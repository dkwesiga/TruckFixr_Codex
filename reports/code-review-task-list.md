# TruckFixr Fleet AI Code Review Task List

## Open Tasks

- Task ID: TFX-CR-0003
  - Task: Finish normalizing confirmed diagnosis outcomes so repair confirmation, confirmed cause, AI correctness, and follow-on learning do not depend on loose JSON trails.
  - Category: Knowledge base/history growth
  - Severity: High
  - First discovered date: 2026-05-11
  - Last seen date: 2026-05-19
  - Affected files: `server/routers/diagnostics.ts`, `server/services/diagnosisWorkflow.ts`, `server/services/aiQualityReviewLog.ts`, `server/services/tadisCore.ts`, `drizzle/schema.ts`, `drizzle/0018_link_repair_outcomes_to_diagnostics.sql`, `drizzle/0019_mvp_readiness_hardening.sql`, `server/diagnosticFeedbackPersistence.test.ts`, `activityLogs` table, `repairOutcomes` table, `aiQualityReviews` table
  - Status: Open
  - Recommended fix: Approved Batch G now persists solved-case context, same-fleet retrieval signals, and manager/mechanic feedback into normalized `repairOutcomes` plus AI review metadata; next verify retrieval quality with real repaired cases and tighten any remaining normalization gaps.
  - Verification command or check required: Confirm a repair outcome, verify it appears in normalized storage, and confirm it is retrieved as a future similar solved case within the same fleet only with the expected cause/fix context.

- Task ID: TFX-CR-0004
  - Task: Remove broad runtime schema mutation from `server/db.ts` and reduce it to connection and bootstrap responsibilities.
  - Category: Code quality & maintainability
  - Severity: High
  - First discovered date: 2026-05-11
  - Last seen date: 2026-05-19
  - Affected files: `server/db.ts`, `render.yaml`, `server/dbStartupPolicy.test.ts`
  - Status: Open
  - Recommended fix: Approved Batch I and the live readiness backfills are enough to keep the current environment running, but the remaining startup-time schema repair in `server/db.ts` should still be removed in favor of the reviewed migration path so future environments do not depend on ad hoc repair logic.
  - Verification command or check required: Bring up a fresh database from the canonical migrations only, then run app startup, demo seed validation, `pnpm check`, `pnpm test`, `pnpm build`, and browser smoke without extra live backfill scripts.

- Task ID: TFX-CR-0006
  - Task: Add stronger automated coverage for assigned-driver inspection and diagnosis happy paths after access hardening.
  - Category: Daily inspection workflow
  - Severity: Medium
  - First discovered date: 2026-05-11
  - Last seen date: 2026-05-19
  - Affected files: `server/routers/diagnostics.ts`, `server/routers/inspections.ts`, related test files
  - Status: Open
  - Recommended fix: Production browser smoke now proves the driver login, inspection entry, and diagnosis result routes load successfully. Remaining work is to add deeper automated happy-path coverage for actual submission, DVIR completion, and manager review visibility.
  - Verification command or check required: Run targeted inspection/diagnosis route tests plus browser smoke that exercises a full submit/review flow.

- Task ID: TFX-CR-0007
  - Task: Reduce repeated AI cost and latency across multi-question diagnosis sessions.
  - Category: Performance & AI cost control
  - Severity: Medium
  - First discovered date: 2026-05-11
  - Last seen date: 2026-05-19
  - Affected files: `server/routers/diagnostics.ts`, `server/services/diagnosisWorkflow.ts`, `server/services/aiOrchestrator.ts`, `server/_core/index.ts`, `drizzle/0019_mvp_readiness_hardening.sql`
  - Status: Open
  - Recommended fix: Approved Batch E/C reduced the diagnosis smoke route to `3092 ms` total duration and `1461 ms` usable time. Keep this task open only for live multi-clarification timing/cost proof, prompt compaction, and lower-end device validation.
  - Verification command or check required: Multi-clarification diagnosis tests with token, retry, and cost assertions, then rerun `pnpm verify:browser-smoke` and confirm live diagnosis paths stay below the MVP thresholds.

- Task ID: TFX-CR-0023
  - Task: Unblock sandbox/CI-safe verification so `pnpm test`, `pnpm build`, and `pnpm verify:browser-smoke` don't fail with `spawn EPERM` when Vite/Vitest/esbuild or Playwright attempts to launch child processes.
  - Category: Developer experience / verification reliability
  - Severity: High
  - First discovered date: 2026-05-18
  - Last seen date: 2026-05-20
  - Affected files: `scripts/run-vitest.mjs`, `scripts/run-build-client.mjs`, `scripts/verify/browser-smoke.ts`, Vite/Vitest/esbuild toolchain configuration
  - Status: Open (regressed)
  - Recommended fix: Restore the sandbox-safe verification approach so builds/tests/smokes run without blocked `spawn` calls in constrained environments, and keep it stable across dependency upgrades.
  - Verification command or check required: In this sandbox/CI-like environment, `pnpm test`, `pnpm build`, and `pnpm verify:browser-smoke` all pass end-to-end.

- Task ID: TFX-CR-0017
  - Task: Add production observability and error monitoring coverage for backend, AI provider, Supabase, and Stripe failures.
  - Category: Observability, logging & error monitoring
  - Severity: Medium
  - First discovered date: 2026-05-12
  - Last seen date: 2026-05-19
  - Affected files: backend services, deployment/runtime configuration
  - Status: Open
  - Recommended fix: Add a production-safe error monitoring path and capture key operational failures without exposing secrets or customer data.
  - Verification command or check required: Trigger safe test errors for backend, AI, Supabase, and Stripe paths and verify redacted monitoring events.

- Task ID: TFX-CR-0018
  - Task: Enforce demo/test data exclusion from production analytics, diagnostic learning, billing, and customer reports.
  - Category: Demo/test/production data separation
  - Severity: Medium
  - First discovered date: 2026-05-12
  - Last seen date: 2026-05-19
  - Affected files: `scripts/demo/demoSeedWorkflow.ts`, `shared/demoAssets.ts`, analytics/reporting/learning consumers, billing/reporting queries
  - Status: Open
  - Recommended fix: Add explicit demo filters or a first-class demo marker wherever aggregate analytics, billing, customer reporting, or diagnostic learning consumes seeded records.
  - Verification command or check required: Seed demo data and verify analytics, billing, learning, and customer report queries exclude demo records unless explicitly requested.

- Task ID: TFX-CR-0020
  - Task: Add audited staff/admin recovery workflows for pilot support issues.
  - Category: Customer support/admin recovery
  - Severity: High
  - First discovered date: 2026-05-13
  - Last seen date: 2026-05-19
  - Affected files: `server/routers/supportRecovery.ts`, `server/services/supportRecovery.ts`, `server/supportRecovery.test.ts`, `drizzle/schema.ts`, `drizzle/0017_support_recovery_actions.sql`, `drizzle/0019_mvp_readiness_hardening.sql`, `server/_core/trpc.ts`, company/vehicle/access services
  - Status: Open
  - Recommended fix: Approved Batch J added staff-only user reactivation, richer pilot-code/subscription recovery snapshot data, and the earlier audited recovery actions; remaining work is to verify audit writes under real DB permissions and add any still-missing operator-facing recovery entry points.
  - Verification command or check required: Staff-only permission tests, audit log checks, service-role or policy verification for `supportRecoveryActions`, and negative tests for owners, managers, and drivers.

- Task ID: TFX-CR-0021
  - Task: Verify pilot-to-paid billing conversion and subscription enforcement in staging.
  - Category: Billing / subscription readiness
  - Severity: Medium
  - First discovered date: 2026-05-13
  - Last seen date: 2026-05-19
  - Affected files: `server/services/stripeBilling.ts`, `server/_core/stripeBillingRoutes.ts`, `server/services/subscriptions.ts`, `server/subscriptions.billing.test.ts`, billing UI
  - Status: Open
  - Recommended fix: Approved Stripe hardening aligned readiness to canonical lookup-key fallback, turned missing explicit plan envs into warnings, and safely refuses `sk_live_...` verification. The current live blocker is that `pnpm verify:stripe` fails with `Invalid API Key provided` for the active `sk_test_...` credential; replace the invalid test key, keep explicit non-local `APP_BASE_URL`, then rerun checkout, webhook, failed-payment, cancellation, and conversion scenarios.
  - Verification command or check required: Replace the invalid Stripe test-mode secret and set a non-local app base URL as needed, then run `pnpm verify:stripe`, staging checkout, webhook replay, subscription state assertions, and route-level plan enforcement tests.

- Task ID: TFX-CR-0022
  - Task: Reduce the oversized shared frontend bundle and re-check mobile-first loading speed risk.
  - Category: Performance / Loading Speed
  - Severity: Medium
  - First discovered date: 2026-05-14
  - Last seen date: 2026-05-19
  - Affected files: `vite.config.ts`, `client/src/App.tsx`, `server/_core/index.ts`, `drizzle/0019_mvp_readiness_hardening.sql`, shared dashboard and auth bundles
  - Status: Open
  - Recommended fix: Route-load timing is still green and core diagnosis timing improved sharply, but the shared chunk remains large and the public pricing route still measured `6065 ms` total in local smoke. Keep the shared chunk under watch and use smaller Batch E follow-up work for public-route/page-settling polish before broader rollout.
  - Verification command or check required: `pnpm build`, compare chunk sizes against the 2026-05-15 baseline, rerun `pnpm verify:browser-smoke`, and repeat mobile-sized smoke checks on lower-end hardware or slower network conditions.

## In Progress Tasks

- Task ID: TFX-CR-0003
  - Task: Finish normalizing confirmed diagnosis outcomes so repair confirmation, confirmed cause, AI correctness, and follow-on learning do not depend on loose JSON trails.
  - Category: Knowledge base/history growth
  - Severity: High
  - Owner, if known: Codex / current Batch G follow-up
  - Status: Implemented, verification follow-up active
  - Notes: Batch G code landed this pass; remaining work is real-data retrieval proof and any final normalization cleanup.

- Task ID: TFX-CR-0020
  - Task: Add audited staff/admin recovery workflows for pilot support issues.
  - Category: Customer support/admin recovery
  - Severity: High
  - Owner, if known: Codex / current Batch J follow-up
  - Status: Implemented, verification follow-up active
  - Notes: Batch J code landed this pass; remaining work is live audit-write proof and any still-missing support entry points.

## Resolved Tasks

- Task ID: TFX-CR-0001
  - Task: Complete live verification of the RLS hardening migrations so company separation no longer depends on legacy `managerUserId` policy logic, the old open `activityLogs` insert rule, or unverified support-recovery audit access.
  - Category: Security & access control
  - Resolved date: 2026-05-18
  - Evidence of resolution: Live `pnpm verify:rls` passed after the approved readiness migration rollouts, confirming assigned-vehicle visibility, cross-fleet hiding, denied cross-fleet activity-log writes, support-recovery audit isolation, and fleet-scoped subscription visibility.

- Task ID: TFX-CR-0002
  - Task: Restore a fully green automated test suite after the recent auth, access, and AI workflow changes.
  - Category: Bug fixes & stability
  - Resolved date: 2026-05-13
  - Evidence of resolution: Escalated `pnpm test` passed 23 test files and 171 tests. Sandbox-only run still failed with `spawn EPERM`, which was an environment limitation rather than an application test failure.

- Task ID: TFX-CR-0008
  - Task: Add a missed-inspection reminder or compliance scheduler for managers.
  - Category: Daily inspection workflow
  - Resolved date: 2026-05-13
  - Evidence of resolution: `server/services/inspectionReminders.ts` and `server/services/inspectionReminders.test.ts` exist, and full `pnpm test` passed.

- Task ID: TFX-CR-0009
  - Task: Reduce session lifetime and add sliding refresh behavior.
  - Category: Security & access control
  - Resolved date: 2026-05-11
  - Evidence of resolution: `shared/const.ts` sets a 24-hour session duration, and `server/_core/context.ts` and `server/_core/sdk.ts` refresh the cookie when needed.

- Task ID: TFX-CR-0010
  - Task: Reject invalid `fleetId` during vehicle creation instead of silently substituting a fleet.
  - Category: Security & access control
  - Resolved date: 2026-05-11
  - Evidence of resolution: `server/routers/vehicles.ts` requires a positive `fleetId` and forbids users without manage access from creating a vehicle in that fleet.

- Task ID: TFX-CR-0011
  - Task: Persist onboarding truck setup and invitation steps.
  - Category: UI/UX & mobile usability
  - Resolved date: 2026-05-11
  - Evidence of resolution: `client/src/pages/Onboarding.tsx` calls `trpc.vehicles.create`, `trpc.company.inviteMember`, and `trpc.auth.createManagedDriverInvite`.

- Task ID: TFX-CR-0012
  - Task: Consolidate manager dashboard entry points onto the live implementation.
  - Category: UI/UX & mobile usability
  - Resolved date: 2026-05-11
  - Evidence of resolution: `client/src/App.tsx`, `client/src/pages/ManagerDashboard.tsx`, and `client/src/pages/ManagerDashboardSaaS.tsx` route to the canonical manager dashboard implementation.

- Task ID: TFX-CR-0013
  - Task: Prevent low-confidence diagnosis flow from dead-ending after a repeated second clarifying question.
  - Category: AI diagnosis workflow
  - Resolved date: 2026-05-13
  - Evidence of resolution: `server/services/diagnosisWorkflow.ts` supports continued and fallback clarification behavior, and full `pnpm test` passed.

- Task ID: TFX-CR-0015
  - Task: Repair Supabase Auth UUID to app-user ID mapping in RLS policies.
  - Category: Security & access control
  - Resolved date: 2026-05-13
  - Evidence of resolution: File inspection confirmed `drizzle/0015_harden_rls_and_sessions.sql` defines `current_app_user_id()` and resolves `auth.uid()` through `users.openId` using `supabase_<uuid>` or raw UUID; live verification was then completed under `TFX-CR-0001` on 2026-05-18.

- Task ID: TFX-CR-0019
  - Task: Resolve critical/high dependency audit advisories.
  - Category: Security / Dependency Risk
  - Resolved date: 2026-05-14
  - Evidence of resolution: `pnpm audit --audit-level=high` completed with no high or critical advisories on 2026-05-14, was rechecked on 2026-05-15 with the same result, and remained unchanged on 2026-05-18 (`1 low`, `10 moderate`).

- Task ID: TFX-CR-0005
  - Task: Audit and constrain `getUserPrimaryFleetId` fallback auto-membership creation from assignments and legacy manager linkage.
  - Category: Security & access control
  - Resolved date: 2026-05-14
  - Evidence of resolution: `server/services/companyAccess.ts` no longer auto-creates active company memberships from assignment or legacy manager-link inference, no longer defaults missing DB access to fleet `1`, and `server/companyAccess.test.ts` now verifies assignment/direct-vehicle fallback plus the removal of legacy cross-fleet membership fallback. `pnpm check`, `pnpm test`, and `pnpm build` all passed after the change.

## Deferred Tasks

- Task ID: TFX-CR-0014
  - Task: Expand onboarding to support larger initial team setup flows.
  - Category: UI/UX & mobile usability
  - Reason deferred: The current branch still has higher-priority support-recovery, knowledge-model, billing-readiness, and maintainability work.
  - Revisit date or trigger: Revisit after `TFX-CR-0003`, `TFX-CR-0020`, and `TFX-CR-0021` are resolved.

- Task ID: TFX-CR-0016
  - Task: Verify and repair possible diagnosis router drift around historical similarity and cause taxonomy.
  - Category: AI diagnosis workflow
  - Reason deferred: Current diagnosis workflow tests are passing; support recovery, runtime schema hardening, and staging billing remain higher-priority.
  - Revisit date or trigger: Revisit when Batch C is approved.

## New Tasks From Today

- No new task IDs added. Re-opened `TFX-CR-0023` on 2026-05-20 due to `spawn EPERM` regressions affecting `pnpm test`, `pnpm build`, and `pnpm verify:browser-smoke`.


## Rolling Implementation Roadmap

| Order | Workstream / Batch | Current Priority | Why It Matters | Status | Dependencies | Last Updated |
|---:|---|---|---|---|---|---|
| 1 | Revenue/billing readiness | Critical | Billing is still the clearest hard gate preventing a full paid-pilot GO call | Blocked on a valid Stripe test credential | Stripe staging access and a working Stripe test secret / non-local `APP_BASE_URL` | 2026-05-19 |
| 2 | Data integrity and record ownership | High | Ensures confirmed outcomes and cross-feature history stay tied to the correct fleet, vehicle, and diagnosis | Active next batch | None beyond current schema | 2026-05-19 |
| 3 | Support/admin recovery | High | Controlled pilots need safe, audited recovery actions before support must edit data manually | Active next batch | Verified RLS baseline | 2026-05-19 |
| 4 | Daily inspection workflow blockers | High | Core daily fleet workflow should now move from route-load verification to full happy-path proof | Route smoke green / deeper workflow proof pending | Workstreams 2-3 | 2026-05-19 |
| 5 | Core workflow performance and app loading speed | Medium/High | Route load is good and diagnosis improved, but public-route polish and lower-end device proof still matter | Improved / monitor | Lower-end device checks and public-route polish | 2026-05-19 |
| 6 | Observability and operational troubleshooting | Medium | Makes pilot incidents faster to diagnose without manual digging | Active | Workstreams 1-5 | 2026-05-19 |
| 7 | Demo/test/production separation | Medium | Prevents seeded/demo records from polluting analytics, billing, and learning | Active | Workstreams 1-2 | 2026-05-19 |
| 8 | Performance and AI cost control optimizations | Medium | Keeps response latency and operating cost practical during multi-question diagnosis sessions | Active with stronger timing evidence | Workstreams 2 and 5 | 2026-05-19 |
| 9 | Backup/recovery, maintainability, refactoring | Medium | Reduces future technical risk, especially around startup schema repair and live schema drift | Active | Canonical migration cleanup | 2026-05-19 |
| 10 | UX/mobile usability and onboarding | Medium | Improves activation after the core trust, billing, and support blockers are reduced | Deferred | Workstreams 1, 3, 5 | 2026-05-19 |
