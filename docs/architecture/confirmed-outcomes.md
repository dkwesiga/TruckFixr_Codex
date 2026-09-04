# Confirmed repair outcome architecture

## Current implementation (verified)

- Table: `repairOutcomes` (`drizzle/schema.ts`). Fields include (at minimum, per
  `ConfirmedRepairOutcomeRow` in `server/services/confirmedOutcomes.ts`): `fleetId`,
  `confirmedFault`, `repairPerformed`, `repairNotes`, `partsReplaced`,
  `aiDiagnosisCorrect`, `diagnosticCaseId`, `returnedToServiceAt`, `createdAt`.
- `server/services/confirmedOutcomes.ts` turns a fleet's historical confirmed
  outcomes into `confirmed_outcome_references` fed into the next diagnosis prompt
  (`buildConfirmedOutcomeReferences`), ranked by Jaccard similarity over symptoms +
  normalized fault codes (`scoreHistoricalDiagnosticCase`).
- This is the closed-loop learning mechanism already live in the product: a
  confirmed repair on one truck improves the next similar diagnosis **for the same
  fleet**. `fleetId` is re-checked defensively inside the function itself, not just
  trusted from the caller's SQL — dropped foreign-fleet rows are counted and
  reported back (`droppedForeignFleetCount`).
- Case-status workflow (`shared/maintenance/caseWorkflow.ts`) already models most of
  the observation→outcome chain as statuses: `reported → triaging →
  decision_pending → monitoring/scheduled → out_of_service/in_repair →
  awaiting_parts → ready_for_return → completed/closed`, plus repair-shop states
  `awaiting_follow_up` (post-repair, pending a 3-day follow-up call) and
  `return_job` (a follow-up determined a new, separately tracked return visit is
  needed — without reopening or overwriting the original case).
- `repairShopWorkflow.ts` / `technicianReviews.ts` / `guestCaseOutcomes.ts` extend
  this pattern for the repair-shop-partner and guest-case flows respectively.

## Conceptual chain vs. implementation mapping

| Conceptual step | Implementation |
|---|---|
| Observation | `defects` / `inspectionFlags` (driver-reported), `evidencePhotos.ts` |
| Triage | `aiTriage.ts` → `aiTriageRecords`, `tadisAlerts` |
| Maintenance decision | `maintenanceDecisions.ts` (`addDecision`, `approveCurrentDecision`, `recordCriticalOverride`) |
| Diagnosis | `diagnosisWorkflow.ts`, `diagnosticReviewQueue.ts` |
| Repair | `repairCycles.ts` (`startRepairCycle`, `markCycleStage`, `completeCycle`, `returnToService`) |
| Confirmed outcome | `confirmedOutcomes.ts` + `repairOutcomes` table |

## Provenance invariants (do not violate)

Never overwrite in place: original reported problem, original evidence, model
recommendation + confidence, fleet decision, technician diagnosis, repair performed,
parts installed, outcome confirmation + confirmer + timestamp + resolved/not-resolved.
Corrections happen via a new status/row (`reopened`, `return_job`), never by mutating
history.

## Gaps identified (not fixed in this pass — map only)

- No single first-class "provenance view" joins observation → triage → decision →
  diagnosis → repair → outcome for one case; a caller currently has to query several
  tables/services and assemble the chain themselves. A read-model/view for this
  would reduce the risk of a future feature accidentally reading a partial picture.
- `aiDiagnosisCorrect` (confirmed-outcome grading of the AI) has no documented schema
  constraint proving it's set by a human reviewer rather than derived automatically —
  worth an explicit audit before this field is used in any AI-evaluation/regression
  framework (P2 item, see `CLAUDE.md` roadmap).
- No documented data-retention/anonymization policy specifically for VIN-linked
  confirmed-outcome history (separate from the general policies in
  `docs/security/policies/09-data-retention-disposal-policy.md`) — worth confirming
  the general policy already covers this table, rather than assuming it does.

## Recommendations for future work (do not implement without explicit ask)

- A provenance read-model (view or service function) that returns the full chain for
  one case ID, to reduce ad hoc joins as more surfaces need "explain this
  recommendation" UI.
- An explicit `confirmed_by_user_id` / `confirmed_at` pair on `repairOutcomes` if not
  already present, to make "who confirmed this and when" queryable without touching
  activity logs.
