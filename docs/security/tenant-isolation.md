# Tenant Isolation Control Statement

**Status:** Active control description · **Owner:** Engineering · **Last reviewed:** 2026-06-29

This is the authoritative statement of how TruckFixr isolates one customer fleet's
data from another. It exists so that internal docs, sales answers, and any
StrongDM Comply artifacts describe the control **accurately** and do not overclaim.

## Summary (use this wording)

> TruckFixr enforces multi-tenant isolation primarily at the **application layer**:
> every customer-data query is scoped to the authenticated user's fleet(s) derived
> from server-side session context. **PostgreSQL Row-Level Security (RLS) is enabled
> as defense-in-depth** for direct database / Supabase data-API access. Cross-fleet
> isolation is verified by an automated test (`scripts/verify/rls.ts`).

Do **not** describe RLS as the sole or primary tenant boundary (see "Why" below).

## The primary control: application-layer fleet scoping

- The API server connects to Postgres via `DATABASE_URL` using a role that can run
  DDL (table/type creation in `server/db.ts`). Because that role owns the tables,
  **RLS policies do not constrain the application's own queries** — a table owner
  bypasses RLS unless `FORCE ROW LEVEL SECURITY` is set.
- Therefore the real isolation boundary is the application code: tRPC procedures
  resolve the caller's `fleetId`/membership from session context and add
  `WHERE fleetId = ...` (and driver-level `assignedDriverId` checks where relevant)
  to every customer-data query.
- RBAC is layered on top in `server/_core/trpc.ts`:
  - `protectedProcedure` — any authenticated user.
  - `adminProcedure` — customer fleet `owner`/`manager` (still fleet-scoped).
  - `staffProcedure` — TruckFixr internal staff only (`isStaffAdminUser`); all
    cross-fleet admin endpoints in `server/routers/admin.ts` use this.

## The defense-in-depth control: Postgres RLS

- RLS is enabled on customer-data tables (migrations `0005`, `0012`, `0015`,
  `0016`, `0031`, …) with fleet-scoped `authenticated` policies and a
  `service_role` full-access policy.
- This protects any access path that goes through the Supabase `anon`/`authenticated`
  roles (e.g. the Supabase data API / PostgREST), where the row-security context
  *is* enforced.
- `scripts/verify/rls.ts` proves, against a live database under the `authenticated`
  role, that a user in fleet A cannot read fleet B's vehicles, subscriptions,
  early-warning flags, review queues, admin notes, or lead submissions, and that
  cross-fleet writes are denied.

## Why this distinction matters

If a future query forgets its fleet filter, RLS will **not** catch it (the app role
bypasses RLS). That is the residual risk. It is mitigated by code review and should
be closed by the planned **application-layer fleet-scoping test suite** (see backlog
item 6 in `reports/soc2-readiness-2026-06-29.md`).

## Residual risks / planned hardening

- [ ] Add automated tests asserting representative customer-data procedures withhold
      rows for a non-member caller (covers the primary boundary directly).
- [ ] Evaluate `ALTER TABLE ... FORCE ROW LEVEL SECURITY` + a dedicated least-privilege
      application role so RLS also constrains the app path (turns defense-in-depth into
      a true second enforcement layer). Requires separating the migration/DDL role from
      the runtime role.
- [ ] Keep `scripts/verify/rls.ts` coverage in step with every new fleet-scoped table.

## Verification cadence

See `docs/security/rls-isolation-evidence.md`.
