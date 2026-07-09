# TruckFixr Fleet AI — Weekly SOC 2 Readiness Review

**Review date:** 2026-06-29
**Reviewer:** Claude Code (SOC 2 readiness reviewer)
**Scope baseline:** last code-level review (`reports/daily-code-review-2026-06-12.md`) and the redacted-observability batch (`5678529e`).

> **Caution (carry verbatim into any external document):** TruckFixr is **not** SOC 2 compliant, SOC 2 certified, ISO 27001 certified, or HIPAA compliant. Current status is **"SOC 2 readiness in progress — controls being aligned with SOC 2 Security, Availability, and Confidentiality."**
>
> **StrongDM Comply note:** No StrongDM Comply-generated or Comply-adapted documents were found anywhere in this repository. If Comply documents exist, they live outside version control and could not be verified against actual controls. **StrongDM Comply, if used, is only a documentation accelerator. It does not prove TruckFixr is SOC 2 compliant or certified.**

---

## 1. Weekly Executive Summary

This week's merged work (`#10`–`#12`: landing rebuild, Resources area, gated Maintenance Planning preview, universal PWA, Android install prompt) was marketing/UX-facing and introduced little new attack surface — a low-risk week for the security posture. The earlier in-window data-safety work (RLS on post-0012 tables `9b2e1f02`, redacted observability `5678529e`, first-party cookie scoping `a33f01c0`) is genuinely strong for an early-stage SaaS.

The picture is lopsided: technical controls are ahead of governance and documentation. The repo has real multi-tenant isolation tests, privacy-first log redaction, clean staff/customer RBAC separation, and disciplined secret hygiene. But there is **no CI/CD gate** (every push auto-deploys to production with zero required checks), **no published privacy policy** (the landing footer links to dead `/privacy` and `/terms` routes while the product collects driver PII, VINs, and inspection photos), **no documented backups/DR**, and **no policy set or Comply documents under version control**.

Net: solid engineering foundations, but the items an auditor asks for first — change management, a privacy policy, evidence continuity — are largely absent. No critical regressions were introduced this week; the critical gaps are pre-existing and unresolved.

---

## 2. New Risks Introduced Since Last Review

| # | Risk | Severity |
|---|------|----------|
| N-1 | Universal PWA + install prompt broadens the install footprint; more importantly the landing footer exposes `/privacy` and `/terms` links that 404 while lead-capture + driver data collection expanded. | High (legal/trust) |
| N-2 | Maintenance Planning preview shipped behind `VITE_ENABLE_MAINTENANCE_PLANNING`; uses client-side sample data but gating is build-time env only — no server authorization. Acceptable for a preview; must not graduate to real fleet data without server-side RBAC. | Low (now) |
| N-3 | Resources/landing growth increased public unauthenticated routes with no rate limiting on the lead intake mutation. | Low–Medium |

No new cross-tenant, auth, or secrets risks were introduced by this week's diffs.

---

## 3. Regressions or Unresolved Critical Gaps

| # | Gap | Status |
|---|-----|--------|
| C-1 | **No CI/CD gate.** `.github/` did not exist. Tests, the live RLS isolation script, typecheck, and secret-scanning were all manual. `render.yaml` sets `autoDeploy: true` on both services. | Being remediated this week (CI workflow added) |
| C-2 | **No published privacy policy / PIPEDA notice.** Product collects driver emails, phones, VINs, license plates, inspection photos, and lead PII. Footer `/privacy` and `/terms` links were dead. | Being remediated this week (pages added) |
| C-3 | **No documented backups, recovery, or monitoring.** API runs on Render free plan (spins down, no SLA); `healthCheckPath: /healthz` exists but no uptime alerting or DB backup/restore evidence. | Being remediated this week (runbook added; config still to capture) |
| C-4 | **Tenant isolation depends on application-level fleet scoping, not RLS.** The app connects via `DATABASE_URL` as a DDL-capable role, which bypasses RLS. RLS is defense-in-depth for the Supabase data API only. No automated test asserts every customer-data query is fleet-scoped. | Being documented this week (control statement added); app-layer test still pending |
| C-5 | **No policy set and no version-controlled Comply documents.** | Unresolved |

---

## 4. Top 5 Fixes For This Week

1. Publish a privacy policy + fix the dead `/privacy` (and `/terms`) links (C-2, N-1).
2. Add a minimal CI gate (C-1) — GitHub Actions running typecheck + tests + secret scan.
3. Add the live RLS isolation script to a documented cadence with retained evidence (C-4 evidence).
4. Document backups + monitoring (C-3) — Supabase backup config (RPO/RTO) + uptime monitoring on `/healthz`.
5. Write a one-page tenant-isolation control statement (C-4) so future docs never overclaim "RLS enforces isolation."

**Status:** all five scaffolded/implemented this week — see §7 and the new `docs/security/` directory, `.github/workflows/`, and `client/src/pages/Privacy.tsx` / `Terms.tsx`.

---

## 5. Updated SOC 2 Readiness Score

**≈ 38 / 100** ("readiness in progress" — technical controls notably ahead of governance). Re-score after this week's docs/CI land and evidence is captured.

| Trust area | Score | Note |
|---|---|---|
| Security (technical) | 60% | RBAC separation, redacted logs, secret hygiene, gated prod schema repair |
| Multi-tenant isolation | 55% | Real live cross-fleet test; app-layer scoping unproven by automated coverage |
| Change management (CC8) | 15% → improving | CI gate added this week |
| Availability | 25% | Free plan, no DR/backup evidence captured yet, no alerting |
| Confidentiality | 50% | Good log/photo redaction; no data classification or retention policy |
| Governance/policies | 10% → improving | First security docs added this week |
| Privacy/PIPEDA | 15% → improving | Privacy/Terms pages added; policy still needs counsel review |

## 6. Updated Documentation Readiness Score

**≈ 15 / 100** at review time; expected to rise once this week's `docs/security/` set and Privacy/Terms pages are reviewed and ratified. No Comply documents are under version control.

---

## 7. Evidence Collected This Week

- Live multi-tenant isolation test — `scripts/verify/rls.ts` proves cross-fleet denial under the `authenticated` role across vehicles, subscriptions, `earlyWarningFlags`, review queues, admin notes, and lead privacy.
- Privacy-first log redaction — `server/services/observability.ts` (emails, VINs, phones, JWTs, secret keys, base64 data URLs) with unit coverage.
- RBAC separation of duties — `server/_core/trpc.ts` (`staffProcedure` vs `adminProcedure`); cross-tenant admin endpoints in `server/routers/admin.ts` all use `staffProcedure`.
- Secret hygiene — `.env` gitignored and never committed (verified against full history); `render.yaml` uses `sync: false` / `generateValue: true`.
- Production schema-repair gating — `server/db.ts` disables runtime DDL in production unless explicitly overridden.
- AI decision-support disclaimer — `client/src/pages/LandingSaaS.tsx` states the product does not replace certified inspections/qualified mechanics.

## 8. Evidence Still Missing

- CI run logs / required-check history (CI added this week; history accrues going forward).
- Dated, retained output of the RLS isolation test.
- Database backup configuration + a successful restore test.
- Uptime/availability monitoring history and incident log.
- Access-review evidence (Render/Supabase/Stripe admins; offboarding).
- Vendor/sub-processor inventory (Supabase, Render, Stripe, OpenRouter/OpenAI/Anthropic/Groq, Resend).
- Data retention & deletion records for driver PII and inspection photos.
- Counsel-reviewed, ratified Privacy Policy and Terms.

---

## 9. Tests That Should Be Added or Updated

- Application-layer fleet-scoping test (highest value): assert representative customer-data tRPC procedures withhold rows for a non-member user — covers the actual isolation boundary, which `rlsPolicies.test.ts` (static string-matching) and the manual RLS script do not.
- CI wiring for `pnpm check` + `pnpm test` + `scripts/verify/rls.ts` against a disposable DB.
- Lead intake abuse test — honeypot + (new) rate limit.
- Negative authz tests for `adminProcedure` endpoints confirming a manager from fleet A cannot pass fleet B's `fleetId`.

## 10. Policy / Docs That Should Be Updated

- Create: Privacy Policy (PIPEDA), Terms, Information Security Policy, Access Control Policy, Incident Response Plan, Backup & DR runbook, Vendor/Sub-processor list, Data Retention & Classification.
- Create: one-page Tenant Isolation Control Statement (app-layer scoping primary; RLS defense-in-depth). *(added this week)*
- Update: `README.md` to point to `SECURITY.md` and the control statement. *(SECURITY.md added this week)*

## 11. StrongDM Comply Templates / Documents To Update, Remove, or Adapt

None exist in the repository to review. Required actions:
- If Comply documents exist externally, bring them under version control (or a tracked evidence store) so they can be reviewed against real controls.
- When generated, adapt away enterprise boilerplate that does not fit an early-stage shop: do not claim a formal SOC 2 program, dedicated security team, SIEM, 24/7 SOC, change-advisory board, or pen-test cadence you do not have.
- Every Comply artifact must carry the caution line: *"StrongDM Comply is a documentation accelerator only; it does not prove TruckFixr is SOC 2 compliant or certified."*
- Any Comply control describing "row-level security enforces tenant isolation" must be corrected to match C-4 (app-layer scoping primary).

## 12. Customer Trust / Sales Risks

- Dead `/privacy` and `/terms` links + no privacy policy while collecting driver PII — the single biggest trust/legal liability (addressed this week).
- No CI/automated testing story — addressed this week.
- Free-tier API hosting — undermines availability claims; do not promise uptime SLAs.
- Positive: the landing page makes no false SOC 2 / ISO / HIPAA / "bank-grade encryption" claims and includes an honest AI decision-support disclaimer. Keep it that way — vet all future trust/marketing copy before publish.

## 13. Recommended Implementation Backlog (lean, ordered)

1. Privacy Policy + Terms pages and routes (fix dead links). **(done this week — pending counsel review)**
2. GitHub Actions CI: typecheck + tests + secret scan, required before deploy. **(done this week)**
3. RLS isolation script on a documented cadence with retained evidence. **(done this week — workflow + runbook)**
4. Backups/DR runbook + uptime monitoring on `/healthz`. **(runbook done; config capture pending)**
5. Tenant-isolation control statement + `SECURITY.md`. **(done this week)**
6. Application-layer fleet-scoping test suite.
7. Rate-limit public lead/auth endpoints.
8. Vendor/sub-processor inventory + access review.
9. Move API off free plan before any availability commitment.
10. Lean policy pack (IS, Access, IR, Retention) — Comply-accelerated, then de-enterprised.
