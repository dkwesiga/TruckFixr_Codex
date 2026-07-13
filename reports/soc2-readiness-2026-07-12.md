# TruckFixr Fleet AI — Weekly SOC 2 Readiness Review

**Review date:** 2026-07-12
**Reviewer:** Claude Code (SOC 2 readiness reviewer)
**Baseline:** previous review `reports/soc2-readiness-2026-06-29.md`

> **Caution (carry verbatim into any external document):** TruckFixr is **not** SOC 2
> compliant, SOC 2 certified, ISO 27001 certified, or HIPAA compliant. Status is
> **"SOC 2 readiness in progress — controls being aligned with SOC 2 Security,
> Availability, and Confidentiality."**
>
> **StrongDM Comply:** still no Comply-generated/adapted documents under version
> control. If used, it is a **documentation accelerator only — it does not prove
> TruckFixr is SOC 2 compliant or certified.**

---

## 1. Weekly Executive Summary

Major remediation week. Since the 2026-06-29 baseline the team authored a large,
genuinely useful control set: published **Privacy & Terms** pages (fixing the dead
links), a **CI pipeline** (typecheck + tests + gitleaks + non-blocking `pnpm audit`),
a **weekly live-RLS evidence workflow** plus a recorded **first live RLS isolation run
against the real Supabase DB**, a **16-policy security pack** + system description +
four evidence registers, **per-IP rate limiting** on all public endpoints, **Dependabot**,
a **branch-protection enablement script**, and a **DOCX export** of the whole doc set.
Test coverage grew to **339 passing tests / 47 files**, including new
application-layer fleet-scoping and cross-fleet authorization suites.

The single most important qualifier: **almost none of this is shipped yet.** The work
is committed to the local `main` only — `main` is **ahead 9 / behind 7** of
`origin/main` (diverged; origin merged PR #13). So CI has not actually run on these
changes, branch protection cannot be enabled, and the privacy pages, rate limiting,
and CI gate are **not in production**. Readiness has improved at the *design* level;
*operating effectiveness* — what an auditor credits — is still pending a push,
reconcile, and deploy, plus ratification of the (still DRAFT) policies.

No new customer-data exposure was introduced. The dominant new risk is process:
a remediation batch that exists only on an unpushed, diverged branch.

---

## 2. New Risks Introduced Since Last Review

| # | Risk | Severity |
|---|------|----------|
| N-1 | All Batch A–C remediation is committed to **local `main` only**; `main` is ahead 9 / behind 7 of `origin/main` (diverged). Controls are not live, CI hasn't run on them, and a reconcile/merge is required before shipping — with risk of losing or regressing work. | **High** (change mgmt / availability) |
| N-2 | Policies (16) and privacy documents are **DRAFT / unratified** (owners = `TODO`, no counsel sign-off). Publishing or citing them as in-force controls before ratification would overclaim. | Medium |
| N-3 | Per-IP rate limits are **in-memory per instance**; if the API scales beyond one instance the limit is diluted. Acceptable now (single free-tier instance) but must move to a shared store before scaling. | Low |

---

## 3. Regressions or Unresolved Critical Gaps

| # | Gap | Status vs baseline |
|---|-----|--------------------|
| C-1 | Change-management gate not **enforced**: CI workflow authored but unpushed; branch protection not enabled; `render.yaml` still `autoDeploy: true`. | Code ready → **not live** |
| C-2 | Availability: no verified backups (no restore test), no uptime monitoring, API still on Render **free tier** (no SLA). | Runbook written → **unimplemented** |
| C-3 | Tenant isolation: app-layer scoping is the primary boundary; `FORCE ROW LEVEL SECURITY` + least-privilege runtime role still not adopted. | Documented + tested → **residual accepted** |
| C-4 | Evidence continuity depends on external secrets not yet set (`RLS_DATABASE_URL`, `OBSERVABILITY_WEBHOOK_URL`). | Workflow ready → **needs secrets** |
| C-5 | No StrongDM Comply documents under version control. | Unchanged |

---

## 4. Top 5 Fixes For This Week

1. **Ship it** (C-1, N-1): reconcile local `main` with `origin/main`, push, confirm CI
   runs green, then enable branch protection via
   `scripts/security/enable-branch-protection.sh`.
2. **Ratify the policy pack** (N-2): assign owners + effective dates; get Privacy/Terms/
   PIPEDA reviewed by counsel; flip the DRAFT banners.
3. **Set the two CI/observability secrets** (C-4): `RLS_DATABASE_URL` (disposable DB) and
   `OBSERVABILITY_WEBHOOK_URL`.
4. **Capture backup evidence + add uptime monitoring** (C-2): record Supabase backup
   cadence/RPO/RTO, run one restore test, add an external `/healthz` monitor.
5. **Provision the referenced mailboxes** (`security@`, `privacy@truckfixr.com`) so the
   published pages and IR plan have working contacts.

---

## 5. Updated SOC 2 Readiness Score

**≈ 55 / 100** (up from 38). The jump reflects **controls authored**, not yet
**controls operating** — temper accordingly; re-score after the work ships and
policies are ratified.

| Trust area | Prev | Now | Note |
|---|---|---|---|
| Security (technical) | 60 | 68 | + rate limiting, CI code, isolation tests (not deployed) |
| Multi-tenant isolation | 55 | 72 | + first live RLS run vs real Supabase, app-layer tests |
| Change management (CC8) | 15 | 45 | CI + branch-protection script authored, **not enforced** |
| Availability | 25 | 30 | runbook only; still free tier, no monitoring |
| Confidentiality | 50 | 58 | privacy pages + classification/retention policies drafted |
| Governance/policies | 10 | 45 | full pack drafted, **unratified** |
| Privacy/PIPEDA | 15 | 45 | Privacy/Terms/PIPEDA drafted; counsel + go-live pending |

## 6. Updated Documentation Readiness Score

**≈ 60 / 100** (up from 15): 16 policies + system description + 4 registers + control
runbooks, plus DOCX exports (28 files). Held below "ready" because everything is DRAFT
and unratified, and no Comply docs are tracked.

---

## 7. Evidence Collected This Week

- **First live RLS isolation run vs the real Supabase DB** (commit `4b58014f`, TFX-CR-0040)
  — real cross-fleet denial evidence, plus the reusable `scripts/verify/rls.ts` and the
  weekly `.github/workflows/rls-isolation.yml`.
- **Application-layer isolation + authz tests** — `server/companyAccessFleetScope.test.ts`,
  `server/managerActionQueueAuthz.test.ts`, `server/routerFleetScope.test.ts`
  (inspections/defects/fleet).
- **Rate-limiting control + test** — `server/_core/rateLimit.ts`, `server/rateLimit.test.ts`.
- **Full suite green** — 339 tests / 47 files passing (local run 2026-07-12).
- **CI/CD + dependency controls authored** — `.github/workflows/ci.yml`,
  `rls-isolation.yml`, `.github/dependabot.yml`, `scripts/security/enable-branch-protection.sh`.
- **Policy pack + registers + system description** — `docs/security/**` (Markdown + DOCX).
- **Published Privacy/Terms pages** — `client/src/pages/Privacy.tsx`, `Terms.tsx` (+ routes).

## 8. Evidence Still Missing

- A green **CI run on GitHub** (nothing pushed yet) and enabled branch protection.
- **Backup config + a dated restore test**; uptime-monitor history.
- **Ratified** (owner-signed, dated) policies; counsel-reviewed privacy docs.
- Access-review record; vendor/sub-processor evidence (SOC 2 reports/DPAs).
- Retention/deletion records for driver PII and inspection photos.

---

## 9. Tests That Should Be Added or Updated

- Extend fleet-scoping tests to the remaining `input.fleetId` procedures (same
  `verifyFleetAccess`/`canViewVehicle` pattern); consider a **structural test** that
  fails if any new fleet-scoped procedure lacks an access check.
- A test asserting the rate limiter is actually wired into each public mutation
  (guards against future removal).
- Once multi-instance, a test/whatever for the shared rate-limit store.

## 10. Policy / Docs That Should Be Updated

- Ratify all 16 policies (owners, dates, sign-off); flip DRAFT banners.
- Fill register `TODO`s (vendor data scope/region/evidence; access matrix; asset owners;
  retention periods).
- Keep `docs/security/deployment-safety.md` in sync as external items land.

## 11. StrongDM Comply Templates / Documents

None in the repo to review. When adopted: bring under version control, strip enterprise
boilerplate that doesn't fit the stage, correct any "RLS enforces tenant isolation"
wording to match the app-layer-primary control, and carry the accelerator-only caution.

## 12. Customer Trust / Sales Risks

- **Improved:** privacy/terms exist, isolation is tested, an AI-decision-support
  disclaimer is present, and no false SOC 2/ISO/HIPAA claims appear.
- **Risk:** the improvements are not yet **live** — a buyer visiting production still
  sees the pre-remediation site until this ships. Do not represent controls as
  operating until deployed and ratified. Continue to make **no** uptime guarantees
  while on the free tier.

## 13. Recommended Implementation Backlog (ordered)

1. Reconcile + push `main`; confirm green CI; enable branch protection. **(unblocks everything)**
2. Ratify policies; counsel review of privacy docs.
3. Set `RLS_DATABASE_URL` + `OBSERVABILITY_WEBHOOK_URL`; provision `security@`/`privacy@`.
4. Backup evidence + restore test + `/healthz` uptime monitor.
5. Move API off free tier before any availability commitment.
6. Extend fleet-scoping/structural tests.
7. Evaluate `FORCE ROW LEVEL SECURITY` + least-privilege runtime DB role.
8. Vendor/sub-processor evidence; access review; retention records.
9. Bring any StrongDM Comply docs into version control.

---

## Per-Finding Detail (key items)

### N-1 / C-1 — Remediation committed locally but unshipped; branch diverged
- **Severity:** High · **SOC 2 impact:** Change management CC8.1, Availability · **Trust:** Medium
- **Affected:** local `main` (ahead 9 / behind 7 of `origin/main`); `.github/workflows/ci.yml`;
  `render.yaml` (`autoDeploy: true`)
- **Failure scenario:** the batch never reaches origin, or a careless reconcile drops
  commits; production keeps auto-deploying `origin/main` (which lacks these controls)
  with no CI gate.
- **Recommended fix:** fetch, reconcile the divergence (merge/rebase, resolving PR #13's
  changes), push, verify CI green, enable branch protection.
- **Effort:** S–M · **Acceptance:** `origin/main` contains the controls; a green CI run
  exists; protection enabled · **Evidence:** CI run URL + protection summary.

### N-2 — Policies drafted but unratified
- **Severity:** Medium · **SOC 2 impact:** CC1/governance · **Trust:** Medium
- **Affected:** `docs/security/policies/*.md` (owners `TODO`), `client/src/pages/Privacy.tsx`,
  `Terms.tsx`, `docs/security/policies/15-privacy-pipeda-policy.md`
- **Recommended fix:** assign owners + effective dates, counsel review of privacy docs,
  remove DRAFT banners.
- **Effort:** M · **Acceptance:** each doc has an owner, date, and sign-off · **Evidence:**
  ratified docs in git history.

### C-2 — Availability controls unimplemented
- **Severity:** High · **SOC 2 impact:** Availability A1.2/A1.3 · **Trust:** Medium–High
- **Affected:** `render.yaml` (free tier), `docs/security/backups-and-monitoring.md` (TODOs)
- **Recommended fix:** capture backup cadence/RPO/RTO, run a restore test, add uptime
  monitoring, plan paid tier.
- **Effort:** S–M · **Acceptance:** documented backups + one tested restore + active monitor
  · **Evidence:** config screenshots + restore log.

### N-3 — In-memory rate limits don't span instances
- **Severity:** Low · **SOC 2 impact:** Availability/Confidentiality · **Trust:** Low
- **Affected:** `server/_core/rateLimit.ts`
- **Recommended fix:** move to a shared store (e.g. Redis) before running multiple instances.
- **Effort:** M (future) · **Acceptance:** limits hold across instances · **Evidence:** test.
