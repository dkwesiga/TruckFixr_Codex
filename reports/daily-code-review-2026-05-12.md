# TruckFixr Fleet AI Daily Code Review Report

Date: 2026-05-12
Time: 19:01:59
Timezone: America/Toronto
Reviewed Branch: main
Compared Against: main current working snapshot and `reports/daily-code-review-2026-05-11.md`
Reviewer: Codex

---

## 1. Executive Summary

- Overall health of the codebase: improved since yesterday. The full Vitest suite now passes, demo seed tooling is present, and core owner/manager/driver workflows are more complete.
- Major improvements since previous report: `pnpm test` passed 21 files / 165 tests; demo seed, rollback, and validation scripts exist; onboarding and manager dashboard consolidation remain in place.
- Major unresolved issues: RLS is not production-proven; `server/db.ts` still performs broad runtime DDL; diagnosis outcomes are not normalized into a durable knowledge base.
- New issues discovered today: `drizzle/0015_harden_rls_and_sessions.sql` appears to cast `auth.uid()` to integer, which is likely incompatible with normal Supabase Auth UUID behavior.
- MVP readiness decision: Not ready yet.
- Top 5 risks: RLS identity mismatch; runtime schema drift; weak solved-case data model; complex auto-membership fallback logic; demo data leaking into analytics or learning.
- Top 5 recommended actions: fix Supabase RLS user mapping; verify cross-company DB denies; stage removal of runtime DDL; normalize diagnosis outcomes; add tenant-isolation regression tests.
- Most urgent decision needed from Dickson: approve the security/data-isolation batch before more feature work.

---

## 2. Daily Scorecard

| Review Area | Score /10 | Change Since Previous Report | Notes |
|---|---:|---|---|
| Bug fixes & stability | 7.5 | +1.5 | Full Vitest suite passed. |
| Security & access control | 5.0 | 0 | RLS Auth ID mapping remains unresolved. |
| Multi-company data isolation | 5.5 | +0.5 | App helpers improved; DB policies need proof. |
| AI diagnosis workflow | 7.0 | 0 | Clarification behavior improved; historical matching needs re-check. |
| AI safety, liability & triage controls | 7.0 | +0.5 | Conservative fallback guidance is present. |
| Daily inspection workflow | 6.5 | +0.5 | Core flow exists; reminders remain missing. |
| Data integrity & database consistency | 4.5 | -0.5 | Runtime DDL plus RLS mismatch is risky. |
| Knowledge base/history growth | 5.5 | -0.5 | Signals exist but are not normalized. |
| Performance & AI cost control | 6.5 | +0.5 | Usage logs exist; repeated context work remains. |
| UI/UX & mobile usability | 7.0 | 0 | Good progress; needs mobile E2E coverage. |
| User activation & onboarding friction | 7.0 | +1.0 | First truck and invite actions are wired. |
| MVP readiness for fleet users | 5.8 | +0.8 | Better, but blocked by security verification. |
| Pilot KPI tracking | 6.5 | +0.5 | Many KPIs are derivable from current records. |
| Compliance readiness | 6.0 | +0.5 | Inspection records exist; scheduler gaps remain. |
| Observability, logging & error monitoring | 6.0 | +0.5 | AI logs help; production monitoring is limited. |
| Demo/test/production data separation | 7.0 | +1.0 | Seed safety gates exist; aggregate filters need enforcement. |
| Billing/subscription readiness | 6.5 | 0 | Stripe structure exists; staging proof needed. |
| Backup, recovery & rollback readiness | 5.0 | +0.5 | Demo rollback exists; broader restore runbooks are thin. |
| Code quality & maintainability | 5.0 | 0 | Large files and runtime schema repair remain. |

- Overall MVP readiness score out of 10: 5.8
- Pilot readiness score out of 10: 6.5
- Security readiness score out of 10: 5.0
- AI diagnosis workflow score out of 10: 7.0
- Knowledge base readiness score out of 10: 5.5

---

## 3. What Changed Since Previous Report

### Resolved Since Previous Report

- Issue: Full Vitest suite failing.
- Evidence of resolution: `pnpm test` passed 21 test files / 165 tests when run with required process-spawn permission. The sandbox-only run failed with `spawn EPERM`, which appears environmental.
- Files affected: diagnostics, auth, TADIS, and orchestrator test coverage.

### Improved But Not Fully Resolved

- Issue: Demo/test data readiness.
- What improved: demo seed, rollback, validation, safety gates, and fictional demo identifiers are present.
- What remains: production analytics, diagnostic learning, billing, and reports need explicit demo-data exclusion.

- Issue: AI diagnosis clarification flow.
- What improved: `server/services/diagnosisWorkflow.ts` has a 3-question cap, fallback clarifying questions, and safe fallback diagnosis behavior.
- What remains: `server/routers/diagnostics.ts` should be checked for branch drift around historical similarity and default cause taxonomy.

### Still Unresolved

- Issue: RLS hardening verification.
- Current status: migration exists, but policy identity mapping appears incompatible with normal Supabase UUID semantics.
- Priority: Critical.

- Issue: Runtime schema mutation.
- Current status: `server/db.ts` still creates/alters many tables at startup.
- Priority: High.

- Issue: Normalized TruckFixr knowledge base.
- Current status: diagnosis feedback and repair-learning signals remain mostly activity-log JSON.
- Priority: High.

### New Issues Found Today

- Issue: RLS policies use `auth.uid()::integer`.
- Severity: Critical.
- Affected files: `drizzle/0015_harden_rls_and_sessions.sql`.
- Recommended action: map Supabase UUID auth users to TruckFixr app users explicitly before relying on this migration.

---

## 4. Critical / High-Risk Findings Only

- Issue: Supabase RLS identity mapping may be wrong.
- Severity: Critical.
- Category: Security, access control, tenant isolation.
- Affected files: `drizzle/0015_harden_rls_and_sessions.sql`, auth/user mapping code.
- Why it matters: Supabase `auth.uid()` normally returns a UUID, while TruckFixr app users appear to use integer IDs. Casting `auth.uid()` to integer can fail, deny valid access, or leave DB isolation unproven.
- Product/business impact: real fleet customer data separation cannot be considered production-safe yet.
- Recommended fix: add a verified RLS helper that resolves the current Supabase UUID to the correct TruckFixr user row, then rewrite fleet policies around that helper.
- Risk level: High implementation sensitivity.
- How to test: seed three demo companies, authenticate as normal users, and verify cross-company reads/writes fail at the database layer.
- Whether approval is needed before implementation: Yes.

- Issue: Runtime schema mutation remains in `server/db.ts`.
- Severity: High.
- Category: Data integrity, rollback readiness, maintainability.
- Affected files: `server/db.ts`, Drizzle migrations.
- Why it matters: startup-time DDL can hide missing migrations, create environment drift, and make rollback behavior unpredictable.
- Product/business impact: production incidents become harder to diagnose because schema state may differ from reviewed migrations.
- Recommended fix: move schema creation/repair into migrations and reduce runtime DB code to connection/bootstrap checks.
- Risk level: Medium if staged.
- How to test: clean database migration, app startup, demo seed validation, and full test suite.
- Whether approval is needed before implementation: Yes.

- Issue: solved diagnostic knowledge is not yet normalized.
- Severity: High.
- Category: AI diagnosis and knowledge/history growth.
- Affected files: `server/routers/diagnostics.ts`, `server/services/tadisCore.ts`, `activityLogs`.
- Why it matters: JSON activity logs are not enough for reliable future retrieval, analytics, or learning from confirmed repairs.
- Product/business impact: TruckFixr's long-term AI advantage is harder to demonstrate in pilots.
- Recommended fix: add normalized diagnosis outcome and repair-confirmation records linked to fleet, vehicle, diagnosis session, symptoms, fault codes, cause, repair, confidence, and confirmation status.
- Risk level: Medium.
- How to test: confirm a repair outcome, retrieve it as a future similar case, and verify tenant boundaries.
- Whether approval is needed before implementation: Yes.

---

## 5. Grouped Daily Review Findings

### A. Stability, Performance, Observability

- Key findings: tests now pass; AI usage logging exists; dev warmup timeout noise remains a watch item.
- Medium/Low issues: sandbox-only `pnpm test` hit `spawn EPERM`; production error monitoring is still limited.
- Recommended actions: keep Vitest green as a merge gate and add production-safe monitoring for backend, AI, Supabase, and Stripe failures.
- Test notes: `pnpm test` passed with required process-spawn permission.

---

### B. Security, Access Control, Tenant Isolation

- Key findings: app-layer access checks are stronger; database RLS remains the primary blocker.
- Medium/Low issues: `getUserPrimaryFleetId` still has auto-membership fallback paths from assignments and legacy manager relationships.
- Recommended actions: fix RLS user mapping first, then add cross-company deny tests for vehicles, inspections, diagnostics, repairs, attachments, and activity logs.
- Test notes: do not rely on frontend filtering for company separation.

---

### C. AI Diagnosis, AI Safety, Knowledge Base/History

- Key findings: diagnosis has better clarification caps, safety fallback behavior, and usage logging.
- Medium/Low issues: support-data reuse and historical matching should be checked for drift; repeated clarification rounds can still be costly.
- Recommended actions: normalize solved-case storage and cache compact session context across clarification rounds.
- Test notes: cover low confidence, repeated questions, provider failures, and vehicle-specific history retrieval.
- Does the app currently learn from solved cases? Partially, but mostly through activity logs.
- Does it store enough structured data to improve future diagnostics? Not yet.
- What is missing? normalized outcomes, repair confirmations, cause taxonomy, fleet-safe retrieval, and feedback-quality controls.

---

### D. Daily Inspections, Compliance, Fleet-User Readiness

- Key findings: inspection submission, DVIR-style reporting, assigned-vehicle access, and manager health views are present.
- Medium/Low issues: missed-inspection reminder automation and compliance escalation remain incomplete.
- Recommended actions: add assigned-driver E2E tests and manager missed-inspection reminders.
- Test notes: verify drivers inspect assigned vehicles only and managers see records inside their company only.
- Final decision: Not ready yet.

---

### E. UX, Onboarding, Mobile Usability

- Key findings: onboarding persists first-truck setup and invite actions; manager dashboard consolidation reduces confusion.
- Medium/Low issues: larger-team onboarding is deferred; mobile empty/error states need more testing.
- Recommended actions: add onboarding smoke tests and verify driver inspection/diagnosis flows on small screens.
- Can a new fleet owner reach first value quickly? Mostly, for a small fleet.
- Where could a user get stuck? Auth/demo credential setup, invite acceptance, and first assignment.
- Highest-friction onboarding step: multi-user team setup.

---

### F. Billing, Pilot Data, Backup/Recovery, Maintainability

- Key findings: Stripe/subscription plumbing exists; pilot/demo seed infrastructure is stronger.
- Medium/Low issues: backup/restore runbooks are thin; runtime DDL remains the largest maintainability risk.
- Recommended actions: verify Stripe webhooks in staging, document restore drills, and enforce demo-data filters.
- Test notes: confirm demo data cannot affect billing, production analytics, diagnostic learning, or customer reports.

---

## 6. Pilot KPI Tracking Check

- Currently trackable KPIs: active fleets, vehicles, drivers, inspections, defects, diagnoses, clarification questions, AI confidence, AI token/cost usage, repair outcomes, repeat vehicle issues, and pilot access activity.
- Missing KPIs: time to first vehicle, time to first inspection, missed inspections by expected schedule, downtime avoided, diagnosis-to-repair conversion, demo-vs-real segmentation, and pilot-to-paid funnel stages.
- Highest-priority KPI gap: a clean pilot KPI dashboard that excludes demo data.
- Recommended fix: add a small KPI aggregation service after RLS/data-isolation work.

---

## 7. Approved Fixes Queue

### Batch A: Safe Bug Fixes

- Fix: verify and repair diagnosis router drift around historical similarity and default cause taxonomy.
- Affected files: `server/routers/diagnostics.ts`, related tests.
- Risk level: Low to Medium.
- Expected impact: more accurate similar-case behavior.
- Test steps: run diagnosis workflow tests and a demo similar-case scenario.

### Batch B: Security & Access Fixes

- Fix: rewrite RLS policies to map Supabase Auth UUIDs to TruckFixr app users correctly, then verify tenant isolation.
- Affected files: `drizzle/0015_harden_rls_and_sessions.sql`, auth/user mapping helpers.
- Risk level: High.
- Expected impact: production-grade company separation.
- Test steps: cross-company read/write denial tests under real user sessions.

### Batch C: AI Diagnosis Workflow Fixes

- Fix: persist compact diagnosis session state across clarification rounds.
- Affected files: diagnosis services and routers.
- Risk level: Medium.
- Expected impact: lower cost/latency.
- Test steps: multi-question diagnosis tests with token/cost assertions.

### Batch D: Daily Inspection Workflow Fixes

- Fix: add missed-inspection reminders and assigned-driver inspection regression tests.
- Affected files: inspection router, scheduler/service layer, tests.
- Risk level: Medium.
- Expected impact: stronger compliance value.
- Test steps: missed inspection and defect escalation scenarios.

### Batch E: Performance & AI Cost Fixes

- Fix: add provider retry/cost ceilings and session-context caching.
- Affected files: AI orchestration and diagnosis services.
- Risk level: Medium.
- Expected impact: more predictable AI spend.
- Test steps: provider failure and repeated clarification simulations.

### Batch F: UI/UX & Mobile Fixes

- Fix: expand onboarding for larger team setup and improve mobile empty/error states.
- Affected files: onboarding and dashboard UI.
- Risk level: Low.
- Expected impact: faster activation.
- Test steps: owner setup smoke test on mobile viewport.

### Batch G: Knowledge Base / History Fixes

- Fix: add normalized diagnosis outcome and repair-confirmation storage.
- Affected files: schema, diagnostics router, repair/maintenance services.
- Risk level: Medium.
- Expected impact: real TruckFixr learning loop.
- Test steps: confirm repair, retrieve similar solved case, verify tenant boundaries.

### Batch H: Data Integrity / Tenant Isolation Fixes

- Fix: move runtime schema mutation out of `server/db.ts` into migrations.
- Affected files: `server/db.ts`, Drizzle migrations.
- Risk level: Medium to High.
- Expected impact: safer deploys and rollbacks.
- Test steps: clean DB migration, app startup, demo seed, full test suite.

### Batch I: Billing / Backup / Maintainability Fixes

- Fix: verify staging Stripe webhook flow and document backup/restore/rollback.
- Affected files: billing services, docs, deployment runbooks.
- Risk level: Low to Medium.
- Expected impact: safer pilot-to-paid transition.
- Test steps: staging checkout, webhook, subscription enforcement, restore drill.

---

## 8. Master Task List Updates

Updated `/reports/code-review-task-list.md` with today's status changes, including resolving the green test-suite task and adding RLS identity-mapping, diagnosis drift, observability, and demo-data-separation follow-ups.

---

## 9. Decision Needed From Dickson

| Decision Needed | Reason | Options | Recommended Choice |
|---|---|---|---|
| Approve security/data-isolation fix batch? | RLS identity mapping is the biggest blocker to real fleet use. | Approve Batch B now; defer; split into RLS-only sub-batch. | Approve Batch B now. |
| Treat MVP as blocked for real fleets? | Tests are green, but DB tenant isolation is not verified. | Block real fleets; allow internal demo only; allow limited pilot. | Block real fleets, allow internal demo only. |
| Prioritize knowledge base normalization? | It supports TruckFixr's long-term AI advantage. | Do now; do after RLS; defer. | Do after RLS. |

---

## 10. Prompt Revision Log

### Current Review Areas

1. Bug fixes and stability
2. Security and access control
3. Multi-company data isolation
4. AI diagnosis workflow
5. AI safety, liability, and triage controls
6. Daily inspection workflow
7. Data integrity and database consistency
8. Knowledge base/history generation and growth
9. Performance and AI cost control
10. UI/UX and mobile usability
11. User activation and onboarding friction
12. MVP readiness for real fleet users
13. Pilot KPI tracking
14. Compliance readiness
15. Observability, logging, and error monitoring
16. Demo/test/production data separation
17. Billing/subscription readiness
18. Backup, recovery, and rollback readiness
19. Overall code quality and maintainability

### Recommended Prompt Changes

- Add / Edit / Remove / Reprioritize: Add.
- Proposed change: require a short "commands run" evidence block in each daily report.
- Why it matters: ties review claims to concrete verification.
- Expected benefit: easier audit trail.
- Risk of making the change: slightly longer reports.
- Suggested wording: "Include commands run, pass/fail status, and any environmental limitations."

### User-Editable Task Options

To revise the daily review prompt, reply with one of the following:
- Add task: [describe task]
- Edit task: [task number or name] -> [new wording]
- Remove task: [task number or name]
- Reprioritize task: move [task] before/after [task]
- Approve prompt change: [change name]
- Reject prompt change: [change name]

---

## 11. Recommended Next Action

- Most urgent issue to address: Supabase RLS identity mapping and tenant-isolation verification.
- Safest fix batch to approve first: Batch B, scoped first to RLS mapping and verification tests.
- Whether code changes are recommended today: Yes, but only after approval.
- Whether the MVP is ready for real fleet users today: No.
- Whether the knowledge base/history system is improving: Yes, but it is not structurally strong enough yet.
- Whether any prompt changes are recommended: Yes, add a concise commands-run evidence block.

Recommended first action: Approve Batch B: Security & Access Fixes. I will not modify application code unless you approve a specific batch.
