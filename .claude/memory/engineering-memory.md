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
- Confirmed bug (commit `dc280ad`, `server/services/tadisCore.ts`
  `evaluateCause`/`buildBaselineStage`): when a complaint matched no signal for any
  cause in `CAUSE_LIBRARY`, every cause tied at the same base score and a stable
  sort silently returned the first-declared library entry as a confident-looking
  diagnosis. Fixed by detecting the zero-evidence case explicitly and surfacing
  "insufficient evidence" instead of a guess. General lesson for *any new*
  ranking/similarity code (not a claim that other files have this bug today): when
  every candidate can tie at zero evidence, verify the code path explicitly handles
  that case rather than relying on sort stability to produce a reasonable-looking
  default.
- `drizzle-kit generate`'s snapshot tracking (`drizzle/meta/`) is stale (last real
  snapshot is `0004`; migrations since then are hand-written directly). Don't run
  `drizzle-kit generate` expecting a usable diff — write migration SQL by hand
  matching a recent migration's style, per `.claude/rules/database.md`.
- New fleet-scoped tables since roughly migration `0043` use a simpler RLS
  convention than the older tables: enable RLS + one `service_role`-only
  full-access policy (pattern in `0048`/`0056`), not the older per-fleet
  `authenticated`-role policies (`0005`/`0012`/`0015`/`0016`/`0031`). Register the
  table in `scripts/verify/rls.ts`'s `POST_0012_RLS_TABLES` either way.
- Confirmed bug (found in fresh-context review, `server/services/partOptionApprovals.ts`
  `recordApprovalDecision`): an unconditional `UPDATE ... WHERE id = ...` status
  transition, followed later by an unconditional `INSERT` of an append-only
  decision row, let two concurrent callers both pass validation and both insert
  conflicting rows for the same resource — no DB transactions are used in this
  codebase, so this isn't guarded implicitly. Fixed with a compare-and-swap:
  `UPDATE ... WHERE id = ... AND status = <expected-from> ... RETURNING`, only
  proceeding to the append-only insert if a row was actually returned, otherwise
  throwing a conflict error. General lesson: any status-transition-then-append-row
  sequence on a resource that can be acted on by more than one caller needs this
  CAS guard, not just an allow-list check on the transition itself — the allow-list
  (`canTransitionX`) proves the transition is *legal*, not that it's still *current*.
