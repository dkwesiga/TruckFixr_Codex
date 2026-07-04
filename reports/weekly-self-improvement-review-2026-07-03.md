# TruckFixr Fleet AI Weekly Self-Improvement Review

**Review date:** 2026-07-03
**Reviewer:** Claude Code
**Branch:** `main` @ `718dfea0`, plus the pre-existing dirty working tree (uncommitted)
**Compared against:** `reports/daily-code-review-2026-07-02.md`, `reports/soc2-readiness-2026-06-29.md`, `reports/code-review-task-list.md`

No application code, schema, migrations, RLS policies, storage, prompts, pricing, or copy were changed during this review. This session ran real verification commands directly (not the sandboxed Codex runtime used in the last several daily reports), which produced fresh evidence that has been "Not Verified" for weeks.

---

## A. Executive Summary

1. **Overall product health:** Improving and, for the first time in weeks, independently *proven* rather than claimed — typecheck, the full test suite, and a production client build all passed live in this session.
2. **Most important usage signal:** None available. No analytics/usage data source was reachable from this session (no live DB connection, no product analytics integration). All findings below are code- and config-based, not usage-based.
3. **Biggest technical risk:** The dev server hangs indefinitely on startup in network-restricted environments (this one included) because of a synchronous, un-timed runtime schema check against the live database on boot. This is the same failure mode that has blocked browser/mobile verification in every recent daily report — it is not just an inconvenience, it is actively preventing the team from getting the mobile/Android evidence this review process depends on.
4. **Biggest product opportunity:** Land the already-implemented, already-tested pilot-KPI ownership fix (`TFX-CR-0041`) — it's sitting uncommitted in the working tree with passing tests.
5. **Biggest security/privacy concern:** Raw VIN and license plate (and, in a test log, an email address) are written to stdout via `console.log(...)` in at least one production code path, bypassing the redacted observability module that the SOC 2 review specifically credited as a control.
6. **Biggest mobile/browser/layout concern:** Still cannot be verified with real evidence this week — the startup hang above blocked live browser testing before it could start. This is now three consecutive review cycles without real Android/mobile timing or layout proof.
7. **Recommended focus for the week:** Land `TFX-CR-0041`, fix the PII-in-logs issue, and unblock local dev/CI startup so the mobile/browser verification debt (tracked since `TFX-CR-0022`) can finally be paid down.

---

## B. Evidence Reviewed

- **Code areas reviewed:** `server/routers/subscriptions.ts`, `server/services/pilotAccess.ts`, `server/routers/{diagnostics,inspections,vehicles}.ts`, `server/db.ts` (startup path), `client/src/App.tsx`, `client/src/pages/{DriverDashboardSaaS,LandingSaaS}.tsx`, `render.yaml`, `.github/workflows/{ci,rls-isolation}.yml`, four new authz test files.
- **Verification commands run live in this session (new evidence, not repo-only):**
  - `pnpm run check` (tsc --noEmit) → **passed**.
  - `pnpm run test` → **46 files / 333 tests passed**, ~139s.
  - `pnpm run build:client` → **passed**, fresh `dist/public` bundle produced (largest asset `vendor-shared` 381.15 kB / gzip 125.65 kB — unchanged from the last measured snapshot).
  - Dev server boot (`.claude/launch.json` → `tsx watch server/_core/index.ts`) → **did not come up**; port never accepted connections after 2+ minutes; only one log line emitted (OAuth config notice).
- **Database/schema areas reviewed:** Not queried directly (no live DB reachable this session); reviewed via code (`drizzle/schema.ts`, RLS migrations) already covered exhaustively in the 2026-07-02 and prior daily reports — not re-derived here to avoid duplicating that work.
- **Usage/analytics data:** **Unavailable.** No analytics dashboard, no live DB, no log aggregation was reachable from this session. Nothing in this report is usage-derived.
- **Landing/pricing/conversion:** `client/src/pages/LandingSaaS.tsx` read directly for ICP, CTA, and trust-signal copy.
- **Mobile/Android/PWA/cross-browser:** Attempted live via the preview browser tool; blocked by the dev-server startup hang described above. No new mobile evidence this week.
- **Security/privacy:** Grepped all server routers for `console.log`/`console.warn`/`console.error` calls carrying PII-shaped fields (`vin`, `licensePlate`, `email`, `phone`).

---

## C. Top 5 Weekly Improvement Opportunities

### Recommendation 1: Land the pilot-KPI tenant-ownership fix (`TFX-CR-0041`)

**Priority:** Critical
**Category:** Security / Data Integrity
**Business Impact:** Closes a confirmed cross-fleet data-integrity hole in pilot KPI tracking before more pilot fleets onboard — corrupted conversion/milestone data would directly mislead investor and grant reporting.
**Technical Rationale:** The fix is already written and correct: `server/routers/subscriptions.ts` no longer accepts a client-supplied `fleetId`; `recordPilotMilestone` (`server/services/pilotAccess.ts:650`) now derives the fleet from `overview.fleetId` (authoritative server state) instead of trusting input. `client/src/pages/DriverDashboardSaaS.tsx` and the three call sites in `diagnostics.ts`, `inspections.ts`, `vehicles.ts` were updated to match. A metadata size/shape schema (`pilotEventMetadataSchema`, max 10 fields) was added too.
**Evidence:** Verified live in this session — `pnpm run check` clean, and the two new tests in `server/subscriptions.billing.test.ts` (`derives pilot milestone ownership server-side and ignores a supplied fleet id`, `rejects oversized pilot milestone metadata`) pass as part of the full 333-test run.
**Files or Areas Likely Affected:** `server/routers/subscriptions.ts`, `server/services/pilotAccess.ts`, `server/routers/{diagnostics,inspections,vehicles}.ts`, `client/src/pages/DriverDashboardSaaS.tsx`, `server/subscriptions.billing.test.ts`.
**Estimated Effort:** Small (already done — this is a commit/land decision, not new work).
**Risk Level:** Low (additive validation + removal of an unused client input; full suite green).
**Moat Impact:** Protects the integrity of the pilot outcome/KPI data that ultimately feeds TADIS and investor reporting — not moat-building itself, but moat-protecting.
**Security/Privacy Impact:** Prevents one fleet's users from writing analytics events attributed to another fleet.
**Mobile/Browser Impact:** None.
**Acceptance Criteria:** Change is committed on `main`; CI (`ci.yml`) runs green on the commit; no regression in the 333-test suite.
**Founder Approval Needed:** Yes
**Approval Status:** Pending

---

### Recommendation 2: Stop logging VIN, license plate, and email through raw `console.log`/`console.warn`, route through the redacted observability module

**Priority:** High
**Category:** Security / Compliance / Privacy
**Business Impact:** The SOC 2 readiness review (2026-06-29) specifically credited "privacy-first log redaction" (`server/services/observability.ts`) as a control. This finding shows that control has a gap — an auditor or a customer who asks "does anything log VINs or plates in the clear?" would get a "yes" today, which undercuts a control TruckFixr is already claiming credit for.
**Technical Rationale:** `server/routers/vehicles.ts:555` logs `{ vehicleId, fleetId, vin: vehicle.vin, licensePlate: vehicle.licensePlate, userId }` via plain `console.log('[Analytics] Vehicle added:', ...)`. This bypasses the redaction/observability pipeline entirely and lands in Render's raw stdout logs, which have no field-level redaction. Several sibling `[Analytics]` logs in `defects.ts`, `fleet.ts`, and `inspections.ts` follow the same ad hoc pattern (mostly IDs, lower risk, but worth normalizing in the same pass). Separately, `client/src/lib/analytics.ts` logs a plaintext email to the browser console on signup/login events (confirmed via `analytics.test.ts` output) — lower risk since it stays local to the user's own browser and there is no third-party telemetry SDK per prior review, but still avoidable.
**Evidence:** Live grep in this session, `server/routers/vehicles.ts:555` (confirmed exact line and payload); test output from this session's `pnpm run test` run showing the client analytics console log with a plaintext email.
**Files or Areas Likely Affected:** `server/routers/vehicles.ts`, `server/routers/{defects,fleet,inspections}.ts` (same `[Analytics] ...` pattern), `client/src/lib/analytics.ts`.
**Estimated Effort:** Small — replace the ad hoc `console.log('[Analytics] ...')` calls with the existing `server/services/observability.ts` event recorder (which already has VIN/email/phone redaction) or strip the sensitive fields before logging.
**Risk Level:** Low (log-line change only, no behavior change).
**Moat Impact:** None directly.
**Security/Privacy Impact:** Removes a confirmed PII-in-clear-logs gap; strengthens a control already claimed in the SOC 2 posture.
**Mobile/Browser Impact:** None.
**Acceptance Criteria:** No `console.log`/`console.warn`/`console.error` call in `server/**` includes a raw `vin`, `licensePlate`, `email`, or `phone` field; redacted-observability tests updated/extended to cover the vehicle-add and defect paths; full test suite stays green.
**Founder Approval Needed:** Yes
**Approval Status:** Pending

---

### Recommendation 3: Add a startup timeout/skip so the app doesn't hang forever when the database is unreachable

**Priority:** High
**Category:** Performance / DevEx / Verification Reliability
**Business Impact:** This is the root cause behind a recurring theme across the last three review cycles: "client build/browser smoke blocked," "mobile timing Not Verified," "no fresh browser evidence." Every one of those gaps traces back to the same failure — the app can't boot far enough to be tested when the DB call at startup doesn't return quickly. Fixing this doesn't just fix a dev annoyance; it unblocks the mobile/Android verification evidence that six open tasks (`TFX-CR-0006`, `0022`, `0023`, `0035`) are all waiting on.
**Technical Rationale:** In non-production mode, `server/db.ts` runs a runtime schema-repair check on boot (`shouldRunRuntimeSchemaRepair`, `server/db.ts:2373-2393`) that appears to make a live database call with no timeout. In this session, `tsx watch server/_core/index.ts` printed one log line (OAuth notice) and then never opened port 3000 — confirmed both via the preview tool (`ERR_CONNECTION_REFUSED`) and a direct `curl` (`HTTP 000` after a 5s timeout) over 2+ minutes. This is the same class of problem flagged as `TFX-CR-0004` ("remove broad runtime schema mutation from `server/db.ts`") but manifesting as an availability/DX bug, not just a maintainability one.
**Evidence:** Reproduced live in this session: `pnpm run build:client` succeeded (proves the toolchain itself works fine here, unlike prior sandboxed Codex runs), but the dev server never became reachable. This rules out "environment can't spawn processes" (last week's excuse) and points specifically at the DB-dependent startup path.
**Files or Areas Likely Affected:** `server/db.ts` (startup schema-repair path), `server/_core/index.ts` (boot sequence), possibly a new `DB_CONNECT_TIMEOUT_MS` or `SKIP_RUNTIME_SCHEMA_REPAIR` dev flag.
**Estimated Effort:** Medium — needs a deliberate decision on fallback behavior (fail fast with a clear error vs. skip the check and boot in a degraded mode) rather than a one-line timeout.
**Risk Level:** Medium if rushed (touches startup/schema logic which also carries `TFX-CR-0004`'s existing maintainability debt); Low if scoped strictly to adding a bounded timeout and a clear failure message.
**Moat Impact:** Indirect — faster, more reliable verification cycles compound into faster TADIS/diagnostic iteration.
**Security/Privacy Impact:** None expected if scoped to timeout/error-handling only.
**Mobile/Browser Impact:** This is the direct blocker for all mobile/Android/PWA verification this review is supposed to produce. Fixing it is a prerequisite, not a nice-to-have.
**Acceptance Criteria:** Dev server either boots within a bounded time (e.g., 15-30s) or fails with a clear, actionable error identifying the DB call that didn't return — no more silent multi-minute hangs; a follow-up review session can then actually load the landing page, pricing page, and dashboard in the preview browser at mobile viewport.
**Founder Approval Needed:** Yes
**Approval Status:** Pending

---

### Recommendation 4: Continue and prioritize the already-queued staging tenant-isolation proof (RLS + app-layer)

**Priority:** High
**Category:** Security / Supabase / Compliance
**Business Impact:** This is already ranked #1 in the existing rolling roadmap (`reports/code-review-task-list.md`) and remains the top real-fleet pilot no-go item. Reaffirming rather than re-deriving it this week — no new code evidence changes its status.
**Technical Rationale:** Static RLS policy tests pass; the live/staging cross-fleet denial proof (`scripts/verify/rls.ts` against a classified disposable database) has not run successfully since the environment-classification guard was added, because no classified staging target has been available to any review session, including this one (no live DB reachable here either).
**Evidence:** Carried forward from `TFX-CR-0040` and the 2026-07-02 daily report; not independently re-verified this week (no DB access in this session).
**Files or Areas Likely Affected:** `drizzle/0031_enable_post_0012_table_rls.sql`, `scripts/verify/rls.ts`, `.github/workflows/rls-isolation.yml` (already wired, needs `RLS_DATABASE_URL` secret configured to actually run).
**Estimated Effort:** Medium (mostly a provisioning/secrets decision — a disposable staging Postgres target — plus running the already-built workflow).
**Risk Level:** Low to execute; High to leave unresolved.
**Moat Impact:** Foundational — no fleet-specific data moat matters if tenant isolation isn't provably sound.
**Security/Privacy Impact:** Highest-value unresolved control this review touches.
**Mobile/Browser Impact:** None.
**Acceptance Criteria:** `rls-isolation.yml` runs successfully against a real staging DB (via `workflow_dispatch` or the Monday cron) and produces retained pass/fail evidence.
**Founder Approval Needed:** Yes
**Approval Status:** Pending

---

### Recommendation 5: Complete the backup/restore proof with measured RPO/RTO evidence

**Priority:** High
**Category:** Compliance / Reliability / SOC 2 Readiness
**Business Impact:** Same status as last week (`TFX-CR-0042`) — no restore has ever been tested, and the draft runbook still misidentifies the live object-storage provider (documents Supabase Storage; the live app actually uses the Forge storage proxy per `server/storage.ts`). This is a recovery no-go for any real-fleet commitment and a documentation-accuracy risk for anything shown to an auditor or investor.
**Technical Rationale:** `docs/security/backups-and-monitoring.md` has TODO cadence/RPO/RTO fields. No scratch restore has been performed against either the Supabase Postgres side or the actual Forge object store.
**Evidence:** Carried forward from the 2026-07-02 daily report and 2026-06-29 SOC 2 review; not independently re-verified this week (no provider console access in this session).
**Files or Areas Likely Affected:** `docs/security/backups-and-monitoring.md`, Supabase project backup settings, Forge storage lifecycle config.
**Estimated Effort:** Medium (provider-console work + one scratch restore + writing down what actually happened).
**Risk Level:** Low to execute; High to leave unresolved (currently zero recovery evidence exists).
**Moat Impact:** None directly, but a data-loss incident with no backups would be existential for a fleet-safety product.
**Security/Privacy Impact:** Establishes actual (not documented-as-if) recovery capability for driver PII, inspection photos, and diagnostic history.
**Mobile/Browser Impact:** None.
**Acceptance Criteria:** One dated, successful restore-from-backup test for the database and one for the actual object store (Forge, not Supabase Storage as currently mis-documented), with measured RPO/RTO recorded in `docs/security/backups-and-monitoring.md`.
**Founder Approval Needed:** Yes
**Approval Status:** Pending

---

## D. Security and SOC-Readiness Gate

| Risk | Severity | Location | Why It Matters | Recommended Fix | Blocks Launch/Pilot? |
|---|---|---|---|---|---|
| Raw VIN/license plate/email logged via `console.log`, bypassing redacted observability | High | `server/routers/vehicles.ts:555`; similar pattern in `defects.ts`, `fleet.ts`, `inspections.ts`; `client/src/lib/analytics.ts` | Undercuts the "privacy-first log redaction" control already claimed in the SOC 2 readiness posture | Route through `server/services/observability.ts` or strip sensitive fields before logging | Blocks SOC 2/privacy credibility, not a hard pilot blocker |
| Pilot-event `fleetId` trusted from client input | High (fix already written, uncommitted) | `server/routers/subscriptions.ts`, `server/services/pilotAccess.ts` | Cross-fleet pilot KPI data corruption | Land the already-tested fix in the working tree | Yes, until landed |
| Live tenant-isolation (RLS + app-layer) unproven on a real staging DB | High | `scripts/verify/rls.ts`, `.github/workflows/rls-isolation.yml` | Primary multi-tenant safety boundary is asserted only by static tests | Run the already-built workflow against a classified staging target | Yes |
| No successful backup/restore test on any real provider | High | `docs/security/backups-and-monitoring.md` | Zero recovery evidence for driver PII/photos/diagnostic history | Scratch restore + documented RPO/RTO | Yes |
| Dev server hangs indefinitely with no timeout when DB is unreachable | Medium (availability/DX, not a data exposure) | `server/db.ts` runtime schema-repair path | Blocks verification tooling from ever reaching mobile/browser evidence | Bounded startup timeout + clear failure | Indirectly — blocks proof for other gates |

No new Critical exposure (secret leak, cross-tenant read) was found this week. No change to the "not SOC 2 certified" status.

---

## E. Supabase Database Review

Not independently re-derived this week — no live database connection was reachable from this session, and the schema/RLS/migration structure was already reviewed exhaustively on 2026-07-02 (score 6/10, Repo-only/Partially Verified) and again in the 2026-06-29 SOC 2 review. Nothing in this session's code diff touched schema, migrations, or RLS policies. Recommendation 4 above (staging isolation proof) remains the single highest-value next Supabase action; re-running the full schema review before that proof lands would be duplicated effort.

---

## F. AI Diagnostic Quality Review

Not independently re-derived this week — no diagnosis prompt, workflow, or TADIS files were touched in the current diff, and this exact ground (clarification limits, confidence scoring, fallback/safety overrides, same-fleet outcome retrieval, enum-drift tolerance) was covered in depth by the 2026-07-02 daily report, which found automated coverage green (fallback, safety-override, JSON-repair, and same-fleet-guard tests all pass) with the same two outstanding gaps: (1) live same-fleet outcome retrieval proof on a real DB, and (2) live AI cost/latency telemetry. Both remain open and are not re-litigated here to avoid stale duplication; see `TFX-CR-0003` and `TFX-CR-0007` in the task list.

---

## G. Live Usage Review

**Unavailable.** This session had no reachable live database, no analytics dashboard, and no log aggregation service. No usage, signup, diagnostic-session, abandonment, or error-rate data can be honestly reported this week. This is a repeat of the same limitation noted in the 2026-07-02 review. If usage evidence is important for next week's review, the fastest fix is exposing a read-only, redacted usage-summary endpoint (the codebase already has `server/services/adminMetrics.ts` and a staff-only `admin.observability` summary per the task list) that this kind of review session could query without needing raw DB/provider console access.

---

## H. Mobile, Android WBA/PWA, and Cross-Browser Layout Review

**Not verified this week — blocked before it could start.** The dev server (`.claude/launch.json` → `truckfixr`, port 3000) never became reachable: the preview browser tool reported `ERR_CONNECTION_REFUSED` and a direct `curl` to `http://localhost:3000/` returned no response after a 5-second timeout, more than two minutes after the process reported "running." Only one server log line was ever emitted. See Recommendation 3 for the suspected root cause (an un-timed DB call in the runtime schema-repair startup path).

This is the third consecutive review cycle without real mobile/Android/browser evidence — prior cycles were blocked by sandbox `spawn EPERM` restrictions; this cycle proved the toolchain itself is fine (typecheck, full 333-test suite, and a production client build all completed successfully in this same session) but was blocked by the app's own startup behavior instead. No layout, touch-target, or Android Chrome/Brave findings can be honestly reported this week — testing them would mean guessing, which the review rules explicitly prohibit.

| Page / Component | Device or Browser Concern | Issue | Recommended Fix | Files Likely Affected | Risk | Acceptance Criteria |
|---|---|---|---|---|---|---|
| All routes | Local/dev-parity environments | Dev server hangs indefinitely instead of booting or failing fast | Bounded startup timeout (Recommendation 3) | `server/db.ts`, `server/_core/index.ts` | Medium (blocks verification, not production) | Server reaches a ready or clear-failure state within 30s; mobile preview can then load `/`, `/pricing`, dashboard |

No other rows can be populated honestly this week.

---

## I. Landing Page, Pricing, and Conversion Review

Read directly this week (not re-derived from prior reports, since `LandingSaaS.tsx` hasn't changed materially since the 2026-06-29 review beyond the PWA-universal-branding commit already covered there):

- **ICP clarity:** Clear — hero copy explicitly says "small and mid-sized fleets" and "Reduce downtime before small truck problems become expensive breakdowns."
- **Problem/solution clarity:** Clear — driver-reported issues, DVIR inspections, fault codes, compliance dates, and repair history are named as inputs feeding faster maintenance decisions.
- **CTA strength:** "Get Started" appears in nav and hero; a 45-second demo video section exists; a lead-capture form distinguishes `book_a_demo` / `beta_access` / `pilot_inquiry` / `general_inquiry`.
- **TADIS visibility:** **Not mentioned anywhere in landing copy.** This may be intentional (keeping the proprietary system name internal), but it means the landing page currently sells generic "AI maintenance intelligence" rather than a named, defensible system — worth a founder decision, not a code fix. See §J.
- **Trust/legal:** `/privacy` and `/terms` routes now resolve (added this week per the SOC 2 review, confirmed present in `client/src/App.tsx` and `render.yaml` rewrites/cache headers in this session's diff) — this closes the "dead links while collecting PII" gap flagged as the single biggest trust/legal liability in the 2026-06-29 review.
- **Pricing:** Not re-reviewed this week; the mobile comparison-table fix (`TFX-CR-0022`, 2026-06-14) was already verified and no changes touched `Pricing.tsx` in this session's diff.

No new conversion-flow recommendation this week beyond what's already tracked; the Privacy/Terms fix landing was the most consequential change in this area and it's already done.

---

## J. Competitive Positioning and Moat Review

1. **Is TruckFixr becoming more defensible this week?** Marginally — the pilot-KPI ownership fix protects the integrity of the data that ultimately feeds the moat, but no new diagnostic/TADIS capability shipped this week.
2. **Is TADIS being strengthened?** No code changes to TADIS this week; not regressed either.
3. **Are we collecting useful proprietary diagnostic data?** Unchanged from prior review — structured capture exists, live same-fleet retrieval proof still outstanding (`TFX-CR-0003`).
4. **Are we becoming more valuable to small fleets?** Modestly — Privacy/Terms pages and universal PWA branding reduce trust friction for any fleet operator evaluating the product.
5. **Differentiation from generic AI chatbots/CMMS/telematics platforms?** The landing page currently doesn't name TADIS, so from a visitor's perspective the differentiation reads as "better workflow," not "proprietary diagnostic system" — a missed opportunity for the investor/pilot narrative, not a defect.
6. **One product improvement that would most strengthen the moat this week:** Finish the live same-fleet confirmed-outcome retrieval proof (`TFX-CR-0003`) — it's the concrete mechanism that turns solved cases into a compounding data advantage, and it's closer to done than anything else moat-related (retrieval logic extracted, unit-tested, cross-fleet guard added; only live DB proof remains).

---

## K. Founder Decision List

| Decision Needed | Why It Matters | Options | Recommended Choice |
|---|---|---|---|
| Land `TFX-CR-0041` now vs. bundle with other pending diff changes | The fix and its tests are done and verified; sitting uncommitted is pure risk with no benefit | Commit now / bundle later | **Commit now** |
| Should TADIS be named publicly on the landing page? | Affects investor/pilot narrative vs. keeping the system proprietary/hidden | Name it publicly / keep internal-only | No strong recommendation — founder call on positioning strategy |
| Priority: fix the dev-server startup hang vs. keep chasing mobile evidence around it | The hang has now blocked mobile/browser verification for 3 straight review cycles; fixing it once unblocks every future review | Fix startup path first / keep working around it | **Fix startup path first** |
| Where to get a classified staging DB target for the RLS/backup proofs | Both `TFX-CR-0040` and `TFX-CR-0042` have been blocked for multiple weeks purely on "no disposable staging target available" | Provision one now / keep deferring | **Provision now** — this single gap is blocking two of the five recommendations above |

---

## L. Parking Lot

| Idea | Category | Why Not Now | Revisit Timing |
|---|---|---|---|
| Normalize all `[Analytics] ...` console.log calls (defects.ts, fleet.ts, inspections.ts) into a single structured event helper | Code quality | Lower-risk fields (mostly IDs) than the VIN/plate case in Recommendation 2; bundle once that pattern is fixed | Same batch as Recommendation 2 |
| Feature TADIS by name on the landing page | Positioning/Moat | Strategic branding decision, not a code/security issue — needs founder input, not urgent | When founder decides on public vs. internal-only positioning |
| Stripe checkout/webhook replay proof (`TFX-CR-0021`) | Billing | Already tracked; no new evidence this week; not more urgent than the isolation/backup gates | After Recommendations 4-5 land |
| Client analytics email logged to browser console | Privacy (low severity) | Stays local to the user's own browser, no third-party SDK forwards it; low real risk | Bundle with Recommendation 2 if convenient |

---

## M. Ready-to-Approve Implementation Backlog

| # | Recommendation | Priority | Effort | Risk | Business Impact | Approve / Reject / Defer |
|---|---|---|---|---|---|---|
| 1 | Land `TFX-CR-0041` pilot-KPI ownership fix (already written, tested, uncommitted) | Critical | Small | Low | Prevents cross-fleet KPI corruption | Pending |
| 2 | Stop logging VIN/plate/email via raw `console.log`; route through redacted observability | High | Small | Low | Closes a real gap in an already-claimed privacy control | Pending |
| 3 | Add a bounded startup timeout so the app doesn't hang forever without DB connectivity | High | Medium | Low-Medium | Unblocks mobile/browser verification that's been stalled for 3 review cycles | Pending |
| 4 | Run the already-built live tenant-isolation proof (`rls-isolation.yml`) against a real staging DB | High | Medium | Low | Top existing pilot no-go item | Pending |
| 5 | Complete one real backup/restore test with measured RPO/RTO, correcting the storage-provider documentation | High | Medium | Low | Zero recovery evidence today; recovery no-go for real fleets | Pending |

Please approve, reject, or defer each recommendation. I will not make code changes until you explicitly approve the specific items to implement.
