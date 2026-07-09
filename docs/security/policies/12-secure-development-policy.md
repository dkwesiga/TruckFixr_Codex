# Secure Development Policy (SDLC)

| | |
|---|---|
| **Status** | DRAFT — pending ratification |
| **Owner** | TODO: Engineering Lead |
| **Version** | 0.1 |
| **Effective** | TODO |
| **Last reviewed** | 2026-06-29 |
| **Review cadence** | Annual |

## 1. Purpose

Build security into how TruckFixr software is written, reviewed, and shipped.

## 2. Practices

- **Code review:** changes merge to `main` via pull request; security-relevant
  changes (auth, RLS, data handling, billing) get extra scrutiny.
- **Automated checks in CI** (`.github/workflows/ci.yml`): typecheck, tests, and
  secret scanning on every push/PR.
- **Input validation:** API inputs are validated with `zod` schemas at the tRPC
  boundary.
- **Authorization in depth:** server-side role checks (`protectedProcedure` /
  `adminProcedure` / `staffProcedure`) plus app-layer fleet scoping and database RLS.
- **Secrets:** never committed; enforced by gitignore + CI secret scan.
- **Dependencies:** pinned via lockfile; use maintained libraries; review notable
  upgrades. **Planned/target:** enable automated dependency vulnerability alerts
  (e.g. Dependabot) — see [Vulnerability Management](14-vulnerability-management-policy.md).

## 3. Testing

- Unit/integration tests run in CI (`pnpm test`).
- Tenant-isolation has a live verification script (`pnpm verify:rls`).
- **Planned/target:** application-layer fleet-scoping test suite covering the
  primary isolation boundary.

## 4. Environments

- Local development uses gitignored `.env` and non-production databases (guarded by
  `scripts/verify/db-target-guard.ts` for verification scripts).
- Production secrets are isolated in Render; production schema changes go through
  migrations (runtime repair disabled).

## 5. Review

Reviewed annually and when the toolchain or architecture changes materially.
