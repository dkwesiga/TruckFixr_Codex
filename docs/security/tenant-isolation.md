# Tenant Isolation Control Statement

**Status:** Active control description · **Owner:** Engineering · **Last reviewed:** 2026-09-05

This is the authoritative statement of how TruckFixr isolates one customer fleet's
data from another. It exists so that internal docs, sales answers, and any
StrongDM Comply artifacts describe the control **accurately** and do not overclaim.

**Correction (2026-09-05):** this document previously described the automated-test
"residual risk" below as entirely open. It understated existing coverage — see
"Existing regression coverage" below and the full resource-by-resource map in
`docs/architecture/tenant-isolation-test-coverage.md` (that document is the
detailed map; this one stays the short authoritative control statement — prefer
linking rather than duplicating detail between them).

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
  to every customer-data query. Two shapes of this pattern occur in practice:
  - **Direct fleet input**: the client passes `fleetId`; the resolver checks the
    caller's `companyMemberships` row for *that* `fleetId`
    (`getCompanyMembership`/`resolveActiveFleetId` in
    `server/services/companyAccess.ts` / `maintenanceTenantScope.ts`). Used by
    `inspections.getRecentByFleet`, `defects.listByFleet`, `fleet.getById`,
    `maintenanceCases.list`, `vehicles.listByFleet`.
  - **Resource-derived fleet**: the client passes only a resource id (`caseId`,
    `vehicleId`, `defectId`); the resolver looks up *that resource's actual fleet*
    server-side and checks membership against it — never against the caller's
    "primary" fleet. Used by `vehicles.getById`/`inspections.getById`
    (`canViewVehicle`) and `maintenanceCases.get`/`transition`/`assign`/`reopen`/
    decision/repair-cycle endpoints (`getCaseFleetId` + `resolveActiveFleetId`).
    Safe because all relevant primary keys (`vehicles.id`, `maintenanceCases.id`,
    `defects.id`) are global `serial` sequences, not per-fleet.
- RBAC is layered on top in `server/_core/trpc.ts`:
  - `protectedProcedure` — any authenticated user.
  - `adminProcedure` — checks `ctx.user.role` is `owner`/`manager` **only**; this is
    a role check, not a fleet-scope check. It does not itself restrict which fleet
    — every resolver behind it still performs one of the two patterns above itself.
  - `staffProcedure` — TruckFixr internal staff only (`isStaffAdminUser`); all
    cross-fleet admin endpoints in `server/routers/admin.ts` use this.

## Existing regression coverage

The primary application-layer boundary already has real, passing automated tests —
not just the RLS layer below:

- `server/companyAccessFleetScope.test.ts` — unit tests on `canManageCompanyOperations`
  (cross-tenant denial, owner fallback, inactive membership, driver denial).
- `server/routerFleetScope.test.ts` — tRPC-caller-level cross-fleet tests for
  `inspections.getRecentByFleet`, `defects.listByFleet`, `fleet.getById`, and
  (added alongside this document's correction) `maintenanceCases.get`/`transition`
  — the resource-derived-fleet path, including a role-boundary test (a `driver`
  caller rejected at the `adminProcedure` tier before any fleet lookup runs).
- `server/managerActionQueueAuthz.test.ts` — `diagnostics.getManagerActionQueue`.
- `server/services/confirmedOutcomes.test.ts` / `server/diagnosticFeedbackPersistence.test.ts`
  — cross-fleet leakage guard in the confirmed-outcome reference builder.
- `server/services/maintenanceLifecycle.e2e.test.ts` — a cross-tenant negative path
  exercised inside the full case-lifecycle chain (Fleet B cannot read or verify
  Fleet A's case/outcome).

See `docs/architecture/tenant-isolation-test-coverage.md` for the full
resource-by-resource map (vehicles, maintenance cases, evidence photos, repair
outcomes, analytics, parts requests) and the remaining, narrower gaps.

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

### Supabase Storage is a partial exception — RLS *is* the primary control there

The "RLS is defense-in-depth only" framing above is specifically about the app's
own Postgres table queries (the app's DB role bypasses RLS there). It does **not**
describe Supabase **Storage**: evidence-photo buckets (`inspection-evidence`,
`diagnostic-evidence`, `fleet-documents`) are accessed through Supabase Storage's
`authenticated` role and its own RLS policies on `storage.objects`
(`supabase/migrations/20260527113000_storage_privacy_policies.sql`, asserted by
`server/storagePolicies.test.ts`), and there is no separate app-layer duplicate
check on direct storage access. For that path, RLS is the real, enforced boundary
— not a backstop. `server/storagePolicies.test.ts` checks the migration's policy
*content* (a static assertion), not live behavior against a running Supabase
project; there is no equivalent of `scripts/verify/rls.ts` proving this live.

## Why this distinction matters

If a future query forgets its fleet filter, RLS will **not** catch it for a Postgres
table query (the app role bypasses RLS there — this does not apply to Storage,
above). That is the residual risk for Postgres-table queries specifically. See
"Existing regression coverage" above for what already mitigates it beyond code
review, and `docs/architecture/tenant-isolation-test-coverage.md` for the gaps that
remain.

## Residual risks / planned hardening

- [x] ~~Add automated tests asserting representative customer-data procedures
      withhold rows for a non-member caller~~ — done; see "Existing regression
      coverage" above. Narrower gaps (e.g. no `vehicles.*` router-level test yet)
      remain — tracked in `docs/architecture/tenant-isolation-test-coverage.md`,
      not here.
- [ ] Evaluate `ALTER TABLE ... FORCE ROW LEVEL SECURITY` + a dedicated least-privilege
      application role so RLS also constrains the app path (turns defense-in-depth into
      a true second enforcement layer). Requires separating the migration/DDL role from
      the runtime role.
- [ ] Keep `scripts/verify/rls.ts` coverage in step with every new fleet-scoped table.
- [ ] Add a live-Supabase-Storage proof of the RLS policies above (today only their
      SQL text is asserted, not live cross-tenant behavior).

## Verification cadence

See `docs/security/rls-isolation-evidence.md`.
