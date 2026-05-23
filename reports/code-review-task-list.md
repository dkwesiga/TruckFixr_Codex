# TruckFixr Fleet AI Code Review Task List

## Open Tasks

- Task ID: TFX-CR-0003
  - Task: Finish normalizing confirmed diagnosis outcomes so repair confirmation, confirmed cause, AI correctness, and follow-on learning do not depend on loose JSON trails.
  - Category: Knowledge base/history growth
  - Severity: High
  - First discovered date: 2026-05-11
  - Last seen date: 2026-05-23
  - Affected files: `server/routers/diagnostics.ts`, `server/services/diagnosisWorkflow.ts`, `server/services/aiQualityReviewLog.ts`, `server/services/tadisCore.ts`, `drizzle/schema.ts`, `drizzle/0018_link_repair_outcomes_to_diagnostics.sql`, `drizzle/0019_mvp_readiness_hardening.sql`, `server/diagnosticFeedbackPersistence.test.ts`, `activityLogs` table, `repairOutcomes` table, `aiQualityReviews` table
  - Status: Open
  - Recommended fix: Batch G — verify repair outcomes are retrieved correctly as similar past cases within the same fleet. Confirm AI correctness feedback from managers is persisted.
  - Verification command or check required: Confirm a repair outcome, verify it appears in normalized storage, and confirm it is retrieved as a future similar solved case within the same fleet only with the expected cause/fix context.

- Task ID: TFX-CR-0004
  - Task: Remove broad runtime schema mutation from `server/db.ts` and reduce it to connection and bootstrap responsibilities.
  - Category: Code quality & maintainability
  - Severity: High
  - First discovered date: 2026-05-11
  - Last seen date: 2026-05-23
  - Affected files: `server/db.ts`, `render.yaml`, `server/dbStartupPolicy.test.ts`
  - Status: Open
  - Recommended fix: Remove startup-time schema repair once canonical migrations are confirmed stable. Batch I follow-up.
  - Verification command or check required: Bring up a fresh database from the canonical migrations only, then run app startup, demo seed validation, `pnpm check`, `pnpm test`, `pnpm build`, and browser smoke without extra live backfill scripts.

- Task ID: TFX-CR-0006
  - Task: Add stronger automated coverage for assigned-driver inspection and diagnosis happy paths after access hardening.
  - Category: Daily inspection workflow
  - Severity: Medium
  - First discovered date: 2026-05-11
  - Last seen date: 2026-05-23
  - Affected files: `server/routers/diagnostics.ts`, `server/routers/inspections.ts`, related test files
  - Status: Open
  - Recommended fix: Add happy-path tests for offline queue flush + idempotency (new surface area from 2026-05-22 working tree). Run `pnpm test` in CI-capable environment.
  - Verification command or check required: Run targeted inspection/diagnosis route tests plus browser smoke that exercises a full submit/review flow including offline-queue scenario.

- Task ID: TFX-CR-0007
  - Task: Reduce repeated AI cost and latency across multi-question diagnosis sessions.
  - Category: Performance & AI cost control
  - Severity: Medium
  - First discovered date: 2026-05-11
  - Last seen date: 2026-05-23
  - Affected files: `server/routers/diagnostics.ts`, `server/services/diagnosisWorkflow.ts`, `server/services/aiOrchestrator.ts`, `server/_core/index.ts`, `drizzle/0019_mvp_readiness_hardening.sql`
  - Status: Open
  - Recommended fix: Live multi-clarification timing/cost proof, prompt compaction, and lower-end device validation. Last known: 3092 ms total / 1461 ms usable.
  - Verification command or check required: Multi-clarification diagnosis tests with token, retry, and cost assertions, then rerun `pnpm verify:browser-smoke`.

- Task ID: TFX-CR-0017
  - Task: Add production observability and error monitoring coverage for backend, AI provider, Supabase, and Stripe failures.
  - Category: Observability, logging & error monitoring
  - Severity: Medium
  - First discovered date: 2026-05-12
  - Last seen date: 2026-05-23
  - Affected files: backend services, deployment/runtime configuration
  - Status: Open
  - Recommended fix: Add a production-safe error monitoring path and capture key operational failures without exposing secrets or customer data.
  - Verification command or check required: Trigger safe test errors for backend, AI, Supabase, and Stripe paths and verify redacted monitoring events.

- Task ID: TFX-CR-0018
  - Task: Enforce demo/test data exclusion from production analytics, diagnostic learning, billing, and customer reports.
  - Category: Demo/test/production data separation
  - Severity: Medium
  - First discovered date: 2026-05-12
  - Last seen date: 2026-05-23
  - Affected files: `scripts/demo/demoSeedWorkflow.ts`, `shared/demoAssets.ts`, analytics/reporting/learning consumers, billing/reporting queries
  - Status: Open
  - Recommended fix: Add explicit demo filters or a first-class demo marker wherever aggregate analytics, billing, customer reporting, or diagnostic learning consumes seeded records.
  - Verification command or check required: Seed demo data and verify analytics, billing, learning, and customer report queries exclude demo records unless explicitly requested.

- Task ID: TFX-CR-0020
  - Task: Add audited staff/admin recovery workflows for pilot support issues.
  - Category: Customer support/admin recovery
  - Severity: High
  - First discovered date: 2026-05-13
  - Last seen date: 2026-05-23
  - Affected files: `server/routers/supportRecovery.ts`, `server/services/supportRecovery.ts`, `server/supportRecovery.test.ts`, `drizzle/schema.ts`, `drizzle/0017_support_recovery_actions.sql`, `drizzle/0019_mvp_readiness_hardening.sql`, `server/_core/trpc.ts`, company/vehicle/access services
  - Status: Open (implemented; live verification outstanding)
  - Recommended fix: Verify audit writes work under live DB permissions. Batch J verification step.
  - Verification command or check required: Staff-only permission tests, audit log checks, service-role or policy verification for `supportRecoveryActions`, and negative tests for owners, managers, and drivers.

- Task ID: TFX-CR-0021
  - Task: Verify pilot-to-paid billing conversion and subscription enforcement in staging.
  - Category: Billing / subscription readiness
  - Severity: Medium
  - First discovered date: 2026-05-13
  - Last seen date: 2026-05-23
  - Affected files: `server/services/stripeBilling.ts`, `server/_core/stripeBillingRoutes.ts`, `server/services/subscriptions.ts`, `server/subscriptions.billing.test.ts`, billing UI
  - Status: Open
  - Recommended fix: Replace the invalid Stripe test-mode secret and set a non-local app base URL, then run `pnpm verify:stripe`, staging checkout, webhook replay, subscription state assertions, and route-level plan enforcement tests.
  - Verification command or check required: `pnpm verify:stripe`, staging checkout, webhook replay, subscription state enforcement.

- Task ID: TFX-CR-0022
  - Task: Reduce the oversized shared frontend bundle and re-check mobile-first loading speed risk.
  - Category: Performance / Loading Speed
  - Severity: Medium
  - First discovered date: 2026-05-14
  - Last seen date: 2026-05-23
  - Affected files: `vite.config.ts`, `client/src/App.tsx`, `server/_core/index.ts`, `drizzle/0019_mvp_readiness_hardening.sql`, shared dashboard and auth bundles
  - Status: Open
  - Recommended fix: Rerun `pnpm build` and `pnpm verify:browser-smoke` in a CI-capable environment. Public pricing route was 6065 ms in last smoke — above 4 sec target. Lazy-load pricing/landing route.
  - Verification command or check required: `pnpm build`, compare chunk sizes, rerun browser smoke.

- Task ID: TFX-CR-0023
  - Task: Unblock sandbox/CI-safe verification so `pnpm test`, `pnpm build`, `pnpm verify:browser-smoke`, and Stripe verification don't fail with `spawn EPERM`.
  - Category: Developer experience / verification reliability
  - Severity: High
  - First discovered date: 2026-05-18
  - Last seen date: 2026-05-23
  - Affected files: `scripts/run-vitest.mjs`, `scripts/run-build-client.mjs`, `scripts/verify/browser-smoke.ts`, `scripts/verify/stripe.ts`, Vite/Vitest/esbuild/tsx toolchain configuration
  - Status: Open (persistent)
  - Recommended fix: Either (A) adjust sandbox policy to allow Node child-process spawning for Vite/Vitest/esbuild + Playwright, or (B) move CI verification to an environment where spawning is allowed.
  - Verification command or check required: In a CI-capable environment, `pnpm test`, `pnpm build`, `pnpm verify:browser-smoke`, and full Stripe verification pass end-to-end.

- Task ID: TFX-CR-0024
  - Task: Review and harden the internal admin metrics/dashboard feature (authz gates, export restrictions, PII safety, and query performance).
  - Category: Security / internal tooling & operations
  - Severity: High
  - First discovered date: 2026-05-22
  - Last seen date: 2026-05-23
  - Affected files: `server/routers/admin.ts`, `server/services/adminMetrics.ts`, `client/src/pages/AdminMetricsDashboard.tsx`, `client/src/pages/AdminFleetDetail.tsx`, `drizzle/0024_admin_metrics_dashboard.sql`
  - Status: Open
  - Recommended fix: Ensure all admin endpoints are gated to TruckFixr internal roles in production, exports are limited to super-admin only, and metrics queries are bounded/optimized with safe defaults and redaction where needed.
  - Verification command or check required: Unit tests for role gating + export permission, plus a staging validation that non-admin staff/users cannot access metrics, and a performance check for the largest timeframe/filters.

- Task ID: TFX-CR-0026
  - Task: Commit or revert the untracked Quick Start + inspection review workflow changes (and migrations `0026`/`0027`) as a single coherent deployable unit.
  - Category: Deployment hygiene / migration discipline
  - Severity: High
  - First discovered date: 2026-05-23
  - Last seen date: 2026-05-23
  - Affected files: `client/src/components/quickStart/*`, `client/src/lib/quickStartGuides.ts`, `client/src/pages/QuickStartGuides.tsx`, `server/routers/quickStart.ts`, `server/services/inspectionReviewWorkflow.ts`, `server/services/inspectionReviewWorkflow.test.ts`, `drizzle/0026_inspection_review_workflow_storage.sql`, `drizzle/0027_quick_start_guide_progress.sql`
  - Status: Open
  - Recommended fix: Either (A) stage/commit these changes with clear migration ordering + release notes, or (B) revert/remove them until ready. Avoid deploying partial schema + router changes.
  - Verification command or check required: Apply migrations in staging, run `pnpm check`, run full (non-sandboxed) `pnpm test`, and validate Quick Start guide progress persistence end-to-end.

## In Progress Tasks

- Task ID: TFX-CR-0003
  - Task: Finish normalizing confirmed diagnosis outcomes (knowledge base / TADIS learning).
  - Category: Knowledge base/history growth
  - Severity: High
  - Owner, if known: Codex / Batch G follow-up
  - Status: Implemented (Batch G), verification follow-up active
  - Notes: Real-data retrieval proof still outstanding.

- Task ID: TFX-CR-0020
  - Task: Add audited staff/admin recovery workflows for pilot support issues.
  - Category: Customer support/admin recovery
  - Severity: High
  - Owner, if known: Codex / Batch J follow-up
  - Status: Implemented, live audit-write verification outstanding

## Resolved Tasks

- Task ID: TFX-CR-0001
  - Task: Complete live verification of the RLS hardening migrations.
  - Category: Security & access control
  - Resolved date: 2026-05-18
  - Evidence of resolution: Live `pnpm verify:rls` passed; 6 checks green. Reconfirmed 2026-05-22.

- Task ID: TFX-CR-0002
  - Task: Restore a fully green automated test suite.
  - Category: Bug fixes & stability
  - Resolved date: 2026-05-13
  - Evidence of resolution: Full `pnpm test` passed 23 test files / 171 tests in non-sandboxed environment.

- Task ID: TFX-CR-0008
  - Task: Add a missed-inspection reminder or compliance scheduler.
  - Category: Daily inspection workflow
  - Resolved date: 2026-05-13
  - Evidence of resolution: `server/services/inspectionReminders.ts` and test file exist; full `pnpm test` passed.

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
  - Evidence of resolution: `drizzle/0015_harden_rls_and_sessions.sql` defines `current_app_user_id()`; live RLS verification confirmed 2026-05-18.

- Task ID: TFX-CR-0019
  - Task: Resolve critical/high dependency audit advisories.
  - Category: Security / Dependency Risk
  - Resolved date: 2026-05-14
  - Evidence of resolution: `pnpm audit --audit-level=high` shows zero critical/high advisories. Confirmed 2026-05-22 (1 low, 11 moderate).

- Task ID: TFX-CR-0025
  - Task: Commit and apply migration 0025 (driver mode queue idempotency) before deploying the offline queue feature.
  - Category: Data integrity / deployment readiness
  - Resolved date: 2026-05-23
  - Evidence of resolution: `drizzle/0025_driver_mode_queue_idempotency.sql` is now committed (commit `ceffa5d`). Staging migration application remains a deployment step, but the “untracked migration” blocker is resolved.

- Task ID: TFX-CR-0005
  - Task: Audit and constrain `getUserPrimaryFleetId` fallback auto-membership creation.
  - Category: Security & access control
  - Resolved date: 2026-05-14
  - Evidence of resolution: `server/services/companyAccess.ts` no longer auto-creates active memberships from legacy inference.

## Deferred Tasks

- Task ID: TFX-CR-0014
  - Task: Expand onboarding to support larger initial team setup flows.
  - Category: UI/UX & mobile usability
  - Reason deferred: Higher-priority support-recovery, billing, and knowledge-model work outstanding.
  - Revisit date or trigger: Revisit after TFX-CR-0003, TFX-CR-0020, and TFX-CR-0021 are resolved.

- Task ID: TFX-CR-0016
  - Task: Verify and repair possible diagnosis router drift around historical similarity and cause taxonomy.
  - Category: AI diagnosis workflow
  - Reason deferred: Current diagnosis workflow tests passing; higher-priority work outstanding.
  - Revisit date or trigger: Revisit when Batch C is approved.

## New Tasks From Today

- Resolved `TFX-CR-0025` on 2026-05-23: migration `0025_driver_mode_queue_idempotency.sql` is now committed (commit `ceffa5d`).
- Added `TFX-CR-0026` on 2026-05-23: untracked Quick Start + inspection review workflow + migrations `0026`/`0027` should be committed (or reverted) as one deployable unit.
- Updated `TFX-CR-0023` on 2026-05-22: spawn EPERM persists; new queue tests (inspectionDrafts, issueDrafts, shared/inspection) added but not yet confirmed run.
- Updated `TFX-CR-0006` on 2026-05-22: offline queue + idempotency now adds test surface area needing coverage.
- Updated `TFX-CR-0024` on 2026-05-22: admin metrics/dashboard authz still unverified in staging.


## Rolling Implementation Roadmap

| Order | Workstream / Batch | Current Priority | Why It Matters | Status | Dependencies | Last Updated |
|---:|---|---|---|---|---|---|
| 1 | Commit or revert WIP migrations + Quick Start workflow (TFX-CR-0026) | Critical | Prevents partial deploys and schema drift | New — open | None | 2026-05-23 |
| 2 | Admin metrics authz hardening (TFX-CR-0024, Batch B) | High | Admin data exposure risk | Open | None | 2026-05-23 |
| 3 | Revenue/billing readiness (TFX-CR-0021, Batch I) | Critical | Billing is the clearest hard gate for paid pilots | Blocked on valid Stripe test key | Stripe staging access | 2026-05-23 |
| 4 | Data integrity and record ownership (TFX-CR-0003) | High | Confirmed outcomes and TADIS learning quality | Active next batch | None beyond current schema | 2026-05-22 |
| 5 | Support/admin recovery verification (TFX-CR-0020, Batch J) | High | Controlled pilots need safe, audited recovery | Implemented; verification active | Verified RLS baseline | 2026-05-22 |
| 6 | Daily inspection workflow — deeper happy-path proof (TFX-CR-0006) | High | Core daily fleet workflow needs full submission proof | Route smoke green; deeper proof pending | TFX-CR-0025 applied first | 2026-05-22 |
| 7 | Core workflow performance and app loading speed (TFX-CR-0022) | Medium/High | Route load good; public-route polish and lower-end proof still matter | Monitor | CI-capable environment for smoke | 2026-05-22 |
| 8 | Observability and operational troubleshooting (TFX-CR-0017) | Medium | Makes pilot incidents faster to diagnose | Active | Workstreams 1–6 | 2026-05-22 |
| 9 | Demo/test/production separation (TFX-CR-0018) | Medium | Prevents seeded records from polluting analytics and billing | Active | Workstreams 1–3 | 2026-05-22 |
| 10 | Performance and AI cost control (TFX-CR-0007) | Medium | Operating cost and multi-question latency | Active with stronger timing evidence needed | Workstreams 4 and 7 | 2026-05-22 |
| 11 | Backup/recovery, maintainability, db.ts cleanup (TFX-CR-0004) | Medium | Reduces future technical risk | Active | Canonical migration cleanup | 2026-05-22 |
| 12 | UX/mobile usability and onboarding (TFX-CR-0014) | Medium | Improves activation after core blockers are reduced | Deferred | Workstreams 1, 3, 5 | 2026-05-22 |
