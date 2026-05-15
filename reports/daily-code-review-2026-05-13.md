# TruckFixr Fleet AI Daily Code Review Report

Date: 2026-05-13
Time: 10:14:05
Timezone: America/Toronto
Reviewed Branch: main
Compared Against: `reports/daily-code-review-2026-05-12.md`; `main...HEAD` has no committed diff, so today's review covers the active `main` working tree.
Reviewer: Codex

---

## 0. Commands Run & Verification Evidence

| Command | Purpose | Pass / Fail / Skipped | Key Output or Finding | Notes / Limitations |
|---|---|---|---|---|
| `Get-Content package.json` | Inspect available scripts first | Pass | Scripts include `check`, `test`, `build`, demo seed/rollback/validation. No lint script. | Project uses pnpm, not npm lockfile workflow. |
| `git branch --show-current` | Identify branch | Pass | `main` | Active branch reviewed. |
| `git status --short` | Inspect working state | Pass | Large dirty working tree across app, server, schema, scripts, reports. | Report includes working tree risk. |
| `git log --oneline -5` | Commit context | Pass | Latest commit `7f9c2f4 Add DeepSeek diagnostic failover`. | Useful context only. |
| `git diff --stat main...HEAD` | Compare branch to main | Pass | No output | Branch is `main`; comparison is same-branch. |
| `git diff --stat` | Working-tree scope | Pass | 73 tracked files changed, 3259 insertions, 1817 deletions, plus untracked files. | Large uncommitted surface increases release risk. |
| Read previous report/task list | Previous failure re-check | Pass | Previous report and master task list found. | Baseline: 2026-05-12. |
| `pnpm check` | TypeScript verification | Pass | `tsc --noEmit` completed cleanly. | Verified. |
| `pnpm test` | Full Vitest suite | Initial sandbox fail, escalated pass | Sandbox failed with `spawn EPERM`; escalated run passed 23 files / 171 tests. | Same environment issue as previous report; not an app failure. |
| `pnpm audit --audit-level high` | Dependency security audit | Initial sandbox fail, escalated fail | Registry access first failed with `ECONNREFUSED`; escalated audit found 60 vulnerabilities: 1 critical, 21 high. | New task created. No `audit fix` run. |
| `pnpm build` | Production build verification | Initial sandbox fail, escalated pass | Client and server builds passed. Client main chunk warning: `index-DhdN4qzz.js` 655.27 kB. | Build writes `dist`; no source changes made. |
| `npm ci` | Dependency install verification | Skipped | No `package-lock.json`; project uses `pnpm-lock.yaml`. | No install run. |
| `npm audit --audit-level=high` | npm audit | Skipped | No npm lockfile; equivalent `pnpm audit` was run. | pnpm is the package manager. |
| `npm run lint` | Lint verification | Skipped | No lint script in `package.json`. | Add lint later if desired. |

### Files / Areas Inspected

| File / Folder / Area | Why It Was Reviewed | Key Finding | Related Review Area |
|---|---|---|---|
| `package.json`, `pnpm-lock.yaml` | Scripts and dependency posture | pnpm project; audit has critical/high advisories. | Stability, security |
| `reports/daily-code-review-2026-05-12.md` | Previous comparison | RLS mapping and runtime DDL were top blockers. | All areas |
| `reports/code-review-task-list.md` | Prior task state | RLS verification, runtime DDL, learning model, demo separation still open. | Task tracking |
| `drizzle/0015_harden_rls_and_sessions.sql` | RLS hardening | `current_app_user_id()` now resolves Supabase UUID through `users.openId`; activity log insert policy is no longer open. | Tenant isolation |
| `drizzle/0005_rls_policies.sql` | Legacy RLS context | Old `auth.uid()::integer` and open activity log insert remain in older migration history. | Tenant isolation |
| `server/db.ts` | Schema/data integrity | Broad runtime DDL remains at startup. | Data integrity |
| `server/_core/trpc.ts` | API route protection | `adminProcedure` means owner/manager, while `staffProcedure` exists for internal-only actions. | Access control, support |
| `server/services/companyAccess.ts` | Company membership logic | Membership checks improved, but auto-membership fallback paths remain. | Tenant isolation |
| `server/routers/vehicles.ts` | Fleet vehicle access | Vehicle creation now requires valid fleet and manager/owner access. | Security |
| `server/routers/inspections.ts` | Daily inspection and DVIR | Odometer validation, repair outcome capture, reminders, and report retrieval exist. | Inspections, compliance |
| `client/src/pages/DriverInspectionNSC.tsx` | Mobile inspection UX | Truck odometer prompt and trailer hiding are present. | Inspection UX |
| `client/src/pages/InspectionReportDvir.tsx` | DVIR report UX | Pass/defect status and safer back action are present. | Inspection UX |
| `server/routers/diagnostics.ts`, `server/services/diagnosisWorkflow.ts`, `server/services/tadisCore.ts` | AI diagnosis and learning | Clarification caps and feedback exist; knowledge remains partly activity-log based. | AI, knowledge base |
| `server/services/stripeBilling.ts`, `server/_core/stripeBillingRoutes.ts`, `server/services/subscriptions.ts` | Billing | Stripe signature verification and company metadata mapping exist; staging proof still needed. | Billing |
| `scripts/demo/demoSeedWorkflow.ts` | Demo data safety | Safety gates and demo metadata exist; aggregate exclusion still needs enforcement. | Demo separation |
| `server/routers/faultCodeReferences.ts` | Staff/admin recovery model | Uses `staffProcedure`; broader support recovery workflows are still limited. | Support/admin |

---

## 1. Executive Summary

- Overall health: better functionally than yesterday. Typecheck, full tests, and production build pass with current code.
- Major improvements since previous report: RLS UUID mapping appears repaired in `0015_harden_rls_and_sessions.sql`; inspection odometer/report updates are covered by tests; full suite is now 23 files / 171 tests.
- Major unresolved issues: tenant isolation is still not proven against an applied Supabase database; runtime DDL remains; dependency audit found critical/high advisories.
- New issues discovered today: `pnpm audit --audit-level high` reports 1 critical and 21 high vulnerabilities, including `fast-xml-parser`, `@trpc/server`, `drizzle-orm`, `vite`, `pnpm`, `path-to-regexp`, `tar`, `rollup`, `lodash`, and `picomatch`.
- MVP readiness decision: Not ready yet.
- Controlled pilot decision: Not ready for any real fleet users until tenant isolation and dependency risk are addressed or formally accepted.
- Top 5 risks: unverified RLS/tenant isolation; critical/high dependency advisories; runtime schema mutation; incomplete support/admin recovery; knowledge base still not fully normalized.
- Top 5 recommended actions: resolve dependency audit with controlled upgrades; apply/verify RLS in Supabase with cross-company tests; migrate runtime DDL to migrations; add support recovery workflows; normalize diagnosis/repair learning.
- Most urgent decision needed from Dickson: approve a security/dependency fix batch before more feature work.

---

## 2. Daily Scorecard

| Review Area | Score /10 | Change Since Previous Report | Notes |
|---|---:|---|---|
| Bug fixes & stability | 8.0 | +0.5 | Typecheck, tests, build pass. |
| Security & access control | 4.5 | -0.5 | RLS mapping improved, but audit added critical/high dependency risk. |
| Multi-company data isolation | 5.8 | +0.3 | Helper exists; DB denial tests still missing. |
| AI diagnosis workflow | 7.5 | +0.5 | Clarification/session tests pass. |
| AI safety, liability & triage controls | 7.3 | +0.3 | Tests cover fallback and high-risk decisions. |
| Daily inspection workflow | 7.5 | +1.0 | Odometer, trailer handling, DVIR, reminders have tests. |
| Data integrity & database consistency | 4.8 | +0.3 | Odometer update improved; runtime DDL remains. |
| Knowledge base/history growth | 6.0 | +0.5 | Repair outcomes and feedback exist, but normalization incomplete. |
| Performance & AI cost control | 6.5 | 0 | Usage logs exist; build has large main chunk warning. |
| UI/UX & mobile usability | 7.2 | +0.2 | Inspection/report UX improved. |
| User activation & onboarding friction | 7.0 | 0 | Still needs live pilot validation. |
| MVP readiness for fleet users | 5.5 | -0.3 | Dependency audit and unverified RLS block launch. |
| Pilot KPI tracking | 6.5 | 0 | Many KPIs derivable, dashboard/segmentation incomplete. |
| Compliance readiness | 6.8 | +0.8 | DVIR and odometer tracking improved. |
| Observability, logging & error monitoring | 6.0 | 0 | AI logs good; production monitoring incomplete. |
| Demo/test/production data separation | 7.0 | 0 | Seed gates exist; aggregate exclusion not proven. |
| Billing/subscription readiness | 6.2 | -0.3 | Stripe structure exists; dependency/security and staging proof needed. |
| Backup, recovery & rollback readiness | 5.2 | +0.2 | Demo rollback exists; broader rollback remains thin. |
| Customer support/admin recovery | 4.5 | New | Staff procedure exists, but common recovery flows are limited. |
| Code quality & maintainability | 5.2 | +0.2 | Tests better; large dirty tree and runtime DDL remain. |

- Overall MVP readiness score out of 10: 5.5
- Pilot readiness score out of 10: 5.8
- Security readiness score out of 10: 4.5
- AI diagnosis workflow score out of 10: 7.5
- Knowledge base readiness score out of 10: 6.0
- Revenue/billing readiness score out of 10: 6.2
- Support/admin recovery score out of 10: 4.5

---

## 3. What Changed Since Previous Report

### Resolved Since Previous Report

- Issue: suspected RLS UUID-to-integer mapping defect.
- Evidence of resolution: `drizzle/0015_harden_rls_and_sessions.sql` now defines `current_app_user_id()` and resolves `auth.uid()` via `users.openId` values like `supabase_<uuid>`.
- Files affected: `drizzle/0015_harden_rls_and_sessions.sql`.

- Issue: full-suite verification needed re-check.
- Evidence of resolution: escalated `pnpm test` passed 23 files / 171 tests.
- Files affected: test suite.

### Improved But Not Fully Resolved

- Issue: activity log RLS insert rule.
- What improved: migration 0015 replaces `WITH CHECK (true)` with fleet access plus `userId = current_app_user_id()`.
- What remains: must be applied and verified in Supabase under normal user sessions.

- Issue: daily inspection compliance quality.
- What improved: odometer capture/update, trailer omission, DVIR pass/defect markings, reminders, and tests.
- What remains: browser/E2E validation and live manager visibility proof.

### Still Unresolved

- Issue: tenant isolation not proven end-to-end. Current status: partially verified by file inspection; not verified against live RLS. Priority: Critical.
- Issue: runtime schema mutation. Current status: verified in `server/db.ts`. Priority: High.
- Issue: normalized TADIS learning. Current status: partial through repair outcomes and feedback/activity logs. Priority: High.
- Issue: demo-data exclusion from production analytics/learning/billing. Current status: partial. Priority: Medium.

### New Issues Found Today

- Issue: critical/high dependency advisories.
- Severity: Critical.
- Affected files: `package.json`, `pnpm-lock.yaml`.
- Recommended action: approve dependency upgrade batch; do not run automated `audit fix` blindly.

---

## 4. Critical / High-Risk Findings Only

- Issue: Dependency audit reports critical/high advisories.
- Severity: Critical.
- Category: Security / Dependency Risk.
- Affected files: `package.json`, `pnpm-lock.yaml`.
- Confidence level: High.
- Verification status: Verified.
- Evidence source: escalated `pnpm audit --audit-level high`.
- Why it matters: advisories include runtime or deployment-relevant packages: `drizzle-orm` SQL identifier injection, `@trpc/server` prototype pollution advisory, `express` transitive `path-to-regexp` ReDoS, Vite file-read advisories, AWS XML parsing via `fast-xml-parser`, and package-manager/build-tool risks.
- Product/business impact: real fleet data and production deployment confidence are weakened until upgrades are reviewed and tested.
- Recommended fix: upgrade targeted packages to patched versions, refresh lockfile intentionally, run typecheck/test/build/audit, and review breaking changes.
- Risk level: Medium implementation risk because framework packages are involved.
- How to test: `pnpm check`, `pnpm test`, `pnpm build`, `pnpm audit --audit-level high`, plus smoke auth/inspection/diagnosis flows.
- Whether approval is needed before implementation: Yes.

- Issue: Tenant isolation remains not verified in live Supabase/RLS.
- Severity: Critical.
- Category: Security, access control, tenant isolation.
- Affected files: `drizzle/0015_harden_rls_and_sessions.sql`, company access services, auth mapping.
- Confidence level: High.
- Verification status: Partially Verified.
- Evidence source: file inspection and missing live DB denial test evidence.
- Why it matters: the code now has the right mapping shape, but real fleet use depends on applied policies denying cross-company records at the database layer.
- Product/business impact: TruckFixr cannot safely onboard real companies until cross-company denial is proven.
- Recommended fix: apply migration in staging/local Supabase, seed multiple companies, authenticate as normal users, and verify cross-company reads/writes fail for vehicles, inspections, diagnostics, defects, activity logs, attachments, and billing.
- Risk level: High.
- How to test: user-context Supabase queries and tRPC integration tests with three companies.
- Whether approval is needed before implementation: Yes.

- Issue: Runtime schema mutation remains.
- Severity: High.
- Category: Data integrity, rollback readiness.
- Affected files: `server/db.ts`.
- Confidence level: High.
- Verification status: Verified.
- Evidence source: file inspection.
- Why it matters: startup DDL can hide missing migrations, create environment drift, and complicate rollback.
- Product/business impact: production incidents become harder to diagnose and reproduce.
- Recommended fix: move schema repair into migrations and reduce runtime startup to connection checks.
- Risk level: Medium if staged.
- How to test: clean database migration, app startup, demo seed validation, full test/build.
- Whether approval is needed before implementation: Yes.

---

## 5. Blocked / Not Verified Checks

| Check | Status | Reason Blocked | Risk | Task Created? |
|---|---|---|---|---|
| Live Supabase RLS cross-company denial | Not Verified | No live/staging user-context DB verification run in this report. | Critical privacy risk. | Existing `TFX-CR-0001`. |
| Browser E2E for inspection/report/diagnosis | Not Verified | This report used repository/test/build evidence only. | Medium workflow risk. | Existing/covered by `TFX-CR-0006`. |
| Stripe staging checkout/webhook | Not Verified | No Stripe test keys or webhook endpoint exercise in this report. | Medium billing risk. | Existing/covered by `TFX-CR-0021`. |
| Production observability | Partially Verified | Logs exist, but no deployed monitoring review. | Medium support risk. | Existing `TFX-CR-0017`. |
| Demo exclusion from analytics/learning/billing | Partially Verified | Seed markers exist, aggregate consumer filters not proven. | Medium business-data risk. | Existing `TFX-CR-0018`. |

---

## 6. Grouped Daily Review Findings

### A. Stability, Performance, Observability

- Key findings: `pnpm check`, `pnpm test`, and `pnpm build` pass after sandbox escalation.
- Medium/Low issues: build warns that the main client chunk is 655.27 kB; production observability remains limited.
- Recommended actions: keep typecheck/test/build as merge gates, then add monitoring for backend, Supabase, Stripe, and AI provider failures.
- Test notes: sandbox `spawn EPERM` is environmental; escalated verification passed.

### B. Security, Access Control, Tenant Isolation

- Key findings: RLS UUID helper is now present; activity log insert policy is tightened in migration 0015; dependency audit is the largest new security concern.
- Medium/Low issues: `getUserPrimaryFleetId` still has auto-membership fallback paths from assignments and legacy manager linkage.
- Recommended actions: approve dependency/security batch, apply RLS in staging, and add real tenant-isolation denial tests.
- Test notes: do not treat frontend filtering as company separation.

### C. AI Diagnosis, AI Safety, Knowledge Base/History

- Key findings: AI diagnosis tests cover clarification continuation, fallback, JSON repair, and safety decisions.
- Medium/Low issues: diagnosis learning still relies partly on activity-log JSON, though repair outcomes and feedback records exist.
- Recommended actions: normalize diagnosis session outcomes and repair confirmations.
- Test notes: full AI/TADIS tests passed.
- Does the app currently learn from solved cases? Partially.
- Does it store enough structured data to improve future diagnostics? Partial.
- What is missing for a useful TruckFixr knowledge base? Stronger normalized links among diagnosis, symptoms, fault codes, confirmed root cause, parts/labor, repair outcome, and accuracy feedback.
- Safest next improvement: make confirmed repair outcome capture first-class and tenant-scoped.

### D. Daily Inspections, Compliance, Fleet-User Readiness

- Key findings: odometer capture/update for trucks, trailer odometer hiding, DVIR pass/defect status, repair outcomes, reminders, and reporting are present.
- Medium/Low issues: live mobile/E2E coverage remains missing.
- Recommended actions: add assigned-driver E2E checks and manager visibility tests.
- Test notes: inspection workflow/reporting/odometer tests passed through full suite.
- Final decision: Not ready yet.

### E. UX, Onboarding, Mobile Usability

- Key findings: access gateway copy, onboarding, manager dashboard consolidation, and inspection UX are improved.
- Medium/Low issues: first-time owner activation still depends on correct company, invite, and vehicle setup.
- Recommended actions: run mobile browser smoke tests for access, onboarding, driver inspection, diagnosis, and report return.
- Can a new fleet owner reach first value quickly? Mostly, in a demo or guided pilot.
- Where could a user get stuck? Invite acceptance, vehicle assignment, and billing/plan state.
- Highest-friction onboarding step: multi-user setup and assignment.

### F. Billing, Pilot Data, Backup/Recovery, Maintainability

- Key findings: Stripe webhook signature verification exists, company billing metadata is mapped, and demo seed has strong safety gates.
- Medium/Low issues: staging billing flow not verified; runtime DDL remains; demo exclusion from downstream analytics is not proven.
- Recommended actions: verify Stripe in staging and add explicit demo filters in analytics/learning/billing/reporting consumers.
- Test notes: subscription tests passed; no live Stripe test performed.

### G. Customer Support / Admin Recovery

- Key findings: `staffProcedure` exists and fault-code admin tools are staff-gated.
- Medium/Low issues: common support actions like wrong-company correction, reassignment repair, account recovery, failed inspection/diagnosis recovery, and pilot-code correction appear to need direct database intervention or ad hoc paths.
- Recommended actions: add audited staff-only recovery actions for pilot support.
- Test notes: not verified through UI or API.
- Can support recover common pilot-user problems without unsafe database edits? Not reliably.
- Are admin recovery actions properly permissioned and auditable? Partially.
- Biggest pilot risk: wrong company or vehicle assignment that support cannot safely repair.
- Safest next support/admin improvement: staff-only audited user/company/assignment correction tools.

---

## 7. Fleet Pilot No-Go Criteria

| No-Go Area | Pass / Fail / Not Verified | Evidence | Action Required |
|---|---|---|---|
| Authentication reliability | Pass | Auth tests passed. | Continue smoke testing. |
| Tenant isolation | Not Verified | RLS helper inspected; no live denial test. | Apply/verify RLS. |
| Role permissions | Partial | Protected/admin/staff procedures inspected. | Add role regression tests. |
| Daily inspection submission | Pass | Inspection tests passed. | Add browser E2E. |
| Manager visibility of failed inspections | Partial | Code inspected; no live E2E. | Add manager E2E. |
| AI safety and triage controls | Pass | Diagnosis/TADIS tests passed. | Keep regression tests. |
| AI fallback handling | Pass | Tests passed. | Monitor production failures. |
| Environment/API key protection | Partial | Env and Stripe paths inspected. | Add deployment checklist. |
| Demo/test/production data separation | Partial | Seed markers exist. | Prove aggregate exclusions. |
| Data integrity and record ownership | Fail | Runtime DDL remains. | Move DDL to migrations. |
| Critical build/API/database failures | Pass | Typecheck/build/tests pass. | Continue CI gates. |
| Pilot billing/access readiness | Partial | Stripe/pilot code paths exist. | Verify staging flow. |
| Error logging/observability | Partial | Logs exist; monitoring incomplete. | Add monitoring. |

Final pilot decision: Not ready yet.

---

## 8. Controlled Pilot Decision

| Decision Level | Status | Evidence | Conditions / Restrictions |
|---|---|---|---|
| Ready for any real fleet users? | No | Tenant isolation not verified and dependency audit has critical/high findings. | Internal/demo only. |
| Controlled pilot allowed? | No | Critical privacy/security checks remain unverified. | Revisit after RLS and dependency remediation. |
| Broader onboarding allowed? | No | Not launch-ready. | Revisit after no-go criteria pass. |

Final decision: Not ready for any real fleet users.

---

## 9. Pilot Operating Restrictions

Pilot operating restrictions do not apply because the app is not ready for real fleet users.

---

## 10. Data Learning Quality Check

| Data Area | Captured? Yes / No / Partial / Not Verified | Structure Quality | Reusable for TADIS? | Gap / Recommended Fix |
|---|---|---|---|---|
| Vehicle identity and specs | Yes | Good | Yes | Keep mileage/engine/specs consistent. |
| Symptoms and fault codes | Yes | Good | Yes | Maintain taxonomy. |
| Inspection findings | Yes | Good | Yes | Add E2E assurance. |
| Clarification questions and answers | Yes | Good | Yes | Keep session linkage. |
| AI diagnosis and confidence score | Yes | Good | Yes | Normalize outcome link. |
| Triage recommendation | Yes | Good | Yes | Keep safety audit. |
| Repair action and parts replaced | Partial | Medium | Partial | Make repair outcome capture standard. |
| Confirmed root cause | Partial | Medium | Partial | Normalize confirmed causes. |
| AI accuracy feedback | Partial | Medium | Partial | Add structured correctness fields. |
| Repeat issue tracking | Partial | Medium | Partial | Add repeat issue service. |
| Downtime / time-to-resolution data | Partial | Low | Partial | Capture downtime and close dates. |

Daily learning-quality score: 6.0 /10

TruckFixr is collecting enough signal to begin improving diagnostics, but not enough clean structured outcome data to compound reliably. The biggest missing field is a durable, required confirmed root cause and repair result linked to diagnosis session, vehicle, fleet, and inspection. Safest next improvement: normalize confirmed repair outcomes and AI correctness feedback before considering any broad AI retraining.

---

## 11. Revenue / Billing Readiness Check

| Billing Area | Status: Pass / Fail / Partial / Not Verified | Evidence | Risk | Recommended Fix |
|---|---|---|---|---|
| Company-level billing ownership | Partial | `canManageCompanyBilling`, fleet metadata inspected. | Medium | Add staging tests. |
| Pilot-to-paid conversion path | Partial | Pilot conversion services exist. | Medium | Verify full conversion. |
| Stripe customer/session flow | Partial | Code inspected, tests pass. | Medium | Run Stripe test mode. |
| Stripe webhook verification | Pass | HMAC verification in `stripeBilling.ts`. | Low | Keep tests. |
| Subscription status enforcement | Partial | Services exist. | Medium | Add route-level tests. |
| Vehicle-based plan readiness | Partial | Limits exist. | Medium | Test limit enforcement. |
| Trial/pilot expiry handling | Partial | Pilot services exist. | Medium | Test expiry. |
| Data preservation after conversion | Not Verified | No live conversion test. | Medium | Add staging scenario. |
| Billing UI clarity | Partial | Pricing/profile inspected lightly. | Medium | Run UX smoke test. |
| Manual admin override for pilots | Partial | Admin alerts exist; recovery limited. | Medium | Add staff recovery tools. |

Revenue readiness score: 6.2 /10

A pilot fleet likely can become paid without intentional data loss, but the path is not proven end-to-end. Billing appears tied to company/fleet metadata and owner permissions. Biggest billing blocker before paid launch: staging proof of checkout, webhook sync, subscription enforcement, and data preservation. Some billing polish can wait until after controlled pilots.

---

## 12. Customer Support / Admin Recovery Check

| Support Scenario | Status: Pass / Partial / Fail / Not Verified | Evidence | Risk | Recommended Fix |
|---|---|---|---|---|
| Signup/account recovery | Partial | Auth security and email auth paths exist. | Medium | Add support playbook/tooling. |
| Wrong company assignment | Fail | No audited staff correction flow found. | High | Add staff-only correction action. |
| Driver invite/assignment correction | Partial | Manager flows exist. | Medium | Add audited recovery path. |
| Vehicle correction/deactivation | Partial | Vehicle update exists. | Medium | Add deactivation/audit checks. |
| Failed inspection recovery | Partial | Reports/logs exist. | Medium | Add support visibility. |
| Failed diagnosis recovery | Partial | Activity/AI logs exist. | Medium | Add support view. |
| Pilot code issue recovery | Partial | Pilot services exist. | Medium | Add staff reset/reissue flow. |
| Subscription/account status recovery | Partial | Admin alerts exist. | Medium | Add override workflow. |
| User deactivation/reactivation | Not Verified | No clear flow found. | High | Add staff/owner status control. |
| Troubleshooting logs/admin visibility | Partial | Logs exist in tables. | Medium | Add support dashboard. |

Support/admin recovery score: 4.5 /10

Support cannot yet recover common pilot problems without potentially unsafe database edits. Admin recovery is partly permissioned but not complete or consistently auditable. Biggest support risk: wrong company or wrong vehicle assignment. Safest next improvement: audited staff-only recovery actions.

---

## 13. Pilot KPI Tracking Check

- Currently trackable KPIs: active fleets, vehicles, drivers, inspections, defects/issues, diagnoses, clarification questions, confidence scores, AI usage/cost, repair outcomes, repeat vehicle signals, active users by company, pilot redemptions.
- Missing KPIs: time to first vehicle, first inspection, first diagnosis, missed inspection rate by schedule, time-to-repair, downtime avoided, pilot-to-paid funnel stage, demo-excluded KPI views.
- Highest-priority KPI gap: demo-safe pilot KPI dashboard.
- Recommended fix: add a tenant-safe KPI aggregation/reporting service after RLS verification.

---

## 14. Approved Fixes Queue

### Batch A: Safe Bug Fixes
- Fix: add browser smoke checks for inspection report navigation and daily inspection submission.
- Affected files: test/browser workflow files to be chosen.
- Risk level: Low.
- Expected impact: fewer UI regressions.
- Test steps: browser inspect/report/driver flows.

### Batch B: Security & Access Fixes
- Fix: apply and verify RLS migration with cross-company denial tests.
- Affected files: `drizzle/0015_harden_rls_and_sessions.sql`, tenant tests.
- Risk level: High.
- Expected impact: real company separation.
- Test steps: seeded multi-company user-context reads/writes.

### Batch C: AI Diagnosis Workflow Fixes
- Fix: normalize diagnosis outcomes and confirmed repair feedback.
- Affected files: schema, diagnostics router, TADIS loaders.
- Risk level: Medium.
- Expected impact: stronger learning loop.
- Test steps: confirm repair, retrieve similar solved case.

### Batch D: Daily Inspection Workflow Fixes
- Fix: add assigned-driver and manager-visibility E2E tests.
- Affected files: inspection tests.
- Risk level: Low to Medium.
- Expected impact: stronger compliance confidence.
- Test steps: assigned vehicle inspection and failed DVIR path.

### Batch E: Performance & AI Cost Fixes
- Fix: split large client chunks and cache compact diagnosis context.
- Affected files: Vite config, diagnosis workflow.
- Risk level: Medium.
- Expected impact: faster load and lower AI cost.
- Test steps: build size, diagnosis clarification token checks.

### Batch F: UI/UX & Mobile Fixes
- Fix: run mobile flow QA for access, onboarding, driver, manager, diagnosis, DVIR.
- Affected files: UI tests and targeted components.
- Risk level: Low.
- Expected impact: better pilot usability.
- Test steps: mobile viewport smoke test.

### Batch G: Knowledge Base / History Fixes
- Fix: add structured root-cause, parts, labor, downtime, and AI correctness capture.
- Affected files: schema, diagnostics, inspections/repairs.
- Risk level: Medium.
- Expected impact: useful TADIS knowledge base.
- Test steps: repair outcome -> future similar case retrieval.

### Batch H: Data Integrity / Tenant Isolation Fixes
- Fix: remove runtime schema mutation from `server/db.ts`.
- Affected files: `server/db.ts`, migrations.
- Risk level: Medium to High.
- Expected impact: safer deploy/rollback.
- Test steps: clean DB migration, app startup, demo seed, full tests.

### Batch I: Billing / Backup / Maintainability Fixes
- Fix: verify Stripe staging checkout/webhook and document restore runbook.
- Affected files: billing tests/docs.
- Risk level: Medium.
- Expected impact: safer pilot-to-paid.
- Test steps: Stripe test checkout, webhook, status enforcement.

### Batch J: Support / Admin Recovery Fixes
- Fix: add staff-only audited recovery actions for company/user/vehicle/pilot-code mistakes.
- Affected files: support/admin router and UI.
- Risk level: Medium.
- Expected impact: safer pilot support.
- Test steps: staff-only permission tests and audit log verification.

### Batch K: Dependency Security Fixes
- Fix: upgrade packages for critical/high audit advisories.
- Affected files: `package.json`, `pnpm-lock.yaml`.
- Risk level: Medium.
- Expected impact: reduced runtime/build/dependency security risk.
- Test steps: `pnpm check`, `pnpm test`, `pnpm build`, `pnpm audit --audit-level high`.

---

## 15. Master Task List Updates

Updated `/reports/code-review-task-list.md`.

---

## 16. Decision Needed From Dickson

| Decision Needed | Reason | Options | Recommended Choice |
|---|---|---|---|
| Approve dependency security fixes? | Audit found 1 critical and 21 high advisories. | Approve Batch K; defer; manually accept risk. | Approve Batch K. |
| Approve RLS verification? | Real fleet use requires proven tenant isolation. | Approve Batch B; defer until dependency fixes; split into test-only. | Approve Batch B after or alongside Batch K. |
| Allow any real pilot users? | No-go checks still fail/not verified. | No real users; controlled pilot; broader onboarding. | No real users yet. |
| Prioritize support recovery? | Pilot support gaps can force unsafe database edits. | Approve Batch J now; defer until security; combine with admin tools. | Defer until Batch K/B. |

---

## 17. Prompt Revision Log

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
19. Customer support/admin recovery
20. Overall code quality and maintainability

### Recommended Prompt Changes

- Add / Edit / Remove / Reprioritize: Add.
- Proposed change: require dependency-audit deltas to be compared against the previous report.
- Why it matters: audit noise can grow quickly; daily deltas help focus on new risk.
- Expected benefit: clearer approval decisions for package upgrades.
- Risk of making the change: slightly longer command section.
- Suggested wording: "When audit is run, list new, resolved, and still-open critical/high advisories compared with the previous report when prior audit data exists."

### User-Editable Task Options

To revise the daily review prompt, reply with one of the following:
- Add task: [describe task]
- Edit task: [task number or name] -> [new wording]
- Remove task: [task number or name]
- Reprioritize task: move [task] before/after [task]
- Approve prompt change: [change name]
- Reject prompt change: [change name]

---

## 18. Recommended Next Action

- Most urgent issue to address: critical/high dependency audit findings.
- Safest fix batch to approve first: Batch K: Dependency Security Fixes, followed immediately by Batch B: Security & Access Fixes.
- Whether code changes are recommended today: Yes, but only after explicit approval.
- Whether the MVP is ready for real fleet users today: No.
- Whether controlled pilot use is allowed today: No.
- Whether broader onboarding is allowed today: No.
- Whether the knowledge base/history system is improving: Yes, but still below launch-quality learning structure.
- Whether revenue/billing readiness is improving: Partial, but staging verification is still needed.
- Whether support/admin recovery is sufficient for pilots: No.
- Whether any prompt changes are recommended: Yes, add audit delta tracking.

Recommended first action: Approve Batch K: Dependency Security Fixes. I will not modify application code unless you approve a specific batch.
