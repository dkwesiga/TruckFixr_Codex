# Engineering memory

Durable, evidence-backed lessons only. See `README.md` in this directory for the
promotion rule before adding an entry. One line + a pointer to the evidence, not a
narrative.

- Tenant isolation is application-layer, not RLS — the app's Postgres role owns the
  tables and bypasses RLS. Any "just add an RLS policy" fix for a leaking query is
  insufficient by itself. (Source: `docs/security/tenant-isolation.md`.)
- Case-status transitions are an explicit allow-list (`TRANSITIONS` in
  `shared/maintenance/caseWorkflow.ts`); anything not listed is rejected by design —
  don't work around a rejected transition by writing status directly, extend the map
  with justification instead.
- `isStaffAdminUser` has a dev-only convenience fallback (owner/manager treated as
  staff when no staff emails are configured and the DB isn't Supabase) — this must
  never fire in production; if you're debugging a staff-only route locally and it
  "just works," check whether you're relying on this fallback before assuming the
  real auth check passed.
- The TADIS tie-to-first-array-entry bug (commit `dc280ad`) is the kind of subtle
  logic bug this codebase has hit before in scoring/ranking code — when reviewing
  new similarity/ranking logic (e.g. `jaccardSimilarity`/`scoreHistoricalDiagnosticCase`
  in `confirmedOutcomes.ts`), check tie-breaking behavior explicitly, don't assume
  "first match" is intentional.
