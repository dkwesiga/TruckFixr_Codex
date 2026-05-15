# TruckFixr Fleet AI Code Review Task List

## Open Tasks

- Task ID: TFX-CR-0001
  - Task: Complete live verification of the RLS hardening migration so company separation no longer depends on legacy `managerUserId` policy logic or the old open `activityLogs` insert rule.
  - Category: Security & access control
  - Severity: Critical
  - First discovered date: 2026-05-11
  - Last seen date: 2026-05-14
  - Affected files: `drizzle/0005_rls_policies.sql`, `drizzle/0015_harden_rls_and_sessions.sql`, `server/rlsPolicies.test.ts`, `server/companyAccess.test.ts`
  - Status: Open
  - Recommended fix: The local hardening and static verification are in place; now run migration `0015` in a Supabase-like environment and validate real cross-company denial cases with normal user-context queries.
  - Verification command or check required: Seed multiple companies, authenticate as normal users, and verify cross-company reads and writes fail for vehicles, inspections, diagnostics, defects, activity logs, repair outcomes, attachments, and billing.

- Task ID: TFX-CR-0003
  - Task: Finish normalizing confirmed diagnosis outcomes so repair confirmation, confirmed cause, AI correctness, and follow-on learning do not depend on loose JSON trails.
  - Category: Knowledge base/history growth
  - Severity: High
  - First discovered date: 2026-05-11
  - Last seen date: 2026-05-14
  - Affected files: `server/routers/diagnostics.ts`, `server/services/diagnosisWorkflow.ts`, `server/services/aiQualityReviewLog.ts`, `server/services/tadisCore.ts`, `activityLogs` table, `repairOutcomes` table, `aiQualityReviews` table
  - Status: Open
  - Recommended fix: Strengthen dedicated schema and retrieval paths for confirmed causes, fixes, confirmation state, linked diagnosis sessions, parts, downtime, and AI correctness so future similar-case retrieval uses clean structured records.
  - Verification command or check required: Confirm a repair outcome, verify it appears in normalized storage, and confirm it is retrieved as a future similar solved case within the same fleet only.

- Task ID: TFX-CR-0004
  - Task: Remove broad runtime schema mutation from `server/db.ts` and reduce it to connection and bootstrap responsibilities.
  - Category: Code quality & maintainability
  - Severity: High
  - First discovered date: 2026-05-11
  - Last seen date: 2026-05-14
  - Affected files: `server/db.ts`
  - Status: Open
  - Recommended fix: Move schema creation and repair logic into reviewed Drizzle migrations, then verify clean startup from migrations only.
  - Verification command or check required: Run clean database migration, app startup, demo seed validation, `pnpm check`, `pnpm test`, and `pnpm build`.

- Task ID: TFX-CR-0006
  - Task: Add stronger automated coverage for assigned-driver inspection and diagnosis happy paths after access hardening.
  - Category: Daily inspection workflow
  - Severity: Medium
  - First discovered date: 2026-05-11
  - Last seen date: 2026-05-13
  - Affected files: `server/routers/diagnostics.ts`, `server/routers/inspections.ts`, related test files
  - Status: Open
  - Recommended fix: Add seeded assignment-based tests for inspection start, diagnosis start, submission, DVIR report viewing, and manager visibility.
  - Verification command or check required: Run targeted inspection and diagnosis route tests plus browser smoke checks.

- Task ID: TFX-CR-0007
  - Task: Reduce repeated AI cost and latency across multi-question diagnosis sessions.
  - Category: Performance & AI cost control
  - Severity: Medium
  - First discovered date: 2026-05-11
  - Last seen date: 2026-05-14
  - Affected files: `server/routers/diagnostics.ts`, `server/services/diagnosisWorkflow.ts`, `server/services/aiOrchestrator.ts`
  - Status: Open
  - Recommended fix: Persist compact diagnosis session state, reuse support context across clarification rounds, and add retry or cost ceilings.
  - Verification command or check required: Multi-clarification diagnosis tests with token, retry, and cost assertions.

- Task ID: TFX-CR-0017
  - Task: Add production observability and error monitoring coverage for backend, AI provider, Supabase, and Stripe failures.
  - Category: Observability, logging & error monitoring
  - Severity: Medium
  - First discovered date: 2026-05-12
  - Last seen date: 2026-05-14
  - Affected files: backend services, deployment/runtime configuration
  - Status: Open
  - Recommended fix: Add a production-safe error monitoring path and capture key operational failures without exposing secrets or customer data.
  - Verification command or check required: Trigger safe test errors for backend, AI, Supabase, and Stripe paths and verify redacted monitoring events.

- Task ID: TFX-CR-0018
  - Task: Enforce demo/test data exclusion from production analytics, diagnostic learning, billing, and customer reports.
  - Category: Demo/test/production data separation
  - Severity: Medium
  - First discovered date: 2026-05-12
  - Last seen date: 2026-05-14
  - Affected files: `scripts/demo/demoSeedWorkflow.ts`, `shared/demoAssets.ts`, analytics/reporting/learning consumers, billing/reporting queries
  - Status: Open
  - Recommended fix: Add explicit demo filters or a first-class demo marker wherever aggregate analytics, billing, customer reporting, or diagnostic learning consumes seeded records.
  - Verification command or check required: Seed demo data and verify analytics, billing, learning, and customer report queries exclude demo records unless explicitly requested.

- Task ID: TFX-CR-0020
  - Task: Add audited staff/admin recovery workflows for pilot support issues.
  - Category: Customer support/admin recovery
  - Severity: High
  - First discovered date: 2026-05-13
  - Last seen date: 2026-05-14
  - Affected files: support/admin router and UI to be created, `server/_core/trpc.ts`, company/vehicle/access services
  - Status: Open
  - Recommended fix: Add staff-only audited actions for wrong company assignment, driver invite correction, vehicle reassignment, user deactivation or reactivation, pilot-code reset or reissue, failed inspection or diagnosis recovery visibility, and subscription status support.
  - Verification command or check required: Staff-only permission tests, audit log checks, and negative tests for owners, managers, and drivers.

- Task ID: TFX-CR-0021
  - Task: Verify pilot-to-paid billing conversion and subscription enforcement in staging.
  - Category: Billing / subscription readiness
  - Severity: Medium
  - First discovered date: 2026-05-13
  - Last seen date: 2026-05-14
  - Affected files: `server/services/stripeBilling.ts`, `server/_core/stripeBillingRoutes.ts`, `server/services/subscriptions.ts`, billing UI
  - Status: Open
  - Recommended fix: Run Stripe test-mode checkout and webhook scenarios for company-level billing, trial or pilot expiry, failed payment, cancellation, and data preservation after conversion.
  - Verification command or check required: Staging Stripe checkout, webhook replay, subscription state assertions, and route-level plan enforcement tests.

- Task ID: TFX-CR-0022
  - Task: Reduce the oversized shared frontend bundle and re-check mobile-first loading speed risk.
  - Category: Performance / Loading Speed
  - Severity: Medium
  - First discovered date: 2026-05-14
  - Last seen date: 2026-05-14
  - Affected files: `vite.config.ts`, `client/src/App.tsx`, shared dashboard and auth bundles
  - Status: Open
  - Recommended fix: Inspect shared dependency composition, split large common chunks where safe, and re-check route-level loading behavior on the highest-traffic mobile flows.
  - Verification command or check required: `pnpm build`, compare chunk sizes, and smoke-test login, dashboard, inspection, and diagnosis routes on mobile-sized viewports.

## In Progress Tasks

- None recorded today.

## Resolved Tasks

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
  - Evidence of resolution: File inspection confirmed `drizzle/0015_harden_rls_and_sessions.sql` defines `current_app_user_id()` and resolves `auth.uid()` through `users.openId` using `supabase_<uuid>` or raw UUID. Live tenant-isolation verification remains open under `TFX-CR-0001`.

- Task ID: TFX-CR-0019
  - Task: Resolve critical/high dependency audit advisories.
  - Category: Security / Dependency Risk
  - Resolved date: 2026-05-14
  - Evidence of resolution: `pnpm audit --audit-level=high` completed with no high or critical advisories; today it reported 11 vulnerabilities total, all below the review threshold (`1 low`, `10 moderate`).

- Task ID: TFX-CR-0005
  - Task: Audit and constrain `getUserPrimaryFleetId` fallback auto-membership creation from assignments and legacy manager linkage.
  - Category: Security & access control
  - Resolved date: 2026-05-14
  - Evidence of resolution: `server/services/companyAccess.ts` no longer auto-creates active company memberships from assignment or legacy manager-link inference, no longer defaults missing DB access to fleet `1`, and `server/companyAccess.test.ts` now verifies assignment/direct-vehicle fallback plus the removal of legacy cross-fleet membership fallback. `pnpm check`, `pnpm test`, and `pnpm build` all passed after the change.

## Deferred Tasks

- Task ID: TFX-CR-0014
  - Task: Expand onboarding to support larger initial team setup flows.
  - Category: UI/UX & mobile usability
  - Reason deferred: The current branch still has higher-priority tenant-isolation, support-recovery, knowledge-model, and maintainability work.
  - Revisit date or trigger: Revisit after `TFX-CR-0001`, `TFX-CR-0003`, and `TFX-CR-0020` are resolved.

- Task ID: TFX-CR-0016
  - Task: Verify and repair possible diagnosis router drift around historical similarity and cause taxonomy.
  - Category: AI diagnosis workflow
  - Reason deferred: Current diagnosis workflow tests are passing; tenant isolation, support recovery, and runtime schema hardening remain higher-priority.
  - Revisit date or trigger: Revisit when Batch C is approved.

## New Tasks From Today

- Task ID: TFX-CR-0022
  - Task: Reduce the oversized shared frontend bundle and re-check mobile-first loading speed risk.
  - Category: Performance / Loading Speed
  - Severity: Medium
  - Affected files: `vite.config.ts`, `client/src/App.tsx`, shared dashboard and auth bundles
  - Recommended next action: Profile the shared client chunk, split the biggest common dependencies, then rerun `pnpm build` and smoke-test key mobile flows.

## Rolling Implementation Roadmap

| Order | Workstream / Batch | Current Priority | Why It Matters | Status | Dependencies | Last Updated |
|---:|---|---|---|---|---|---|
| 1 | Security, authentication, roles, tenant isolation | Critical | Protects fleet and customer data and blocks any real pilot use until live RLS verification is complete | Active | Supabase-like verification environment | 2026-05-14 |
| 2 | Data integrity and record ownership | High | Ensures confirmed outcomes and cross-feature history stay tied to the correct fleet, vehicle, and diagnosis | Active | Workstream 1 | 2026-05-14 |
| 3 | Daily inspection workflow blockers | High | Core daily fleet workflow must remain reliable after access hardening | Monitoring | Workstreams 1-2 | 2026-05-14 |
| 4 | AI safety, fallback, diagnostic reliability | High | Core product value and liability control depend on safe fallback and trustworthy outputs | Monitoring | Workstreams 1-2 | 2026-05-14 |
| 5 | Core workflow performance and app loading speed | High | Mobile-first adoption will suffer if the oversized shared chunk or slow routes remain | Active | Build profiling, browser smoke tests | 2026-05-14 |
| 6 | Support/admin recovery | High | Controlled pilots need safe, audited recovery actions before support must edit data manually | Active | Workstream 1 | 2026-05-14 |
| 7 | Revenue/billing readiness | Medium/High | Needed for pilot-to-paid conversion without account confusion or data loss | Blocked on staging verification | Stripe staging access | 2026-05-14 |
| 8 | Knowledge base/history and TADIS learning data | Medium/High | Long-term diagnostic advantage depends on clean confirmed-outcome capture and reuse | Active | Workstream 2 | 2026-05-14 |
| 9 | Performance and AI cost control optimizations | Medium | Keeps response latency and operating cost practical during multi-question diagnosis sessions | Active | Workstreams 4-5 | 2026-05-14 |
| 10 | UX/mobile usability and onboarding | Medium | Improves activation after the core trust and performance blockers are reduced | Deferred | Workstreams 1, 5, 6 | 2026-05-14 |
| 11 | Demo/test/production separation | Medium | Prevents seeded/demo records from polluting analytics, billing, and learning | Active | Workstreams 2 and 7 | 2026-05-14 |
| 12 | Backup/recovery, maintainability, refactoring | Medium | Reduces future technical risk, especially around runtime schema mutation | Active | Workstreams 1-2 | 2026-05-14 |
