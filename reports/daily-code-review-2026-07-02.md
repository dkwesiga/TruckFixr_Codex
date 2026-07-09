# TruckFixr Fleet AI Daily Code + Supabase Database Review Report

Date: 2026-07-02
Time: 21:17 America/Toronto
Timezone: America/Toronto
Reviewed Branch: `main` at `718dfea0e78cafb5bc39d38a230eed4159609a6d`, including the pre-existing dirty working tree
Compared Against: `reports/daily-code-review-2026-06-12.md`, `reports/code-review-task-list.md`, and `6b5e132..HEAD`
Reviewer: Codex
Supabase Review Mode: **Repo-only**

No application code, database schema, migration, RLS policy, Storage bucket, Edge Function, secret, or production data was changed. Only this report and the master task list were updated.

---

## 0. Commands Run & Verification Evidence

| Command/check | Result | Key evidence / limitation |
|---|---|---|
| Git branch/status/log/diff | Pass | `main`; 96 committed files changed since the prior reviewed head; existing user WIP preserved |
| Prior report and task list | Pass | Prior daily report: 2026-06-12; task list baseline: 2026-06-24 |
| Static `rg`/file inspection | Pass | Auth, routes, schema, migrations, RLS, Storage, AI, inspections, billing, indexes, backups, deployment |
| Normal `pnpm run ...` scripts | Environment failure | Runtime pnpm 11.7.0 ignored pnpm 10 settings, tried reinstalling, then aborted a non-interactive module purge |
| Direct pinned TypeScript | Pass | `tsc --noEmit`, exit 0 |
| Direct pinned Vitest | Pass | 47 files / 339 tests |
| Direct pinned server build | Pass | `dist/index.js` about 1.1 MB |
| Direct Vite client build | Blocked | `spawn EPERM`; current client bundle snapshot is stale |
| `node scripts/verify/rls.ts` | Safely blocked | Refused unclassified remote Supabase target; no live query/write claimed |
| Stripe lite verifier | Partial | Exit 0, `ok:false`; test key/webhook secret unavailable |
| Browser smoke | Skipped | Browser spawn `EPERM` |
| Demo validator | Skipped | Spawn restricted |
| `pnpm audit --audit-level=high` | Blocked | npm advisory endpoint `ECONNREFUSED`; no audit delta claimed |
| Tracked-secret scan | Pass (static) | `.env` not tracked; no tracked database/service-role credential match reported |

### Files / Areas Inspected

| Area | Finding |
|---|---|
| `drizzle/schema.ts`, migrations 0004-0031 | Post-0012 RLS fix exists; Drizzle appears canonical but dual migration locations remain |
| `supabase/migrations/*` | Storage SQL is repo-only; no Supabase config, generated types, or Edge Functions |
| Supabase auth/cookie code | User metadata is display-only; cookie parent-domain fix is in `main` |
| Company/vehicle access plus new tests | Representative negative cross-fleet tests pass; coverage is not exhaustive |
| Subscriptions/pilot access | Client-supplied pilot-event `fleetId` is not validated |
| Storage/photo code | Live flow uses Forge proxy, not Supabase Storage; actual read/backup privacy remains unproved |
| Inspections/defects/diagnostics | Sampled routes enforce server-side access; automated suite passes |
| AI/TADIS/outcomes | Safety, fallback, structured outcome, and same-fleet guard tests pass |
| Observability/support/admin | Redacted observability exists; durable sink and staging recovery proof absent |
| Backup/CI/security docs | Runbook has TODO RPO/RTO/restore items and misidentifies the current object store |
| Vite/assets/Render | Lazy routes; stale assets: 68 files / 1,896,920 bytes; largest JS 381,154 bytes; free-plan cold starts remain |

Supabase's current [Data API grant change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically) is not an immediate runtime blocker because this app uses direct server-side Postgres. Future Data API clients must handle grants and RLS separately.

---

## 1. Executive Summary

Health is improving: typecheck, server build, and all 339 tests pass. Main now includes the post-0012 RLS remediation, better tenant tests, AI outcome retrieval, observability, early warnings, and PWA work.

One new **High** defect is confirmed: `subscriptions.trackPilotEvent` trusts an optional client `fleetId`, allowing an active pilot user to attribute a KPI milestone to another fleet. It is not a read/exposure path, but it can corrupt tenant-owned pilot analytics.

Supabase safety is **6/10, Repo-only / Partially Verified**. Static RLS improved, but the table-owner runtime connection bypasses RLS, so application query scoping is the primary boundary. Live RLS, schema alignment, storage privacy, backups, and restores were not verified.

Loading and perceived performance are **6/10, Partially Verified**. Lazy routing helps, but no fresh client build or timing exists and Render free-plan cold starts remain.

Top risks: pilot-event ownership; incomplete primary-boundary test matrix; actual Forge photo privacy; untested recovery; unverified login/browser/client/Stripe/live-RLS behavior.

Top actions: fix TFX-CR-0041; run Batch K staging isolation/storage proof; complete Batch I+K restore proof; run pinned CI/browser/audit; verify first-party API-domain login.

MVP decision: **Not ready yet.** Controlled real-fleet pilot: **No today**, because authentication, tenant isolation, storage privacy, and recovery no-go checks are unverified.

---

## 2. Daily Scorecard

| Review Area | /10 | Change | Note |
|---|---:|---|---|
| Stability | 8 | +2 | 339 tests/typecheck/server build pass |
| Security/access | 6 | +1 | Better tests; one High ownership flaw |
| Multi-company isolation | 6 | +1 | Representative, not exhaustive |
| AI diagnosis | 8 | +1 | Broad automated coverage |
| AI safety/triage | 8 | +1 | Conservative fallback tests |
| Inspections | 7 | +1 | Automated, not live/mobile |
| Data integrity | 6 | 0 | KPI ownership flaw |
| Knowledge/history | 7 | +1 | Outcome retrieval improved |
| Performance/AI cost | 6 | 0 | No live timing/cost |
| App loading | 6 | 0 | Stale bundle |
| Perceived speed | 6 | 0 | Browser not run |
| UI/mobile | 7 | +1 | PWA/resources/mobile work |
| Onboarding | 6 | 0 | Login proof missing |
| MVP readiness | 5 | 0 | No-go checks open |
| Pilot KPI tracking | 5 | -1 | Cross-fleet event attribution |
| Compliance | 5 | +1 | Docs/CI added, controls incomplete |
| Observability | 7 | +2 | Durable sink absent |
| Demo separation | 6 | 0 | Fresh validation skipped |
| Billing | 6 | 0 | Stripe replay absent |
| Backup/recovery | 3 | 0 | No restore test |
| Support recovery | 6 | +1 | Staging proof absent |
| Maintainability | 6 | +1 | `server/db.ts` remains large |
| Supabase/RLS/storage | 6 | +1 | Repo improved; live proof absent |

Summary: MVP **5/10**; Pilot **5/10**; Security **6/10**; AI **8/10**; Knowledge **7/10**; Revenue **6/10**; Support **6/10**; Loading **6/10**; Perceived Performance **6/10**; Supabase **6/10 Repo-only**.

---

## 3. What Changed Since Previous Report

Resolved/improved:

- Direct full test suite now passes 47 files / 339 tests.
- `drizzle/0031_enable_post_0012_table_rls.sql` is committed and static policy tests pass.
- Cookie parent-domain logic is in `main`.
- Representative application-layer cross-fleet denial tests were added.
- TADIS outcome retrieval, observability, PWA, and mobile UX improved.

Still unresolved:

- Actual photo-provider privacy/read/delete/backup proof.
- Live RLS/schema and generated-type/source-of-truth alignment.
- First-party deployed login/browser proof.
- Restore/RPO/RTO evidence.
- Stripe replay and real performance evidence.

New today:

- **High TFX-CR-0041:** unvalidated pilot-event fleet ownership.
- **High TFX-CR-0042:** backup/restore untested; provider inventory inaccurate.
- TFX-CR-0023 updated for the pnpm launcher mismatch.

---

## 4. Critical / High-Risk Findings Only

### TFX-CR-0041 - Pilot KPI write accepts unverified fleet ownership

- Severity/category: **High**, security/data integrity/tenant ownership.
- Affected: `server/routers/subscriptions.ts:401`, `server/services/pilotAccess.ts:651`, `pilotAccessEvents`.
- Confidence/status: High; verified static path.
- Evidence: route forwards `input.fleetId ?? state.activeFleetId`; service writes it without membership or redemption-fleet validation.
- Impact: an active pilot user can pollute another fleet's conversion/KPI data.
- Fix/test: derive fleet from authoritative state or validate active membership; bound metadata; prove fleet-A cannot write fleet-B while same-fleet idempotency passes.
- Batch: **B + H**; explicit approval required.

### TFX-CR-0031/0035 - Actual photo storage privacy is unproved

- Severity: **High**; confidence High; partially verified.
- Evidence: Supabase policy tests pass, but live uploads use Forge URLs and provider-level read/delete/backup behavior was not tested.
- Impact: inspection evidence privacy and recovery cannot be certified.
- Fix: harden the actual provider or migrate deliberately; prove cross-fleet denial, signed/authorized reads, expiry, cleanup, and backups.
- Batch: **B + K**; approval required.

### TFX-CR-0042 - Backup/recovery is untested

- Severity: **High**; confidence High.
- Evidence: backup cadence, retention, RPO, RTO, and restore test are TODO; file provider is documented inconsistently.
- Impact: recovery commitments cannot be made.
- Fix: confirm live settings and actual provider, run scratch restore, record measured evidence.
- Batch: **I + K**; approval required.

### Live tenant-isolation proof remains incomplete

- Severity: **High**; partially verified.
- Evidence: table-owner runtime bypass is documented; representative app tests pass; live RLS verifier safely refused the unclassified remote.
- Fix: expand route-level negative authorization coverage, run classified staging RLS proof, then consider separate DDL and least-privilege runtime roles.
- Batch: **B + K**; approval required.

No confirmed Critical cross-company read or exposed service-role key was found.

---

## 5. Blocked / Not Verified Checks

| Check | Status/reason | Risk | Task |
|---|---|---|---|
| Live Supabase RLS/schema | Guard blocked unknown remote | High | 0040/0032/0033 |
| Actual storage isolation | No safe provider test target | High | 0031/0035 |
| Client build/browser/mobile | Spawn `EPERM` | High | 0022/0023/0039 |
| Dependency audit | Registry blocked | High tracking | 0037 |
| Stripe replay | Test credentials unavailable | Medium/High | 0021 |
| Demo exclusion | Validator skipped | Medium | 0018 |
| Backup/restore | No settings/scratch restore | High | 0042 |
| Exact API/AI/DB timing | No live telemetry run | Medium | 0007/0022 |

---

## 6. Grouped Daily Review Findings

### A. Stability, Performance, Loading Speed, Observability

Full automated suite/typecheck/server build are green. Client/browser timing is blocked; stale assets total 1.90 MB. Render cold starts and non-durable observability remain risks. Run pinned CI, fresh client build, route timing, and a durable redacted sink.

### B. Security, Access Control, Tenant Isolation

Sampled core routes use server-side access checks; representative cross-fleet denial tests pass. TFX-CR-0041 is a confirmed write-integrity gap. No tracked secret exposure was found. Fix it, expand the route matrix, and run staging RLS proof.

### C. AI Diagnosis, AI Safety, Knowledge Base/History

Fallback, safety overrides, clarification limits, JSON repair, outcome retrieval, and same-fleet guards pass tests. The app can reuse solved cases, but live retrieval and demo exclusion remain unproved. Safest next step: staging same-fleet outcome retrieval. AI speed is not verified.

### D. Inspections, Compliance, Fleet Readiness

Inspection/defect tests pass, but mobile submission, photo privacy, and manager browser behavior are unverified. Core workflows exist, yet login/storage/performance gates remain. Decision: **Not ready yet**.

### E. UX, Onboarding, Mobile, Perceived Speed

PWA/offline, mobile pricing, resources, and lazy routes improved. Highest friction remains deployed login and first fleet setup. Cold API start and AI calls may feel slow; current field timings do not exist.

### F. Billing, Pilot Data, Backup, Maintainability

Billing owner checks and automated tests exist, but Stripe end-to-end proof does not. Pilot KPI fleet ownership is unsafe. Demo exclusion is not fresh. Runtime schema mutation, dual migration sources, and untested recovery remain.

### G. Support/Admin Recovery

Staff-only recovery procedures and audits exist in code/tests. Live audit writes, reversibility, actual provider recovery, and durable logs are unproved. A staging recovery drill is the safest next step.

---

## 7. Supabase Database Review

Mode: **Repo-only**. Reviewed schema, SQL, RLS, auth mapping, query code, storage, demo guards, env names, CI, and recovery docs. No live database query was used.

| Area | Status | Finding |
|---|---|---|
| Schema/design | Yes | Core ownership broadly present; some integrity is app-enforced |
| Migrations | Yes | Dual Drizzle/Supabase locations |
| RLS | Static only | 0031 improves coverage |
| Tenant isolation | Partial | App layer primary; live proof absent |
| Auth mapping | Static only | UUID mapping exists |
| Storage | Partial | Actual Forge path differs from Supabase SQL |
| Generated types | Absent | Drizzle types used |
| Query/indexes | Partial | Core indexes present; no EXPLAIN/timing |
| Demo safety | Partial | Remote guards; exclusion unproved |
| Backup/rollback | Partial/Fail | Draft only |
| Auditability | Partial | Structures exist; durable sink absent |
| FK/cascades/constraints | Partial | Not comprehensively live-verified |
| Privacy/secrets | Partial/Static pass | No tracked secret; photo provider unproved |
| Cost | Partial | No live DB/storage metrics |
| Edge Functions | Not Available | None present |

High findings: storage/provider mismatch (0031/0035), backup absence (0042), and incomplete live/application isolation proof (0040). Medium: absent generated Supabase types, dual migration source, and unmeasured index/RLS performance.

Supabase Database Score: **6/10, Repo-only / Partially Verified**.

Pilot risk: **acceptable for internal development only; not verified for real fleets.**

---

## 8. Fleet Pilot No-Go Criteria

| No-Go area | Status | Required action |
|---|---|---|
| Authentication | Not Verified | First-party deployed browser test |
| Tenant isolation | Not Verified | Complete app matrix + staging RLS |
| Role permissions | Partial | Expand/stage |
| Inspection submit/manager view | Partial | Browser/staging proof |
| AI safety/fallback | Pass automated | Live probe/timing |
| Key protection | Pass static | CI gitleaks |
| Demo separation | Not Verified | Capable validation |
| Record ownership | Fail | Fix 0041 |
| Client/build/core performance | Not Verified | CI build/timing |
| Billing | Partial | Stripe staging |
| Observability | Partial | Durable sink |
| RLS/company ownership/auth mapping | Partial | Classified staging |
| Storage privacy | Not Verified | Actual-provider proof |
| Service role server-only | Pass static | CI scan |
| Seed/reset protection | Pass static | CI validation |
| Backup/recovery | Fail | Batch I+K |

Final pilot decision: **Not ready yet**.

---

## 9. Controlled Pilot Decision

| Level | Status | Condition |
|---|---|---|
| Any real fleet users | No | Resolve ownership/auth/tenant/storage/recovery |
| Controlled real-fleet pilot | No today | Reassess after staged no-go proof |
| Broader onboarding | No | High risks remain |

Final: **Not ready for real fleet users today.**

## 10. Pilot Operating Restrictions

Not applicable because the app is not ready for real fleet users. Internal/demo use should remain synthetic and non-production.

---

## 11. Data Learning Quality Check

| Data area | Status / reuse gap |
|---|---|
| Vehicle, symptoms, fault codes, inspections | Yes, structured |
| Clarifications, diagnosis, confidence, triage | Yes, structured |
| Repair/parts/root cause/AI accuracy | Partial; consistent closure needed |
| Repeat issues | Yes; live tuning absent |
| Downtime/time-to-resolution | Partial |
| Demo exclusion | Not Verified |

Score: **7/10**. TruckFixr captures enough structure to improve diagnostics and generally links fleet/vehicle/inspection/diagnosis records. Biggest gap: confirmed repair/root-cause closure with AI accuracy and downtime. Safest next step: prove same-fleet outcome retrieval and demo exclusion on staging.

---

## 12. Revenue / Billing Readiness Check

| Area | Status |
|---|---|
| Company ownership / checkout / portal | Partial; owner checks exist |
| Pilot-to-paid / data preservation | Partial; automated evidence |
| Stripe session/webhook | Not Verified end-to-end |
| Status/vehicle limits/expiry | Partial |
| UI/admin override | Partial |
| Billing/KPI DB ownership | Fail/Partial: TFX-CR-0041 |

Score: **6/10**. The model exists, but Stripe replay and pilot-event ownership block paid readiness.

---

## 13. Customer Support / Admin Recovery Check

Signup, wrong-company, assignment, vehicle, pilot, subscription, and user-status recovery are **Partial**: staff-only services exist, but staging audit/reversal proof is missing. Logs and slow-load support are Partial because observability is non-durable. Supabase correction safety is Not Verified.

Score: **6/10**. Common actions can avoid routine raw SQL, but live proof is insufficient.

---

## 14. Pilot KPI Tracking Check

Trackable: fleets, vehicles, drivers, inspections, missed inspections, defects, diagnoses, confidence, outcomes, early warnings, activity, and milestones.

Missing/unverified: trustworthy completion timings, demo exclusion, storage failure metrics, live AI cost/latency, and protected milestone fleet ownership. Highest priority: **TFX-CR-0041**.

---

## 15. Performance Threshold Check

| Workflow/target | Status |
|---|---|
| Initial/mobile load <4s/<7s | Not Verified |
| Login/dashboard <4s | Not Verified |
| Vehicle/inspection <3s | Not Verified |
| Failed inspection/history <4s | Not Verified |
| AI simple <20s / clarification <35s | Not Verified |
| AI fallback <10s | Not Verified |
| API <800ms / heavy <2s | Not Verified |
| Supabase queries <1.5s | Not Verified |
| Loading/progress states | Partial static evidence |

Loading Score: **6/10**. Perceived Performance: **6/10**. Biggest risk is cold start plus unmeasured mobile/client behavior. Performance remains a pilot gate because it is not verified.

---

## 16. Approved Fixes Queue

| Order | Batch | Reason |
|---:|---|---|
| 1 | B+H: TFX-CR-0041 | Confirmed tenant-write integrity flaw |
| 2 | B+K: staging tenant/RLS/storage proof | Privacy/isolation gate |
| 3 | I+K: backup/restore proof | Recovery no-go |
| 4 | B: first-party auth deployment proof | Login gate |
| 5 | I/E: pinned CI/client/audit/browser timing | Release confidence |
| 6 | I: Stripe staging replay | Paid conversion |
| 7 | G: live solved-case retrieval | Learning quality |

No fixes were implemented. Batches 1-4 should precede real users.

---

## 17. Master Task List Updates

Updated `reports/code-review-task-list.md`:

- Added TFX-CR-0041 and TFX-CR-0042.
- Updated TFX-CR-0023, 0031, 0039, and 0040.
- No duplicate IDs created.

## 18. Supabase Finding Severity Guidance

Applied as written. No confirmed Critical exposure/secret leak. High was used for unverified isolation/storage, missing recovery, and tenant-owned KPI write integrity.

---

## 19. Decision Needed From Dickson

| Decision | Options | Recommendation |
|---|---|---|
| TFX-CR-0041 Batch B+H | Approve/defer | **Approve first** |
| Staging Batch B+K | Approve/defer | Approve second |
| Recovery Batch I+K | Approve/defer | Approve before users |
| Real-fleet pilot | Hold/accept risk | **Hold** |
| Photo provider | Harden Forge/migrate Supabase | Harden current MVP path, reassess migration |

---

## 20. Prompt Revision Log

Current 23 review areas remain unchanged. Recommended prompt changes: **None**.

To revise the daily review prompt, reply with:
- Add task: [describe task]
- Edit task: [task] -> [wording]
- Remove task: [task]
- Reprioritize task: move [task] before/after [task]
- Approve prompt change: [name]
- Reject prompt change: [name]

---

## 21. Recommended Next Action

Most urgent: **TFX-CR-0041 pilot-event tenant ownership**.

Safest first batch: **Approve Batch B+H to derive pilot milestone fleet ownership from authoritative server state and add cross-fleet denial tests.**

Order: 0041 -> live RLS/storage proof -> backup/restore -> login proof -> CI/browser/audit/performance -> Stripe replay.

- MVP / controlled real-fleet pilot / broader onboarding: **No**.
- Loading, perceived performance, tenant isolation, Supabase safety, storage privacy, demo separation, and cost: **Not sufficiently verified**.
- Migrations: understandable in repo; live alignment/rollback unverified.
- Generated types: absent; Drizzle used; source-of-truth decision open.
- Indexes: plausible for pilot scale, not performance-verified.
- Backup/recovery: insufficient.
- Batch K: recommended and blocks isolation/storage/recovery evidence.
- Knowledge base: improving.
- Revenue/support: partial, not pilot-ready.
- Dependency delta: unknown because audit endpoint was unavailable.
- Prompt change: none.

**Approval required:** I will not modify application code, Supabase schema, migrations, RLS policies, storage buckets, Edge Functions, secrets, or production data unless Dickson explicitly approves a specific named batch. Which batch would you like to approve?
