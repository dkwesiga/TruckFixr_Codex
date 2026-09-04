# Tenancy rules

- The tenant is the **fleet** (`fleets` table). A user's access to a fleet is via
  `companyMemberships` (role: `owner` | `manager` | `driver`); drivers are further
  scoped to `vehicleAssignments` (sometimes time-limited/temporary access).
- `internalAdminRole` (staff) is orthogonal to fleet role — a staff admin is not a
  member of every fleet, they cross the boundary explicitly via `staffProcedure`.
- `adminProcedure`'s middleware (`server/_core/trpc.ts`) checks `ctx.user.role` is
  `owner`/`manager` only — it does **not** itself resolve or restrict to a specific
  fleet. Every resolver behind `adminProcedure` must still call
  `resolveActiveFleetId`/`assertManagesFleet` (or the `companyAccess.ts` equivalent)
  itself; don't treat the procedure tier alone as proof a query is fleet-scoped.
- Every customer-data table carries (directly or via join) a `fleetId`. Any new table
  holding fleet-scoped data must include `fleetId` and be added to
  `scripts/verify/rls.ts` coverage and RLS migrations, not just app-layer filtering.
- Cross-fleet access patterns to actively look for when reviewing a change:
  - Fleet A user reading/writing Fleet B's vehicles, maintenance cases, inspection
    photos, repair outcomes, parts requests, or analytics.
  - A driver seeing a vehicle they aren't currently assigned to (including after a
    temporary-assignment expiry).
  - A query that joins through a table without re-checking `fleetId` on every hop
    (a subquery that fetches by ID alone, then trusts it). Note: fetching a row by
    its own primary key (defect/vehicle/case id — all `serial`, globally unique
    across fleets) and checking access once via `canViewVehicle`/`assertVehicleInFleet`
    before querying related rows *by that same id* (e.g. `repairOutcomes` by
    `vehicleId`) is the established, safe pattern here — flag it only if the
    authorization check happens after the data is read/returned, or is missing
    entirely, not merely because a later query reuses the already-checked id.
  - An admin/report endpoint that aggregates across fleets without being
    `staffProcedure`.
- When adding a new query, prefer resolving the fleet scope once
  (`resolveActiveFleetId` / `assertManagesFleet` / `assertVehicleInFleet` in
  `server/services/maintenanceTenantScope.ts`, or the equivalent in
  `companyAccess.ts`) rather than re-deriving it ad hoc.
- Demo fleets are tenants like any other for isolation purposes — demo data must not
  leak between the three demo companies either.
