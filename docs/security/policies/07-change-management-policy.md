# Change Management Policy

| | |
|---|---|
| **Status** | DRAFT — pending ratification |
| **Owner** | TODO: Engineering Lead |
| **Version** | 0.1 |
| **Effective** | TODO |
| **Last reviewed** | 2026-06-29 |
| **Review cadence** | Annual |

## 1. Purpose

Ensure changes to production are reviewed, tested, and traceable (SOC 2 CC8.1).

## 2. Code changes

- Work happens on branches and merges to `main` via pull request.
- **CI must pass before merge** (`.github/workflows/ci.yml`): typecheck (`pnpm check`),
  tests (`pnpm test`), and secret scan (gitleaks).
- Each PR should have a clear description; security-relevant changes (auth, RLS,
  data handling) get extra review.
- **Planned/target:** enable branch protection on `main` requiring the CI check and
  at least one review.

## 3. Deployment

- Render deploys `main` automatically (`autoDeploy: true`). CI is the safety gate
  before code reaches `main`.
- Rollback = redeploy a previous known-good commit from `main`.

## 4. Database changes

- Schema changes are made through **Drizzle migrations** in `drizzle/`.
- **Runtime schema repair is disabled in production** (`ALLOW_RUNTIME_SCHEMA_REPAIR=false`);
  migrations are applied deliberately before/with a deploy (`pnpm db:push`).
- Changes touching RLS policies or fleet-scoped tables require running
  `pnpm verify:rls` (see [RLS evidence](../rls-isolation-evidence.md)).

## 5. Emergency changes

A hotfix may be expedited but must still go through a PR + CI and be documented
after the fact. Any emergency use of runtime schema repair must be logged and
reverted to migration-managed state promptly.

## 6. Traceability

Git history is the change record (author, reviewer, time, diff). Releases/notable
changes are summarized in `reports/`.
