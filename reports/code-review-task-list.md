# TruckFixr Fleet AI Code Review Task List

Last updated: 2026-05-29

## Open Tasks

- Task ID: TFX-CR-0003
  - Task: Finish normalizing confirmed diagnosis outcomes so repair confirmation, confirmed cause, AI correctness, and follow-on learning do not depend on loose JSON trails.
  - Category: Knowledge base/history growth
  - Severity: High
  - First discovered date: 2026-05-11
  - Last seen date: 2026-05-27
  - Affected files: `server/routers/diagnostics.ts`, `server/services/diagnosisWorkflow.ts`, `server/services/aiQualityReviewLog.ts`, `server/services/tadisCore.ts`, `drizzle/schema.ts`, `repairOutcomes`, `aiQualityReviews`
  - Status: Open (improved; local static retrieval proof green, live same-fleet proof outstanding)
  - Recommended fix: Batch G - verify repair outcomes are retrieved correctly as similar past cases within the same fleet and confirm manager/mechanic AI-correctness feedback is persisted with reusable structure.
  - Verification command or check required: Confirm a repair outcome, verify normalized storage, then confirm it is retrieved as a future similar solved case within the same fleet only. Latest evidence: 2026-05-27 targeted `server/diagnosticFeedbackPersistence.test.ts` passed and final full Vitest passed 34 files / 237 tests.

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
  - Status: Open (improved; capable-environment proof green, packaged browser smoke still a lite probe)
  - Recommended fix: Batch I - keep the CI/non-restricted verification path and replace the placeholder browser smoke probe with real route checks when practical.
  - Verification command or check required: In a CI-capable environment, full Vitest, real browser smoke, demo validation, audit, and release builds pass end-to-end. Latest evidence: 2026-05-27 elevated final full Vitest passed 34 files / 237 tests, elevated `pnpm validate:demo-seed` passed, browser route smoke loaded landing/signup/auth with zero app console errors, and audit passed threshold with no Critical/High advisories.

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

## Supabase / Database Tasks

- Task ID: TFX-CR-0031
  - Task: Verify or implement Supabase Storage privacy for inspection/defect photos and uploaded evidence.
  - Category: Supabase database, RLS, storage & data safety
  - Severity: High
  - First discovered date: 2026-05-27
  - Last seen date: 2026-05-29
  - Affected files/tables/policies/buckets/functions: `client/src/pages/DriverInspectionNSC.tsx`, `client/src/pages/VerifiedInspection.tsx`, `drizzle/0007_verified_inspections.sql`, `inspectionPhotos`, `defects.photoUrls`, `server/storage.ts`, `docs/supabase-storage-privacy-plan.md`, `server/storagePolicies.test.ts`, `supabase/migrations/20260527113000_storage_privacy_policies.sql`
  - Status: In Progress (repo-level migration + static policy proof present; online evidence upload path added; live/local/staging storage behavior proof pending)
  - Recommended fix: Apply `supabase/migrations/20260527113000_storage_privacy_policies.sql` only to a verified local/staging Supabase project, then decide whether pilot photos stay as limited data URLs or move to private Supabase Storage. Before real fleet use, prove private buckets, tenant-aware path/metadata rules, MIME/size limits, signed URL rules, orphan cleanup, and cross-company storage denial.
  - Verification command or check required: In local/staging, upload files as Company A driver/manager and prove Company B users cannot read/list/signed-url them; verify file metadata links company, vehicle, inspection, defect, user, and repair records. Latest evidence: 2026-05-27 targeted storage/RLS/support Vitest passed 3 files / 24 tests and final full Vitest passed 35 files / 243 tests. Supabase CLI was unavailable, so no live/local/staging storage policy application was performed.
  - Related batch: Batch K
  - Cross-reference batch if applicable: Batch B, Batch F

- Task ID: TFX-CR-0035
  - Task: Prove inspection/defect photo workflow privacy and consent end-to-end (including “proof photos”) with staging/local evidence.
  - Category: Daily inspection workflow / data safety
  - Severity: High
  - First discovered date: 2026-05-29
  - Last seen date: 2026-05-29
  - Affected files/tables/policies/buckets/functions: inspection/defect photo capture flows, `server/routers/inspections.ts`, `server/routers/vehicles.ts`, `dist/public/*` client assets, and Storage policies/migrations related to `TFX-CR-0031`
  - Status: Open
  - Recommended fix: In a verified staging/local environment, validate upload/view/delete flows across multiple fleets/users; confirm “proof photo” UX disclosure and consent; confirm Storage object paths + policy enforcement deny cross-fleet list/read/signed-url; confirm orphan cleanup.
  - Verification command or check required: Spawn-capable browser smoke + manual staging/local evidence run; optionally pair with `TFX-CR-0031` storage-policy proof steps.
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
  - Last seen date: 2026-05-29
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
  - Last seen date: 2026-05-29
  - Affected files: `server/services/diagnosisWorkflow.ts`, `server/services/diagnosisWorkflow.test.ts`, `scripts/admin/probe-diagnosis-ai-health.ts`
  - Status: In Progress (enum coercion summaries now recorded and surfaced; staging run + alerting proof pending)
  - Recommended fix: Confirm drift-handled enum coercions are visible in staging telemetry and do not silently hide invalid final states; keep a tight threshold for “defaulted” enum coercions.
  - Verification command or check required: Run `scripts/admin/probe-diagnosis-ai-health.ts` in staging and confirm recent diagnosis sessions surface `enumCoercions` evidence (non-zero when drift occurs; zero when outputs are clean).

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

## New Tasks From Today

- Task ID: TFX-CR-0035
  - Task: Prove inspection/defect photo workflow privacy and consent end-to-end (including “proof photos”) with staging/local evidence.
  - Category: Daily inspection workflow / data safety
  - Severity: High
  - Recommended next action: Run cross-fleet photo privacy/consent proof on an explicitly classified staging/local target.

- Task ID: TFX-CR-0036
  - Task: Add/verify observability + safety checks for diagnosis enum-format drift tolerance so provider regressions are detectable and non-corrupting.
  - Category: AI diagnosis workflow / reliability
  - Severity: Medium/High
  - Recommended next action: Run the new diagnosis health probe in staging and confirm drift-handled signals are visible.

## Rolling Implementation Roadmap

| Order | Workstream / Batch | Current Priority | Why It Matters | Status | Dependencies | Last Updated |
|---:|---|---|---|---|---|---|
| 1 | Supabase Storage privacy and file-access proof (`TFX-CR-0031`, Batch K/B) | High | Protects inspection/defect/customer file privacy | Repo-level migration and static policy proof implemented; live/local/staging behavior proof pending | Verified local/staging Supabase target and storage direction decision | 2026-05-27 |
| 2 | Verification reliability across environments (`TFX-CR-0023`, Batch I) | Critical | Full tests, real browser smoke, demo validation, and audit evidence are needed before reliable pilot expansion | Improved; capable-environment proof green, packaged browser smoke still lite | CI/spawn-capable and network-capable verification path | 2026-05-27 |
| 3 | Current linked-vehicle/dialog WIP deploy decision (`TFX-CR-0027`, Batch A) | High | Prevents local/demo/deploy mismatch on active manager/driver vehicle flows | Resolved by commit `6813d08`; deploy decision remains separate | None | 2026-05-27 |
| 4 | Real Android/mobile timing proof (`TFX-CR-0022`, Batch E) | High | Confirms bundle split improves field loading behavior | Bundle split implemented; timing outstanding | Browser/mobile run | 2026-05-27 |
| 5 | Admin metrics authz hardening (`TFX-CR-0024`, Batch B) | High | Protects internal/customer operational data | Open | None | 2026-05-27 |
| 6 | Support/admin recovery verification (`TFX-CR-0020`, Batch J) | High | Controlled pilots need safe recovery and auditable remediation | Improved; staff-only audit-list query and non-staff denial proof green, live audit-write proof pending | Verified staging DB | 2026-05-27 |
| 7 | Revenue/billing readiness (`TFX-CR-0021`, Batch I) | Medium/High | Enables pilot-to-paid conversion without account-state drift | Improved; pilot-to-paid conversion marker covered, full Stripe replay pending | Stripe staging access | 2026-05-27 |
| 8 | Knowledge base/history and TADIS learning data (`TFX-CR-0003`, Batch G) | Medium/High | Builds long-term product advantage from confirmed outcomes | Improved; local retrieval guardrail proof green | Stable verification path | 2026-05-27 |
| 9 | Daily inspection workflow deeper proof (`TFX-CR-0006`, Batch D) | High | Core daily fleet workflow still needs full submit/review proof | Static/code proof; browser blocked | `TFX-CR-0023` | 2026-05-27 |
| 10 | Demo/test/production separation (`TFX-CR-0018`) | Medium | Prevents seeded records polluting analytics, billing, and learning | Improved; demo validation green in capable environment | Analytics/billing/learning consumer-specific filters | 2026-05-27 |
| 11 | Performance and AI cost control (`TFX-CR-0007`, Batch E/C) | Medium | Controls operating cost and latency | Active | Timing telemetry | 2026-05-27 |
| 12 | Backup/recovery, maintainability, `server/db.ts` cleanup (`TFX-CR-0004`, Batch I/K) | Medium/High | Reduces migration and restore risk | Open | Canonical migration proof | 2026-05-27 |
