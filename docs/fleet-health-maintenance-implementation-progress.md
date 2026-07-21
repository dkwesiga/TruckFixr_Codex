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
| 3 | Maintenance decision workflow | **Backend complete** — UI pending |
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

- **Score persistence** (`server/services/attentionScorePersistence.ts`):
  gathers real inputs from `defects` + `vehicleEvents` (repeat DTCs) + PM status,
  computes score, persists a snapshot ONLY on material change / classification
  change / acknowledge / override (never on every read). Acknowledge + display
  override write paths (override never alters components/diagnosis/case creation).
  Case-based rules default empty until Phase 3 (additive).
- **PM DB service** (`server/services/pmService.ts`): template create/list,
  assign (tenant-checked), record completion, per-vehicle status.
- **tRPC router** (`server/routers/fleetMaintenance.ts`), registered in
  `server/routers.ts` as `fleetMaintenance`. All procedures resolve the fleet
  server-side, gate on the umbrella + capability flag (fail closed), and enforce
  owner/manager for writes. `setFleetFeature` + `internalTestIngest` are
  `staffProcedure` and reject `read_only_viewer` writes. Procedures: capabilities,
  setFleetFeature, listEvents (no raw payloads, paginated), createManualEvent,
  importEventsCsv, reviewEvent, internalTestIngest, PM (list/create/assign/
  complete/status), score (compute+persist/acknowledge/override).

- **Fleet Health dashboard** (`client/src/pages/FleetHealth.tsx`), route
  `/app/fleet-health` (gated by `FLEET_HEALTH_ENABLED` build flag +
  RoleBasedRoute owner/manager + server-side capability). Ranked vehicle
  priorities (primary interface) with classification badges, score, expandable
  "why" breakdown, acknowledge action, and data-quality warnings; summary
  indicator tiles; events-to-review tab; safety disclaimer. Responsive from
  320px. Shows a clear "not enabled" state when the capability is off.
- **Batched fleet-health summary** service
  (`server/services/fleetHealthSummary.ts`) + `fleetHealthSummary` router query:
  bulk-loads defects, DTC events, PM config, and overrides ONCE and scores each
  vehicle in memory (no N+1). Applies display overrides, ranks worst-first.

Verification: `pnpm build:client` (real Vite production build) PASSED — the page
compiled into its own code-split chunk (`FleetHealth-*.js`). tsc clean.
NOTE: live browser verification was attempted but the dev server did not finish
starting in this environment (stuck pre-listen ~6 min, no errors, port never
opened — a DB/startup issue unrelated to these additive changes). The client
build is the compile-time proof; a manual browser pass against a running server
with the pilot flags enabled remains in "manual verification".

- **Settings → Integrations** (`client/src/pages/FleetIntegrations.tsx`), route
  `/app/integrations`. Three tabs: **Manual entry** (vehicle + type + time +
  optional odometer/DTC → `createManualEvent`), **CSV import** (client-side parse
  via shared `parseCsv`, required-column check, 10-row preview + parsed count,
  explicit confirm → `importEventsCsv`, per-row error summary; enforces 5 MB /
  1000-row limits), and **Review queue** (lists `review_required` events,
  accept/reject via `reviewEvent`). Each tab respects its own capability flag
  (events vs integration ingestion). No fake Geotab/Samsara connection controls;
  an explicit note states there is no direct telematics connection this release.
  Build emits `FleetIntegrations-*.js` chunk; tsc clean.

Remaining in Phase 2 (UI, optional polish):
- Vehicle Details (`/truck/:id`) integration — surface score explanation,
  events, PM, and related cases inline (cases arrive in Phase 3).

## Phase 3 — Maintenance decision workflow (backend complete)

Schema + migration `0016_maintenance_cases_decisions_cycles.sql`:
- `maintenanceCases` (reference, status, origin, source links, assignment,
  currentDecisionId, expectedCompletionAt), `maintenanceDecisions` (append-only
  versions, one current), `repairCycles` (multiple per case, one active).
- `maintenance_case_seq` PostgreSQL sequence for global references (never counts
  rows).

Pure domain rules (shared, tested):
- `caseWorkflow.ts`: 13 statuses + explicit transition map (`canTransition`),
  active-status set, normalized severities/actions, approval policy by severity,
  critical-action test, safety disclaimers, `formatCaseReference` (MC-YYYY-######).
- `recommendationAdapter.ts`: maps diagnosis OUTPUT → normalized recommendation
  (severity/action), preserves original text verbatim; read-only (never mutates
  diagnosis). 12 tests in `caseWorkflow.test.ts`.

Services:
- `maintenanceCaseReference.ts` (sequence-based reference).
- `maintenanceCases.ts`: manual + idempotent automatic-from-diagnosis creation,
  validated status transitions, assignment (manager + maintenance user), reopen
  (preserves history, deactivates lingering cycle), list/get.
- `maintenanceDecisions.ts`: append-only versioning (one current), approval
  (attention), critical override (mandatory reason, critical-only, preserves
  original recommendation, owner/manager finalizes). 7 tests.
- `repairCycles.ts`: start (one active), stage marks, return-to-service with
  computed downtime, complete with closure result.
- `maintenanceBoards.ts`: Downtime Board (active cases, read-time overdue, no
  cron) + consolidated Case Activity timeline from domain records.

Router `maintenanceCases` (registered): list/get/createManual/createFromDiagnosis
(idempotent, post-diagnosis)/transition/assign/reopen; addDecision/approve/
criticalOverride; startCycle/markStage/returnToService/completeCycle;
downtimeBoard. All gated by `maintenance_cases` + owner/manager (adminProcedure)
+ tenant scope. Critical override is owner/manager only. tsc clean; 84 tests pass.

Remaining in Phase 3 (UI): case detail view, decision/approval/override controls,
Downtime Board page, and Case Activity timeline in the client (Fleet Health tabs).

## Manual verification still required
- Run `pnpm db:push` (or apply `0014` SQL) against a real database and confirm
  the two tables + indexes exist.

## Next action
Phase 2 — normalized vehicle events table + ingestion service (manual / internal
test / CSV), PM scheduling, Vehicle Attention Score, Fleet Health dashboard,
repair-outcome v2 fields.
