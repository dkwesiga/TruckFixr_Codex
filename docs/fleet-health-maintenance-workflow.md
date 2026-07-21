# Fleet Health & Maintenance Decision Workflow

Feature-flagged pilot capability for TruckFixr. Helps a fleet identify which
vehicles need attention, understand why, make a documented operating decision,
coordinate repair activity, confirm the outcome, and measure the operational
result — without changing the existing diagnosis system.

Status: implemented on branch `feature/fleet-health-maintenance-workflow`.
All capabilities default **disabled**; nothing is enabled for any fleet until an
internal admin turns it on.

---

## 1. Architecture

- **Stack:** Vite + React 19 + wouter + tRPC v11 + Drizzle ORM (PostgreSQL) +
  Tailwind + shadcn/Radix + Recharts. pnpm workspace, Vitest.
- **Auth/session:** existing `jose`-based sessions (`sdk.authenticateRequest`);
  no changes.
- **Tenancy:** application-layer, via `server/services/companyAccess.ts`. RLS is
  defense-in-depth only.
- **Code layout:**
  - Pure domain logic → `shared/maintenance/*` (runs on client + server, unit
    tested).
  - Server services → `server/services/*`.
  - tRPC routers → `server/routers/{fleetMaintenance,maintenanceCases,repairDocuments,pilot}.ts`,
    registered in `server/routers.ts`.
  - UI → `client/src/pages/{FleetHealth,FleetIntegrations,MaintenanceCaseDetail}.tsx`
    and `client/src/components/RepairDocumentsSection.tsx`.
- **No new frameworks** were introduced (no new UI kit, chart lib, form lib,
  state lib, auth platform, test runner, queue, or worker).

## 2. Feature flags

General-purpose per-fleet flags live in the `fleetFeatures` table
(`fleetId + featureKey` unique). Distinct from the global `features` catalog and
`planFeatures`. Helpers: `server/services/fleetFeatures.ts`.

| Key | Kind |
|-----|------|
| `fleet_maintenance_pilot` | umbrella (eligibility only) |
| `fleet_health_dashboard` | capability |
| `vehicle_attention_score` | capability |
| `normalized_vehicle_events` | capability |
| `integration_ingestion` | capability |
| `pm_schedules` | capability |
| `repair_outcome_capture_v2` | capability |
| `maintenance_cases` | capability |
| `repair_document_review` | capability |
| `pilot_metrics` | capability |

Rules: default disabled; no backfill; a capability is effective only when the
umbrella flag AND the capability flag are both enabled; backend checks are
authoritative and **fail closed** (`requireFleetFeature`). `super_admin`/`admin`
manage; `read_only_viewer` cannot mutate. Every change is logged.

## 3. Permissions

- Fleet roles `owner` / `manager` / `driver` unchanged. **No `technician` role
  added.**
- Narrow, fleet-scoped grants in `maintenancePermissions` (capabilities such as
  `upload_documents`, `update_repair_status`, `submit_repair_outcome`). Grants
  never confer feature management, pilot config, exports, estimate approval,
  critical-override finalization, or internal-admin access. Financial totals,
  variance, limits, and approvals stay owner/manager.
- Internal roles reuse `staffProcedure` / `users.internalAdminRole`.

## 4. Tenant isolation

Every business table carries `fleetId`. The fleet is always resolved
server-side (`resolveActiveFleetId`) from the authenticated user; a client-passed
`fleetId` must match an active membership. Foreign vehicle/case/document
references fail with `NOT_FOUND` without revealing existence in another fleet
(`maintenanceTenantScope.ts`). Cross-fleet document duplicates are never
revealed.

## 5. Diagnosis boundary (critical)

Diagnosis files (`diagnosisWorkflow.ts`, `tadisCore.ts`,
`diagnosticReviewQueue.ts`, and the diagnostic routers) were **not modified**.
The maintenance layer only reads diagnosis output:

- The Attention Score is operational priority only; it is never sent to
  diagnosis, changes no prompt/route, and presents no failure probability.
- Vehicle events do not trigger diagnosis or auto-append evidence.
- PM status affects operational priority only, never diagnosis.
- Automatic case creation happens **after** diagnosis returns, via the idempotent
  `maintenanceCases.createFromDiagnosis` procedure; it reads output through
  `recommendationAdapter` and never re-runs or mutates diagnosis.

`server/services/diagnosisMaintenanceBoundary.test.ts` captures every AI request
during a real workflow run and asserts no maintenance-layer token appears, the
diagnosis input surface has no maintenance fields, and prompts are deterministic.

## 6. Normalized vehicle events

`vehicleEvents` table; provider-neutral. Types: odometer, engine_hours,
dtc_detected, dtc_cleared, inspection_defect, issue_resolved,
maintenance_completed, free_text, unknown. Trust: `trusted` (structured) vs
`review_required` (free_text/unknown). Structured accepted events may affect
scoring; free-text never enters scoring or diagnosis before human acceptance.

**Idempotency** (`shared/maintenance/normalization.ts`): with a source id →
`fleetId + source + sourceEventId`; without → `fleetId + vehicleId + source +
eventType + UTC timestamp + normalizedPayloadHash`. Canonicalization: trimmed
strings, uppercase DTCs, UTC ISO, fixed numeric precision, stable key order,
volatile-key exclusion. Duplicates are skipped and reported, never failing the
batch. Raw payloads are minimized and never loaded in list queries.

## 7. Event ingestion

One service (`vehicleEventIngestion.ts`) backs manual entry (owner/manager),
internal-admin test ingestion (`staffProcedure`), and CSV import. CSV limits:
5 MB, 1000 rows, batches of 100. Client-side preview + explicit confirmation;
server is authoritative for validation, dedup, and cross-fleet rejection.
Formula-injection protection on parse/export. No worker, no background import.
UI: Settings → Integrations (`/app/integrations`).

## 8. Preventive maintenance

`pmTemplates` + `pmAssignments`. Pure calculation in
`shared/maintenance/pmStatus.ts`: statuses not_due / due_soon / overdue /
insufficient_data / inactive; "whichever comes first" across km/hours/days;
**missing data never yields a false overdue**. Owners/managers manage.

## 9. Vehicle Attention Score

Deterministic, explainable, rules-based (`shared/maintenance/attentionScore.ts`).
Classifications: Critical 75–100, Attention 40–74, Stable 0–39, capped at 100.
Double counting is prevented (defect↔case source dedup; open-vs-critical defect).
Returns components with rule key, points, explanation, supporting entity, and
data-quality warnings. Snapshots (`attentionScoreSnapshots`) persist only on
material change / classification change / acknowledgement / override — never on
page load. Owners/managers may acknowledge, note, apply an operational display
override, or clear it (`attentionScoreOverrides`); overrides never alter
components, diagnosis, or case creation.

## 10. Fleet Health

Single destination `/app/fleet-health` (requires `fleet_maintenance_pilot` +
`fleet_health_dashboard`). Primary interface: a ranked vehicle-priorities list
with expandable "why". Tabs: Vehicle priorities, Active cases, Downtime board,
Pilot metrics (when enabled), Events to review. Summary indicator tiles + a
readiness banner. `fleetHealthSummary` bulk-loads and scores in memory (no N+1).

## 11. Repair outcomes v2

Additive optional columns on the existing `repairOutcomes` table
(`maintenanceCaseId`, `repairCycleId`, `systemCategory`, `agreementClassification`,
`repairResult`, `actualDowntimeHours`, …). Existing payloads stay valid; no new
field is required to close repairs or submit feedback; nothing feeds diagnosis.

## 12. Maintenance cases

`maintenanceCases`: one fleet + one primary vehicle. Reference `MC-{YEAR}-{######}`
from a PostgreSQL sequence (`maintenance_case_seq`) — globally unique, immutable,
never row-counted. Origins: diagnosis, issue, inspection, event, pm, manual.
Automatic creation from diagnosis is idempotent per `diagnosticSessionId`. Manual
creation requires vehicle + reason.

Statuses (`shared/maintenance/caseWorkflow.ts`): reported, triaging,
decision_pending, monitoring, scheduled, out_of_service, in_repair,
awaiting_parts, ready_for_return, completed, closed, reopened, cancelled — with an
explicit transition map (`canTransition`).

## 13. Decisions, approval, override

`maintenanceDecisions`: append-only versions, exactly one current. Severity
stable/attention/critical; actions continue_monitor / complete_trip_then_inspect /
schedule_service / pull_from_service / roadside_assistance / tow. Approval policy:
stable auto-records; attention needs owner/manager approval; **critical** defaults
to do-not-operate, requires a new version with a **mandatory override reason**,
preserves the original recommendation, and is **finalizable only by owner/manager**.
Maintenance users may assess/recommend but not finalize. Safety disclaimers (full/
short/critical) shown at first use, on critical recommendations, override controls,
decision records, document review, and exports.

## 14. Repair cycles & downtime

`repairCycles`: multiple per case, one active. Tracks out-of-service, repair
start, expected completion, awaiting-parts, ready-for-return, return-to-service
(computes downtime hours), completion + closure result (resolved /
partially_resolved / not_resolved). Reopening (owner/manager, reason required)
preserves prior history and opens a new cycle segment — never a new case. Downtime
Board shows active cases with read-time overdue (no cron). Assignment: one manager
+ zero/one maintenance user.

## 15. Case activity

`getCaseTimeline` builds one chronological timeline from domain records
(decisions, cycles) plus the case's audit-log entries. Domain records are the
source of truth; there is no general comment system.

## 16. Repair documents

`repairDocuments`. Types estimate/work_order/invoice/unknown. Limits: 10 MB,
20 PDF pages, 25 docs/case, 3 extraction attempts. Allowed: PDF/JPEG/PNG/WebP —
validated authoritatively by **magic bytes** (`documentValidation.ts`); executables,
archives, SVG, HTML, scripts, forged extensions, and oversized/empty files are
rejected. SHA-256 checksums; in-fleet duplicate detection (same case → refuse;
elsewhere in fleet → warn+confirm; never reveal cross-fleet). Private storage via
the existing `storagePut`/`storageGet` proxy with **server-generated keys**
(`maintenance-cases/{fleetId}/{caseId}/{documentId}/{filename}`); original persisted
before extraction; signed URLs never logged.

Processing states: uploaded, pending, processing, needs_review, completed, failed,
manual_review_only, quarantined. Upload succeeds independently of extraction.

### Extraction — BLOCKED (documented dependency)

Automated **structured** extraction is not implemented. The only existing
abstraction is free-text image OCR (`extractPhotoEvidenceText`, 400-char snippets
via the AI orchestrator), which cannot reliably yield line items / totals / tax,
and adding a provider solely for this feature is out of scope. A provider-neutral
`DocumentExtractor` interface (`manualExtractor` default) is in place so a real
extractor can be dropped in later. Documents land in `manual_review_only`;
operators enter/correct values manually (corrections are appended for audit).

## 17. Deterministic comparison

`shared/maintenance/documentComparison.ts`, integer minor units only. Labeled
"Items to verify"; never declares overbilling. Compares subtotal/tax/total
(verify + high tiers), labour hours, added/removed/quantity/unit-price/duplicate
lines, and invoice-only repairs. **Currency restriction:** different currencies
with no rate → hard stop (no amount comparison). Fixed thresholds
(`DOCUMENT_REVIEW_THRESHOLDS`, not configurable). Canadian defaults (km, CAD,
Ontario HST context; not every charge assumed taxable).

## 18. Repair authorization

Pure policy `shared/maintenance/repairAuthorizationPolicy.ts`. A maintenance user
may authorize only when: delegated, assigned, case not critical, within the
delegated limit, values reviewed, no unresolved high variance, and scope matches.
Manager approval is required above limit / critical / unreviewed / high variance;
above the manager ceiling → external approval. Delegation defaults **disabled**.
Records persist to `repairAuthorizations`. Fleet policy is read from the
`repair_document_review` capability's `valueJson` (also settable via pilot
settings).

## 19. External-AI consent & data residency

`externalAiConsent`, default `none`. Owners grant/withdraw; internal admins may
record documented consent with evidence but never impersonate fleet consent
(distinct `source`). Withdrawal/expiry stops future external processing while
preserving prior results, uploads, manual entry, and deterministic comparison.
Because automated extraction is blocked, no external document AI runs today.
**Data residency is not asserted** — see the privacy checklist; use the graded
disclosures rather than claiming Canada-only processing.

## 20. Readiness

`shared/maintenance/pilotReadiness.ts`: Ready / Needs attention / Optional, with
blocking items, warnings, and **targeted degradation** flags (block approvals /
AI case creation / uploads / new cases / metric counting / manual document mode).
Degradation disables only the affected capability — never the whole pilot.
`computePilotReadiness` gathers real inputs (settings, features, consent,
storage/diagnosis availability).

## 21. Pilot metrics & exports

`shared/maintenance/pilotMetrics.ts`: case volume, median time-to-decision, avg
approval time, downtime aggregates, severity/action breakdowns, critical-override
rate, first-time-fix and repeat-repair (exact spec formulas with 30-day
observation windows), document variance, outcome completion, agreement. Pending
observation windows are reported; **no causation is claimed.** Shown compactly in
Fleet Health. Tenant-scoped CSV export (`csvExport.ts`) excludes prompts, signed
URLs, storage keys, raw payloads; formula-injection-safe; includes a metadata
preamble (date/timezone/period/units/currencies); logged.

## 22. Migrations

Hand-written additive SQL, applied in filename order. **The drizzle journal is
abandoned at `0012` repo-wide** (real files run through `0032`, none journalled),
so `drizzle-kit generate/migrate` is not the mechanism and the journal is left
untouched. This feature adds:

| File | Adds |
|------|------|
| `0033_fleet_maintenance_foundations.sql` | fleetFeatures, maintenancePermissions |
| `0034_fleet_maintenance_events_pm_score.sql` | vehicleEvents, pmTemplates, pmAssignments, attentionScore*, repairOutcomes v2 cols |
| `0035_maintenance_cases_decisions_cycles.sql` | maintenance_case_seq, maintenanceCases, maintenanceDecisions, repairCycles |
| `0036_repair_documents_authorization.sql` | repairDocuments, repairAuthorizations |
| `0037_pilot_settings_consent.sql` | pilotSettings, externalAiConsent |

All statements are `IF NOT EXISTS`-guarded (safe to re-run). No drops, no
destructive renames, no data erasure in reverse.

## 23. Deployment order

1. Apply `0033`–`0037` (in order) to the database.
2. Verify the new tables/indexes and the `maintenance_case_seq` sequence exist.
3. Deploy the application with **all flags disabled** (default).
4. Enable `fleet_maintenance_pilot` for one internal demo fleet.
5. Enable capabilities individually and validate each.

## 24. Rollback

1. Suspend pilot activity; disable the umbrella flag (stops automatic creation,
   uploads, and metric counting via fail-closed checks).
2. Revert the application.
3. **Preserve** the additive schema and data (safe to leave in place).
4. Verify diagnosis and issue workflows are unaffected.
5. Re-enable after correction.

## 25. Recovery

- Failed document uploads stay in `failed`/`manual_review_only`; use the manual
  retry (bounded to 3 attempts) or enter values manually.
- Orphaned/partial records are additive and non-blocking; no runtime schema
  repair is enabled for these tables.

## 26. Testing

Run `node scripts/run-vitest.mjs run <paths>` (the runner hardcodes its include
globs; `shared/**` was added so shared unit tests are collected). 120 maintenance
+ regression tests pass; `npx tsc --noEmit` is clean; `pnpm build:client` (real
Vite production build) succeeds. High-risk coverage: feature flags (fail closed),
event idempotency, CSV limits, PM calculations, score rules/cap/double-counting,
status transitions, decision versioning, approval, critical override, document
comparison (variance tiers, tax tolerance, currency restriction, duplicates),
document validation (forged/dangerous types), authorization limits, readiness,
metrics, case references, and the diagnosis regression boundary.

## 27. Manual verification still required

The dev server did not finish starting in the implementation sandbox (a
DB/startup/env issue unrelated to these additive changes), so live browser
verification is outstanding. With the pilot flags enabled for a fleet, walk the
30-step demonstration in the final report and confirm: enable pilot → configure
dates/vehicles → readiness → events + CSV → PM → Fleet Health/score → diagnosis →
auto case → approve/override → downtime/repair → documents/comparison →
authorization → outcome → return to service → close/reopen → metrics → export.

## 28. Deferred work

Automated structured document extraction (blocked; interface ready), a dedicated
internal-admin Pilot Operations page (settings/consent are fully manageable via
the `pilot` staff router today), demo/seed data, and everything explicitly out of
scope (Geotab/Samsara connectors, public API keys, workers/queues, predictive ML,
manufacturer PM schedules, full CMMS, warranty/recurring alerts, emergency
contacts, roadside records, surveys, closeout snapshots, commercial
recommendations).
