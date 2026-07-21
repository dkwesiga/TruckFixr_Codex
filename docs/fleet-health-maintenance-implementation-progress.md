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
- **Migrations:** hand-written numbered SQL in `drizzle/*.sql`, applied in
  filename order (the drizzle journal + `meta/` snapshots are abandoned at
  `0012`; the real files run through `0032`, none of which are in the journal, so
  `drizzle-kit generate/migrate` is NOT the mechanism). Convention: hand-write
  idempotent additive SQL with the next number. **This feature adds `0033`–`0037`
  and does NOT touch the journal** (matching how `0013`–`0032` are handled).
  NOTE: an early draft mis-numbered these `0014`–`0018` (collided with existing
  files) and edited the journal — both corrected before completion.
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
| 2 | Vehicle data & Fleet Health | **Complete** (backend + dashboard + integrations) |
| 3 | Maintenance decision workflow | **Complete** (backend + UI) |
| 4 | Repair-document review | **Complete** (auto-extraction blocked) |
| 5 | Pilot controls | **Complete** (backend + UI) |

## Phase 1 — Foundations & diagnostic safeguards ✅

Delivered:
- `fleetFeatures` table + `maintenancePermissions` table (schema + migration 0033).
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
- Migration: `drizzle/0033_fleet_maintenance_foundations.sql` (idempotent). The
  drizzle journal is intentionally NOT modified (abandoned at 0012 repo-wide).

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
- Migration `0034_fleet_maintenance_events_pm_score.sql`.

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

Schema + migration `0035_maintenance_cases_decisions_cycles.sql`:
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

Phase 3 UI (complete):
- `client/src/pages/MaintenanceCaseDetail.tsx`, route `/app/case/:id`: case header
  (reference, status, severity), current decision with approve control (attention)
  and a critical-override form (mandatory reason + action, with the critical
  safety disclaimer), record-a-decision form, repair-cycle controls (start, stage
  marks, return-to-service with downtime, complete + closure result), assignment,
  reopen (when closed/completed), consolidated Case Activity timeline, and the
  full safety disclaimer. Owner/manager only.
- Fleet Health gains **Active cases** and **Downtime board** tabs (gated by the
  `maintenance_cases` capability): case list links to detail; the board shows
  read-time overdue with a red rail. Build emits `MaintenanceCaseDetail-*.js`;
  `pnpm build:client` PASSED; tsc clean.

## Phase 4 — Repair-document review (backend complete)

**Automated structured extraction: BLOCKED (documented dependency).** The repo's
only extraction abstraction is free-text image OCR (`extractPhotoEvidenceText`,
400-char snippets via the AI orchestrator), which cannot reliably yield line
items / totals / tax, and §8.6/§35 prohibit adding a provider solely for this
feature. A provider-neutral `DocumentExtractor` interface exists (`manualExtractor`
default) so a real extractor can be dropped in later; documents land in
`manual_review_only` and the deterministic comparison runs on manually-entered /
corrected values. Everything else in Phase 4 is fully implemented.

Schema + migration `0036`: `repairDocuments` (checksum, processing state,
normalized fields, corrections, supersession, duplicate links, region/consent),
`repairAuthorizations`.

Pure, tested modules (shared):
- `documentLimits.ts` (fixed limits + `DOCUMENT_REVIEW_THRESHOLDS`, allowed
  types/states).
- `documentValidation.ts` — magic-byte sniffing; rejects executables/HTML/SVG,
  forged extensions, oversized/empty files. 8 tests.
- `documentComparison.ts` — deterministic estimate↔invoice diff in integer minor
  units: total/subtotal variance (verify + high tiers), tax tolerance, labour
  hours, added/removed/quantity/unit-price/duplicate lines, invoice-only repairs,
  and a hard currency-mismatch stop (no cross-currency compare without a rate).
  10 tests.
- `repairAuthorizationPolicy.ts` — who may authorize (maintenance/manager/
  external) given limits, delegation (default off), assignment, criticality,
  review state, and high variance. 8 tests.

Services + `repairDocuments` router (registered): upload (authoritative
validation → SHA-256 → in-fleet duplicate detection, never revealing cross-fleet
→ private `storagePut` with server-generated key `maintenance-cases/{fleet}/{case}/
{doc}/{name}` → manual-review state), signed-URL download (never logged), manual
field entry + correction (append-only corrections), retry (bounded attempts),
deterministic comparison, and repair authorization. Upload/view allowed for
owners/managers AND maintenance-permitted users; financial value entry,
comparison, and approvals stay owner/manager (§10). tsc clean; 102 tests pass.

Phase 4 UI (complete): `client/src/components/RepairDocumentsSection.tsx`,
embedded in the case detail page (gated by `repair_document_review`): upload
(PDF/image → base64 → validated server-side), document list with view (signed
URL) + manual value entry/correction, deterministic comparison rendered as
"Items to verify" (severity-coloured), and the authorize control (amount +
review flags → decision + reasons). Build rebuilds `MaintenanceCaseDetail-*.js`;
tsc clean.

## Phase 5 — Essential pilot controls (backend complete)

Schema + migration `0037`: `pilotSettings` (status, dates, primary/backup
manager, enrolled vehicles, notification recipients, baseline, authorization
policy), `externalAiConsent` (status, purpose, consent/withdrawal times,
consenting user vs internal recorder, provider/model/region disclosure,
evidence).

Pure, tested modules (shared):
- `pilotReadiness.ts` — Ready / Needs attention / Optional + blocking/warnings +
  TARGETED degradation flags (block approvals / AI creation / uploads / new
  cases / metric counting / manual document mode); never disables the whole
  pilot. 6 tests.
- `pilotMetrics.ts` — case volume, median time-to-decision, avg approval time,
  downtime aggregates, severity/action breakdowns, critical-override rate,
  first-time-fix and repeat-repair (exact §43 formulas with observation
  windows), document variance, outcome completion, agreement. 7 tests.
- `csvExport.ts` — formula-injection-safe CSV serialization + export preamble
  (date/timezone/period/units/currencies). 5 tests.

Services + `pilot` router (registered):
- `pilotSettings.ts`: settings upsert (internal admin), consent grant/withdraw
  (owner) vs record-with-evidence (internal admin, never impersonating), and
  `computePilotReadiness` gathering real inputs (settings, features, consent,
  storage/diagnosis availability).
- `pilotMetricsService.ts`: gathers cases/decisions/cycles/outcomes and computes
  metrics; tenant-scoped case CSV export (excludes prompts/URLs/keys/raw
  payloads; logged).
- Router: getSettings (owner/manager view), upsertSettings (staff),
  setConsent (owner only), recordConsent (staff), readiness, metrics
  (gated `pilot_metrics`), exportCases (owner/manager). tsc clean; 120 tests pass.

Phase 5 UI (complete): Fleet Health gains a **readiness banner** (shows
blocking/warnings when not ready) and a **Pilot metrics** tab (gated by
`pilot_metrics`) with compact metric tiles, a pending-observation-window note,
a "does not imply causation" caption, and an **Export cases (CSV)** button that
downloads the tenant-scoped export client-side. Build rebuilds `FleetHealth-*.js`;
tsc clean.

Deferred (optional, non-blocking): a dedicated internal-admin Pilot Operations
page (settings/consent are fully manageable via the `pilot` staff router;
`upsertSettings`/`recordConsent` are callable by internal admins today).

## Manual verification still required
- Run `pnpm db:push` (or apply `0033` SQL) against a real database and confirm
  the two tables + indexes exist.

## Next action
Phase 2 — normalized vehicle events table + ingestion service (manual / internal
test / CSV), PM scheduling, Vehicle Attention Score, Fleet Health dashboard,
repair-outcome v2 fields.
