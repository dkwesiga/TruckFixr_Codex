---
name: truckfixr-confirmed-outcome
description: Use when touching the maintenance-case, diagnosis, or repair-outcome pipeline (server/services/confirmedOutcomes.ts, maintenanceCases.ts, repairCycles.ts, guestCaseOutcomes.ts) to make sure provenance is preserved and nothing in the observation-to-outcome chain gets overwritten.
---

# TruckFixr confirmed-outcome integrity

TruckFixr already implements a confirmed-repair-outcome learning loop
(`server/services/confirmedOutcomes.ts` → `buildConfirmedOutcomeReferences`, backed by
the `repairOutcomes` table). It ranks a fleet's own past confirmed repairs by
similarity to feed the next diagnosis prompt. Full detail:
`docs/architecture/confirmed-outcomes.md`.

## Invariants to protect

The conceptual chain is: **observation → triage → maintenance decision → diagnosis →
repair → confirmed outcome.** Never overwrite or destroy, at any step:

- the original driver-reported observation and evidence (photos, fault codes),
- the original AI assessment and its confidence score,
- the fleet/manager decision made at the time,
- the technician's diagnosis,
- parts installed / repair performed,
- the confirmed-outcome record (whether the AI diagnosis was correct, who confirmed
  it, when).

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
- Does anything compute `aiDiagnosisCorrect` or similar without a human confirmation
  step (that field must reflect a human's judgment, not the model grading itself)?
- Is `droppedForeignFleetCount` (or the equivalent safety counter) still surfaced to
  the caller, or silently swallowed?
- Does a new case-status transition allow skipping from an early state directly to
  `completed`/`closed` without the intermediate diagnosis/repair steps the workflow
  expects?

## Do not

- Implement a schema refactor of the observation→outcome chain in this pass unless
  the user has explicitly asked for it — map gaps and document them in
  `docs/architecture/confirmed-outcomes.md` instead.
