---
name: truckfixr-database-change
description: Use whenever a task requires modifying drizzle/schema.ts or adding a migration. Walks the change through the required backward-compatibility, tenancy, and rollback checks before generating SQL.
---

# TruckFixr database-change skill

This wraps `.claude/workflows/database-change.md` as an invocable checklist. Read that
file for the full sequence; this is the condensed version to run through inline.

1. Read the current table definition(s) in `drizzle/schema.ts` and their most recent
   migration for naming conventions already in use.
2. Grep `server/services/` and `server/routers/` for every consumer of the
   table/column you're changing.
3. Prefer additive: new nullable column + backfill, rather than rename/narrow/drop
   on a table with existing rows.
4. Generate the migration via the project's Drizzle tooling
   (`drizzle-kit generate`), don't hand-write divergent SQL.
5. If the table is fleet-scoped (has or should have `fleetId`), add/update the RLS
   policy migration following the pattern in migrations `0005`, `0012`, `0015`,
   `0016`, `0031`, and add coverage in `scripts/verify/rls.ts`.
6. Check whether `scripts/seed-demo-data.ts` needs updating for the new shape, and
   run `pnpm validate:demo-seed` if so.
7. Update any test asserting the old shape.
8. Run `pnpm check` — a schema change frequently breaks type inference at call
   sites even when logic is untouched.
9. Never run a migration against a database that isn't confirmed local/staging.
   Never perform a destructive migration without explicit, in-the-moment user
   instruction.
