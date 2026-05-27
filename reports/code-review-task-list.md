# TruckFixr Fleet AI Code Review Task List

Last updated: 2026-05-27

## Open Tasks

- Task ID: TFX-CR-0003
  - Task: Finish normalizing confirmed diagnosis outcomes so repair confirmation, confirmed cause, AI correctness, and follow-on learning do not depend on loose JSON trails.
  - Category: Knowledge base/history growth
  - Severity: High
  - First discovered date: 2026-05-11
  - Last seen date: 2026-05-27
  - Affected files: `server/routers/diagnostics.ts`, `server/services/diagnosisWorkflow.ts`, `server/services/aiQualityReviewLog.ts`, `server/services/tadisCore.ts`, `drizzle/schema.ts`, `repairOutcomes`, `aiQualityReviews`
  - Status: Open
  - Recommended fix: Batch G - verify repair outcomes are retrieved correctly as similar past cases within the same fleet and confirm manager/mechanic AI-correctness feedback is persisted with reusable structure.
  - Verification command or check required: Confirm a repair outcome, verify normalized storage, then confirm it is retrieved as a future similar solved case within the same fleet only.

- Task ID: TFX-CR-0004
  - Task: Remove broad runtime schema mutation from `server/db.ts` and reduce it to connection/bootstrap responsibilities.
  - Category: Code quality & maintainability
  - Severity: High
  - First discovered date: 2026-05-11
  - Last seen date: 2026-05-27
  - Affected files: `server/db.ts`, `drizzle/*.sql`, `render.yaml`
  - Status: Open
  - Recommended fix: Batch I - move schema guarantees into canonical migrations after fresh-database validation; pair with Supabase source-of-truth work in Batch K.
  - Verification command or check required: Bring up a fresh DB from migrations only, then run app startup, demo seed validation, `pnpm check`, `pnpm test`, builds, and browser smoke.

- Task ID: TFX-CR-0006
  - Task: Add stronger automated coverage for assigned-driver inspection and diagnosis happy paths after access hardening.
  - Category: Daily inspection workflow
  - Severity: Medium
  - First discovered date: 2026-05-11
  - Last seen date: 2026-05-27
  - Affected files: `server/routers/diagnostics.ts`, `server/routers/inspections.ts`, related tests
  - Status: Open
  - Recommended fix: Batch D - add happy-path tests for inspection submit/review, diagnosis, offline queue flush, and idempotency.
  - Verification command or check required: Full `pnpm test` in CI-capable environment plus browser smoke.

- Task ID: TFX-CR-0007
  - Task: Reduce repeated AI cost and latency across multi-question diagnosis sessions.
  - Category: Performance & AI cost control
  - Severity: Medium
  - First discovered date: 2026-05-11
  - Last seen date: 2026-05-27
  - Affected files: `server/routers/diagnostics.ts`, `server/services/diagnosisWorkflow.ts`, `server/services/aiOrchestrator.ts`, `server/services/tadisCore.ts`
  - Status: Open
  - Recommended fix: Batch E/C - add live timing/cost proof, prompt compaction, and lower-end device validation.
  - Verification command or check required: Multi-clarification diagnosis tests with token, retry, cost, and timing assertions.

- Task ID: TFX-CR-0017
  - Task: Add production observability and error monitoring coverage for backend, AI provider, Supabase, Stripe, browser runtime, slow loads, and failed workflows.
  - Category: Observability, logging & error monitoring
  - Severity: Medium
  - First discovered date: 2026-05-12
  - Last seen date: 2026-05-27
  - Affected files: backend services, deployment/runtime configuration, browser runtime hooks
  - Status: Open
  - Recommended fix: Add production-safe redacted monitoring for backend/API, AI provider, Supabase, Stripe, browser runtime errors, and workflow latency.
  - Verification command or check required: Trigger safe test errors/timeouts and verify redacted monitoring events.

- Task ID: TFX-CR-0018
  - Task: Enforce demo/test data exclusion from production analytics, diagnostic learning, billing, and customer reports.
  - Category: Demo/test/production data separation
  - Severity: Medium
  - First discovered date: 2026-05-12
  - Last seen date: 2026-05-27
  - Affected files: `scripts/demo/demoSeedWorkflow.ts`, `shared/demoAssets.ts`, `server/services/adminMetrics.ts`, analytics/reporting/learning/billing consumers
  - Status: Open
  - Recommended fix: Add explicit demo filters or first-class demo markers wherever aggregate analytics, billing, customer reporting, or diagnostic learning consumes seeded records.
  - Verification command or check required: Seed demo data and verify analytics, billing, learning, and customer report queries exclude demo records unless explicitly requested. Latest local run skipped because child-process spawning is blocked.

- Task ID: TFX-CR-0020
  - Task: Add and verify audited staff/admin recovery workflows for pilot support issues.
  - Category: Customer support/admin recovery
  - Severity: High
  - First discovered date: 2026-05-13
  - Last seen date: 2026-05-27
  - Affected files: `server/routers/supportRecovery.ts`, `server/services/supportRecovery.ts`, `drizzle/schema.ts`, `supportRecoveryActions`, support recovery tests
  - Status: Open (implemented; live/staging verification outstanding)
  - Recommended fix: Batch J - verify audit writes work under live/staging DB permissions and add negative role tests for recovery actions.
  - Verification command or check required: Staff-only permission tests, audit log checks, service-role/policy verification for `supportRecoveryActions`, and negative tests for owners/managers/drivers.

- Task ID: TFX-CR-0021
  - Task: Verify pilot-to-paid billing conversion and subscription enforcement in staging.
  - Category: Billing / subscription readiness
  - Severity: Medium
  - First discovered date: 2026-05-13
  - Last seen date: 2026-05-27
  - Affected files: `server/services/stripeBilling.ts`, `server/_core/stripeBillingRoutes.ts`, `server/services/subscriptions.ts`, `server/subscriptions.billing.test.ts`, billing UI, `subscriptions`, `fleets`
  - Status: Open
  - Recommended fix: Batch I - run full checkout, webhook replay, subscription state assertions, route-level plan enforcement tests, and pilot-to-paid data preservation checks.
  - Verification command or check required: `pnpm verify:stripe` full mode, staging checkout, webhook replay, subscription state enforcement. Latest evidence: 2026-05-27 Stripe-lite passed only.

- Task ID: TFX-CR-0022
  - Task: Complete real Android/mobile timing verification after the shared frontend bundle split.
  - Category: Performance / Loading Speed
  - Severity: Medium
  - First discovered date: 2026-05-14
  - Last seen date: 2026-05-27
  - Affected files: `vite.config.mjs`, `client/src/App.tsx`, shared dashboard/auth/vendor bundles
  - Status: Open (bundle split implemented; real mobile timing outstanding)
  - Recommended fix: Run a real Android Chrome/Brave or throttled mobile-browser timing pass against the production build and record route-level load measurements.
  - Verification command or check required: Mobile/browser timing for initial shell, login, driver dashboard, manager dashboard, inspection start, diagnosis routes. Latest evidence: 2026-05-27 `pnpm build:client` reports `vendor-shared-BU_WnMg_.js` at 125.65 KB gzip.

- Task ID: TFX-CR-0023
  - Task: Restore trustworthy verification across sandbox/CI environments so browser smoke, demo-seed validation, dependency audit, full Vitest, and end-to-end release checks are not blocked by environment restrictions.
  - Category: Developer experience / verification reliability
  - Severity: High
  - First discovered date: 2026-05-18
  - Last seen date: 2026-05-27
  - Affected files: `scripts/run-vitest.mjs`, `scripts/run-build-client.mjs`, `scripts/run-validate-demo-seed.mjs`, `scripts/verify/browser-smoke-lite.ts`, Vite/Vitest/esbuild/tsx/Playwright toolchain
  - Status: Open (improved; full Vitest/browser smoke/demo validation still needs capable-environment proof)
  - Recommended fix: Batch I - keep the CI/non-restricted verification path and replace the placeholder browser smoke probe with real route checks when practical.
  - Verification command or check required: In a CI-capable environment, full Vitest, real browser smoke, demo validation, audit, and release builds pass end-to-end. Latest evidence: 2026-05-27 fallback `pnpm test` passed 5/5, browser smoke skipped, demo validation skipped, audit passed threshold with no Critical/High advisories.

- Task ID: TFX-CR-0024
  - Task: Review and harden the internal admin metrics/dashboard feature.
  - Category: Security / internal tooling & operations
  - Severity: High
  - First discovered date: 2026-05-22
  - Last seen date: 2026-05-27
  - Affected files: `server/routers/admin.ts`, `server/services/adminMetrics.ts`, `client/src/pages/AdminMetricsDashboard.tsx`, `client/src/pages/AdminFleetDetail.tsx`, `drizzle/0024_admin_metrics_dashboard.sql`
  - Status: Open
  - Recommended fix: Batch B - ensure admin endpoints remain TruckFixr-internal-only in production, exports are super-admin-only, metrics queries are bounded/optimized, and PII is redacted where appropriate.
  - Verification command or check required: Unit tests for role gates/export permissions, staging non-admin denial checks, and query performance checks for largest filters.

- Task ID: TFX-CR-0027
  - Task: Finalize, commit, or explicitly defer the linked-vehicle summary and Radix dialog/select stability WIP as one deployable unit.
  - Category: Deployment hygiene / stability
  - Severity: High
  - First discovered date: 2026-05-24
  - Last seen date: 2026-05-27
  - Affected files: `server/routers/vehicles.ts`, `client/src/pages/ManagerDashboardFixed.tsx`, `client/src/pages/DriverDashboardSaaS.tsx`, `client/src/pages/DriverInspectionNSC.tsx`, `client/src/pages/DriverDiagnosis.tsx`, `client/src/lib/driverVehicles.ts`, `client/src/lib/driverVehicleContext.ts`, `client/src/components/VehicleCaptureFlow.tsx`, `client/src/components/VehicleAccessRequestDialog.tsx`, `scripts/demo/demoSeedWorkflow.ts`
  - Status: Implemented in working tree; commit/deploy handoff pending
  - Recommended fix: Commit, stage for review, or explicitly defer the verified Batch A file set as one deployable unit.
  - Verification command or check required: `pnpm check`, `pnpm build:client`, `pnpm build:server`, `pnpm validate:demo-seed`, browser shell smoke, and authenticated role walkthrough.

- Task ID: TFX-CR-0028
  - Task: Ensure daily code review reports are tracked/committed or intentionally ignored.
  - Category: Repo hygiene / reporting continuity
  - Severity: Medium
  - First discovered date: 2026-05-25
  - Last seen date: 2026-05-27
  - Affected files: `reports/daily-code-review-*.md`
  - Status: Open
  - Recommended fix: Treat daily reports as first-class tracked artifacts; update automation/flow so the previous report is not left untracked or is explicitly ignored with rationale.
  - Verification command or check required: `git status --short` shows no untracked `reports/daily-code-review-*.md` after each run; prior day report is present in git history or staged for commit.

## Supabase / Database Tasks

- Task ID: TFX-CR-0031
  - Task: Verify or implement Supabase Storage privacy for inspection/defect photos and uploaded evidence.
  - Category: Supabase database, RLS, storage & data safety
  - Severity: High
  - First discovered date: 2026-05-27
  - Last seen date: 2026-05-27
  - Affected files/tables/policies/buckets/functions: `client/src/pages/DriverInspectionNSC.tsx`, `client/src/pages/VerifiedInspection.tsx`, `drizzle/0007_verified_inspections.sql`, `inspectionPhotos`, `defects.photoUrls`, `server/storage.ts`, Supabase storage buckets/policies if adopted
  - Status: Open (policy plan drafted; implementation/proof pending)
  - Recommended fix: Use `docs/supabase-storage-privacy-plan.md` to decide whether pilot photos stay as limited data URLs or move to private Supabase Storage. If Supabase Storage is used, add private buckets, tenant-aware path/metadata rules, MIME/size limits, signed URL rules, orphan cleanup, and cross-company RLS/storage tests.
  - Verification command or check required: In local/staging, upload files as Company A driver/manager and prove Company B users cannot read them; verify file metadata links company, vehicle, inspection, defect, user, and repair records.
  - Related batch: Batch K
  - Cross-reference batch if applicable: Batch B, Batch F

- Task ID: TFX-CR-0032
  - Task: Resolve Supabase schema source-of-truth and generated database type drift.
  - Category: Supabase generated types / migration quality
  - Severity: Medium
  - First discovered date: 2026-05-27
  - Last seen date: 2026-05-27
  - Affected files/tables/policies/buckets/functions: `drizzle/schema.ts`, `drizzle/*.sql`, `supabase/migrations/20260403_expand_diagnostic_sessions.sql`, generated Supabase type files if added
  - Status: Open
  - Recommended fix: Document whether Drizzle is canonical and Supabase migrations are supplemental, or align Supabase migration/type generation workflow. Add safe type-generation instructions if Supabase clients are used directly.
  - Verification command or check required: Fresh schema build from canonical migrations; generated types exist or explicit Drizzle-only decision is documented; app typecheck passes.
  - Related batch: Batch K
  - Cross-reference batch if applicable: Batch I

## In Progress Tasks

- Task ID: TFX-CR-0003
  - Task: Finish normalizing confirmed diagnosis outcomes.
  - Category: Knowledge base/history growth
  - Severity: High
  - Owner, if known: Codex / Batch G follow-up
  - Status: Implemented partially; retrieval proof active
  - Notes: Real-data same-fleet retrieval proof still outstanding.

- Task ID: TFX-CR-0020
  - Task: Add audited staff/admin recovery workflows for pilot support issues.
  - Category: Customer support/admin recovery
  - Severity: High
  - Owner, if known: Codex / Batch J follow-up
  - Status: Implemented; live/staging audit-write verification outstanding
  - Notes: Staff-only routing and tests re-inspected 2026-05-27.

## Resolved Tasks

- Task ID: TFX-CR-0001
  - Task: Complete live verification of the RLS hardening migrations.
  - Category: Security & access control
  - Resolved date: 2026-05-18
  - Evidence of resolution: `pnpm verify:rls` passed; reconfirmed 2026-05-27 with six checks green. Environment-classification guardrail is tracked separately under `TFX-CR-0030`.

- Task ID: TFX-CR-0002
  - Task: Restore a fully green automated test suite.
  - Category: Bug fixes & stability
  - Resolved date: 2026-05-13
  - Evidence of resolution: Full `pnpm test` previously passed 23 test files / 171 tests in non-sandboxed environment. Current restricted-environment full Vitest gap is tracked separately under `TFX-CR-0023`.

- Task ID: TFX-CR-0005
  - Task: Audit and constrain `getUserPrimaryFleetId` fallback auto-membership creation.
  - Category: Security & access control
  - Resolved date: 2026-05-14
  - Evidence of resolution: `server/services/companyAccess.ts` no longer auto-creates active memberships from legacy inference.

- Task ID: TFX-CR-0008
  - Task: Add a missed-inspection reminder or compliance scheduler.
  - Category: Daily inspection workflow
  - Resolved date: 2026-05-13
  - Evidence of resolution: `server/services/inspectionReminders.ts` and test file exist; full `pnpm test` previously passed.

- Task ID: TFX-CR-0009
  - Task: Reduce session lifetime and add sliding refresh.
  - Category: Security & access control
  - Resolved date: 2026-05-11
  - Evidence of resolution: `shared/const.ts` 24-hour session; `server/_core/context.ts` refreshes cookie.

- Task ID: TFX-CR-0010
  - Task: Reject invalid `fleetId` during vehicle creation.
  - Category: Security & access control
  - Resolved date: 2026-05-11
  - Evidence of resolution: `server/routers/vehicles.ts` requires positive `fleetId`.

- Task ID: TFX-CR-0011
  - Task: Persist onboarding truck setup and invitation steps.
  - Category: UI/UX & mobile usability
  - Resolved date: 2026-05-11
  - Evidence of resolution: `client/src/pages/Onboarding.tsx` calls vehicle create, invite member, and managed driver invite.

- Task ID: TFX-CR-0012
  - Task: Consolidate manager dashboard entry points.
  - Category: UI/UX & mobile usability
  - Resolved date: 2026-05-11
  - Evidence of resolution: Routing consolidated to canonical manager dashboard.

- Task ID: TFX-CR-0013
  - Task: Prevent low-confidence diagnosis dead-end.
  - Category: AI diagnosis workflow
  - Resolved date: 2026-05-13
  - Evidence of resolution: `server/services/diagnosisWorkflow.ts` supports continued/fallback clarification.

- Task ID: TFX-CR-0015
  - Task: Repair Supabase Auth UUID to app-user ID mapping in RLS policies.
  - Category: Security & access control
  - Resolved date: 2026-05-13
  - Evidence of resolution: `drizzle/0015_harden_rls_and_sessions.sql` defines `current_app_user_id()`; RLS verification reconfirmed 2026-05-27.

- Task ID: TFX-CR-0019
  - Task: Resolve critical/high dependency audit advisories.
  - Category: Security / Dependency Risk
  - Resolved date: 2026-05-14
  - Evidence of resolution: 2026-05-27 `$env:NODE_OPTIONS='--use-system-ca'; pnpm audit --audit-level=high` reported only 1 low and 11 moderate advisories.

- Task ID: TFX-CR-0025
  - Task: Commit and apply migration 0025 before deploying the offline queue feature.
  - Category: Data integrity / deployment readiness
  - Resolved date: 2026-05-23
  - Evidence of resolution: `drizzle/0025_driver_mode_queue_idempotency.sql` is committed.

- Task ID: TFX-CR-0026
  - Task: Commit or revert the untracked Quick Start + inspection review workflow changes and migrations `0026`/`0027` as one coherent deployable unit.
  - Category: Deployment hygiene / migration discipline
  - Resolved date: 2026-05-24
  - Evidence of resolution: `git ls-files` confirmed related Quick Start and inspection review files were tracked at that time.

- Task ID: TFX-CR-0029
  - Task: Repair the spawn-safe lite test harness so stale fallback assertions do not fail `pnpm test` after chunk-recovery changes.
  - Category: Developer experience / verification reliability
  - Resolved date: 2026-05-26
  - Evidence of resolution: Reconfirmed 2026-05-27; `pnpm test` fallback mode passed 5/5 checks.

- Task ID: TFX-CR-0030
  - Task: Add environment classification and guardrails before any Supabase/Postgres verification script writes test rows, even in rollback transactions.
  - Category: Supabase database safety / verification reliability
  - Resolved date: 2026-05-27
  - Evidence of resolution: `scripts/verify/db-target-guard.ts` now classifies DB targets; `scripts/verify/rls.ts`, `scripts/verify/stripe.ts`, and `scripts/verify/apply-readiness-migrations.ts` use it. `pnpm verify:rls` now exits before writes against the unclassified remote Supabase host with a clear staging/production approval message.

## Deferred Tasks

- Task ID: TFX-CR-0014
  - Task: Expand onboarding to support larger initial team setup flows.
  - Category: UI/UX & mobile usability
  - Reason deferred: Higher-priority support recovery, billing, verification, Supabase storage, and knowledge-model work outstanding.
  - Revisit date or trigger: Revisit after `TFX-CR-0003`, `TFX-CR-0020`, `TFX-CR-0021`, and `TFX-CR-0031` are resolved.

- Task ID: TFX-CR-0016
  - Task: Verify and repair possible diagnosis router drift around historical similarity and cause taxonomy.
  - Category: AI diagnosis workflow
  - Reason deferred: Current diagnosis workflow is stable enough for internal testing; higher-priority verification and learning-loop work outstanding.
  - Revisit date or trigger: Revisit when Batch C or Batch G is approved.

## New Tasks From Today

- Task ID: TFX-CR-0030
  - Task: Add environment classification and guardrails before remote Supabase/Postgres verification scripts write test rows.
  - Category: Supabase database safety / verification reliability
  - Severity: High
  - Affected files: `scripts/verify/rls.ts`, `scripts/verify/stripe.ts`, demo/seed verification scripts
  - Recommended next action: Resolved for script guardrails; configure `TFX_DATABASE_TARGET=staging` and `ALLOW_STAGING_DB_VERIFY_WRITES=true` only for safe staging verification reruns.

- Task ID: TFX-CR-0031
  - Task: Verify or implement Supabase Storage privacy for inspection/defect photos and uploaded evidence.
  - Category: Supabase database, RLS, storage & data safety
  - Severity: High
  - Affected files: inspection photo UI, `inspectionPhotos`, `defects.photoUrls`, `server/storage.ts`, Supabase bucket/policy files if added
  - Recommended next action: Approve Batch K + Batch B storage privacy plan.

- Task ID: TFX-CR-0032
  - Task: Resolve Supabase schema source-of-truth and generated database type drift.
  - Category: Supabase generated types / migration quality
  - Severity: Medium
  - Affected files: `drizzle/schema.ts`, `drizzle/*.sql`, `supabase/migrations/*`, generated database types
  - Recommended next action: Decide whether Drizzle remains canonical or add Supabase type generation workflow.

## Rolling Implementation Roadmap

| Order | Workstream / Batch | Current Priority | Why It Matters | Status | Dependencies | Last Updated |
|---:|---|---|---|---|---|---|
| 1 | Supabase Storage privacy and file-access proof (`TFX-CR-0031`, Batch K/B) | High | Protects inspection/defect/customer file privacy | Policy plan drafted; implementation/proof open | Storage direction decision | 2026-05-27 |
| 2 | Verification reliability across environments (`TFX-CR-0023`, Batch I) | Critical | Full tests, real browser smoke, demo validation, and audit evidence are needed before reliable pilot expansion | Improved; still open | CI/spawn-capable and network-capable verification path | 2026-05-27 |
| 3 | Current linked-vehicle/dialog WIP deploy decision (`TFX-CR-0027`, Batch A) | High | Prevents local/demo/deploy mismatch on active manager/driver vehicle flows | Implemented in worktree; handoff pending | Commit/deploy decision | 2026-05-27 |
| 4 | Real Android/mobile timing proof (`TFX-CR-0022`, Batch E) | High | Confirms bundle split improves field loading behavior | Bundle split implemented; timing outstanding | Browser/mobile run | 2026-05-27 |
| 5 | Admin metrics authz hardening (`TFX-CR-0024`, Batch B) | High | Protects internal/customer operational data | Open | None | 2026-05-27 |
| 6 | Support/admin recovery verification (`TFX-CR-0020`, Batch J) | High | Controlled pilots need safe recovery and auditable remediation | Implemented; verification active | Verified staging DB | 2026-05-27 |
| 7 | Revenue/billing readiness (`TFX-CR-0021`, Batch I) | Medium/High | Enables pilot-to-paid conversion without account-state drift | Stripe-lite green; full replay pending | Stripe staging access | 2026-05-27 |
| 8 | Knowledge base/history and TADIS learning data (`TFX-CR-0003`, Batch G) | Medium/High | Builds long-term product advantage from confirmed outcomes | Active | Stable verification path | 2026-05-27 |
| 9 | Daily inspection workflow deeper proof (`TFX-CR-0006`, Batch D) | High | Core daily fleet workflow still needs full submit/review proof | Static/code proof; browser blocked | `TFX-CR-0023` | 2026-05-27 |
| 10 | Demo/test/production separation (`TFX-CR-0018`) | Medium | Prevents seeded records polluting analytics, billing, and learning | Active | Demo validation capable env | 2026-05-27 |
| 11 | Performance and AI cost control (`TFX-CR-0007`, Batch E/C) | Medium | Controls operating cost and latency | Active | Timing telemetry | 2026-05-27 |
| 12 | Backup/recovery, maintainability, `server/db.ts` cleanup (`TFX-CR-0004`, Batch I/K) | Medium/High | Reduces migration and restore risk | Open | Canonical migration proof | 2026-05-27 |
