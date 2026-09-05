# Confirmed repair outcome architecture

**Correction (this pass):** an earlier version of this document significantly
understated the existing implementation — it described only the reference-builder
(`confirmedOutcomes.ts`) and treated the outcome-lifecycle/revision/versioning
machinery below as future work ("recommendations", "gaps"). That machinery already
exists and is exercised by `server/services/maintenanceLifecycle.e2e.test.ts`. Verify
against the code before extending this document further.

## Current implementation (verified)

### Outcome lifecycle (the actual "confirmed vs. just performed" mechanism)

`shared/tadis/outcomeLifecycle.ts` defines the state machine actually enforced by
`server/services/outcomeVerification.ts`, on the `repairOutcomes.outcomeState` column:

```
unknown -> reported -> verified -> confirmed
                \-> failed <-/  (reachable from reported/verified/confirmed; terminal)
```

- **reported** (`reportOutcome`) — a customer/shop reports what happened; no
  technician authority required. Sets `reportedAt`/`reportedByUserId`/`evidenceSource`.
- **verified** (`verifyOutcome`) — a technician confirms the repair was technically
  correct (`verificationMethod`: road test, pressure test, fault code cleared, etc.).
  Sets `verifiedAt`/`verifiedByUserId`/`verificationMethod`.
- **confirmed** (`confirmOutcome`) — the repair is later shown to have *held*
  (`confirmationEvidenceType`: no comeback within the window, mileage accumulated,
  etc.). Sets `confirmedAt`/`confirmedByUserId`/`confirmationEvidenceType`.
- **failed** (`markOutcomeFailed`) — the repair did not resolve the issue. **Never
  deleted** — it is retained as negative TADIS evidence. Reachable from any of the
  above (`canTransitionOutcome` in `outcomeLifecycle.ts`).

This state machine is the actual answer to "does TruckFixr distinguish repair
performed from issue resolved": **yes** — `reported`/`verified` mean "repair was
done", `confirmed` means "and it held", `failed` means "it didn't." Three additional
columns (`repairResult`, `diagnosisCorrectness`, `agreementClassification`) exist on
`repairOutcomes` from a "repair outcome v2" schema addition but **have no write path
anywhere in `server/` today** — don't treat them as implemented, and don't populate
them speculatively; `outcomeState` is the field that actually drives this distinction.

### Revision without overwrite

Once an outcome reaches `verified`/`confirmed`, a correction goes through
`reviseVerifiedOutcome` (already implemented in `outcomeVerification.ts`; not
exercised by this pass's new test, which covers the report/verify/confirm path):
it inserts a **new** `repairOutcomes` row, sets
`supersededAt`/`supersededByOutcomeId`/`technicalRevisionOfId` on the old row (never
deleted, never overwritten), and logs the change in the **append-only**
`outcomeRevisions` table (`beforeStateJson`/`afterStateJson`/`reason`/
`changedByUserId`/`changeType`/`requiresReVerification`). `requireOutcome` (the
lookup every lifecycle function uses) explicitly excludes superseded rows, so no
lifecycle mutation can land on a stale, already-corrected record.

### Decision versioning

`server/services/maintenanceDecisions.ts` `addDecision` never overwrites: each call
inserts a new `maintenanceDecisions` row (`version` incremented from the current
max, `supersededDecisionId` pointing at the prior current row) and marks all prior
versions `isCurrent: false`. `recordCriticalOverride` is the **one** supported way to
change a critical decision's final action — it requires a mandatory `overrideReason`
and only applies when the current decision's severity is already `critical`
(`BAD_REQUEST` otherwise); it too inserts a new version rather than mutating the
existing row.

### Provenance read model

`server/services/maintenanceBoards.ts` → `getCaseTimeline(args: {fleetId, caseId})`
reconstructs the full chain for one case, fleet-scoped, as a single chronological
list:

- `case_opened` (from `maintenanceCases`),
- `original_report` — the originating `defects` row via `sourceDefectId`, read-only,
  never mutated by anything downstream,
- `ai_triage` — the `aiTriageRecords` row for that defect. **`aiTriageRecords` has no
  `updatedAt` column at all** — there is no schema-level update path for this table,
  so this is always the original model output, not a later edit,
- `decision` / `approval` / `critical_override` (from `maintenanceDecisions`, every
  version),
- `repair_cycle_started` / `out_of_service` / `return_to_service` / `cycle_completed`
  (from `repairCycles`),
- `outcome_reported` / `outcome_verified` / `outcome_confirmed` / `outcome_failed`
  (from `repairOutcomes` — **added in this pass**; previously the timeline stopped
  at repair cycles and did not surface the confirmed-outcome stage at all),
- `outcome_revised` (from `outcomeRevisions` — **added in this pass**; summary only,
  does not echo the full before/after JSON into a general-purpose read).
- `reopened` (from `activityLogs`, unchanged).

This is the safe, single entry point for "reconstruct this case's provenance" —
prefer it over re-deriving the chain from several services by hand. Covered by
`server/services/maintenanceLifecycle.e2e.test.ts`.

### Reference builder (AI-context feed, distinct from the lifecycle above)

`server/services/confirmedOutcomes.ts` → `buildConfirmedOutcomeReferences` turns a
fleet's historical **resolved** outcomes into `confirmed_outcome_references` fed
into the next diagnosis prompt, ranked by Jaccard similarity over symptoms +
normalized fault codes (`scoreHistoricalDiagnosticCase`). `fleetId` is re-checked
defensively inside the function itself, not just trusted from the caller's SQL —
dropped foreign-fleet rows are counted and reported back
(`droppedForeignFleetCount`).

`server/services/tadisLearningPromotion.ts` → `evaluateAndUpsertCandidate` is the
gate between a confirmed outcome and the shared-learning corpus (partner fleets
only, opt-in `contributionPolicy`): it explicitly refuses to promote an outcome
unless `outcomeState` is in `RESOLVED_OUTCOME_STATES` (`verified`/`confirmed`/
`failed`) — a bare `reported` outcome is never treated as training-quality evidence.
This is the concrete answer to "is an unverified outcome ever fed to learning
automatically": **no**, verified at the code level.

### Case-status workflow

`shared/maintenance/caseWorkflow.ts` models the operational status of a case:
`reported → triaging → decision_pending → monitoring/scheduled →
out_of_service/in_repair → awaiting_parts → ready_for_return → completed/closed`,
plus repair-shop states `awaiting_follow_up`/`return_job`. This is a separate state
machine from the outcome lifecycle above (a case's operational status vs. a repair
outcome's confirmation status) — don't conflate them. A routine case-status
transition (`transitionCaseStatus`) never touches `maintenanceDecisions` or
`repairOutcomes` — verified by
`server/services/maintenanceLifecycle.e2e.test.ts`'s safety-escalation tests.

## Conceptual chain vs. implementation mapping

| Conceptual step | Implementation |
|---|---|
| Observation | `defects` (driver-reported), surfaced via `getCaseTimeline`'s `original_report` entry |
| Triage | `aiTriage.ts` → `aiTriageRecords` (insert-only), surfaced via `getCaseTimeline`'s `ai_triage` entry |
| Maintenance decision | `maintenanceDecisions.ts` (`addDecision`, `approveCurrentDecision`, `recordCriticalOverride`) — versioned, never overwritten |
| Diagnosis | `diagnosisWorkflow.ts`, `diagnosticReviewQueue.ts` |
| Repair | `repairCycles.ts` (`startRepairCycle`, `markCycleStage`, `completeCycle`, `returnToService`) |
| Confirmed outcome | `outcomeVerification.ts` (`reportOutcome`/`verifyOutcome`/`confirmOutcome`/`markOutcomeFailed`/`reviseVerifiedOutcome`) + `repairOutcomes`/`outcomeRevisions` tables |
| Provenance reconstruction | `maintenanceBoards.ts` → `getCaseTimeline` |

## Provenance invariants (verified, not aspirational)

Never overwrite in place: original reported problem (`defects`), original evidence,
model recommendation + confidence (`aiTriageRecords` — no update path exists),
fleet/manager decision (`maintenanceDecisions` — always a new version),
technician diagnosis, repair performed, parts installed, outcome confirmation +
confirmer + timestamp + resolved/not-resolved (`repairOutcomes`'s lifecycle
fields, mutated only through the outcome-lifecycle functions, corrected only
through `reviseVerifiedOutcome` + `outcomeRevisions`). Corrections happen via a new
row/version/status (`reopened`, `return_job`, a new decision version, a new
superseding outcome row), never by mutating history.

## Gaps identified (real, narrow)

- `repairResult`/`diagnosisCorrectness`/`agreementClassification` columns exist but
  have no write path — not a defect, but don't build new logic assuming they're
  populated; `outcomeState` is the field actually carrying that signal today.
- No live-database proof of the revision/versioning invariants above (this pass's
  new test, `maintenanceLifecycle.e2e.test.ts`, proves them against an in-memory
  stub of the query builder — see `.claude/rules/testing.md` for why that's the
  established layer here, not a live-DB integration test).
- No documented data-retention/anonymization policy specifically for VIN-linked
  confirmed-outcome history (separate from the general policies in
  `docs/security/policies/09-data-retention-disposal-policy.md`) — worth confirming
  the general policy already covers this table, rather than assuming it does.

## Recommendations for future work (do not implement without explicit ask)

- Extend `getCaseTimeline` to also surface parts-request linkage once
  `docs/architecture/parts-acquisition.md`'s fitment/sourcing stages exist and are
  case-linked (today `partsRequests` links only via `caseId`, and the outcome's own
  `partsReplaced` free-text/jsonb field is already surfaced in `outcome_reported`).
- If a future feature needs `repairResult`/`diagnosisCorrectness`/
  `agreementClassification`, scope that as its own change (write path + tests), not
  a side effect of something else.
