# Fresh-context review workflow

Purpose: catch what the implementer missed, precisely because the implementer is
biased by having just written the code. Run this as a separate pass — ideally a new
subagent/session that reads only the diff and the surrounding code, not the
implementation conversation.

**Explicit instruction to the reviewer: do not assume the implementation is correct.
Assume it is wrong until each check below is actually verified against the code.**

## How to invoke

- Prefer spawning a fresh agent (`Agent` tool, general-purpose or a code-review
  agent) with a prompt containing: the diff (`git diff` against the merge base), the
  stated intent of the change, and a pointer to this file plus
  `.claude/skills/truckfixr-safety-gate/SKILL.md` and
  `.claude/skills/truckfixr-tenant-security/SKILL.md` when the diff touches those
  areas.
- The reviewer must read the actual current file contents for anything it flags —
  not rely on the diff hunk alone (context above/below a hunk matters for tenant
  scoping and status transitions).

## Checklist

### Correctness
- Logic errors, off-by-one, wrong operator/condition.
- State-transition errors — does this respect `TRANSITIONS` in
  `shared/maintenance/caseWorkflow.ts` (or the equivalent map for whatever state
  machine is touched)? Is a terminal status being mutated without going through the
  dedicated reopen path?
- Edge cases: empty arrays, zero/negative IDs, missing optional fields.
- Null/undefined handling — especially fields that are `nullable()` in Drizzle/zod.
- Async behavior: unhandled promise rejections, missing `await`, race conditions on
  concurrent writes to the same case/vehicle.
- Data consistency: does a multi-step write have a transaction boundary where one is
  needed, or can it leave a case/repair-outcome half-updated on failure?

### TruckFixr domain correctness
- Maintenance-case integrity: status transition is in the allowed map; severity/action
  vocabulary matches `shared/maintenance/caseWorkflow.ts` exactly (no ad hoc strings).
- Vehicle linkage: every case/defect/repair-outcome row is tied to a real vehicle in
  the correct fleet, not just a bare ID.
- Repair linkage: repair cycle / repair-shop workflow states stay consistent with the
  parent case's history.
- Confirmed-outcome integrity: original diagnosis, decision, and confirmed outcome are
  distinguishable fields, not overwritten in place (see
  `docs/architecture/confirmed-outcomes.md`).
- Parts linkage (if touched): a parts request/fitment claim references a real
  case/vehicle and doesn't silently upgrade an unconfirmed fitment to confirmed.

### Security
- Authentication: is the right procedure tier used (`public`/`protected`/`admin`/
  `staff`)? Any new `publicProcedure` returning customer data is a BLOCKER.
- Authorization: does every customer-data query filter by the caller's fleet (from
  session context), not from client input?
- Tenant isolation: walk every query added/changed and ask "what happens if the
  caller is a member of a different fleet, or a driver with a different vehicle
  assignment?" Use `.claude/skills/truckfixr-tenant-security/SKILL.md`.
- Data leakage: does an error message, log line, or response payload include another
  fleet's data or an internal detail (stack trace, SQL, secret) it shouldn't?
- Insecure API exposure: any new route bypassing tRPC's auth middleware (raw Express
  route) needs its own explicit auth check — verify it exists.
- Secrets: no hardcoded keys/tokens; no `.env` values echoed into a response/log.
- Injection: any raw SQL/string-built query? Drizzle's query builder is expected;
  flag string concatenation into SQL.
- Insecure object access: an endpoint that takes an ID and doesn't verify the caller
  owns/can-access the object behind that ID (IDOR).

### AI-related risk
- Unsafe model assumptions: code that trusts a model field to always be present/
  well-formed without validation.
- Model output treated as trusted input: model text used directly in a query, file
  path, or shell command; model-suggested action applied without going through the
  approval/confidence gate that exists elsewhere in the codebase.
- Missing uncertainty handling: a low-confidence result forced into a confident
  recommendation.
- Inappropriate autonomous action: an AI-driven change that transitions a case to a
  critical/terminal status, orders parts, or contacts a customer without a human
  approval step that existed before the change.

### Database
- Migration safety: additive vs. destructive; is a `DROP`/`ALTER ... NOT NULL`
  applied to a column with existing data without a backfill step?
- Referential integrity: new FK relationships, cascade behavior on delete.
- Transaction boundaries: multi-table writes that should be atomic.
- Indexing: only flag if a new query pattern is per-request and clearly missing an
  index that already exists on comparable tables (don't invent indexing work outside
  scope).
- Unsafe updates/deletes: any `UPDATE`/`DELETE` without a `WHERE` scoped to a specific
  row/fleet.

### Regression
- Does an existing test now fail, or was a test weakened/deleted to make the change
  pass instead of fixing the underlying issue?
- Does `pnpm check` / `pnpm test` / `pnpm build` (when relevant) actually pass? Don't
  take the implementer's word for it — rerun.

## Output format

Report findings as: **BLOCKER**, **HIGH**, **MEDIUM**, **LOW**, **INFORMATIONAL**.
Skip stylistic nitpicks unless they affect correctness or maintainability. Fix
BLOCKER/HIGH issues where the fix is itself low-risk (see
`.claude/memory/README.md` promotion rule for turning a repeated finding into a
durable rule); otherwise document as an open risk.
