# Deployment Safety & CI/CD Controls

| | |
|---|---|
| **Status** | Active (some items require one-time console setup) |
| **Owner** | TODO: Engineering Lead |
| **Last reviewed** | 2026-06-30 |
| **Review cadence** | Annual + on pipeline change |

How TruckFixr keeps production changes safe (SOC 2 CC7/CC8, Availability). Pairs
with the [Change Management Policy](policies/07-change-management-policy.md) and
[Vulnerability Management Policy](policies/14-vulnerability-management-policy.md).

## 1. In-repo controls (implemented)

| Control | Where | Notes |
|---|---|---|
| Typecheck + tests on every push/PR | `.github/workflows/ci.yml` (`quality`) | `pnpm check`, `pnpm test` |
| Secret scanning | `.github/workflows/ci.yml` (`secret-scan`) | gitleaks |
| Dependency audit | `.github/workflows/ci.yml` (`dependency-audit`) | `pnpm audit --audit-level=high --prod`; non-blocking for now |
| Automated dependency update PRs | `.github/dependabot.yml` | weekly, grouped; npm + github-actions |
| Live tenant-isolation evidence | `.github/workflows/rls-isolation.yml` | weekly; needs `RLS_DATABASE_URL` secret |
| Public-endpoint rate limiting | `server/_core/rateLimit.ts` | lead intake, signup, login/signin, password reset |

## 2. One-time setup required (GitHub / Render consoles)

These cannot be set from the repo and must be enabled by an admin.

### 2.1 Branch protection on `main`  ← do this first

`render.yaml` auto-deploys `main`, so `main` must require a green CI run. After the
CI workflow has run at least once on GitHub, run the helper script (requires repo
admin + an authenticated `gh`):

```bash
# Preview first (changes nothing):
bash scripts/security/enable-branch-protection.sh --dry-run

# Apply:
bash scripts/security/enable-branch-protection.sh
```

The script auto-detects the repo, requires the two blocking CI checks
(`Typecheck, tests, secret scan` and `Secret scan (gitleaks)`), enforces the rules
on admins, and defaults to **0 required approvals** so a solo maintainer is not
deadlocked — raise it once a second reviewer exists:

```bash
bash scripts/security/enable-branch-protection.sh --approvals 1
```

`dependency-audit` is intentionally left out of the required checks until the audit
backlog is clean. See `scripts/security/enable-branch-protection.sh --help` for all
options.

### 2.2 Uptime monitoring on `/healthz`

- Add an external monitor (e.g. UptimeRobot / BetterStack free tier) hitting
  `https://truckfixr-api.onrender.com/healthz` every 1–5 min with email/SMS alerts.
- Record the monitor URL and alert recipients in the
  [Asset Inventory](registers/asset-inventory.md).
- See the [Backups & Monitoring Runbook](backups-and-monitoring.md) for the wider
  monitoring picture.

### 2.3 Durable observability sink

- Set `OBSERVABILITY_WEBHOOK_URL` (Render env var, `sync: false`) so critical
  observability events forward to a durable destination. The app already supports
  this best-effort webhook (`server/services/observability.ts`); no code change needed.

### 2.4 RLS evidence secret

- Add an `RLS_DATABASE_URL` repo secret pointing at a disposable verification
  database so `rls-isolation.yml` can run weekly (see
  [RLS evidence cadence](rls-isolation-evidence.md)).

## 3. Rate limiting reference

`server/_core/rateLimit.ts` applies fixed-window, per-IP limits to public endpoints
(in-memory, dependency-free, mirroring the per-email login cooldown):

| Endpoint | Bucket | Limit / window |
|---|---|---|
| `leads.submitDemoRequest` | `lead_submit` | 5 / 10 min |
| `emailAuth.signup` | `auth_signup` | 5 / 15 min |
| `emailAuth.login` | `auth_login` | 10 / 15 min |
| `emailAuth.signin` | `auth_signin` | 10 / 15 min |
| `emailAuth.requestPasswordReset` | `auth_reset` | 5 / 15 min |
| `emailAuth.resetPassword` | `auth_reset_confirm` | 15 / 15 min |

These are per-instance in-memory limits. If the API scales to multiple instances,
move shared limits to a central store (e.g. Redis) — tracked as future work.

## 4. Known constraint

The API runs on Render's free tier (no SLA, cold starts). Do not advertise uptime
guarantees until it moves to a paid, monitored plan.
