# Fleet Health & Maintenance Workflow — Implementation Ledger

Branch: `feature/fleet-health-maintenance-workflow` (off `main`).

This is the working ledger for the feature-flagged Fleet Health & Maintenance
pilot. It records audit findings, per-phase status, DB changes, commands run,
test results, deviations, and remaining work. Final developer docs live in
`docs/fleet-health-maintenance-workflow.md`.

## Audit findings (confirmed against the repo)

- **Stack:** Vite + React 19 + wouter + tRPC v11 + Drizzle ORM (PostgreSQL) +
  Tailwind + shadcn/Radix + Recharts. pnpm workspace. Vitest.
- **Auth:** custom `jose` sessions via `sdk.authenticateRequest`. Procedures in
  `server/_core/trpc.ts`: `protectedProcedure`, `adminProcedure` (owner/manager),
  `staffProcedure` + `isStaffAdminUser` (internal roles `super_admin` / `admin` /
  `read_only_viewer` via `users.internalAdminRole`).
- **Tenancy:** application-layer, in `server/services/companyAccess.ts`
  (`canManageCompanyOperations`, `getUserPrimaryFleetId`, `getCompanyMembership`).
  RLS is defense-in-depth only (see `docs/security/tenant-isolation.md`).
- **Schema:** single file `drizzle/schema.ts` (52 tables). `fleets.id` serial int;
  `vehicles.id` varchar(64); `activityLogs` (fleetId, userId, action, entityType,
  entityId, details jsonb). Existing `features` is a GLOBAL catalog — NOT a
  per-fleet flag table, so a new `fleetFeatures` table is required (added).
- **Migrations:** hand-written numbered SQL in `drizzle/*.sql` (0005–0013),
  applied via `pnpm db:push`. The drizzle `meta/` snapshots are stale (only
  `0004_snapshot.json`), so `drizzle-kit generate` is NOT used — it would emit a
  destructive full diff. Convention: hand-write idempotent additive SQL.
- **Reuse targets:** `confirmedOutcomes.ts` (repair outcomes), `ocr.ts`,
  `downtimeCalculator.ts`, `diagnosisWorkflow.ts` / `tadisCore.ts` /
  `diagnosticReviewQueue.ts` (diagnosis — PROTECTED, do not modify),
  `observability.ts`, `email.ts`, storage in `@aws-sdk/client-s3` +
  `s3-request-presigner` (`server/storage.ts`).
- **No `CLAUDE.md` files** exist in-repo; conventions inferred from code
  (`getDb()` returns null when DB is down — fail soft; `dateTimestamp()` helper).

### Deviations from the master prompt
- `fleetFeatures` is a new table (prompt's recommended name) because the existing
  `features` table is a global catalog, not per-fleet. Documented, additive.
- Vehicle references use varchar(64) to match `vehicles.id` repo-wide.
- Test runner (`scripts/run-vitest.mjs`) hardcodes its include globs and ignores
  `vitest.config.*`; added `shared/**` globs there (and in the configs) so shared
  unit tests run under `pnpm test`.

## Phase status

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | Foundations & diagnostic safeguards | **Complete** (committed) |
| 2 | Vehicle data & Fleet Health | **In progress** — Attention Score core done |
| 3 | Maintenance decision workflow | Not started |
| 4 | Repair-document review | Not started |
| 5 | Pilot controls | Not started |

## Phase 1 — Foundations & diagnostic safeguards ✅

Delivered:
- `fleetFeatures` table + `maintenancePermissions` table (schema + migration 0014).
- Feature-flag service (`server/services/fleetFeatures.ts`) — fail-closed;
  umbrella gate; `isFleetFeatureEnabled`, `getFleetFeatureConfig`,
  `isFleetCapabilityEnabled`, `getFleetMaintenanceCapabilities`,
  `requireFleetFeature`, `setFleetFeature` (logs every change).
- Central activity-log helper (`server/services/maintenanceActivityLog.ts`) —
  reuses `activityLogs`, redacts forbidden keys, never throws.
- Maintenance permissions service (`server/services/maintenancePermissions.ts`) —
  narrow grants, sanitized capabilities, owner/manager implicit.
- Tenant-scope helpers (`server/services/maintenanceTenantScope.ts`) —
  server-side fleet resolution; rejects cross-fleet vehicle/case references.
- Shared constants + utilities:
  `shared/maintenance/featureKeys.ts`, `permissions.ts`, `normalization.ts`
  (canonicalization + idempotency hashing).
- Golden diagnostic boundary test
  (`server/services/diagnosisMaintenanceBoundary.test.ts`) — proves no
  maintenance-layer token enters any diagnosis prompt, diagnosis input surface
  has no maintenance fields, and prompts are deterministic.

### Database changes (Phase 1)
- New tables: `fleetFeatures`, `maintenancePermissions`.
- Migration: `drizzle/0014_fleet_maintenance_foundations.sql` (idempotent).
- Journal entry added (also backfilled the missing 0013 entry).

### Commands run (Phase 1)
- `npx tsc --noEmit` → passed (no errors).
- `node scripts/run-vitest.mjs run shared/maintenance server/services/fleetFeatures.test.ts server/services/maintenanceActivityLog.test.ts server/services/diagnosisMaintenanceBoundary.test.ts`
  → **29 passed**.

### Feature keys (all default DISABLED, no backfill)
Umbrella: `fleet_maintenance_pilot`.
Capabilities: `fleet_health_dashboard`, `vehicle_attention_score`,
`normalized_vehicle_events`, `integration_ingestion`, `pm_schedules`,
`repair_outcome_capture_v2`, `maintenance_cases`, `repair_document_review`,
`pilot_metrics`.

### Blockers / deferred
None for Phase 1.

## Phase 2 — Vehicle data & Fleet Health (in progress)

Delivered so far:
- **Vehicle Attention Score** pure calculator + tests
  (`shared/maintenance/attentionScore.ts`, `attentionScore.test.ts`). Implements
  all §18 rules, double-count prevention (defect⟷case source dedup, open-defect
  vs critical-defect), +35 critical-case cap, 0–100 cap, classification bands
  (critical ≥75 / attention ≥40 / stable), per-component explanations, and
  data-quality warnings. 9 tests pass. Pure/shared so the client renders
  explanations without a round-trip; never sent to diagnosis.

- **Normalized vehicle events**: `vehicleEvents` table + provider-neutral
  ingestion service (`server/services/vehicleEventIngestion.ts`) shared by
  manual / internal-test / CSV paths. Idempotent within a fleet (dedup in-batch
  and against stored keys), bounded batches, per-row categorization
  (imported/duplicate/invalid/skipped/failed) with safe item errors, cross-fleet
  vehicle rejection, structured→trusted / free-text→review_required. 6 tests.
- **CSV utilities** (`shared/maintenance/csv.ts`): dependency-free parser +
  formula-injection protection + import limits. 6 tests.
- **PM calculation** (`shared/maintenance/pmStatus.ts`): pure next-due calc,
  template/override interval resolution, statuses (not_due/due_soon/overdue/
  insufficient_data/inactive), "whichever comes first", no false overdue on
  missing data. 9 tests. Tables: `pmTemplates`, `pmAssignments`.
- **Score persistence tables**: `attentionScoreSnapshots`,
  `attentionScoreOverrides`.
- **Repair outcome v2**: additive optional columns on `repairOutcomes`
  (maintenanceCaseId, repairCycleId, systemCategory, …). Backward compatible.
- Migration `0015_fleet_maintenance_events_pm_score.sql` + journal entry.

Remaining in Phase 2 (not yet built):
- Score persistence service (snapshot-on-material-change) + acknowledge /
  operational override write paths; PM DB service (CRUD + completion).
- tRPC router exposing events/PM/score; internal-admin test ingestion procedure.
- Fleet Health dashboard page; Vehicle Details integration; Settings →
  Integrations (manual events, CSV import, review queue).

## Manual verification still required
- Run `pnpm db:push` (or apply `0014` SQL) against a real database and confirm
  the two tables + indexes exist.

## Next action
Phase 2 — normalized vehicle events table + ingestion service (manual / internal
test / CSV), PM scheduling, Vehicle Attention Score, Fleet Health dashboard,
repair-outcome v2 fields.
