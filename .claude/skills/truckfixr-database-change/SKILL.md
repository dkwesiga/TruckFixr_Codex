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
4. Write the migration by hand (`drizzle-kit generate`'s snapshots are stale in
   this repo — verified, last real one is `0004`), matching a recent migration's
   exact style in `drizzle/*.sql`.
5. If the table is fleet-scoped (has or should have `fleetId`), enable RLS +
   add a `service_role`-only policy following the pattern in migrations `0048`/
   `0056` (the current convention — not the older per-fleet `authenticated`-role
   policies in `0005`/`0012`/`0015`/`0016`/`0031`), and add coverage in
   `scripts/verify/rls.ts`'s `POST_0012_RLS_TABLES`.
6. Check whether `scripts/seed-demo-data.ts` needs updating for the new shape, and
   run `pnpm validate:demo-seed` if so.
7. Update any test asserting the old shape.
8. Run `pnpm check` — a schema change frequently breaks type inference at call
   sites even when logic is untouched.
9. Never run a migration against a database that isn't confirmed local/staging.
   Never perform a destructive migration without explicit, in-the-moment user
   instruction.
