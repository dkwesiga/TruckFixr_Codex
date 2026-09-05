# Database / migration rules

- Schema lives in `drizzle/schema.ts`; migrations are numbered SQL files in
  `drizzle/*.sql`. **Correction (verified):** `drizzle-kit generate`'s snapshot
  tracking (`drizzle/meta/`) is stale as of this writing (last real snapshot is
  `0004`) — migrations since then are hand-written directly, matching the exact
  style of the surrounding numbered files (`CREATE TABLE IF NOT EXISTS ...`,
  idempotent), and applied via `scripts/verify/apply-readiness-migrations.ts`
  (gated by `ALLOW_READINESS_MIGRATIONS=true` + the target-guard below), not
  `drizzle-kit migrate`/`pnpm db:push`. Don't assume `drizzle-kit generate` will
  produce a usable diff — write the SQL by hand, matching a recent migration's
  style, and update `drizzle/schema.ts` in the same change. Never hand-edit a
  live database schema outside a migration file.
- No destructive migration (`DROP TABLE`, `DROP COLUMN`, irreversible data deletion)
  without explicit user instruction in the moment — this harness does not authorize
  it implicitly, even for "cleanup."
- Never run a migration (or `scripts/verify/apply-readiness-migrations.ts`) against
  a database you have not confirmed is local/staging. Check `DATABASE_URL` first —
  see `scripts/verify/db-target-guard.ts` for the existing target-guard pattern and
  reuse it rather than writing a new one.
- A new fleet-scoped table needs a `fleetId` column, an RLS-enabling statement, and
  coverage in `scripts/verify/rls.ts`. **Correction (verified):** the convention for
  any table added since roughly migration `0043` is *not* the older per-fleet
  `authenticated`-role policy style in `0005`/`0012`/`0015`/`0016`/`0031` — it's the
  simpler pattern in `0048`/`0056`: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` +
  a single `..._service_role_full_access` policy (`FOR ALL TO service_role USING
  (true) WITH CHECK (true)`). This blocks the Supabase `anon`/`authenticated` API
  entirely for that table; the actual tenant boundary is the application layer
  (`docs/security/tenant-isolation.md`). Use the newer pattern for a new table
  unless the table is genuinely meant to be read directly via the Supabase data API
  by an authenticated fleet user (rare — check for a precedent like
  `partnerProfiles` before assuming that's needed). Register the table name in
  `POST_0012_RLS_TABLES` in `scripts/verify/rls.ts` either way.
- Prefer additive migrations (new column/table, backfill, then deprecate) over
  in-place destructive changes when evolving a table that already has data —
  especially anything under the provenance chain (see
  `.claude/rules/ai-safety.md` and `docs/architecture/confirmed-outcomes.md`).
- Full workflow for any schema change: `.claude/workflows/database-change.md`.
