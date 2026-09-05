---
name: truckfixr-release-check
description: Use before telling the user a change is "done" or ready to merge/deploy. Runs the actual project verification commands and reports real results, not assumed ones.
---

# TruckFixr release check

Wraps `.claude/workflows/release-gate.md`. Run the commands that actually apply to
the change you made — don't run the full list reflexively if only a doc changed,
but don't skip a check because it's inconvenient either.

1. `pnpm check`
2. `pnpm test`
3. `pnpm build` (only if build config, env handling, or an entrypoint changed)
4. If `drizzle/schema.ts` changed: confirm the database-change workflow was
   followed (migration exists, RLS coverage if fleet-scoped,
   `pnpm validate:demo-seed` passes).
5. If a customer-data query/router changed: apply
   `.claude/skills/truckfixr-tenant-security/SKILL.md`; run `pnpm verify:rls` if a
   database is available and the change is plausibly RLS-relevant.
6. If triage/case-status/severity logic changed: apply
   `.claude/skills/truckfixr-safety-gate/SKILL.md`.
7. Run the fresh-context review (`.claude/workflows/fresh-context-review.md`) and
   resolve BLOCKER/HIGH findings.

Report the exact commands run and their actual pass/fail output. If a check in the
release-gate workflow doesn't exist for this project or environment (no E2E suite,
no accessible database for `verify:rls`), say so explicitly as a gap — never claim a
check ran when it didn't.
