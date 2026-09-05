---
name: truckfixr-tenant-security
description: Use before merging any change that adds or modifies a query, router procedure, or service touching customer data (vehicles, maintenance cases, inspections, repair outcomes, parts requests, analytics). Checks for cross-fleet data leakage and confirms the correct tRPC procedure tier is used.
---

# TruckFixr tenant-security review

TruckFixr's tenant boundary is the **application layer**, not Postgres RLS (the app's
DB role owns the tables and bypasses RLS — see `docs/security/tenant-isolation.md`).
That means every query is a potential leak point if it forgets its fleet filter, and
no database-level safety net will catch it in production traffic.

## Walk every new/changed query against these scenarios

A Fleet A user (owner, manager, or driver) must not be able to read or write:

- Fleet B's vehicles or vehicle assignments.
- Fleet B's maintenance cases, defects, inspections, or repair cycles.
- Fleet B's uploaded inspection/evidence photos.
- Fleet B's repair outcomes / confirmed-outcome records.
- Fleet B's parts requests or supplier records.
- Fleet B's analytics, dashboards, or aggregate metrics.
- Fleet B's subscription/billing data.

For each, ask: **where does `fleetId` come from in this code path?** It must trace
back to `ctx.user`'s resolved membership (`resolveActiveFleetId`,
`assertManagesFleet`, `assertVehicleInFleet` in
`server/services/maintenanceTenantScope.ts`, or `companyAccess.ts`), never from a
client-supplied parameter used directly in a `WHERE` clause without a membership
check.

## Specific traps to check for

- A query that fetches a row by ID (case, vehicle, defect) and only checks `fleetId`
  on the *first* hop of a join, not on every table touched.
- A driver-scoped query that checks current assignment but not assignment expiry
  (temporary access should not persist past its window).
- A new admin/reporting endpoint that aggregates across fleets without being
  `staffProcedure` + `isStaffAdminUser`.
- An error path that returns a full object (including cross-fleet fields) before an
  authorization check runs, rather than checking authorization first.
- A newly added table with fleet-scoped data that has no RLS policy migration and no
  entry in `scripts/verify/rls.ts` (defense-in-depth gap, not the primary boundary,
  but still a gap worth flagging).

## Procedure-tier check

- `publicProcedure` — no auth. Must never return customer data.
- `protectedProcedure` — any authenticated user. Correct default; still needs its own
  fleet-scope check inside the resolver.
- `adminProcedure` — checks `ctx.user.role` is `owner`/`manager` only. This is a
  role check, not a fleet-scope check — the middleware itself does not restrict
  which fleet. The resolver behind it must still call `resolveActiveFleetId` +
  `assertManagesFleet` (or the `companyAccess.ts` equivalent) itself.
- `staffProcedure` — TruckFixr internal staff, the only sanctioned cross-fleet path.

Flag any new procedure that reads/writes customer data using anything looser than
`protectedProcedure` plus an explicit fleet-scope check, and any cross-fleet logic
that isn't `staffProcedure`.

## If you find a gap

- If the fix follows an established pattern already used elsewhere (e.g. add the
  same `assertVehicleInFleet` call a sibling procedure already makes) — fix it
  directly, it's low-risk.
- If it requires a new authorization model or changes what a role can see —
  document it as a finding (severity BLOCKER if exploitable today), do not implement
  a novel fix without confirming with the user.
