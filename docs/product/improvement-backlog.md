# TruckFixr Fleet AI — Improvement Backlog

Maintained weekly by the whole-product self-improvement review (`reports/weekly-self-improvement-review-*.md`). This file is the rolling source of truth for open findings; the dated review reports are the historical record of when each was raised. Do not implement anything here without explicit approval — see each item's status.

**Legend — Severity:** P0 Critical, P1 High, P2 Medium, P3 Low. **Status:** Open / Approved / In Progress / Landed / Deferred / Rejected.

---

## Open — from 2026-08-03 review

| # | Finding | Severity | Domain | First raised | Status | Notes |
|---|---|---|---|---|---|---|
| BL-01 | `passwordResetTokens` was missing in production (confirmed 2026-08-03, 15:42 UTC); `0006_password_reset.sql` applied to prod same day; password reset now fixed; both tables verified to exist | **Resolved 2026-08-03** | Database / data integrity | 2026-08-03 | ✓ Landed | See review §D.1/§J/addendum. Migration applied via controlled script. No new code commits needed — files were already tracked. |
| BL-02 | Legacy `client/src/lib/analytics.ts` sets a persistent localStorage ID and POSTs it (credentials included) from the public, pre-consent `/try-one-case` funnel — contradicts the "cookieless" claim used to justify removing the consent banner | P1 | Security / privacy | 2026-08-03 | Open — supporting action | See review §D.2. |
| BL-03 | AI safety-override list (`detectSafetyOverride`, `tadisCore.ts`) doesn't cover tire, emissions/derate, structural, or electrical categories — a low-confidence case in these categories can reach "proceed" with no forced escalation after one clarification round | P1 | AI diagnostic safety | 2026-08-03 | Open — supporting action | See review §D.3. |
| BL-04 | Automated RLS tenant-isolation workflow still never runs (`RLS_DATABASE_URL` unconfigured); one assertion (`service_role` read of `lead_submissions`) has been failing, unresolved, since the 2026-07-12 manual run | P1 | Security / tenant isolation | 2026-07-03 (carried forward) | Open — supporting action | See review §D.4. Blocked on the same "no staging/CI DB secret provisioned" gap for 3+ weeks. |
| BL-05 | No backup/restore test has ever been performed; `docs/security/backups-and-monitoring.md` still misdocuments the storage provider (says Supabase Storage; actual is Forge) | P1 | Reliability / SOC2 readiness | 2026-07-03 (carried forward) | Open | See review §D.5. |
| BL-06 | Dev server has no bounded startup timeout when the database is unreachable (`server/db.ts`) | P2 (downgraded from P1 — not blocking verification this cycle, and prod doesn't run this path) | DevEx / verification reliability | 2026-07-03 (carried forward) | Open | Not re-tested this session; worth a fresh repro before prioritizing. |
| BL-07 | New driver "Report a Problem" dialog has no draft/autosave (unlike full DVIR inspections) | P2 | Driver workflow / UX | 2026-08-03 | Open | `DriverDashboardSaaS.tsx:20,297-313,586-618`. |
| BL-08 | New driver "Report a Problem" dialog has no structured fault-code/warning-light input, only free text | P2 | Driver workflow / AI evidence quality | 2026-08-03 | Open | `DriverDashboardSaaS.tsx:1091-1268`. |
| BL-09 | Manager "Needs manager action" queue isn't sorted/grouped by urgency | P2 | Fleet-manager workflow / UX | 2026-08-03 | Open | `ManagerDashboardFixed.tsx:2196-2287`. |
| BL-10 | Zero new tests for the driver/manager dashboard + DVIR merge (PR #48), including the `runTriage` ownership-check change | P2 | Test coverage | 2026-08-03 | Open | The logic itself was verified safe on direct read (review §G) — this is a coverage gap, not a live bug. |
| BL-11 | No rate limiting on the authenticated AI diagnosis endpoint (`diagnosticsRouter.analyze`) | P2 | Security / cost-abuse | 2026-08-03 | Open | Lower urgency — requires an authenticated, presumably-compromised account to exploit. |
| BL-12 | Zero foreign-key constraints on any `defectId` column (9 tables); hardening migrations drafted but not applied/committed | P2 | Database integrity | 2026-08-03 | Open | Dry-run found 0 orphans as of last check — latent risk, not realized. |
| BL-13 | Driver dashboard can flash a false "No assigned vehicles yet" empty state before the vehicles query finishes loading | P3 | Driver workflow / UX | 2026-08-03 | Open | `DriverDashboardSaaS.tsx:215-218,316,784`. |
| BL-14 | Homepage viewport meta sets `maximum-scale=1`, disabling pinch-zoom (WCAG 1.4.4) | P3 | Accessibility | 2026-08-03 | Open | `client/index.html:6-8`. |
| BL-15 | CSP `connect-src` still whitelists the retired `truckfixr-api.onrender.com` host | P3 | Security hygiene | 2026-08-03 | Open | Cleanup only, no active risk identified. |
| BL-16 | `defects.ts:482` logs a free-text `title` field to console, which could incidentally carry PII if a driver types something sensitive | P3 | Privacy hygiene | 2026-08-03 | Open | Residual from the otherwise-resolved 2026-07-03 PII-logging finding. |
| BL-17 | Likely-dead code: `client/src/pages/DriverDashboard.tsx` and `ManagerDashboardSaaS.tsx` have no import references found anywhere | P3 | Code health | 2026-08-03 | Open | Confirm unused, then delete. |
| BL-18 | No live usage/analytics data source exists anywhere in the stack; GA4 is wired in code but has no production Measurement ID configured | P2 | Live-usage evidence | 2026-07-03 (carried forward) | Open | Blocks every future review's ability to report real usage. Recommended fix (still not built): a read-only, staff-only internal usage-summary endpoint. |

## Resolved since last review

| # | Finding | Resolved | Evidence |
|---|---|---|---|
| BL-R1 | Pilot-KPI `fleetId` trusted from client input (TFX-CR-0041) | 2026-07-03 (commit `07814ff1`) | `pilotAccess.ts:651` now derives fleet server-side |
| BL-R2 | Raw VIN/license plate/email logged via console.log, bypassing redacted observability | 2026-07-03 (commit `d4e48ed5`) | `vehicles.ts:555` logs IDs only; `analytics.ts` added redaction |
| BL-R3 | `/privacy` and `/terms` routes previously missing | Resolved by 2026-08-03 review (exact landing commit not isolated) | `App.tsx:269-270`, both substantial components (206/97 lines) |

## Deferred / parking lot

| Idea | Why not now | Revisit when |
|---|---|---|
| Feature TADIS by name on the landing page | Strategic branding decision, not a code/security issue | Founder decides on public vs. internal-only positioning (carried from 2026-07-03) |
| Normalize remaining `[Analytics] ...` console.log calls into one structured helper | Lower-risk fields (mostly IDs) than the resolved VIN/plate case | Bundle with any future logging cleanup |
| Prompt-injection hardening for free-text driver input | Moderate, not urgent risk — output is Zod-validated and safety-critical fields are already deterministic, not LLM-controlled | After BL-03 (safety-override category gap) lands |
