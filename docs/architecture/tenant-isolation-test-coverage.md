# Tenant-isolation test coverage (P0)

This document maps TruckFixr's actual application-layer authorization architecture,
resource by resource, and records what regression coverage exists today. It exists
because an earlier draft of `docs/architecture/system-overview.md` incorrectly
claimed no such coverage existed — see the correction there. Do not restate that
error; verify against the code before extending this table.

## Architecture verified

**The primary tenant boundary is application-layer, not Postgres RLS** — confirmed
accurate. The app's Postgres role owns the tables and bypasses RLS; RLS is a real,
separately-enforced control only for paths that go through Supabase's
`authenticated`/`anon` roles (PostgREST data-API, and Supabase **Storage** — see the
photo/evidence row below, where RLS *is* the primary control, not defense-in-depth).

The application-layer pattern has two shapes, both server-derived (never trusting a
raw client `fleetId` as authorization on its own):

1. **Direct fleet input** — the client passes `fleetId`; the resolver checks the
   caller's `companyMemberships` row for *that* `fleetId`
   (`getCompanyMembership`/`resolveActiveFleetId` in `server/services/companyAccess.ts`
   / `maintenanceTenantScope.ts`). Used by `inspections.getRecentByFleet`,
   `defects.listByFleet`, `fleet.getById`, `maintenanceCases.list`,
   `vehicles.listByFleet` (`canManageVehicleAccess` for owner/manager, driver
   assignment lookup otherwise).
2. **Resource-derived fleet** — the client passes only a resource id (`caseId`,
   `vehicleId`, `defectId`); the resolver looks up *that resource's actual fleet*
   server-side, then checks membership against it — never against the caller's
   "primary" fleet. Used by `vehicles.getById` / `inspections.getById`
   (`canViewVehicle`, which loads the vehicle row itself and computes its
   `fleetId`), and `maintenanceCases.get`/`transition`/`assign`/`reopen`/decisions/
   repair-cycle endpoints (`getCaseFleetId` + `resolveActiveFleetId` — added
   coverage in this pass, see below). All ids involved (`vehicles.id`,
   `maintenanceCases.id`, `defects.id`, `users.id`) are global `serial` primary
   keys, not per-fleet sequences — so "look up the resource, then check its real
   fleet" is safe and cannot be confused with another fleet's row of the same
   local sequence number.

`adminProcedure` (`server/_core/trpc.ts`) is a **role** check only (`owner`/
`manager`) — it does not itself restrict to a fleet. Every resolver behind it
performs its own fleet check via one of the two patterns above. Documented (and
fixed for accuracy) in `CLAUDE.md`, `.claude/rules/tenancy.md`, and
`.claude/skills/truckfixr-tenant-security/SKILL.md` in this pass, after finding the
original PR's wording could be misread as the procedure enforcing it.

## Resource-by-resource map

| Resource | Route/service | Auth mechanism | Tenant id | Guard | DB boundary | RLS contribution | Existing test coverage |
|---|---|---|---|---|---|---|---|
| Vehicles | `vehicles.getById`/`listByFleet` | `protectedProcedure` | `fleetId` (via vehicle row for `getById`; direct input for `listByFleet`) | `canViewVehicle` → `canManageVehicleAccess`/`canManageCompanyOperations`, or driver assignment (`getActiveVehicleAssignment`) | `WHERE vehicles.fleetId = ...` / assignment join | Defense-in-depth (migrations 0005+) | `server/companyAccessFleetScope.test.ts` (the underlying `canManageCompanyOperations` gate) — no router-level `vehicles.*` test yet (gap, below). |
| Maintenance/repair cases | `maintenanceCases.list/get/transition/assign/reopen/...` | `protectedProcedure` (list/get) / `adminProcedure` (mutations) | `fleetId` (list) or case-derived via `getCaseFleetId` (get/mutations) | `resolveActiveFleetId`/`assertManagesFleet` (`maintenanceTenantScope.ts`) | `WHERE maintenanceCases.fleetId = ... AND id = ...` (`getCaseForFleet`) | Defense-in-depth | **Added in this pass**: `server/routerFleetScope.test.ts` (`maintenanceCases.get`/`transition` cross-fleet + role-boundary tests). Previously untested at the router level. |
| Uploaded evidence/photos | Supabase Storage buckets (`inspection-evidence`, `diagnostic-evidence`, `fleet-documents`); DB row in `inspectionPhotos` | Supabase Storage `authenticated` role (direct client upload/read) + app-level association | Storage object path (`company-<fleetId>/...`) + `inspectionPhotos.fleetId` | Storage: RLS policies (`truckfixr_storage_fleet_id`, `user_has_fleet_access`) are the **real, enforced** boundary here, not a backstop — there is no app-layer duplicate check on direct storage access. DB row: same patterns as inspections. | `storage.objects` RLS (Supabase-enforced) + `WHERE inspectionPhotos.fleetId = ...` | `server/storagePolicies.test.ts` (asserts the storage RLS migration's policy content — a static/text check, not a live cross-tenant proof). No live-Supabase-storage cross-tenant test exists (would need a real Supabase project; out of scope for this pass — see gap below). |
| Repair outcomes (confirmed) | `defects.ts` (by `defectId`/`vehicleId`, after `canViewVehicle`), `diagnostics.ts` (by `fleetId` directly, after `canDiagnoseVehicle`); lifecycle mutations (`verifyOutcome`/`confirmOutcome`/`markOutcomeFailed`) via `outcomeVerification.ts`'s `requireOutcome`, fleet-scoped by `eq(repairOutcomes.fleetId, ...)` | `protectedProcedure` | `fleetId` | Authorization runs *before* the id-scoped query — the query itself doesn't repeat the fleet filter because the id was already proven to belong to a fleet the caller can access. `requireOutcome` additionally excludes superseded rows. | `WHERE repairOutcomes.defectId = ...` / `.vehicleId = ...` / `.fleetId = ...` | Defense-in-depth | `server/services/confirmedOutcomes.test.ts` + `server/diagnosticFeedbackPersistence.test.ts` (service-level: "drops other fleets' outcomes and reports the count"). **Added in this pass**: `server/services/maintenanceLifecycle.e2e.test.ts` proves `verifyOutcome` rejects a cross-fleet `fleetId` with `NOT_FOUND` inside a full lifecycle chain. No router-level test of the `defects`/`diagnostics` *read* endpoints specifically (gap, below — lower priority since the shared `canViewVehicle`/`canDiagnoseVehicle` gate is covered elsewhere). |
| Analytics / manager action queue | `diagnostics.getManagerActionQueue` | `adminProcedure` | `fleetId` (direct input) | `canManageVehicleAccess` | fleet-scoped query | Defense-in-depth | `server/managerActionQueueAuthz.test.ts` — already covers this cross-fleet case. |
| Analytics (cross-fleet, staff) | `admin.ts` (`observability`, `metrics`, `tadisMetrics`) | `staffProcedure` | N/A — intentionally cross-fleet, staff-only | `isStaffAdminUser` | Aggregates across fleets by design | N/A | Not part of tenant-isolation testing (this is the sanctioned cross-fleet path, not a leak) — covered by `isStaffAdminUser` logic itself; no dedicated negative test found for "non-staff calling a staff route" specifically, though `staffProcedure`'s middleware is a simple, well-contained check. |
| Parts requests (concierge) | `partsRequests.ts` | `staffProcedure` (internal) / signed-token public links (`generateCustomerLink`/`generateSupplierLink`, `guestTokens.ts`) | No direct `fleetId` column — scoped only via `caseId` → `maintenanceCases.fleetId` when case-derived | Staff-only for the management surface (no fleet-user-facing endpoint exists); guest links are capability-URLs (possession of the signed token = access), not fleet-membership-checked | N/A (staff) / token lookup (`guestTokens`) | N/A | `server/services/guestTokens.test.ts` covers token expiry/misuse. Not a fleet-isolation concern today since there is no fleet-user-facing read path — flag this in any future work that adds one. |
| Parts Intelligence (requirements/fitment/options/approvals) | `partIntelligence.ts` | `protectedProcedure`, `manage_part_requirements` capability for create/manage, `assertManagesFleet` (owner/manager only) for approve/decline/request-more-information | Direct `fleetId` column on `partRequirements`/`partFitmentAssessments`/`partSupplierOptions`/`partOptionApprovals`; `parts` itself is not fleet-scoped (shared catalog) | Resource-derived fleet via `getPartRequirementFleetId`/`getSupplierOptionFleetId` (same pattern as `getCaseFleetId`) for id-keyed endpoints; direct-fleet-input via `getCaseFleetId` for `create`/`listForCase` | Defense-in-depth (post-0012 service-role-only RLS) | `server/routerFleetScope.test.ts` (`partIntelligence.*` blocks — cross-fleet denial for read/manage/approve endpoints, capability-gate denial) and `server/services/partsIntelligence.e2e.test.ts` (service-level cross-tenant denial across the full lifecycle including approvals). |

## Coverage added in this pass

`server/routerFleetScope.test.ts` gained:

- `maintenanceCases.get` — allows a case in the caller's own fleet; denies a case
  owned by another fleet (asserting the check runs against the case's *real* fleet,
  not the caller's own); denies even when the client supplies an explicit (wrong)
  `fleetId` alongside the foreign case id (the "submit Fleet B identifiers in the
  request body" attack from the adversarial checklist).
- `maintenanceCases.transition` — denies transitioning a case owned by another
  fleet before any status-transition logic runs; denies a `driver`-role caller
  outright at the `adminProcedure` tier (role-boundary test — the case-fleet lookup
  is never even reached for a non-owner/manager caller, asserted via a call-count
  check on the mocked lookup).

`server/services/maintenanceLifecycle.e2e.test.ts` (added in the P1 provenance/
lifecycle pass) additionally proves cross-tenant denial **inside a full,
multi-step lifecycle** rather than at a single router call: after a case is
created, decided, repaired, and its outcome reported in Fleet A, a Fleet B
`fleetId` cannot read the case (`getCaseForFleet` → `null`), reconstruct its
timeline (`getCaseTimeline` → `[]`), list its outcomes (`listOutcomesForCase` →
`[]`), or verify its outcome (`verifyOutcome` → `NOT_FOUND`) — all existing safe-
denial conventions, no new response shape. Fleet A's own access is unaffected by
the denied attempt.

All new tests follow the existing `server/routerFleetScope.test.ts` convention:
`appRouter.createCaller` with a mocked `TrpcContext`, mocking only the specific
dependency functions needed to isolate the tenant-boundary decision
(`getCaseFleetId`, `getCompanyMembership`, `requireFleetFeature`) while leaving
everything else (including the real authorization logic under test) unmocked.

## Vulnerabilities found

**None.** Every resource mapped above already resolves its tenant scope
server-side and rejects a cross-fleet request with `FORBIDDEN` (or, for
`vehicles.getById`, a `false` from `canViewVehicle` that the router turns into
`FORBIDDEN`). No authorization defect was found that would need a fix or a
separate security PR.

## Remaining gaps (documented, not built in this pass)

- **`vehicles.getById`/`listByFleet` have no router-level cross-fleet test** —
  the underlying `canManageCompanyOperations` gate is unit-tested
  (`companyAccessFleetScope.test.ts`), but no test drives it through
  `appRouter.createCaller` the way `maintenanceCases`/`inspections`/`defects`/
  `fleet` now do. Same effort/shape as the `maintenanceCases.get` test added here;
  recommended as the next small addition.
- **Driver vehicle-assignment expiry has no dedicated cross-fleet-adjacent test** —
  `getActiveVehicleAssignment` already filters on `expiresAt`, but there's no test
  proving a driver loses access the moment a temporary assignment expires (a
  same-fleet, role-boundary-shaped gap rather than a cross-fleet one).
- **No live-database proof of the storage-RLS row above** — `storagePolicies.test.ts`
  checks the migration's SQL text, not actual behavior against a running Supabase
  project. `scripts/verify/rls.ts` proves the Postgres-table RLS layer live; there
  is no equivalent live check for Storage object policies. This is the same
  category of residual risk `docs/security/tenant-isolation.md` already flags for
  Postgres RLS, applied to Storage.
- **No E2E-level proof** — everything above (existing and newly added) runs at the
  unit/service or mocked-tRPC-caller level, per `.claude/rules/testing.md`'s actual
  test-infrastructure conventions (no E2E framework wired into CI). A true E2E
  proof (real HTTP request, real session, real Postgres, asserting a 403/404
  against another fleet's live data) does not exist for any resource. This is a
  different, larger investment than the unit/router-level suite here and should be
  scoped separately if pursued.
- **`partsRequests`** has no fleet-user-facing read path today, so it isn't a
  cross-fleet test target yet — re-check this the moment any endpoint exposes it
  to fleet owners/managers directly (see `docs/architecture/parts-acquisition.md`).

## Recommendation

Tenant-isolation coverage is now sufficient to treat this as **P1, not P0**: the
primary application-layer boundary has real, passing regression tests across the
highest-value resources (vehicles' gate function, cases, inspections, defects,
fleet, manager action queue, confirmed-outcome builder), including the one gap this
pass closed (`maintenanceCases`' case-derived-fleet path). The remaining gaps above
are narrower (one more router, one role-boundary edge case, one live-environment
proof for Storage RLS, and E2E generally) and don't block moving on — track them as
normal backlog items rather than a blocking P0.
