# TruckFixr Fleet AI Code Review Task List

Last updated: 2026-07-12

## Open Tasks

- Task ID: TFX-CR-0003
  - Task: Finish normalizing confirmed diagnosis outcomes so repair confirmation, confirmed cause, AI correctness, and follow-on learning do not depend on loose JSON trails.
  - Category: Knowledge base/history growth
  - Severity: High
  - First discovered date: 2026-05-11
  - Last seen date: 2026-06-09
  - Affected files: `server/routers/diagnostics.ts`, `server/services/confirmedOutcomes.ts`, `server/services/confirmedOutcomes.test.ts`, `server/services/diagnosisWorkflow.ts`, `server/services/aiQualityReviewLog.ts`, `server/services/tadisCore.ts`, `drizzle/schema.ts`, `repairOutcomes`, `aiQualityReviews`
  - Status: In Progress (retrieval logic extracted + unit-tested + cross-fleet guard added; live same-fleet DB proof still outstanding)
  - Recommended fix: Batch G - verify repair outcomes are retrieved correctly as similar past cases within the same fleet and confirm manager/mechanic AI-correctness feedback is persisted with reusable structure.
  - Verification command or check required: Confirm a repair outcome, verify normalized storage, then confirm it is retrieved as a future similar solved case within the same fleet only. Latest evidence: 2026-06-14 (Rec #3) extracted the inline confirmed-outcome selection/ranking into a pure, testable `server/services/confirmedOutcomes.ts` (`buildConfirmedOutcomeReferences`) with a defensive `droppedForeignFleetCount` cross-fleet guard that drops any non-requested-fleet row before it reaches the AI prompt and emits a `cross_fleet_outcome_filtered` observability warning. `confirmedOutcomes.test.ts` added (similarity ranking, top-N cap, parts/AI-accuracy/case-link summary, normalized-over-feedback priority, stored-signal boosting, and same-fleet isolation). `pnpm run check` passed; targeted Vitest passed 17/17 (confirmedOutcomes + diagnosticSupport + diagnosticFeedbackPersistence) and 53/53 (diagnostics.flow + tadis + diagnosisWorkflow); lite harness 9/9. Still outstanding: the live DB proof that the SQL fleet filter + retrieval surface a confirmed outcome to a future same-fleet case and never to a different fleet (needs a classified staging/local target).

- Task ID: TFX-CR-0004
  - Task: Remove broad runtime schema mutation from `server/db.ts` and reduce it to connection/bootstrap responsibilities.
  - Category: Code quality & maintainability
  - Severity: High
  - First discovered date: 2026-05-11
  - Last seen date: 2026-05-28
  - Affected files: `server/db.ts`, `drizzle/*.sql`, `render.yaml`
  - Status: Open
  - Recommended fix: Batch I - move schema guarantees into canonical migrations after fresh-database validation; pair with Supabase source-of-truth work in Batch K.
  - Verification command or check required: Bring up a fresh DB from migrations only, then run app startup, demo seed validation, `pnpm check`, `pnpm test`, builds, and browser smoke.

- Task ID: TFX-CR-0006
  - Task: Add stronger automated coverage for assigned-driver inspection and diagnosis happy paths after access hardening.
  - Category: Daily inspection workflow
  - Severity: Medium
  - First discovered date: 2026-05-11
  - Last seen date: 2026-06-12
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
  - Last seen date: 2026-06-14
  - Affected files: `server/services/observability.ts`, `server/services/observability.test.ts`, `server/_core/env.ts`, `server/_core/index.ts`, `server/_core/stripeBillingRoutes.ts`, `server/services/aiOrchestrator.ts`, `server/routers/admin.ts`, `client/src/lib/observability.ts`, `client/src/main.tsx`
  - Status: In Progress (implemented; staging verification pending)
  - Recommended fix: Add production-safe redacted monitoring for backend/API, AI provider, Supabase, Stripe, browser runtime errors, and workflow latency.
  - Verification command or check required: Trigger safe test errors/timeouts and verify redacted monitoring events. Latest evidence: 2026-06-14 founder-approved build added a self-contained redacted observability module (severity/category events, email/VIN/phone/token/JWT/data-URL redaction, bounded in-memory ring buffer + counters, console sink plus optional `OBSERVABILITY_WEBHOOK_URL`). Wired into tRPC `onError` (backend/Supabase/Stripe split), AI orchestrator call summaries + failed attempts, slow-route timing, Stripe webhook failures, server startup errors, and a redacted client beacon (`/api/observability/client`) fed by `client/src/lib/observability.ts`. Staff-only `admin.observability` summary endpoint added. `pnpm run check` passed, `server/services/observability.test.ts` passed 15/15, affected service tests passed 29/29, `node scripts/run-tests-lite.mjs` passed 9/9, and `pnpm run build:server` succeeded. Remaining: trigger real redacted events in staging and decide whether to add a persistent sink/log drain beyond the in-memory buffer.

- Task ID: TFX-CR-0018
  - Task: Enforce demo/test data exclusion from production analytics, diagnostic learning, billing, and customer reports.
  - Category: Demo/test/production data separation
  - Severity: Medium
  - First discovered date: 2026-05-12
  - Last seen date: 2026-05-27
  - Affected files: `scripts/demo/demoSeedWorkflow.ts`, `shared/demoAssets.ts`, `server/services/adminMetrics.ts`, analytics/reporting/learning/billing consumers
  - Status: Open
  - Recommended fix: Add explicit demo filters or first-class demo markers wherever aggregate analytics, billing, customer reporting, or diagnostic learning consumes seeded records.
  - Verification command or check required: Seed demo data and verify analytics, billing, learning, and customer report queries exclude demo records unless explicitly requested. Latest evidence: 2026-05-27 elevated `pnpm validate:demo-seed` passed, including demo-only rollback scope and runtime company separation checks.

- Task ID: TFX-CR-0020
  - Task: Add and verify audited staff/admin recovery workflows for pilot support issues.
  - Category: Customer support/admin recovery
  - Severity: High
  - First discovered date: 2026-05-13
  - Last seen date: 2026-05-27
  - Affected files: `server/routers/supportRecovery.ts`, `server/services/supportRecovery.ts`, `drizzle/schema.ts`, `supportRecoveryActions`, support recovery tests
  - Status: Open (improved; staff-only audit-list query and non-staff denial proof green, live/staging audit-write verification outstanding)
  - Recommended fix: Batch J - verify audit writes work under live/staging DB permissions, keep negative role tests for recovery actions, and exercise staff-only audit review in staging.
  - Verification command or check required: Staff-only permission tests, audit log checks, service-role/policy verification for `supportRecoveryActions`, and negative tests for owners/managers/drivers. Latest evidence: 2026-05-27 `server/supportRecovery.test.ts` passed 9 tests, targeted storage/RLS/support Vitest passed 3 files / 24 tests, and final full Vitest passed 35 files / 243 tests.

- Task ID: TFX-CR-0021
  - Task: Verify pilot-to-paid billing conversion and subscription enforcement in staging.
  - Category: Billing / subscription readiness
  - Severity: Medium
  - First discovered date: 2026-05-13
  - Last seen date: 2026-05-27
  - Affected files: `server/services/stripeBilling.ts`, `server/_core/stripeBillingRoutes.ts`, `server/services/subscriptions.ts`, `server/subscriptions.billing.test.ts`, billing UI, `subscriptions`, `fleets`
  - Status: Open (improved; local pilot-to-paid webhook conversion marker covered, staging checkout/webhook replay outstanding)
  - Recommended fix: Batch I - run full checkout, webhook replay, subscription state assertions, route-level plan enforcement tests, and pilot-to-paid data preservation checks.
  - Verification command or check required: `pnpm verify:stripe` full mode, staging checkout, webhook replay, subscription state enforcement. Latest evidence: 2026-05-27 Stripe-lite passed, targeted `server/subscriptions.billing.test.ts` passed 9 tests, and paid checkout webhook now marks active Pilot Access converted to paid.

- Task ID: TFX-CR-0022
  - Task: Complete real Android/mobile timing verification after the shared frontend bundle split.
  - Category: Performance / Loading Speed
  - Severity: Medium
  - First discovered date: 2026-05-14
  - Last seen date: 2026-05-27
  - Affected files: `vite.config.mjs`, `client/src/App.tsx`, `client/src/pages/Pricing.tsx`, shared dashboard/auth/vendor bundles
  - Status: In Progress (Rec #5 landed the Pricing comparison-table mobile fix + a fresh bundle snapshot; real device timing still outstanding)
  - 2026-06-14 (Rec #5): made the Pricing comparison table scroll horizontally inside its own container with a pinned Feature column + a small-screen "Swipe to compare plans" hint, so the 6-column table no longer crushes columns or forces page-level horizontal scroll on 360-390px. Produced a fresh production bundle via `pnpm run build:client` (exit 0): largest assets vendor-shared 381.15 kB / gzip 125.65 kB, vendor-charts 275.72 kB / gzip 63.08 kB. Device-timing + responsive checklist added at `reports/batch-mobile-timing-checklist.md`. The client observability beacon now auto-reports loads over 6s (`slow_page_load`). `pnpm run check` passed. Still outstanding: real Android Chrome/Brave route-level FCP/LCP/TTI capture (needs a device/throttled browser).
  - Recommended fix: Run a real Android Chrome/Brave or throttled mobile-browser timing pass against the production build and record route-level load measurements.
  - Verification command or check required: Mobile/browser timing for initial shell, login, driver dashboard, manager dashboard, inspection start, diagnosis routes. Latest evidence: 2026-06-12 daily review again could not run a fresh client build due spawn restrictions; the existing `dist/public` snapshot still showed 70 files / 1,938,365 bytes, including `vendor-shared-BU_WnMg_.js` at 381,154 raw bytes.

- Task ID: TFX-CR-0023
  - Task: Restore trustworthy verification across sandbox/CI environments so browser smoke, demo-seed validation, dependency audit, full Vitest, and end-to-end release checks are not blocked by environment restrictions.
  - Category: Developer experience / verification reliability
  - Severity: High
  - First discovered date: 2026-05-18
  - Last seen date: 2026-06-12
  - Affected files: `scripts/lib/verify-report.mjs`, `scripts/lib/spawn-env.mjs`, `scripts/run-vitest.mjs`, `scripts/run-build-client.mjs`, `scripts/run-validate-demo-seed.mjs`, `scripts/run-tests-lite.mjs`, `scripts/verify/browser-smoke-lite.ts`, Vite/Vitest/esbuild/tsx/Playwright toolchain
  - Status: In Progress (Rec #4 landed structured verdicts + clean exit semantics; full suite green locally; real CI/restricted-shell matrix proof still recommended)
  - 2026-06-14 (Rec #4): added a shared verdict layer so every wrapper emits one machine-parseable `[verify-result] {check,mode,status,reason}` line and a skip is no longer indistinguishable from a pass. New `scripts/lib/verify-report.mjs` (`exitCodeForStatus`, `requireFullVerification`, `finishVerification`) defines exit semantics: passed=0, failed=1, skipped=0 locally but 1 under CI/`TFX_REQUIRE_SPAWN`. New `scripts/lib/spawn-env.mjs` de-duplicates the Windows `net use` probe patch + spawn detection and replaces the non-portable `cmd.exe` probe (which false-skipped on Linux CI) with a portable `node -e` probe. Refactored `run-vitest.mjs` (removed the duplicated/ambiguous `exit(1)`; full-pass/full-fail/lite-pass/CI-skip now each emit a distinct verdict), `run-build-client.mjs`, `run-validate-demo-seed.mjs`, and `browser-smoke-lite.ts`. Verification: `pnpm run check` passed; `pnpm test` ran the full suite 37 files / 270 tests and exited `0` with `[verify-result] ... "status":"passed"`; `node scripts/run-tests-lite.mjs` passed 10/10 (added a `verifyReport` exit-code test); `node scripts/verify/browser-smoke-lite.ts` emitted a structured passed verdict.
  - Recommended fix: Batch I - keep the CI/non-restricted verification path and replace the placeholder browser smoke probe with real route checks when practical.
  - Verification command or check required: In a CI-capable environment, full Vitest, real browser smoke, demo validation, audit, and release builds pass end-to-end. Latest evidence: 2026-06-12 approved Batch I restored the spawn-safe path: `node scripts/run-tests-lite.mjs` passed 9/9 checks, `node scripts/run-vitest.mjs` exited `0`, and `pnpm run test` now exits `0` after the spawn-blocked fallback; `pnpm run build:client`, `pnpm run validate:demo-seed`, and `pnpm run verify:browser-smoke` still return spawn-blocked skip results in this shell.

  - 2026-07-02 review evidence: the Codex runtime supplied pnpm 11.7.0 for this pnpm 10.27.0 project, ignored the `package.json` `pnpm.overrides`/`patchedDependencies`, attempted an install, and aborted on the non-interactive modules purge. Direct pinned binaries still proved `tsc --noEmit` exit 0, server build exit 0, and Vitest 47 files / 339 tests exit 0. Client Vite build and browser smoke remained spawn-blocked (`EPERM`). Keep the CI-pinned pnpm 10 path authoritative and add a launcher/version preflight so daily automation cannot confuse dependency-tool failure with product failure.

- Task ID: TFX-CR-0024
  - Task: Review and harden the internal admin metrics/dashboard feature.
  - Category: Security / internal tooling & operations
  - Severity: High
  - First discovered date: 2026-05-22
  - Last seen date: 2026-06-12
  - Affected files: `server/routers/admin.ts`, `server/services/adminMetrics.ts`, `client/src/pages/AdminMetricsDashboard.tsx`, `client/src/pages/AdminFleetDetail.tsx`, `client/src/pages/ManagerDashboardFixed.tsx`, `drizzle/0024_admin_metrics_dashboard.sql`
  - Status: Open (improved; read-only viewer PII masking and staff-verified menu visibility landed, but staging authz/export proof is still outstanding)
  - Recommended fix: Batch B - ensure admin endpoints remain TruckFixr-internal-only in production, exports are super-admin-only, metrics queries are bounded/optimized, and PII is redacted where appropriate.
  - Verification command or check required: Unit tests for role gates/export permissions, staging non-admin denial checks, and query performance checks for largest filters. Latest evidence: 2026-06-12 approved Batch B added server-side `canViewPii` handling, masked member/invite emails plus VINs for `read_only_viewer`, and changed the manager-menu admin link to follow `trpc.admin.me` instead of only `user.internalAdminRole`; staging non-admin denial and large-filter performance proof still pending.

## Supabase / Database Tasks

- Task ID: TFX-CR-0040
  - Task: Enable Row Level Security (and add `service_role_full_access` + fleet-scoped policies where appropriate) on tables created AFTER migration 0012's global RLS loop. Migration 0012 enables RLS only for tables existing at that time; these later tables are not covered.
  - Category: Security & access control / Supabase RLS (defense-in-depth)
  - Severity: High (practical exploitability Low — no browser Supabase client; access is server-only with app-layer fleet scoping)
  - First discovered date: 2026-06-24
  - Last seen date: 2026-07-12
  - Affected files/tables: `inspectionReviewActions` and `inspectionReviewQueueItems` (received policies in `0026` that are INERT without RLS enabled), `adminFleetNotes`, `combinedInspectionSessions`, `lead_submissions`; fix lands in a new `drizzle/0031_*.sql`
  - Status: **Live-verified, mostly passing (12/13 checks); one flagged follow-up.** First successful live run against the actual database — every prior review was blocked by the target-classification guard refusing an unclassified remote target.
  - Recommended fix: mirror the `0030`/`0012` pattern — `ALTER TABLE … ENABLE ROW LEVEL SECURITY` + `service_role_full_access` policy, plus authenticated fleet-scoped SELECT where the table is fleet-owned.
  - Verification command or check required: apply on staging; `SELECT relname, relrowsecurity FROM pg_class WHERE relname IN (...)`; extend `scripts/verify/rls.ts` to assert cross-company denial on these tables.
  - Related batch: Batch K (cross-ref Batch B)
  - 2026-07-02 evidence: `server/rlsPolicies.test.ts` and the full suite passed, and `scripts/verify/rls.ts` correctly refused the unclassified remote Supabase target. Apply/behavior proof remains required on a classified disposable staging database.
  - 2026-07-12 evidence: with founder approval, ran `scripts/verify/rls.ts` locally against the real Supabase DB (`TFX_DATABASE_TARGET=staging ALLOW_STAGING_DB_VERIFY_WRITES=true`; no separate disposable staging project exists yet). The script wraps all writes in a single `BEGIN`/`ROLLBACK`; confirmed live afterward that zero rows matching the run's naming pattern (`rls-%truckfixr.test`, `RLS Fleet %`) persisted. 12 of 13 live assertions passed: post-0012 RLS-enabled status on all 5 tables, cross-fleet vehicle/subscription/early-warning/review-queue/review-action/combined-session/admin-note isolation, support-recovery-audit visibility rules, and `lead_submissions` correctly hidden from authenticated users. **One failure:** `service_role should read verification lead submissions` — `service_role` could not read a `lead_submissions` row it should be able to. Not yet root-caused (could be a genuine `service_role` grant/policy gap on `lead_submissions`, or a test artifact); practical exposure is likely low regardless since the main app connects via an owner-level role that bypasses RLS entirely (RLS is defense-in-depth for the Supabase Data API path only). Needs a scoped follow-up before this task is called resolved. Also noted in passing, unrelated to this run: two pre-existing orphaned `stripe-verify-*@truckfixr.test` rows (dated 2026-05-20) from an older, separately-run Stripe verification script that didn't clean up after itself — left in place pending explicit approval to delete.

- Task ID: TFX-CR-0031
  - Task: Verify or implement Supabase Storage privacy for inspection/defect photos and uploaded evidence.
  - Category: Supabase database, RLS, storage & data safety
  - Severity: High
  - First discovered date: 2026-05-27
  - Last seen date: 2026-07-02
  - Affected files/tables/policies/buckets/functions: `client/src/pages/DriverInspectionNSC.tsx`, `client/src/pages/VerifiedInspection.tsx`, `drizzle/0007_verified_inspections.sql`, `inspectionPhotos`, `defects.photoUrls`, `server/storage.ts`, `docs/supabase-storage-privacy-plan.md`, `server/storagePolicies.test.ts`, `supabase/migrations/20260527113000_storage_privacy_policies.sql`
  - Status: In Progress (repo-level migration + static policy proof present; online evidence upload path added; source classification and malformed photo-URL rejection landed; live/local/staging storage behavior proof pending)
  - 2026-06-14 architecture finding: the live photo flow uploads via the Forge storage proxy (`server/storage.ts`, `BUILT_IN_FORGE_API_*`) and the client renders `imageUrl`/`photoUrls` directly, so the Supabase Storage RLS policies in `supabase/migrations/20260527113000_storage_privacy_policies.sql` are INERT for the live flow. Upload authz is enforced in app code (`inspections.uploadEvidencePhoto`), but there is NO access-controlled read endpoint — photo-read privacy currently relies on Forge URL unguessability or `inspectionPhotos`/`defects` table RLS (inline data URLs). Proof harness added at `reports/batch-photo-privacy-proof.md`. Decision needed: add an MVP access-controlled signed-read endpoint (no Supabase Storage re-platform) vs. full migration to Supabase Storage + signed URLs.
  - Recommended fix: Apply `supabase/migrations/20260527113000_storage_privacy_policies.sql` only to a verified local/staging Supabase project, then decide whether pilot photos stay as limited data URLs or move to private Supabase Storage. Before real fleet use, prove private buckets, tenant-aware path/metadata rules, MIME/size limits, signed URL rules, orphan cleanup, and cross-company storage denial.
  - Verification command or check required: In local/staging, upload files as Company A driver/manager and prove Company B users cannot read/list/signed-url them; verify file metadata links company, vehicle, inspection, defect, user, and repair records. Latest evidence: 2026-06-12 approved Batch K added server-side evidence source classification plus malformed photo-URL rejection in inspection submission paths, and the spawn-safe lite harness now asserts the scoped key + source normalization rules; fresh local/staging storage-behavior proof is still missing.
  - Related batch: Batch K
  - Cross-reference batch if applicable: Batch B, Batch F
  - 2026-07-02 evidence: static Storage policy tests passed, but the live application still uses the Forge storage proxy rather than Supabase Storage. The draft backup runbook incorrectly describes Supabase Storage as the current object store, so privacy, backup inclusion, signed-read behavior, and orphan cleanup remain unverified for the actual provider.

- Task ID: TFX-CR-0035
  - Task: Prove inspection/defect photo workflow privacy and consent end-to-end (including “proof photos”) with staging/local evidence.
  - Category: Daily inspection workflow / data safety
  - Severity: High
  - First discovered date: 2026-05-29
  - Last seen date: 2026-06-12
  - Affected files/tables/policies/buckets/functions: inspection/defect photo capture flows, `server/routers/inspections.ts`, `server/routers/vehicles.ts`, `dist/public/*` client assets, and Storage policies/migrations related to `TFX-CR-0031`
  - Status: Open (improved; inspection and verified-inspection photo flows now include explicit evidence/consent disclosure copy, but end-to-end fleet privacy proof is still missing)
  - Recommended fix: In a verified staging/local environment, validate upload/view/delete flows across multiple fleets/users; confirm “proof photo” UX disclosure and consent; confirm Storage object paths + policy enforcement deny cross-fleet list/read/signed-url; confirm orphan cleanup.
  - Verification command or check required: Spawn-capable browser smoke + manual staging/local evidence run; optionally pair with `TFX-CR-0031` storage-policy proof steps. Latest evidence: 2026-06-12 approved Batch K added explicit “inspection-related evidence only” disclosure copy to the driver and verified-inspection photo capture UI, but browser/staging confirmation of the full consent and privacy flow remains outstanding.
  - Related batch: Batch K

- Task ID: TFX-CR-0032
  - Task: Resolve Supabase schema source-of-truth and generated database type drift.
  - Category: Supabase generated types / migration quality
  - Severity: Medium
  - First discovered date: 2026-05-27
  - Last seen date: 2026-05-28
  - Affected files/tables/policies/buckets/functions: `drizzle/schema.ts`, `drizzle/*.sql`, `supabase/migrations/20260403_expand_diagnostic_sessions.sql`, generated Supabase type files if added
  - Status: Open
  - Recommended fix: Document whether Drizzle is canonical and Supabase migrations are supplemental, or align Supabase migration/type generation workflow. Add safe type-generation instructions if Supabase clients are used directly.
  - Verification command or check required: Fresh schema build from canonical migrations; generated types exist or explicit Drizzle-only decision is documented; app typecheck passes.
  - Related batch: Batch K
  - Cross-reference batch if applicable: Batch I

- Task ID: TFX-CR-0033
  - Task: Align the live `vehicles` schema with the repo's additive vehicle fields so manager vehicle creation does not fail on schema drift.
  - Category: Supabase / database schema safety
  - Severity: High
  - First discovered date: 2026-05-27
  - Last seen date: 2026-05-28
  - Affected files/tables/policies/buckets/functions: `server/routers/vehicles.ts`, `server/db.ts`, `drizzle/0013_truckfixr_pricing_refactor.sql`, `drizzle/0026_inspection_review_workflow_storage.sql`, `public.vehicles`
  - Status: Open
  - Recommended fix: Batch K1 - run the read-only preflight, then apply only the additive live schema alignment SQL for missing `vehicles` columns. If `vehicles.id` or related `vehicleId` types still drift, handle that as a separate Batch K2 step.
  - Verification command or check required: Run the read-only checklist in `reports/batch-k1-live-schema-preflight-and-approval.md`, then after approval apply `reports/batch-k1-live-vehicles-schema.sql` and re-test live manager add-vehicle flow.
  - Related batch: Batch K
  - Cross-reference batch if applicable: Batch H

## Access Control / Role Gating Tasks

- Task ID: TFX-CR-0034
  - Task: Prove owner-operator mode authorization and data invariants (no cross-fleet leakage; correct fleet membership; safe role gating).
  - Category: Security & access control / role gating
  - Severity: High
  - First discovered date: 2026-05-28
  - Last seen date: 2026-06-09
  - Affected files: `client/src/components/OwnerOperatorGate.tsx`, `client/src/components/RoleBasedRoute.tsx`, `client/src/lib/roleBasedAccess.ts`, `client/src/lib/ownerOperator.ts`, `scripts/verify/owner-operator.ts`, `reports/batch-oo-owner-operator-staging-proof.md`, `package.json`, `server/services/ownerOperator.ts`, `server/routers/vehicleAccess.ts`, `server/services/ownerOperator.test.ts`, `server/ownerOperatorAccessControl.test.ts`, `server/routers/auth.ts`, `server/_core/localUsers.ts`, `drizzle/0028_owner_operator_mode.sql`
  - Status: In Progress (server endpoints tightened; server authz tests added; full browser/staging flow proof pending)
  - Recommended fix: Finish staged verification (local/staging) proving direct-route access control, correct fleet/membership invariants on toggle, and no cross-fleet read/write in owner-operator mode.
  - Verification command or check required: `pnpm verify:owner-operator` (read-only DB invariants) + spawn-capable full `pnpm test` + browser smoke for direct-route protection.

## AI Diagnosis / Reliability Tasks

- Task ID: TFX-CR-0036
  - Task: Add/verify observability + safety checks for diagnosis enum-format drift tolerance so provider regressions are detectable and non-corrupting.
  - Category: AI diagnosis workflow / reliability
  - Severity: Medium/High
  - First discovered date: 2026-05-29
  - Last seen date: 2026-06-12
  - Affected files: `server/services/diagnosisWorkflow.ts`, `server/services/diagnosisWorkflow.test.ts`, `scripts/admin/probe-diagnosis-ai-health.ts`
  - Status: In Progress (enum coercion summaries now recorded and surfaced; staging run + alerting proof pending)
  - Recommended fix: Confirm drift-handled enum coercions are visible in staging telemetry and do not silently hide invalid final states; keep a tight threshold for “defaulted” enum coercions.
  - Verification command or check required: Run `scripts/admin/probe-diagnosis-ai-health.ts` in staging and confirm recent diagnosis sessions surface `enumCoercions` evidence (non-zero when drift occurs; zero when outputs are clean). Latest evidence: 2026-06-12 review found no repo-level regression signal, but also no fresh staging probe output.

## In Progress Tasks

- Task ID: TFX-CR-0003
  - Task: Finish normalizing confirmed diagnosis outcomes.
  - Category: Knowledge base/history growth
  - Severity: High
  - Owner, if known: Codex / Batch G follow-up
  - Status: Implemented partially; retrieval proof active
  - Notes: Targeted retrieval guardrail test passed 2026-05-27; real-data same-fleet retrieval proof still outstanding.

- Task ID: TFX-CR-0020
  - Task: Add audited staff/admin recovery workflows for pilot support issues.
  - Category: Customer support/admin recovery
  - Severity: High
  - Owner, if known: Codex / Batch J follow-up
  - Status: Implemented; live/staging audit-write verification outstanding
  - Notes: Staff-only routing, staff-only audit action query, bounded audit filters, and all mutating/query non-staff denial tests passed 2026-05-27.

## Resolved Tasks

- Task ID: TFX-CR-0001
  - Task: Complete live verification of the RLS hardening migrations.
  - Category: Security & access control
  - Resolved date: 2026-05-18
  - Evidence of resolution: `pnpm verify:rls` previously passed in a spawn/network-capable environment; on 2026-05-27 (sandbox rerun) `pnpm verify:rls` correctly refused to write verification rows because the DB target was unclassified (`unknown_remote`). Environment-classification guardrail is tracked separately under `TFX-CR-0030`.

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
  - Evidence of resolution: 2026-05-27 `$env:NODE_OPTIONS='--use-system-ca'; pnpm audit --audit-level=high` reported only 1 low and 11 moderate advisories (not reproducible in this sandbox rerun due to `ECONNREFUSED` to the npm audit endpoint).

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

- Task ID: TFX-CR-0027
  - Task: Finalize, commit, or explicitly defer the linked-vehicle summary and Radix dialog/select stability WIP as one deployable unit.
  - Category: Deployment hygiene / stability
  - Resolved date: 2026-05-27
  - Evidence of resolution: Commit `6813d08` captured the linked-vehicle/dialog WIP with reports and Supabase guardrail files. Post-commit verification included `pnpm check`, elevated full Vitest 34 files / 236 tests, elevated `pnpm validate:demo-seed`, and browser route smoke.

- Task ID: TFX-CR-0028
  - Task: Ensure daily code review reports are tracked/committed or intentionally ignored.
  - Category: Repo hygiene / reporting continuity
  - Resolved date: 2026-05-27
  - Evidence of resolution: Daily reports for 2026-05-24 through 2026-05-27 were included in commit `6813d08`; only `.claude/worktrees/practical-bouman-31c9af` remained unstaged afterward.

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

## New Tasks From Today (2026-06-24)

- Task ID: TFX-CR-0040
  - Task: Enable RLS on post-0012 tables (see Supabase / Database Tasks for full detail).
  - Category: Security / Supabase RLS
  - Severity: High (practical Low — server-only access)
  - Affected files: `inspectionReviewActions`, `inspectionReviewQueueItems`, `adminFleetNotes`, `combinedInspectionSessions`, `lead_submissions`
  - Recommended next action: Approve Batch K; add `drizzle/0031_*.sql`; live-verify on staging.

- Task ID: TFX-CR-0037
  - Task: Clear dev-toolchain dependency advisories: `vitest` <3.2.6 (critical, UI server file read/exec, GHSA-5xrq-8626-4rwp) and `vite` ≤7.3.4 (high, `server.fs.deny` bypass, GHSA-fx2h-pf6j-xcff).
  - Category: Dependency / Security (dev tooling, NOT production runtime)
  - Severity: High (tracked) — no production-runtime exposure (Vite dev server / Vitest UI never run in prod)
  - First discovered date: 2026-06-24 (first successful `pnpm audit` baseline)
  - Recommended next action: Tooling-only bump `vitest`≥3.2.6, `vite`≥7.3.5 under Batch I; do not run `npm/pnpm audit fix` without approval.
  - Verification: rerun `pnpm audit --audit-level high`.

- Task ID: TFX-CR-0038
  - Task: Untracked `client/src/pages/DemoScreenshotStoryboard.tsx` has syntax errors (corrupted JSX). The `App.tsx` lazy import/route was removed on 2026-06-24 to keep the build green; the file must be fixed or deleted before re-adding the `/demo/screenshots` route.
  - Category: Code quality / build safety
  - Severity: Medium
  - First discovered date: 2026-06-24
  - Recommended next action: Fix or delete the file (Batch I).
  - Verification: `npx tsc --noEmit` with the file present must be clean.

- Task ID: TFX-CR-0039
  - Task: Production login fix not yet live. Cookie parent-domain scoping landed (`server/_core/cookies.ts`, commit a33f01c0) but is on `feat/dvir-inspection-report`; Render deploys from `main`. Real-browser login on truckfixr.com remains broken until merged AND the API is served first-party (api.truckfixr.com).
  - Category: Security / Auth / Deployment
  - Severity: High
  - First discovered date: 2026-06-24
  - Affected files: `server/_core/cookies.ts`, `render.yaml`, frontend `VITE_API_BASE_URL`, API `APP_BASE_URL`
  - Recommended next action: Batch B — merge to main; add `api.truckfixr.com` custom domain + DNS; set `VITE_API_BASE_URL=https://api.truckfixr.com` and `APP_BASE_URL=https://truckfixr.com`; redeploy; verify login on default-settings Brave/Chrome.

  - 2026-07-02 status for TFX-CR-0039: Improved - commit `a33f01c0` is now in `main`. First-party API domain/DNS/environment deployment and real-browser login verification remain outstanding.

## New Tasks From Today (2026-07-02)

- Task ID: TFX-CR-0041
  - Task: Prevent `subscriptions.trackPilotEvent` from accepting an unverified client-supplied `fleetId` when recording pilot KPI milestones.
  - Category: Security / data integrity / tenant ownership / pilot KPI tracking
  - Severity: High
  - First discovered date: 2026-07-02
  - Last seen date: 2026-07-03
  - Affected files/tables: `server/routers/subscriptions.ts`, `server/services/pilotAccess.ts`, `pilotAccessEvents`
  - Status: **Resolved** (commit `07814ff1`, 2026-07-03)
  - Evidence: `recordPilotMilestone` no longer accepts a `fleetId` argument at all — it derives it from `overview.fleetId` (authoritative pilot/subscription state). The route no longer forwards `input.fleetId`/`state.activeFleetId`; a bounded `pilotEventMetadataSchema` (max 10 fields) was added. `server/subscriptions.billing.test.ts` proves a supplied `fleetId: 999` is ignored and oversized metadata is rejected with `BAD_REQUEST`. Verified live in this review: `pnpm run check` clean, full suite 47 files / 339 tests passed.
  - Recommended fix: Batch B + H - remove the client fleet override and derive the fleet from the authenticated user's active pilot/subscription state, or enforce authoritative active membership before the write. Bound/sanitize metadata and add negative cross-fleet route tests.
  - Verification command or check required: route test proving a fleet-A user cannot persist a milestone for fleet B; same-fleet event remains idempotent; full `pnpm test`/direct Vitest and typecheck. **Done.**

- Task ID: TFX-CR-0043
  - Task: Stop logging raw VIN/license plate/email via ad hoc `console.log`/`console.debug` analytics calls, bypassing the redacted observability module.
  - Category: Security / Privacy / SOC 2 readiness
  - Severity: High
  - First discovered date: 2026-07-03
  - Last seen date: 2026-07-03
  - Affected files: `server/routers/vehicles.ts`, `client/src/lib/analytics.ts`, `client/src/lib/analytics.test.ts`
  - Status: **Resolved** (commit `d4e48ed5`, 2026-07-03)
  - Evidence: `server/routers/vehicles.ts:555` logged `vin`/`licensePlate` in the clear to stdout on every vehicle add; those fields are now dropped from the log line. `client/src/lib/analytics.ts` logged a raw email to the dev console on signup/login (`import.meta.env.DEV` only, confirmed via `analytics.test.ts` output); added key-based redaction (`SENSITIVE_PROPERTY_KEY_RE`, mirroring the server-side pattern in `server/services/observability.ts`) plus a regression test asserting `email` is replaced with `[redacted]`. Sibling `[Analytics] ...` logs in `defects.ts`/`fleet.ts`/`inspections.ts` were checked and carry only IDs/enums, no PII — left as-is.
  - Recommended fix: Done — see evidence.
  - Verification command or check required: `pnpm run check` and full `pnpm run test` both green (47 files / 339 tests) after the fix.

- Task ID: TFX-CR-0042
  - Task: Complete and test the production database/object-storage backup, restore, and rollback process using the actual live providers.
  - Category: Backup, recovery & rollback / Supabase database safety
  - Severity: High
  - First discovered date: 2026-07-02
  - Last seen date: 2026-07-02
  - Affected files/areas: `docs/security/backups-and-monitoring.md`, Supabase project backup settings, actual Forge object storage, migration/rollback workflow
  - Status: Open (draft runbook contains TODO cadence/RPO/RTO/restore evidence and misidentifies the live object store as Supabase Storage)
  - Recommended fix: Batch I + K - confirm the Supabase plan/backup retention, document the actual Forge storage backup/lifecycle behavior, perform a scratch restore, record measured RPO/RTO, and document a migration rollback decision path.
  - Verification command or check required: dated restore-test evidence from a non-production snapshot plus file-recovery proof for the actual object store; no production mutation during review.

## Rolling Implementation Roadmap

| Order | Workstream / Batch | Priority | Why | Status | Dependencies | Updated |
|---:|---|---|---|---|---|---|
| 1 | Pilot KPI tenant ownership (`TFX-CR-0041`, B/H) | High | Prevents cross-fleet analytics corruption | **Resolved** `07814ff1` | None | 2026-07-03 |
| 1b | PII-in-logs cleanup (`TFX-CR-0043`) | High | Closes gap in already-claimed log-redaction control | **Resolved** `d4e48ed5` | None | 2026-07-03 |
| 2 | Actual storage privacy and access proof (`TFX-CR-0031/0035`, B/K) | High | Protects inspection evidence | Static Supabase SQL passes; live Forge path unproved | Provider decision + staging | 2026-07-02 |
| 3 | Backup/restore and rollback proof (`TFX-CR-0042`, I/K) | High | Prevents unrecoverable pilot data loss | Draft/TODO; no restore test | Provider console + scratch target | 2026-07-02 |
| 4 | Verification reliability/client/browser/audit (`TFX-CR-0023/0037`, I/E) | High | Establishes trustworthy releases and performance | Full direct tests green; client/browser/audit blocked | Pinned pnpm 10 CI | 2026-07-02 |
| 5 | First-party deployed login proof (`TFX-CR-0039`, B) | High | Login is a pilot gate | Cookie fix in main; DNS/env/browser proof pending | Domain/DNS/deploy | 2026-07-02 |
| 6 | Application + RLS isolation matrix (`TFX-CR-0040`, B/K) | High | Proves the primary and defense-in-depth tenant boundaries | **Live-verified 12/13** against real DB; 1 flagged (`lead_submissions` service_role read) needs root-cause | Root-cause the one failure | 2026-07-12 |
| 7 | Support/admin recovery (`TFX-CR-0020`, J) | High | Controlled pilots need safe recovery | Unit proof; live audit/reversal pending | Classified staging | 2026-07-02 |
| 8 | Billing and pilot-to-paid (`TFX-CR-0021`, I) | Medium/High | Enables paid conversion | Automated proof; Stripe replay pending | Stripe test environment | 2026-07-02 |
| 9 | Knowledge/history (`TFX-CR-0003`, G) | Medium/High | Grows TADIS from solved cases | Retrieval tests green; live same-fleet proof pending | Staging DB | 2026-07-02 |
| 10 | Inspection/mobile/performance proof (`TFX-CR-0006/0022`, D/E) | Medium/High | Confirms field usability | Automated/static proof only | Browser/device | 2026-07-02 |
