# Database-change workflow

Any change to `drizzle/schema.ts` (new table/column, index, constraint) follows this
sequence. Do not skip steps to save time — schema mistakes are expensive to undo.

1. **Inspect the current model.** Read the affected table(s) in `drizzle/schema.ts`
   and the most recent migration touching them, to understand naming conventions
   already in use (camelCase columns, `fleetId` placement, timestamp conventions).
2. **Identify consumers.** Grep `server/services/` and `server/routers/` for the
   table name to find every read/write path that will be affected.
3. **Assess backward compatibility.** Can existing rows satisfy a new `NOT NULL`
   constraint? Does a renamed column break a consumer that isn't in this diff?
   Prefer additive changes (new nullable column, backfill later) over
   rename-in-place.
4. **Define the migration.** `drizzle-kit generate`'s snapshot tracking is stale
   in this repo (verified: `drizzle/meta`'s last real snapshot is `0004`) — write
   the SQL by hand, matching the exact style of a recent migration in
   `drizzle/*.sql` (idempotent `CREATE TABLE IF NOT EXISTS`, matching column
   types/defaults to `drizzle/schema.ts`). Applied via
   `scripts/verify/apply-readiness-migrations.ts`, not `drizzle-kit migrate`.
5. **Define rollback** where the migration is anything beyond a pure addition —
   at minimum, note in the migration file or PR what a rollback would require.
6. **Assess tenant implications.** Does the new table need `fleetId`? Does it need
   an RLS policy migration (pattern: migrations `0005`, `0012`, `0015`, `0016`,
   `0031`) and coverage in `scripts/verify/rls.ts`?
7. **Update tests** for any service/router logic that now depends on the new shape.
8. **Verify seed/demo data.** Does `scripts/seed-demo-data.ts` (or the relevant seed
   script) need updating so demo fleets still validate? Run
   `pnpm validate:demo-seed` if the change touches a table the seed populates.
9. **Run a fresh-context review** (`.claude/workflows/fresh-context-review.md`),
   with particular attention to the Database section.
10. **Document material data-risk** — anything that could lose or corrupt existing
    rows, even in a low-probability case — in the PR description, not silently.

Never run a migration command against a database that hasn't been confirmed
local/staging (`scripts/verify/db-target-guard.ts` pattern). Never perform a
destructive migration (dropping a column/table with data) without explicit,
in-the-moment user instruction.
