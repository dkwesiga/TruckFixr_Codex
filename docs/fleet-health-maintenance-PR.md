# Proposed PR: feat: add fleet health and maintenance decision workflow

> Draft description for a PR from `feature/fleet-health-maintenance-workflow` →
> `main`. **Not pushed; no PR opened.**

## Summary

Adds a production-quality, fully feature-flagged Fleet Health & Maintenance
Decision Workflow for a controlled pilot. The flow works end to end at the API
layer and in the UI:

driver report / structured signal → diagnosis (unchanged) → Fleet Health
prioritization → Maintenance Case → documented decision → approval or critical
override → downtime & repair tracking → estimate/invoice review → repair
authorization → structured outcome → return to service → closure → pilot metrics.

Every capability defaults **disabled**. Backend checks fail closed. The existing
diagnosis system is untouched and protected by a golden regression test.

## Scope

- **10 feature flags** (1 umbrella + 9 capabilities), per-fleet, default off.
- **Normalized vehicle events** with idempotent manual / internal-test / CSV
  ingestion.
- **Preventive maintenance** templates/assignments + pure next-due calculation.
- **Explainable Vehicle Attention Score** (deterministic, capped, snapshotted).
- **Fleet Health dashboard** + Settings → Integrations.
- **Maintenance Cases** with human references, append-only decisions, risk-based
  approvals, critical overrides, repair cycles, reopening, assignment, a Downtime
  Board, and a consolidated Case Activity timeline.
- **Repair documents**: private upload, magic-byte validation, checksums,
  duplicate detection, manual entry/correction, and a deterministic
  estimate-to-invoice comparison. **Automated structured extraction is marked
  blocked** (documented dependency; provider-neutral interface in place).
- **Repair authorization** with limits/delegation tiers.
- **Pilot controls**: settings, external-AI consent, readiness with targeted
  degradation, compact pilot metrics, and tenant-scoped CSV export.

## Database

Adds tables via additive, idempotent SQL `0033`–`0037` (applied in filename
order; the drizzle journal is abandoned at `0012` repo-wide and is intentionally
left untouched): `fleetFeatures`, `maintenancePermissions`, `vehicleEvents`,
`pmTemplates`, `pmAssignments`, `attentionScoreSnapshots`,
`attentionScoreOverrides`, `maintenanceCases`, `maintenanceDecisions`,
`repairCycles`, `repairDocuments`, `repairAuthorizations`, `pilotSettings`,
`externalAiConsent`, plus additive columns on `repairOutcomes` and the
`maintenance_case_seq` sequence. No drops or destructive renames.

## Diagnosis protection

No diagnosis file changed. `server/services/diagnosisMaintenanceBoundary.test.ts`
proves no maintenance-layer token enters any AI prompt, the diagnosis input
surface has no maintenance fields, and prompts are deterministic. Automatic case
creation runs after diagnosis via an idempotent endpoint that only reads output.

## Tests

- `npx tsc --noEmit`: clean.
- Vitest: **120 maintenance + regression tests pass** (incl. the diagnosis
  boundary and existing `routerFleetScope`). No live services called.
- `pnpm build:client` (real Vite production build): passes; all new pages emit
  code-split chunks.

## Not done / follow-up

- **Live browser verification** is outstanding — the dev server would not finish
  starting in the implementation environment (DB/startup/env issue unrelated to
  these additive changes). The production client build is the compile-time proof.
- Automated document extraction (blocked; interface ready).
- Demo/seed data and a dedicated internal-admin Pilot Ops page (manageable via
  the `pilot` staff router today).

## Dependencies

None added. No new UI kit, chart lib, form lib, state lib, auth platform, test
runner, queue, or worker.

## Rollout

Apply `0033`–`0037` → verify schema/sequence → deploy with flags off → enable
`fleet_maintenance_pilot` for one internal demo fleet → enable capabilities
individually. Rollback = disable the umbrella flag (fail-closed) and revert the
app; additive schema/data are preserved.
