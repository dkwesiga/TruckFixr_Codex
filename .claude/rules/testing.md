# Testing rules

- Test runner: Vitest via `pnpm test` (`scripts/run-vitest.mjs`). Typecheck:
  `pnpm check` (`tsc --noEmit`).
- Pure domain logic (case-status transitions, TADIS scoring helpers, confirmed-outcome
  ranking) belongs in `shared/` specifically so it can be unit-tested without a
  database — follow the existing `*.test.ts` files next to the modules in
  `shared/maintenance/`, `shared/tadis/`.
- Service-level tests live next to the service: `server/services/<name>.test.ts`.
  Follow that convention for new services rather than a separate `__tests__/` tree.
- `scripts/verify/*.ts` are live-environment checks, not unit tests — they need a
  real (local/staging) database or external service and are run explicitly
  (`pnpm verify:rls`, `verify:stripe`, `verify:browser-smoke`), not part of `pnpm test`.
- When you change a case-status transition, a severity/action mapping, or a
  tenant-scope helper, check for and update the existing test asserting the old
  behavior rather than deleting it — a removed test is a red flag in review.
- No E2E framework is currently wired into CI; `verify:browser-smoke`/
  `verify:browser-routes` are the closest thing (route-level smoke, not full user
  journeys). See `docs/architecture/system-overview.md` for the current
  critical-journey coverage map and gaps.
