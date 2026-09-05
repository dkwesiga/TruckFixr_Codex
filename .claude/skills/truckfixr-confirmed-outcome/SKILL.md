---
name: truckfixr-confirmed-outcome
description: Use when touching the maintenance-case, diagnosis, or repair-outcome pipeline (server/services/confirmedOutcomes.ts, maintenanceCases.ts, repairCycles.ts, guestCaseOutcomes.ts) to make sure provenance is preserved and nothing in the observation-to-outcome chain gets overwritten.
---

# TruckFixr confirmed-outcome integrity

TruckFixr implements a considerably more complete confirmed-repair-outcome and
provenance system than a first read suggests — verify against the code below
before assuming something is missing. Full detail:
`docs/architecture/confirmed-outcomes.md`.

Key pieces (all in `server/services/`, backed by `repairOutcomes`,
`outcomeRevisions`, `maintenanceDecisions`):

- **Outcome lifecycle** (`shared/tadis/outcomeLifecycle.ts`,
  `server/services/outcomeVerification.ts`): `unknown → reported → verified →
  confirmed`, with `failed` reachable from any resolved state and *never
  deleted* ("negative TADIS evidence"). This is the actual mechanism that
  distinguishes "repair performed" (reported/verified) from "issue actually
  resolved" (confirmed) from "did not resolve" (failed) — don't invent a
  parallel taxonomy for this.
- **Revision-without-overwrite**: once an outcome reaches `verified`/
  `confirmed`, a correction goes through `reviseVerifiedOutcome` — it inserts
  a NEW `repairOutcomes` row, sets `supersededAt`/`supersededByOutcomeId` on
  the old one (never deleted), and logs the change in the append-only
  `outcomeRevisions` table (before/after JSON, reason, actor). `requireOutcome`
  refuses to act on a superseded row.
  `server/services/confirmedOutcomes.ts` → `buildConfirmedOutcomeReferences` ranks
  a fleet's own past confirmed repairs by similarity to feed the next diagnosis
  prompt, and re-asserts `fleetId` defensively (see below).
- **Decision versioning** (`server/services/maintenanceDecisions.ts`):
  `addDecision` never overwrites — each call inserts a new `maintenanceDecisions`
  row (`version` incremented, `supersededDecisionId` pointing at the prior
  row), marks all priors `isCurrent: false`. `recordCriticalOverride` requires
  a mandatory reason and only applies when the *current* decision is
  `critical` — this is the product's one supported way to change a critical
  decision's final action, not a routine update.
- **Provenance read model** (`server/services/maintenanceBoards.ts` →
  `getCaseTimeline`): reconstructs the full chain for one case — original
  report (`defects` row via `sourceDefectId`), the AI triage snapshot
  (`aiTriageRecords`, insert-only — no `updatedAt` column exists), every
  decision version + approval, repair-cycle events, and the outcome-lifecycle
  events (`outcome_reported`/`outcome_verified`/`outcome_confirmed`/
  `outcome_failed`/`outcome_revised`). Use this instead of re-deriving the
  chain by hand from several services.

## Invariants to protect

The conceptual chain is: **observation → triage → maintenance decision → diagnosis →
repair → confirmed outcome.** Never overwrite or destroy, at any step:

- the original driver-reported observation and evidence (`defects` row —
  never mutate `description`/`symptoms` after the fact to "correct" a report;
  add a new record instead),
- the original AI assessment and its confidence score (`aiTriageRecords` — no
  update path exists for this table; keep it that way),
- the fleet/manager decision made at the time (`maintenanceDecisions` — always
  append a new version, never `UPDATE` an existing decision's `severity`/
  `finalAction`/`rationale` in place),
- the technician's diagnosis and repair performed,
- the confirmed-outcome record (`repairOutcomes` — mutate only through
  `verifyOutcome`/`confirmOutcome`/`markOutcomeFailed`/`reviseVerifiedOutcome`,
  never a bare `UPDATE` that bypasses the lifecycle state machine and its
  `outcomeRevisions` audit trail).

A correction (e.g. "actually the repair didn't fix it, technician re-diagnosed") must
be a **new row or additive status transition**, not an in-place edit of the original
record. Check `TRANSITIONS` in `shared/maintenance/caseWorkflow.ts` — the workflow
already models this via `reopened` and repair-shop `return_job` states rather than
mutating the original case.

## Fleet scoping inside this pipeline specifically

`buildConfirmedOutcomeReferences` re-asserts `fleetId` match even though callers are
expected to have already scoped their SQL — this defensive re-check exists
specifically so a future query regression can't leak another fleet's confirmed
repairs into an AI prompt. Preserve this pattern (defense-in-depth inside the
function, not just at the call site) in any similar cross-cutting AI-context builder
you add.

## When reviewing a change here, check

- Does a new write path bypass `repairOutcomes` and store outcome data somewhere
  that breaks the reference-building query?
- Does anything compute `aiDiagnosisCorrect`, `outcomeState`, or similar without a
  human confirmation step (these fields must reflect a human's judgment, not the
  model grading itself)? `server/services/tadisLearningPromotion.ts` already
  enforces this at the promotion boundary — `evaluateAndUpsertCandidate` refuses
  to promote an outcome into a learning candidate unless its `outcomeState` is in
  `RESOLVED_OUTCOME_STATES` (`verified`/`confirmed`/`failed`); preserve that check
  in any new promotion path rather than promoting a bare `reported` outcome.
- Is `droppedForeignFleetCount` (or the equivalent safety counter) still surfaced to
  the caller, or silently swallowed?
- Does a new case-status transition allow skipping from an early state directly to
  `completed`/`closed` without the intermediate diagnosis/repair steps the workflow
  expects?
- Does anything call `.update(repairOutcomes)`/`.update(maintenanceDecisions)`
  directly instead of going through `outcomeVerification.ts`/
  `maintenanceDecisions.ts`'s existing functions? A direct update bypasses the
  revision/versioning safeguards above.

## Known unused columns (not a defect — do not silently wire these up)

`repairOutcomes.repairResult`, `.diagnosisCorrectness`, and
`.agreementClassification` exist in the schema (a "repair outcome v2" addition)
but have no write path anywhere in `server/` today — `outcomeState` is the field
actually driving the reported/verified/confirmed/failed distinction. Don't
populate these columns speculatively; if a feature needs them, that's a product
decision requiring its own scoped change, not a side effect of something else.

## Do not

- Implement a schema refactor of the observation→outcome chain in this pass unless
  the user has explicitly asked for it — map gaps and document them in
  `docs/architecture/confirmed-outcomes.md` instead.
