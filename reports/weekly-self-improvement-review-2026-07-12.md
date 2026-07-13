# TruckFixr Fleet AI Weekly Self-Improvement Review

**Review date:** 2026-07-12
**Reviewer:** Claude Code
**Branch:** `main` @ `0012bd57`, plus a dirty working tree with new uncommitted changes
**Compared against:** `reports/weekly-self-improvement-review-2026-07-03.md`, `reports/code-review-task-list.md`

No application code, schema, migrations, RLS policies, storage, prompts, pricing, or copy were changed during this review — findings only, per this week's prompt.

> **Correction added 2026-07-12, same day, after founder approval and follow-up work:** Recommendation 3 below (and its mentions in §D/§L) mischaracterized `.deploy-pwa` as "unrelated scaffold content, not TruckFixr code" from a "separate, unrelated nested git repository." That was wrong. `.deploy-pwa/.git`'s `origin` remote points at this exact repo (`github.com/dkwesiga/TruckFixr_Codex.git`), checked out on `main` at the same commit `origin/main` was at (`884eb2a6`) — it's a second local clone of this project, not foreign content. The underlying technical problem is unchanged and still real: it was committed as a **gitlink with no `.gitmodules`**, so a fresh clone still gets an empty, unresolvable `.deploy-pwa` directory, and the 19MB `.deploy-pwa.bundle` is still unnecessary bloat. But the "unvetted foreign content" / "worth checking `.env.example` for real secrets" framing does not apply — it's this project's own files. Fixed in commit `fe323f4` (untrack + `.gitignore`, no history rewrite).

---

## A. Executive Summary

1. **Overall product health:** Mixed. Real progress landed since last review (pilot-KPI ownership fix, PII-logging fix, a CI gate, a major landing-page rebuild), but two new, concrete regressions are sitting uncommitted right now, and the CI gate stood up last week would fail if this working tree were pushed as-is.
2. **Most important usage signal:** Still unavailable — no live database or analytics connection was reachable from this session. Nothing below is usage-derived.
3. **Biggest technical risk:** A `tsc --noEmit` typecheck failure in `FleetReadinessLandingSections.tsx` — the component behind the **current live homepage route** (`/`) — currently sits uncommitted. Production `vite build` tolerates it silently (JSX bundlers are lenient about this), but `pnpm run check` and the new CI gate are not — this would turn CI red the moment it's pushed.
4. **Biggest product opportunity:** Finish and commit the in-progress `pnpm-workspace.yaml` migration — it looks like a deliberate fix for the exact pnpm-version drift that has been quietly breaking automated verification for weeks (`TFX-CR-0023`), but it's sitting untracked and incomplete.
5. **Biggest security/privacy concern:** An entire dangling git submodule reference (`.deploy-pwa`, no `.gitmodules`) plus a 19MB git-bundle blob (`.deploy-pwa.bundle`) were committed directly to `main` nine days ago, alongside 50MB of demo videos. This is new — it wasn't present in the 2026-07-03 review.
6. **Biggest mobile/browser/layout concern:** Still not independently verified this week. I deliberately waited over 4 minutes for the dev server to come up this time (having learned last cycle that its cold start can be slow, not hung) — it still hadn't bound to its port when I stopped waiting. Cold-start time is apparently inconsistent (roughly 100s one day, 240s+ another), which is itself worth noting separately from the "it's not actually hung" correction issued last review.
7. **Recommended focus for the week:** Fix the JSX typecheck break before it reaches CI, decide what to do about the accidental submodule/bundle/video bloat on `main`, and land the pnpm-workspace.yaml fix. The standing tenant-isolation and backup/restore proofs from the last two reviews remain the single biggest pilot-readiness blocker and still have zero new evidence.

---

## B. Evidence Reviewed

- **Git history since last review:** `718dfea0..0012bd57` (one large "Publish current TruckFixr updates" commit, 2026-07-09) plus the three commits I landed on 2026-07-03 (`07814ff1`, `d4e48ed5`, `b8cbd136`).
- **Verification commands run live this session:**
  - `pnpm run check` → **failed**: `TS1382: Unexpected token` x4 in `client/src/components/marketing/FleetReadinessLandingSections.tsx:255`.
  - `pnpm run test` → **passed**, 47 files / 339 tests (the syntax error doesn't break Vitest's esbuild transform for unrelated test files).
  - `pnpm run build:client` → **passed**, exit 0, including a bundled `FleetReadinessLanding-*.js` chunk — confirms the JSX issue is a `tsc`-only failure, not a runtime/bundle failure.
- **Code areas reviewed:** `client/src/App.tsx` (route table), `client/src/pages/FleetReadinessLanding.tsx`, `client/src/content/fleetReadinessLanding.ts`, `client/src/components/marketing/FleetReadinessLandingSections.tsx`, `vite.config.{mjs,ts}` diff, `pnpm-workspace.yaml` (new, untracked), `package.json` pnpm block, `.deploy-pwa`, `.deploy-pwa.bundle`, `demo-video/`.
- **Task list cross-check:** `reports/code-review-task-list.md` — confirmed `TFX-CR-0031/0035/0040/0042` (storage privacy, backup/restore, live RLS isolation) have had **no new evidence since 2026-07-02**, ten days ago.
- **Mobile/Android/PWA/cross-browser:** Attempted live via the preview browser tool with a much longer, more patient wait (4+ continuous minutes) than last cycle. The dev server did not come up in that window. No mobile evidence obtained this week either — see §H.
- **Database/AI diagnostics:** Not independently re-derived — no live DB reachable this session, and no diagnosis/prompt/schema files appear in this week's diff, so re-running that full review would duplicate the 2026-07-02 findings without new evidence.
- **Usage/analytics:** **Unavailable**, same as every prior review — no analytics dashboard or live DB reachable from this session.

---

## C. Top 5 Weekly Improvement Opportunities

### Recommendation 1: Complete the live staging tenant-isolation and backup/restore proofs (carried forward, still unresolved)

**Priority:** Critical
**Category:** Security / Supabase / Compliance
**Business Impact:** This has now been the top-ranked, unresolved pilot no-go item across three consecutive review cycles (2026-06-29, 2026-07-02, 2026-07-03) with zero new evidence in ten days. It is still the single biggest thing standing between TruckFixr and a defensible "ready for a real fleet" claim.
**Technical Rationale:** `scripts/verify/rls.ts` and `.github/workflows/rls-isolation.yml` are built and waiting on a classified, disposable staging database (`RLS_DATABASE_URL` secret) that has never been provisioned. Backup/restore has never had a real test run against either the Supabase Postgres side or the actual Forge object-storage provider.
**Evidence:** Unchanged from `TFX-CR-0040`/`TFX-CR-0042` in the task list; confirmed still open via this session's re-check of `reports/code-review-task-list.md`.
**Files or Areas Likely Affected:** `scripts/verify/rls.ts`, `.github/workflows/rls-isolation.yml`, `docs/security/backups-and-monitoring.md`, Supabase project settings, Forge storage config.
**Estimated Effort:** Medium (provisioning + one scratch restore, not new code).
**Risk Level:** Low to execute; High to keep deferring.
**Moat Impact:** Foundational — no data/fleet moat matters without provable tenant isolation.
**Security/Privacy Impact:** Highest-value unresolved control in the whole review.
**Mobile/Browser Impact:** None.
**Acceptance Criteria:** `rls-isolation.yml` runs successfully against a real staging DB with retained pass/fail evidence; one dated, successful restore test exists for both the DB and the actual object store.
**Founder Approval Needed:** Yes
**Approval Status:** Pending

---

### Recommendation 2: Fix the `tsc` typecheck break in the live homepage component before it reaches CI

**Priority:** High
**Category:** Bug / CI Reliability
**Business Impact:** The CI gate added last week (`ci.yml`) exists specifically to stop broken code from reaching `main`. This bug would defeat that gate on its very first real test — a broken commit to the file behind the actual homepage route would fail `pnpm check` and block the PR, which is CI working as intended, but only if someone doesn't route around it under deploy pressure.
**Technical Rationale:** `client/src/components/marketing/FleetReadinessLandingSections.tsx:255` contains literal, unescaped `->` characters inside JSX text: `Report -> Clarify -> Decide -> Closeout -> Learn`. TypeScript's JSX parser rejects a bare `>` in text position (`TS1382`); it must be `{'>'}` or `&gt;`. Confirmed this is JSX-strictness-only: `pnpm run build:client` (Vite/esbuild) completed successfully and produced a working `FleetReadinessLanding` bundle, so the page renders fine at runtime today — this is purely a typecheck/CI gap, not a live-site bug, but it's a landmine for the next commit to this file.
**Evidence:** Live `pnpm run check` output in this session: 4 instances of `TS1382` at the exact same source line/columns.
**Files or Areas Likely Affected:** `client/src/components/marketing/FleetReadinessLandingSections.tsx:255` only.
**Estimated Effort:** Small — replace `->` with `→` (a real arrow character, not a JSX operator) or wrap in `{'->'}`.
**Risk Level:** Low.
**Moat Impact:** None.
**Security/Privacy Impact:** None.
**Mobile/Browser Impact:** None directly, though it's on the homepage every visitor sees.
**Acceptance Criteria:** `pnpm run check` exits 0 with this file included; no visual change to the rendered "Report → Clarify → Decide → Closeout → Learn" strip.
**Founder Approval Needed:** Yes
**Approval Status:** Pending

---

### Recommendation 3: Remove the accidental `.deploy-pwa` submodule, `.deploy-pwa.bundle`, and decide on `demo-video/` bloat

**Priority:** High
**Category:** Repo Hygiene / DevOps / Security
**Business Impact:** A broken repo structure quietly undermines every other reliability effort this review process has been chasing (CI, clean clones, fast checkouts). It's also the kind of thing an investor's or auditor's technical diligence would flag immediately as sloppy.
**Technical Rationale:** Commit `0012bd57` (2026-07-09) added `.deploy-pwa` as a **git submodule reference (gitlink) with no corresponding `.gitmodules` file** — `git show 0012bd57:.deploy-pwa` resolves to a commit (`884eb2a6...`) that lives only in a separate, unrelated nested git repository that happened to be sitting in the working directory (it contains its own `README.md`, `DEMO_CREDENTIALS.md`, `.env.example`, `apps/`, etc. — unrelated scaffold content, not TruckFixr code). Because there's no `.gitmodules`, a fresh `git clone` of TruckFixr will show `.deploy-pwa` as an empty, unresolvable directory. The same commit also added `.deploy-pwa.bundle`, a 19MB binary git-bundle export of that same nested repo, committed directly as a blob. Separately, the same commit replaced small demo PNGs with `demo-video/` — roughly 50MB of MP4s now committed straight to `main`. None of `.deploy-pwa`, `.deploy-pwa.bundle`, or `demo-video/` appear in `.gitignore`.
**Evidence:** `git show --stat 0012bd57`, `git show 0012bd57:.deploy-pwa` (resolves as a foreign commit, confirming gitlink), `git ls-files .deploy-pwa/` (empty — confirms no tracked directory contents, consistent with a gitlink), `du -sh .deploy-pwa.bundle demo-video` (19M / 50M), `file .deploy-pwa.bundle` (confirms "Git bundle").
**Files or Areas Likely Affected:** `.deploy-pwa` (gitlink), `.deploy-pwa.bundle`, `demo-video/`, `.gitignore`.
**Estimated Effort:** Small to stop the bleeding (untrack + gitignore going forward); Medium/founder-decision if a full history rewrite (`git filter-repo`/BFG) is wanted to actually shrink the repo, since that rewrites shared history and needs a deliberate, coordinated force-push.
**Risk Level:** Low for untracking going forward; Medium/High if a history rewrite is chosen (needs coordination — nobody else should have work based on the old history when it happens).
**Moat Impact:** None.
**Security/Privacy Impact:** The nested `.deploy-pwa` content includes its own `.env.example` and `DEMO_CREDENTIALS.md` — worth a quick look to confirm nothing beyond placeholder/example values landed in history, since "example" files have a habit of getting filled in with real values during testing.
**Mobile/Browser Impact:** None directly, but a bloated repo means slower CI checkouts, which compounds the mobile/browser verification reliability problem this review keeps running into.
**Acceptance Criteria:** A fresh `git clone` no longer produces an empty/broken `.deploy-pwa` directory; going forward, `.deploy-pwa*` and large demo media are either gitignored or hosted externally (e.g. object storage / release assets) instead of committed to `main`; founder decision recorded on whether history gets rewritten to reclaim the ~70MB now baked into every clone.
**Founder Approval Needed:** Yes
**Approval Status:** Pending

---

### Recommendation 4: Finish and land the `pnpm-workspace.yaml` migration; remove the now-duplicate config from `package.json`

**Priority:** Medium
**Category:** DevEx / Verification Reliability
**Business Impact:** Multiple past reviews (`TFX-CR-0023`, 2026-06-24 through 2026-07-02) were blocked or degraded because a runtime pnpm version ignored `package.json`'s `pnpm.overrides`/`patchedDependencies` block. pnpm 9+ moved that configuration's canonical home to a top-level `pnpm-workspace.yaml` — which now exists in the working tree, untracked, with equivalent `overrides`/`patchedDependencies`/`allowBuilds` content to what's still duplicated in `package.json`.
**Technical Rationale:** Having the same configuration live in two places (one canonical per current pnpm, one deprecated) is a drift risk — a future edit to one and not the other silently reintroduces the exact version-mismatch problem that's already cost multiple review cycles their verification evidence.
**Evidence:** `git status` shows `pnpm-workspace.yaml` as untracked (`??`); content compared against `package.json`'s `pnpm` block in this session — same override set (`@trpc/server`, `drizzle-orm`, `pnpm: 10.27.0`, etc.).
**Files or Areas Likely Affected:** `pnpm-workspace.yaml` (commit it), `package.json` (remove the now-redundant `pnpm` block once confirmed equivalent).
**Estimated Effort:** Small.
**Risk Level:** Low — purely a config-location change, no dependency version changes.
**Moat Impact:** None.
**Security/Privacy Impact:** None.
**Mobile/Browser Impact:** Indirect — more reliable CI/tooling means more reliable browser/mobile verification going forward.
**Acceptance Criteria:** `pnpm-workspace.yaml` committed; `package.json`'s `pnpm` block removed or reduced to whatever (if anything) pnpm 10 still expects there; `pnpm install --frozen-lockfile` and `pnpm run check`/`pnpm run test` still pass in CI.
**Founder Approval Needed:** Yes
**Approval Status:** Pending

---

### Recommendation 5: Re-review the new homepage (`FleetReadinessLanding`) for trust signals, TADIS visibility, and conversion clarity now that it's the live route

**Priority:** Medium
**Category:** Conversion / Moat / Positioning
**Business Impact:** The homepage (`/`) silently switched from `LandingSaaS` to `FleetReadinessLanding` in the 2026-07-09 commit — a substantial, unreviewed pivot in what every visitor sees first. The 2026-06-29 and 2026-07-03 reviews' landing-page findings (trust signals, CTA strength, TADIS naming) were all evaluated against the *old* homepage and are now stale.
**Technical Rationale:** `client/src/App.tsx:221` now routes `/` to `FleetReadinessLanding`. Content in `client/src/content/fleetReadinessLanding.ts` centers on a "fleet readiness" framing (Ready/Monitor/Service Soon/Stop columns, pilot-interest fit questions) — a materially different pitch from the prior "AI maintenance intelligence" framing. TADIS is still not named anywhere in the new copy either, same gap as before.
**Evidence:** `client/src/App.tsx` route table, `git show --stat 0012bd57` (confirms the swap and the new 871-line component + 237-line content file), grep of the new content file for CTA/pilot/demo language.
**Files or Areas Likely Affected:** `client/src/pages/FleetReadinessLanding.tsx`, `client/src/components/marketing/FleetReadinessLandingSections.tsx`, `client/src/content/fleetReadinessLanding.ts`.
**Estimated Effort:** Small (review only, no rebuild) — this recommendation is "look at it and confirm it's intentional and effective," not "change it."
**Risk Level:** Low to review; unknown conversion impact if the pivot wasn't deliberate/tested.
**Moat Impact:** Same open question as last review — TADIS is still never named publicly, which may be an intentional branding choice, but it's now baked into a bigger rewrite, so worth confirming it's still deliberate rather than an oversight.
**Security/Privacy Impact:** None identified.
**Mobile/Browser Impact:** Unverified this week (see §H) — this new, much larger homepage component (871 lines, several new sections) has not been checked on a real mobile viewport at all yet.
**Acceptance Criteria:** Founder confirms the readiness-framing pivot is intentional; a follow-up review actually loads this page on a mobile viewport once the dev-server cold-start issue is resolved enough to get a screenshot.
**Founder Approval Needed:** Yes
**Approval Status:** Pending

---

## D. Security and SOC-Readiness Gate

| Risk | Severity | Location | Why It Matters | Recommended Fix | Blocks Launch/Pilot? |
|---|---|---|---|---|---|
| Dangling git submodule + 19MB bundle + 50MB video committed to `main` | High | `.deploy-pwa`, `.deploy-pwa.bundle`, `demo-video/` (commit `0012bd57`) | Broken fresh clones, repo bloat, unvetted foreign content (incl. an `.env.example`/`DEMO_CREDENTIALS.md`) now in permanent history | Untrack + gitignore now; founder decision on history rewrite | Not a hard pilot blocker, but a real hygiene/trust risk |
| Live tenant-isolation (RLS + app-layer) still unproven on real staging | Critical | `scripts/verify/rls.ts`, `.github/workflows/rls-isolation.yml` | Primary multi-tenant safety boundary asserted only by static tests, unchanged for 10 days | Provision staging DB, run the already-built workflow | Yes |
| No successful backup/restore test on any real provider | High | `docs/security/backups-and-monitoring.md` | Zero recovery evidence, unchanged for 10 days | Scratch restore + documented RPO/RTO | Yes |
| `tsc` typecheck failure in the live homepage component (uncommitted) | Low (build itself is unaffected) | `FleetReadinessLandingSections.tsx:255` | Would break the newly-added CI gate the moment it's pushed | One-line fix (Recommendation 2) | Blocks CI, not the live site |

No new Critical *data-exposure* finding this week (the submodule/bundle issue is a hygiene/integrity risk, not a confirmed secret leak — worth a quick manual look at what's inside the foreign `.env.example` before ruling that out completely).

---

## E. Supabase Database Review

Not independently re-derived this week — no live database connection was reachable, and no schema/migration/RLS files appear in this week's diff. Status is unchanged from the 2026-07-02/07-03 reviews (6/10, Repo-only/Partially Verified); re-running that full review without new evidence would duplicate prior work. The single highest-value next action remains Recommendation 1 (staging isolation proof).

---

## F. AI Diagnostic Quality Review

Not independently re-derived this week — no diagnosis/prompt/TADIS files appear in this week's diff. This ground was covered in depth on 2026-07-02 (automated fallback/safety/JSON-repair/same-fleet-guard coverage green; live same-fleet outcome retrieval and live AI cost/latency still the two open gaps under `TFX-CR-0003`/`TFX-CR-0007`). Not re-litigated here to avoid stale duplication.

---

## G. Live Usage Review

**Unavailable**, same as every prior review this cycle. No live database, analytics dashboard, or log aggregation was reachable from this session. Nothing usage-derived appears anywhere in this report.

---

## H. Mobile, Android WBA/PWA, and Cross-Browser Layout Review

**Not verified this week — blocked again, but for a more nuanced reason than last time.** Last review's "indefinite hang" claim was corrected: the dev server does eventually come up, typically after ~90-100 seconds. This week I deliberately waited **over 4 continuous minutes** (much longer than the previously-observed cold start) and the server still hadn't bound to port 3000 when I stopped. `Get-NetTCPConnection` confirmed nothing was listening; the node process was accumulating some CPU, so it wasn't frozen, just slow — but meaningfully slower than the ~100s baseline from the last review, and no new log output appeared to explain why.

This means the dev-server cold-start time is **inconsistent**, not just "slow" — sometimes ~100s, sometimes 240s+ without resolving. That inconsistency, on its own, is the real finding here: it makes "just wait longer" an unreliable strategy for getting real browser/mobile evidence, and it's now blocked three consecutive review cycles (2026-06-29 sandbox `EPERM`, 2026-07-03 corrected-but-still-blocked, 2026-07-12 patient-wait-still-blocked). No layout, touch-target, or Android Chrome/Brave findings can be honestly reported — especially for the brand-new `FleetReadinessLanding` homepage, which has never been checked on a real mobile viewport at all.

| Page / Component | Device or Browser Concern | Issue | Recommended Fix | Files Likely Affected | Risk | Acceptance Criteria |
|---|---|---|---|---|---|---|
| All routes | Local dev-parity environments | Cold-start time is inconsistent (~100s to 240s+), not a fixed, predictable delay | Investigate what varies between runs (system load? a retried network call? Vite cache invalidation?) and consider a visible "still starting..." log heartbeat so it's distinguishable from a real hang | `server/_core/index.ts`, `server/_core/vite.ts` | Medium (blocks verification, not production) | Server reliably reaches ready or a clear-failure state within a bounded, predictable window; a follow-up review can then load `/`, `/pricing`, and the new homepage on a mobile viewport |

No other rows can be populated honestly this week.

---

## I. Landing Page, Pricing, and Conversion Review

See Recommendation 5 for the substance — the homepage changed underneath this review process without a corresponding conversion review, so this section is intentionally short rather than re-asserting stale findings against a page that's no longer live. Quick facts confirmed this session: the new copy still frames the ICP as "small and mid-sized fleets" (via `pilotInterest`/fleet-size fit questions), still doesn't name TADIS, and still centers a pilot/demo CTA path. A full trust-signal/CTA-strength pass against the new copy is the actual next step, not something to shortcut here.

---

## J. Competitive Positioning and Moat Review

1. **Is TruckFixr becoming more defensible this week?** Neutral-to-slightly-negative from a hygiene standpoint (the submodule/bundle issue), offset by real progress on the CI gate and the two fixes landed last cycle.
2. **Is TADIS being strengthened?** No code changes to TADIS this week; still not named in any public-facing copy, including the new homepage.
3. **Are we collecting useful proprietary diagnostic data?** Unchanged — no new evidence this week.
4. **Are we becoming more valuable to small fleets?** The new "readiness" framing (Ready/Monitor/Service Soon/Stop) is a sharper, more operational pitch than generic "AI maintenance intelligence" — potentially a real positioning improvement, but unverified since it hasn't had a conversion review yet (Recommendation 5).
5. **Differentiation from generic AI chatbots/CMMS/telematics platforms?** Same gap as last review — TADIS isn't named publicly, so the differentiation story lives in the product, not the pitch.
6. **One product improvement that would most strengthen the moat this week:** Unchanged from last review — finishing the live same-fleet confirmed-outcome retrieval proof (`TFX-CR-0003`) remains the closest-to-done, highest-leverage moat action, and nothing this week moved it forward or backward.

---

## K. Founder Decision List

| Decision Needed | Why It Matters | Options | Recommended Choice |
|---|---|---|---|
| Was the `LandingSaaS` → `FleetReadinessLanding` homepage swap deliberate and final? | It's a major, undocumented pivot in the first thing every visitor sees | Keep it as the permanent homepage / treat as a variant to A/B test / revert | Needs founder input — no evidence either way in this session |
| Rewrite git history to remove the `.deploy-pwa`/`.deploy-pwa.bundle`/`demo-video` bloat, or just stop it from growing further? | History rewrite reclaims ~70MB but requires coordinated force-push; leaving it in place is simpler but permanent | Rewrite now (before more work builds on this history) / gitignore going forward only | Rewrite now, while it's still only 9 days old and before more commits build on top of it |
| Where to host large demo video assets instead of git | 50MB of MP4s in git bloats every clone forever | Git (status quo) / object storage + link / Git LFS | Object storage + link |
| Provisioning a classified staging DB for the RLS/backup proofs | Still blocking the #1 pilot-readiness item after 10 days with no movement | Provision now / keep deferring | Provision now |

---

## L. Parking Lot

| Idea | Category | Why Not Now | Revisit Timing |
|---|---|---|---|
| Quick manual check of the foreign `.env.example`/`DEMO_CREDENTIALS.md` inside `.deploy-pwa` for anything beyond placeholder values | Security (low-probability, worth a glance) | Bundled naturally with Recommendation 3's cleanup | Same batch as Recommendation 3 |
| Stripe checkout/webhook replay proof (`TFX-CR-0021`) | Billing | No new evidence this week; not more urgent than isolation/backup gates | After Recommendation 1 lands |
| Add a startup-progress heartbeat log to the dev server | DevEx polish | Smaller than fixing the underlying variance itself | Bundle with investigating §H's cold-start inconsistency |

---

## M. Ready-to-Approve Implementation Backlog

| # | Recommendation | Priority | Effort | Risk | Business Impact | Approve / Reject / Defer |
|---|---|---|---|---|---|---|
| 1 | Complete staging tenant-isolation + backup/restore proofs (carried forward) | Critical | Medium | Low | Top pilot-readiness blocker, unresolved 10 days | Pending |
| 2 | Fix `TS1382` JSX syntax error in `FleetReadinessLandingSections.tsx:255` | High | Small | Low | Protects the new CI gate from an immediate false start | Pending |
| 3 | Remove/untrack `.deploy-pwa` submodule + `.deploy-pwa.bundle`; decide on `demo-video/` bloat | High | Small (untrack) / Medium (history rewrite) | Low–Medium | Repo integrity, clean clones, investor/audit optics | Pending |
| 4 | Land `pnpm-workspace.yaml`, remove duplicate `package.json` pnpm config | Medium | Small | Low | Closes a recurring CI/tooling reliability gap | Pending |
| 5 | Founder review of the new `FleetReadinessLanding` homepage (trust signals, TADIS, CTA) | Medium | Small (review) | Low | Confirms a major, unreviewed pivot is intentional and effective | Pending |

Please approve, reject, or defer each recommendation. I will not make code changes until you explicitly approve the specific items to implement.
