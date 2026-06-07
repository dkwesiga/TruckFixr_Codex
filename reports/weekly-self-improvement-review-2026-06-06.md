# TruckFixr Fleet AI Weekly Self-Improvement Review

Date: 2026-06-06
Reviewed branch: `main`
HEAD commit: `f623bb8`
Reviewer: Codex (review-only; no code, schema, migration, policy, prompt, pricing, or landing changes made)
Review mode: Repository inspection + reading of existing review artifacts. No live analytics, production logs, or staging writes were accessed.

> Note on stack: the prompt template references Next.js. The actual app is a **Vite + React (wouter) client** with an **Express + tRPC server**, Drizzle ORM over Postgres/Supabase, and a Manus "forge" storage proxy. Findings below reflect the real stack.

---

## A. Executive Summary

1. **Overall product health:** Strong and improving. The AI diagnostic engine is genuinely mature (multi-stage routing, safety enforcement, JSON-repair, enum-drift tolerance, cost/latency telemetry). A disciplined daily-review cadence and a 30+ item tracked task list are in place. Static/repo proofs are green.
2. **Most important usage signal:** Not directly measurable this week — live app/Supabase analytics and production logs were **not accessible** in this environment. Strongest available signal is the repo's own verification suite (typecheck, builds, owner-operator, storage-privacy, conversion, migration-source all pass; full Vitest, real browser smoke, and dependency audit remain blocked in-sandbox).
3. **Biggest technical risk:** Schema is still effectively defined by **runtime DDL in `server/db.ts` (2,540 lines, 448 DDL markers)** rather than by replay-proven migrations. This is a reliability + change-management risk.
4. **Biggest product opportunity:** Close the **TADIS confirmed-outcome learning loop** so confirmed repairs are retrieved as same-fleet similar cases — the core data moat.
5. **Biggest security/privacy concern:** **Evidence-photo tenant isolation is unproven at the storage layer.** The live upload path uses the Manus forge proxy and (offline) base64 data URLs stored in the DB; the Supabase private-bucket RLS model is repo-only and not the live backend. Isolation currently rests entirely on app-layer access checks.
6. **Biggest mobile/browser/layout concern:** The **pricing comparison table is not mobile-responsive** — a fixed 6-column grid inside an `overflow-hidden` container, with no breakpoint or horizontal scroll, on a conversion-critical page that fleet buyers will open on phones.
7. **Recommended focus for the week:** (1) Evidence-photo isolation reality check, (2) mobile pricing table fix, then progress on (3) migration replay, (4) point-of-use AI disclaimer, (5) TADIS learning-loop retrieval proof.

---

## B. Evidence Reviewed

**Code areas reviewed**
- AI diagnostics: `server/services/diagnosisWorkflow.ts` (full), routing/classification, JSON-repair, enum-coercion, safety enforcement, safe fallback; `aiOrchestrator` types; `diagnosticConfig` usage.
- Storage path: `server/storage.ts`, `server/routers/inspections.ts` (evidence upload mutation), `client/src/pages/DriverInspectionNSC.tsx` (photo capture / data-URL path).
- Conversion: `client/src/pages/Pricing.tsx` (full), checkout/pilot/quote mutations.
- Landing/legal copy: `client/src/pages/LandingSaaS.tsx` (disclaimer/FAQ), `InspectionReportDvir.tsx`.
- Access/role gating: `RoleBasedRoute.tsx`, `roleBasedAccess.ts`, owner-operator route/server checks (changed files).
- Schema/runtime: `server/db.ts` (size + DDL marker count), `drizzle/schema.ts` (49 tables).

**Supabase / database areas reviewed**
- `supabase/migrations/20260527113000_storage_privacy_policies.sql` (private buckets + fleet-scoped RLS, repo-only).
- `docs/database-source-of-truth.md` (Drizzle canonical decision; runtime-repair backstop policy).
- Drizzle table inventory and audit/timestamp patterns.

**Usage data / analytics / logs reviewed**
- **Unavailable.** No live Supabase activity, app analytics, production error logs, OCR/VIN failure logs, upgrade-click data, or pilot feedback were accessible. Per the daily reports, analytics/audit endpoints and the npm-audit endpoint are blocked in this sandbox. All "usage" statements are derived from code and prior in-repo report artifacts, not live telemetry.

**Diagnostic sessions reviewed**
- Code-path review only (no live session records). Reviewed prompt construction, routing, safety classification, fallback, and telemetry fields (`aiCallHistory`, `enumCoercions`).

**Landing/pricing/conversion areas reviewed**
- Pricing hero, plan cards, feature comparison table, fleet-quote form, FAQ, final CTA; landing disclaimer/FAQ copy.

**Mobile / Android / cross-browser areas reviewed**
- **Static/code review only.** No real-device or emulator testing was performed (no spawn-capable browser in this environment). Findings are from layout-class inspection and prior static mobile-budget proofs. Real Android Chrome/Brave/WebView testing is recommended, not claimed.

**Security/privacy areas reviewed**
- Storage backend reality vs documented model; data-URL persistence; evidence-upload access checks; `server/db.ts` runtime DDL; AI safety guardrails and disclaimer placement; `reports/security-legal-readiness-evidence.md` (all 11 control areas currently "Not yet recorded").

---

## C. Top 5 Weekly Improvement Opportunities

### Recommendation 1: Reconcile evidence-photo storage with a proven tenant-isolation model

**Priority:** High
**Category:** Security / Supabase / Compliance
**Business Impact:** Inspection/defect "proof photos" can contain license plates, VINs, faces, locations, and damage. For a Canadian pilot and any SOC/enterprise due-diligence, customer-photo isolation must be provable, not assumed. This is the single largest blocker to broader pilot expansion and investor/security questionnaires.
**Technical Rationale:** The **live** upload path stores via the Manus forge proxy (`server/storage.ts` → `storagePut`, called at `server/routers/inspections.ts:1173`) and returns a URL persisted in `photoUrls`. The offline path encodes photos as **base64 data URLs** (`DriverInspectionNSC.tsx:112` `readAsDataURL`) that land in DB rows and flow back through the API. Meanwhile the Supabase private-bucket + fleet-scoped RLS model (`supabase/migrations/20260527113000_storage_privacy_policies.sql`) is **repo-only and not the backend in use**. Net: cross-fleet isolation depends entirely on app-layer `verifyVehicleInspectionAccess` plus the (unverified) privacy/expiry of forge download URLs — there is no storage-layer tenant boundary today.
**Evidence:** `server/storage.ts:70-102`; `server/routers/inspections.ts:1163-1180`; `client/src/pages/DriverInspectionNSC.tsx:112`; migration file is repo-only (header explicitly says "until applied to a verified local/staging target"); `storagePut` is referenced only by inspections + image generation, never the Supabase buckets.
**Files or Areas Likely Affected:** `server/storage.ts`, `server/routers/inspections.ts`, `server/routers/defects.ts`, `client/src/pages/{DriverInspectionNSC,VerifiedInspection}.tsx`, `supabase/migrations/20260527113000_storage_privacy_policies.sql`, `inspectionPhotos`, `defects.photoUrls`.
**Estimated Effort:** Medium
**Risk Level:** Medium
**Moat Impact:** Indirect — trustworthy, structured photo evidence underpins TADIS confirmed-outcome data and enterprise trust.
**Security/Privacy Impact:** Directly addresses tenant isolation, data minimization (stop persisting base64 in DB), and storage least-privilege.
**Mobile/Browser Impact:** Offline/online capture differences affect field (mobile) users; fixing the data-URL path reduces DB bloat and mobile payload size.
**Acceptance Criteria:**
- Documented decision: forge proxy vs applied Supabase private Storage as the canonical evidence backend.
- If forge: prove download URLs are non-enumerable and time-limited; document access model.
- If Supabase: apply the migration to verified staging and prove Company B cannot read/list/signed-URL Company A objects.
- Stop persisting raw base64 data URLs in DB rows (replace with object references) or document why retained for pilot.
- Cross-fleet denial proven in staging across upload/read/list/delete.
**Founder Approval Needed:** Yes
**Approval Status:** Pending

---

### Recommendation 2: Make the pricing comparison table mobile-responsive

**Priority:** High
**Category:** Layout / Mobile / Conversion
**Business Impact:** Pricing is conversion-critical, and small-fleet owners/managers frequently open it on phones. A cramped or clipped table erodes trust and reduces signups/pilot starts at the exact decision moment.
**Technical Rationale:** The feature table renders a fixed `grid-cols-[1.4fr_repeat(5,minmax(0,1fr))]` (6 columns) for header and every row, wrapped in `overflow-hidden rounded-3xl` with **no responsive breakpoint and no horizontal scroll**. On a ~360px Android viewport, five plan columns compress to ~50px each, so values like "$5/month each", "Up to 20", and "Advanced" wrap awkwardly or clip. Because the wrapper is `overflow-hidden`, users cannot even scroll to reveal cut-off content.
**Evidence:** `client/src/pages/Pricing.tsx:361` (overflow-hidden wrapper), `:362` (header grid), `:372` (row grid). No `sm:`/`md:` variant or `overflow-x-auto` present.
**Files or Areas Likely Affected:** `client/src/pages/Pricing.tsx` (comparison section only).
**Estimated Effort:** Small
**Risk Level:** Low
**Moat Impact:** None directly; supports go-to-market.
**Security/Privacy Impact:** None.
**Mobile/Browser Impact:** Core fix for Android Chrome/Brave and small viewports. Two viable patterns: (a) wrap the existing grid in `overflow-x-auto` with a min-width so it scrolls horizontally; or (b) below `md`, switch to stacked per-plan cards listing the same feature rows.
**Acceptance Criteria:**
- No horizontal page scroll and no clipped/overlapping cells at 360px / 390px / 768px.
- All plan values legible on Android Chrome and Android Brave (real-device or throttled emulator check).
- Desktop Chrome/Edge layout unchanged.
- No layout-breaking console errors.
**Founder Approval Needed:** Yes
**Approval Status:** Pending

---

### Recommendation 3: Prove a fresh-DB migration replay and retire runtime schema repair from `server/db.ts`

**Priority:** High
**Category:** Supabase / Performance / Compliance (change management)
**Business Impact:** Production schema correctness, scalability, and SOC-style change management. Investor/enterprise diligence will ask "how do schema changes ship?" — "the app mutates its own schema at boot" is a hard answer to defend.
**Technical Rationale:** `server/db.ts` is **2,540 lines with 448 DDL markers** (`ALTER TABLE`/`ADD COLUMN`/`CREATE TABLE`/`CREATE INDEX`). `docs/database-source-of-truth.md` already declares Drizzle canonical and states production should run with `ALLOW_RUNTIME_SCHEMA_REPAIR=false`, but no fresh-DB replay proves the app boots from migrations alone. This is the long-standing TFX-CR-0004 / TFX-CR-0032 risk.
**Evidence:** `server/db.ts` size + marker count (measured this review); `docs/database-source-of-truth.md`; `verify:migration-source` confirms 25 Drizzle SQL files, 2 Supabase migrations, and 254+ runtime DDL markers still relied upon.
**Files or Areas Likely Affected:** `server/db.ts`, `drizzle/*.sql`, `drizzle/schema.ts`, `supabase/migrations/*`, `render.yaml`, deployment/bootstrap config.
**Estimated Effort:** Large
**Risk Level:** Medium
**Moat Impact:** Indirect (operational maturity supports the investor narrative).
**Security/Privacy Impact:** Reduces drift between intended RLS/constraints and live schema; supports backup/restore confidence.
**Mobile/Browser Impact:** None.
**Acceptance Criteria:**
- Fresh DB built from canonical migrations boots the app, runs demo seed validation, `pnpm check`, builds, and browser smoke — without runtime DDL.
- `server/db.ts` reduced to connection/bootstrap + explicitly approved emergency guardrails.
- Older exposed-schema `SECURITY DEFINER` helpers confirmed superseded/hardened during replay.
**Founder Approval Needed:** Yes
**Approval Status:** Pending

---

### Recommendation 4: Add a point-of-use AI disclaimer and escalation framing on the diagnosis result screen

**Priority:** Medium/High
**Category:** AI Diagnostics / Compliance
**Business Impact:** Liability protection and user trust at the moment a driver/manager acts on a "safe-to-drive" decision. Cheap insurance for a Canadian pilot and a concrete item to record in the security/legal readiness tracker.
**Technical Rationale:** The diagnostic engine is conservative and well-guardrailed server-side (no labor estimates; safety-critical issues forced to `stop_and_inspect`; cautious fallback). However, the **disclaimer exists only in landing/FAQ copy** (`LandingSaaS.tsx:148,804`), **not on the diagnosis result screen** (`DriverDiagnosis.tsx`) where guidance is consumed. The security/legal readiness tracker lists AI disclaimers as "Not yet recorded."
**Evidence:** `LandingSaaS.tsx:148-150,804`; no disclaimer/"qualified technician"/"informational" string found in `DriverDiagnosis.tsx` or other diagnosis result UI; `reports/security-legal-readiness-evidence.md` §8.
**Files or Areas Likely Affected:** `client/src/pages/DriverDiagnosis.tsx`, any shared diagnosis-result component, optionally `shared/` copy constants; `reports/security-legal-readiness-evidence.md` (record evidence).
**Estimated Effort:** Small
**Risk Level:** Low
**Moat Impact:** Low (trust/credibility).
**Security/Privacy Impact:** Strengthens AI-safety/liability posture; no data impact.
**Mobile/Browser Impact:** Must render without crowding the mobile result view (single concise line + link).
**Acceptance Criteria:**
- Concise, persistent disclaimer on the diagnosis result (e.g., "AI guidance only — confirm with a qualified technician; not a substitute for a licensed inspection") visible on mobile and desktop.
- Safety-critical / `stop_and_inspect` results show clear escalation language.
- Evidence recorded in the security/legal readiness tracker.
**Founder Approval Needed:** Yes
**Approval Status:** Pending

---

### Recommendation 5: Close the TADIS confirmed-outcome learning loop with same-fleet normalized retrieval proof

**Priority:** Medium/High
**Category:** Moat / AI Diagnostics / Supabase
**Business Impact:** This is the product's defensibility. A working confirmed-outcome → normalized record → same-fleet retrieval loop is what separates TADIS from a generic AI chatbot and compounds value as pilots run.
**Technical Rationale:** `confirmed_outcome_references` is already plumbed into the diagnosis prompt context (`diagnosisWorkflow.ts`), and `server/tadisLearningLoop.test.ts` exists, but TFX-CR-0003 remains open: confirmed repair outcomes, AI-correctness feedback, and confirmed-cause normalization still partly depend on loose JSON trails, and same-fleet retrieval of past solved cases is not yet proven end-to-end with real data.
**Evidence:** `server/services/diagnosisWorkflow.ts` (`confirmed_outcome_references` in context); `repairOutcomes` / `aiQualityReviews` references in `diagnostics.ts`, `tadisCore.ts`, `aiQualityReviewLog.ts`; TFX-CR-0003 status "improved; local static retrieval proof green, live same-fleet proof outstanding."
**Files or Areas Likely Affected:** `server/routers/diagnostics.ts`, `server/services/{diagnosisWorkflow,tadisCore,aiQualityReviewLog}.ts`, `drizzle/schema.ts` (`repairOutcomes`, `aiQualityReviews`).
**Estimated Effort:** Medium
**Risk Level:** Medium
**Moat Impact:** **Directly strengthens the TADIS data + workflow moat** — the highest-leverage moat item this week.
**Security/Privacy Impact:** Retrieval must be strictly fleet-scoped (no cross-fleet outcome leakage); pairs with isolation work in Rec 1/3.
**Mobile/Browser Impact:** None.
**Acceptance Criteria:**
- Confirm a repair outcome → verify normalized (non-JSON-trail) storage → verify it is retrieved as a similar solved case **within the same fleet only** on a later diagnosis.
- Manager/mechanic AI-correctness feedback persisted with reusable structure.
- Cross-fleet retrieval explicitly proven impossible.
**Founder Approval Needed:** Yes
**Approval Status:** Pending

---

## D. Security and SOC-Readiness Gate

| Risk | Severity | Location | Why It Matters | Recommended Fix | Blocks Launch/Pilot? |
|---|---|---|---|---|---|
| Evidence-photo tenant isolation not proven at storage layer; live path is forge proxy, not the documented Supabase private buckets | High | `server/storage.ts`, `server/routers/inspections.ts:1173`, migration repo-only | Customer photos may contain plates/VINs/faces; isolation rests on app checks + unverified URL privacy | Decide canonical backend; prove cross-fleet denial + URL non-enumerability/expiry in staging | Blocks broader pilot + SOC; OK for tightly-controlled internal pilot |
| Base64 photo data URLs persisted in DB (offline path) | Medium | `client/src/pages/DriverInspectionNSC.tsx:112`, `inspectionPhotos`/`defects.photoUrls` | PII-bearing blobs in DB rows, returned via API; bloat + minimization concern | Store object references, not raw data URLs; or document pilot-scoped retention | No (pilot), yes for data-minimization claims |
| Runtime schema repair is de-facto migration path | Medium/High | `server/db.ts` (448 DDL markers) | Change-management/SOC + drift risk | Fresh-DB replay; reduce db.ts to bootstrap (Rec 3) | Blocks SOC/enterprise readiness claims |
| No point-of-use AI disclaimer on diagnosis result | Medium | `client/src/pages/DriverDiagnosis.tsx` | Liability at moment of action | Add concise disclaimer + escalation (Rec 4) | No, but recommended before external pilot |
| Security/legal readiness tracker: all 11 control areas "Not yet recorded" | Medium | `reports/security-legal-readiness-evidence.md` | Diligence gaps (IAM, audit, retention, vendor risk) | Backfill evidence links as items land | No, but needed for investor/SOC narrative |

No fabricated risks included. Live RLS behavior, dependency audit, and storage behavior could not be re-proven in this environment.

---

## E. Supabase Database Review

1. **Schema issues:** Schema is rich (49 Drizzle tables: fleets, users, vehicles, defects, inspections, plans, subscriptions, lead_submissions, repairOutcomes, aiQualityReviews, etc.) but its **effective definition leaks into runtime `server/db.ts`** rather than living solely in replay-proven migrations (Rec 3).
2. **RLS/policy issues:** App-layer RLS helpers (`current_app_user_id()`, `user_has_fleet_access()`) exist and were hardened (TFX-CR-0015 resolved). **Storage** RLS, however, is written against Supabase buckets that aren't the live backend — a documentation/reality gap (Rec 1).
3. **Missing fields / audit fields:** Confirmed-outcome normalization is incomplete (loose JSON trails — TFX-CR-0003). Audit-write verification for support recovery is still pending live proof (TFX-CR-0020).
4. **Index/performance concerns:** Not measurable without live query stats (analytics unavailable). Admin metrics query bounds remain an open hardening item (TFX-CR-0024).
5. **Data quality issues:** Demo/test data exclusion from analytics/billing/learning still partially open (TFX-CR-0018); base64 photo blobs add row weight.
6. **Tables needed for future intelligence/TADIS/subscriptions/telematics:** Core tables exist. For ELD/telematics (premium, future), plan a dedicated normalized telemetry table set rather than extending diagnostics rows. Confirmed-outcome and AI-correctness tables should be first-class (not JSON) to feed TADIS.
7. **Recommended improvements:** Execute Rec 3 (migration replay) and Rec 5 (normalized outcomes); resolve storage backend decision (Rec 1); keep telematics schema additive and out-of-band until a higher tier ships.

---

## F. AI Diagnostic Quality Review

1. **Diagnostic flow quality:** Strong. Multi-stage: preprocess/fault-code reference lookup → local + AI routing classification → model-tier selection (plan-gated) → diagnosis → JSON-repair → enum-coercion → rules enforcement → safe fallback. Cost/latency/token telemetry captured per call (`aiCallHistory`).
2. **Clarifying question quality:** Capped at 3 (`MAX_CLARIFICATION_QUESTIONS`), gated by a confidence threshold, with a fallback question bank that avoids generic "more details" prompts and de-dupes repeated questions. Good design.
3. **Confidence score quality:** Numeric 0–100 with threshold-driven clarification and final-answer behavior; safe defaults on parse failure.
4. **Safety and escalation logic:** Solid. Safety/complex keyword classifiers, forced `stop_and_inspect` when a model returns `safe_to_drive` on safety-critical cases, risk/compliance escalation, and conservative fallback diagnosis. Advanced model reserved for safety/complex/fault-code per plan.
5. **Fault code handling:** Normalized, pattern-detected (SPN/FMI, MID/PID/SID/FMI, OBD DTC, ABS, transmission, aftertreatment), with reference lookup and approved-match gating.
6. **Repair history usage:** Maintenance history + last inspection are compacted into context; confirmed-outcome references are wired but not yet proven end-to-end (Rec 5).
7. **Hallucination risk:** Controlled — strict JSON contract, enum strictness, "no labor estimates," "use only supplied context," temperature 0–0.08, JSON-repair pass. Low residual risk.
8. **TADIS/data learning opportunity:** The biggest open lever (Rec 5) — normalized same-fleet confirmed-outcome retrieval.
9. **Recommended prompt/workflow improvements:** (a) Surface `enumCoercions` drift to staging telemetry/alerting (TFX-CR-0036); (b) add the point-of-use UI disclaimer (Rec 4); (c) once Rec 5 lands, feed confirmed outcomes back as ranked same-fleet exemplars.

---

## G. Live Usage Review

**Live analytics, production logs, and Supabase activity were NOT available in this review.** The following are code/artifact-derived, not telemetry:

1. **User activity:** Not measurable. No live signup/active-user counts accessible.
2. **Diagnostic sessions:** Reviewed by code path only; no session records inspected.
3. **Abandoned flows:** Not measurable from telemetry. Code review flags the mobile pricing table (Rec 2) and missing result-screen disclaimer (Rec 4) as plausible friction points.
4. **Feature usage:** Not measurable.
5. **Errors / failed events:** Sandbox blocks full Vitest, real browser smoke, and dependency audit; these are environment limits, not product errors (TFX-CR-0023).
6. **Upgrade/pricing signals:** Not measurable; checkout/pilot/quote mutations are wired in `Pricing.tsx`.
7. **Pilot/customer feedback:** None accessible this week.
8. **Product friction (code-derived):** Mobile pricing table; offline data-URL photo handling; no point-of-use disclaimer.
9. **Recommended action:** Stand up minimal product analytics + redacted error monitoring (TFX-CR-0017) so future weekly reviews can use real activation/abandonment/error signals instead of code inference.

---

## H. Mobile, Android WBA/PWA, and Cross-Browser Layout Review

> No real-device or emulator testing was performed in this environment. Items below are from layout-class inspection and prior static budget proofs. Real Android Chrome/Brave/WebView testing is **recommended, not claimed**.

1. **Overall mobile usability:** Reasonable; landing page already hardened (`overflow-x-hidden`, `min-w-0`, `minmax(0,...)`, wrapping headings) per prior proofs.
2. **Android Chrome:** Not tested this week. Pricing table is the highest-risk surface.
3. **Android Brave:** Not tested this week.
4. **Android WebView/WBA:** Not tested this week.
5. **PWA behavior:** No PWA install/manifest behavior verified this review.
6. **Layout responsiveness:** Good on landing; **pricing comparison table is non-responsive** (Rec 2).
7. **Touch usability:** Buttons use rounded-full sizing; not measured against 44px targets on device.
8. **Forms/keyboard:** Fleet-quote and auth forms not device-tested for keyboard overlap.
9. **Modal/drawer/tab behavior:** Radix dialog/select stability previously addressed (TFX-CR-0027); not re-tested on Android this week.
10. **Browser-specific JS/layout issues:** None identified statically; needs device pass.
11. **Performance/layout shift:** Static bundle budget green (home chunk 8KB gz, vendor 122KB gz). Real timing/LCP/CLS unmeasured.
12. **Recommended improvements:** Ship Rec 2; then run a real Android Chrome/Brave timing + overflow pass across landing, signup, dashboard, diagnostics, clarifying questions, results, vehicle mgmt, and pricing (TFX-CR-0022).

| Page / Component | Device or Browser Concern | Issue | Recommended Fix | Files Likely Affected | Risk | Acceptance Criteria |
|---|---|---|---|---|---|---|
| Pricing comparison table | Android Chrome/Brave, ≤390px | Fixed 6-col grid in `overflow-hidden`; no breakpoint/scroll; values clip/wrap | `overflow-x-auto` + min-width, or stacked per-plan cards under `md` | `client/src/pages/Pricing.tsx:361-382` | High | No horizontal page scroll; legible at 360/390/768px; desktop unchanged; no console errors |
| Diagnosis result | Mobile readability | No point-of-use disclaimer/escalation line | Add concise disclaimer (Rec 4) | `client/src/pages/DriverDiagnosis.tsx` | Medium | Disclaimer visible without crowding; safety results show escalation |
| Inspection photo capture | Mobile/offline | Offline path stores base64 data URLs (payload/DB weight) | Reference-based storage (Rec 1) | `DriverInspectionNSC.tsx`, `VerifiedInspection.tsx` | Medium | Photos stored as references; mobile payload reduced; isolation proven |
| Landing, signup, dashboard, diagnostics flow | Android Chrome/Brave/WebView | Not device-tested this week | Run real-device/throttled pass (TFX-CR-0022) | n/a (verification) | Medium | Routes pass on Android Chrome + Brave; no overflow/blocked CTAs |

---

## I. Landing Page, Pricing, and Conversion Review

1. **ICP clarity:** Clear — "small fleets that cannot afford avoidable downtime," CAD pricing, per-vehicle (not per-driver) model.
2. **Problem clarity:** Strong ("Downtime starts when warning signs get missed").
3. **Solution clarity:** AI diagnostics + inspections + trailer linking + fleet dashboard communicated.
4. **CTA strength:** Good — "Start Free Trial," "Start 30-Day Fleet Pilot," "View plans," fleet-quote form.
5. **Pricing clarity:** Strong copy + FAQ (CAD, taxes separate, unlimited users, trailer allowance, annual = 2 months free). Undercut on mobile by the non-responsive table (Rec 2).
6. **Upgrade flow:** Wired to Stripe checkout/pilot mutations; full webhook replay still pending (TFX-CR-0021).
7. **Trust signals:** Disclaimer + Canadian-compliance framing present in landing/FAQ; **missing at the point of diagnostic use** (Rec 4). Pilot credibility/logos not evaluated.
8. **Demo flow:** Fleet-quote path present; no live demo-booking analytics available.
9. **Investor/pilot credibility:** Helped by AI maturity and disciplined review cadence; helped further by Rec 1/3 (security + ops) and Rec 5 (moat).
10. **Recommended improvements:** Rec 2 (mobile table) is the highest-ROI conversion fix this week; consider a TADIS "learns from confirmed repairs" trust line once Rec 5 is proven.

---

## J. Competitive Positioning and Moat Review

1. **More defensible this week?** Marginally — via static proof expansion; the durable moat work (Rec 5) is still pending.
2. **TADIS strengthened?** Partially — confirmed-outcome references are plumbed and tested locally, but same-fleet normalized retrieval isn't proven end-to-end.
3. **Collecting proprietary diagnostic data?** Yes structurally (sessions, fault-code references, telemetry), but the **confirmed-outcome flywheel** is the missing compounding piece.
4. **More valuable to small fleets?** Yes incrementally; a mobile-clean pricing/diagnosis experience (Rec 2/4) raises perceived value at decision/use moments.
5. **Differentiated from generic AI chatbots / directories / CMMS / telematics?** Yes — fleet-scoped diagnostics, fault-code references, safety enforcement, and (eventually) confirmed-outcome learning are well beyond a chatbot. Differentiation deepens with Rec 5.
6. **One product improvement that most strengthens the moat this week:** **Rec 5** — close the TADIS confirmed-outcome → normalized → same-fleet retrieval loop.

---

## K. Founder Decision List

| Decision Needed | Why It Matters | Options | Recommended Choice |
|---|---|---|---|
| Canonical evidence-photo backend | Determines the entire isolation proof path (Rec 1) | (a) Keep forge proxy + prove URL privacy/expiry; (b) Move to applied Supabase private Storage; (c) Hybrid | (b) Apply Supabase private Storage for clean tenant isolation + SOC story |
| Keep base64 data URLs for offline pilot? | Data minimization vs offline simplicity | (a) Keep for pilot, document; (b) Switch to references now | (a) Keep for current pilot, schedule (b) with Rec 1 |
| Sequence this week | Limited bandwidth | (1) Rec 2 + Rec 4 (small, high ROI) first; (2) Rec 1; (3) Rec 3/5 next | Do Rec 2 + Rec 4 now; approve Rec 1 scoping; stage Rec 3/5 |
| Migration replay timing | Large effort vs other priorities | Now / after pilot expansion | Schedule immediately after Rec 1; it gates SOC claims |
| Stand up analytics + error monitoring? | Future reviews need real usage signals (TFX-CR-0017) | Yes now / defer | Yes — minimal redacted monitoring now |

---

## L. Parking Lot

| Idea | Category | Why Not Now | Revisit Timing |
|---|---|---|---|
| ELD/telematics (Samsara/Motive/Geotab) integration | Product/Moat | Premium higher-tier feature; out of MVP scope | After pilot conversion + Rec 5 |
| Admin metrics authz hardening (TFX-CR-0024) | Security | Important but internal-only surface | Next 1–2 weeks |
| Full Stripe webhook replay in staging (TFX-CR-0021) | Billing | Needs Stripe staging access | When staging billing env ready |
| AI cost/latency compaction (TFX-CR-0007) | Performance | Engine already telemetered; not yet a cost problem | When live cost data exists |
| Larger team onboarding flows (TFX-CR-0014) | UX | Deferred behind higher-priority items | After Rec 1/3/5 |
| PWA install/manifest polish | Mobile | No evidence of blocking issue | After Android device pass |

---

## M. Ready-to-Approve Implementation Backlog

| # | Recommendation | Priority | Effort | Risk | Business Impact | Approve / Reject / Defer |
|---|---|---|---|---|---|---|
| 1 | Reconcile evidence-photo storage with a proven tenant-isolation model | High | Medium | Medium | Unblocks broader pilot + SOC/enterprise diligence; protects customer photo PII | Pending |
| 2 | Make the pricing comparison table mobile-responsive | High | Small | Low | Recovers conversion on phones at the decision moment | Pending |
| 3 | Fresh-DB migration replay; retire runtime schema repair | High | Large | Medium | Reliability + SOC change-management; investor-defensible ops | Pending |
| 4 | Point-of-use AI disclaimer + escalation on diagnosis result | Medium/High | Small | Low | Liability protection + user trust at moment of action | Pending |
| 5 | Close TADIS confirmed-outcome same-fleet learning loop | Medium/High | Medium | Medium | Core data moat; compounding pilot value | Pending |

Please approve, reject, or defer each recommendation. I will not make code changes until you explicitly approve the specific items to implement.
