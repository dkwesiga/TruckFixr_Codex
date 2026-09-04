# Release verification workflow

Run before calling a change (or a batch of changes) release-ready. Commands are the
actual ones defined in `package.json` / CI — do not invent others. If a check this
list wants doesn't exist yet, say so as a gap rather than skip it silently.

1. `pnpm check` — TypeScript typecheck (`tsc --noEmit`).
2. `pnpm test` — Vitest unit/service tests.
3. `pnpm build` — production build (client + server) if the change touches build
   config, env handling, or anything imported at the entrypoints.
4. Database migration review — if the change touched `drizzle/schema.ts`, confirm
   `.claude/workflows/database-change.md` was followed (migration file exists, RLS
   coverage updated if fleet-scoped, `pnpm validate:demo-seed` still passes).
5. Tenant-isolation review — if the change touched a customer-data query/router,
   confirm `.claude/skills/truckfixr-tenant-security/SKILL.md` was applied. Run
   `pnpm verify:rls` when a database is available and the change is plausibly
   RLS-relevant (new table, new policy, changed FK).
6. AI-safety regression check — if the change touched triage/case-status/severity
   logic, confirm `.claude/skills/truckfixr-safety-gate/SKILL.md` was applied and no
   existing severity/escalation test was weakened.
7. Dependency/security check — CI runs `gitleaks` (secret scan, blocking) and
   `pnpm audit --audit-level=high --prod` (currently non-blocking, see
   `.github/workflows/ci.yml`). Don't add new high/critical-flagged production
   dependencies without checking the advisory.
8. Fresh-context code review — `.claude/workflows/fresh-context-review.md`.
   BLOCKER/HIGH findings resolved or explicitly accepted with a documented reason.
9. Optional environment-dependent smoke checks, when a target environment is
   available: `pnpm verify:stripe`, `pnpm verify:browser-smoke` /
   `verify:browser-routes`.

## What CI actually runs (`.github/workflows/ci.yml`)

- `quality` job: `pnpm install --frozen-lockfile` → `pnpm check` → `pnpm test`.
- `secret-scan` job: gitleaks (blocking).
- `dependency-audit` job: `pnpm audit --audit-level=high --prod` (`continue-on-error:
  true` — non-blocking today; see `docs/security/policies/14-vulnerability-management-policy.md`).
- A second workflow, `rls-isolation.yml`, exists separately for RLS verification —
  check its current trigger conditions before assuming it runs on every PR.

## Gaps (report, don't fabricate)

- No E2E test suite is wired into CI; `verify:browser-smoke`/`verify:browser-routes`
  are route-level smoke checks, not full user-journey tests. See
  `docs/architecture/system-overview.md` for the critical-journey coverage map.
- `pnpm audit` is non-blocking — a high/critical advisory will not fail CI today.
- Production deploy uses Render `autoDeploy` off `main` (`render.yaml`) — CI passing
  on `main` is the actual release gate; there is no separate manual promotion step
  documented in-repo.
