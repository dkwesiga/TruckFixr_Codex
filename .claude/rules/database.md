# Database / migration rules

- Schema lives in `drizzle/schema.ts`; migrations are numbered SQL files in
  `drizzle/*.sql` generated via `drizzle-kit generate`, applied via `drizzle-kit
  migrate` (`pnpm db:push` runs both). Never hand-edit a live database schema.
- No destructive migration (`DROP TABLE`, `DROP COLUMN`, irreversible data deletion)
  without explicit user instruction in the moment — this harness does not authorize
  it implicitly, even for "cleanup."
- Never run `pnpm db:push` (or any migration command) against a database you have not
  confirmed is local/staging. Check `DATABASE_URL` first — see
  `scripts/verify/db-target-guard.ts` for the existing target-guard pattern and reuse
  it rather than writing a new one.
- A new fleet-scoped table needs: `fleetId` column, an RLS policy migration (follow
  the pattern in migrations `0005`, `0012`, `0015`, `0016`, `0031`), and coverage in
  `scripts/verify/rls.ts`. Skipping any of these is a gap, not a stylistic choice.
- Prefer additive migrations (new column/table, backfill, then deprecate) over
  in-place destructive changes when evolving a table that already has data —
  especially anything under the provenance chain (see
  `.claude/rules/ai-safety.md` and `docs/architecture/confirmed-outcomes.md`).
- Full workflow for any schema change: `.claude/workflows/database-change.md`.
