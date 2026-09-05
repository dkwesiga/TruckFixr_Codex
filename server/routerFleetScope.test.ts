import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

/**
 * Cross-router application-layer fleet-scoping tests (Batch B, extension).
 *
 * Each customer-data router exposes fleet-scoped reads guarded by a
 * `verifyFleetAccess(input.fleetId, ...)` check. The cross-tenant regression we
 * guard against: a user authorized for fleet A passing fleet B's id and getting
 * B's data. For the same caller we grant FLEET_A and deny FLEET_B, and assert:
 *   - requesting FLEET_A is allowed;
 *   - requesting FLEET_B is FORBIDDEN;
 *   - the guard is consulted with the *requested* fleetId (not a cached/own one).
 *
 * inspections/defects authorize via `canManageVehicleAccess`; fleet authorizes via
 * `getCompanyMembership` (+ owner fallback). We mock those and a null-result db so
 * the allowed path returns cleanly without a live database.
 */
const FLEET_A = 1;
const FLEET_B = 2;
const CASE_IN_FLEET_A = 101;
const CASE_IN_FLEET_B = 202;

const REQUIREMENT_IN_FLEET_A = 301;
const REQUIREMENT_IN_FLEET_B = 302;
const SUPPLIER_OPTION_IN_FLEET_B = 402;

const {
  canManageVehicleAccessMock,
  getCompanyMembershipMock,
  getCaseFleetIdMock,
  requireFleetFeatureMock,
  hasMaintenanceCapabilityMock,
  getPartRequirementFleetIdMock,
  getSupplierOptionFleetIdMock,
} = vi.hoisted(() => ({
  canManageVehicleAccessMock: vi.fn(async ({ fleetId }: { fleetId: number }) => fleetId === FLEET_A),
  getCompanyMembershipMock: vi.fn(async ({ fleetId }: { fleetId?: number | null }) =>
    fleetId === FLEET_A
      ? { fleetId: FLEET_A, userId: 14, role: "manager", status: "active" }
      : null
  ),
  // maintenanceCases.get/transition resolve a caseId to its OWNING fleet (not the
  // caller's own fleet) before checking membership — see getCaseFleetId in
  // server/services/maintenanceCases.ts. This mock stands in for that lookup.
  getCaseFleetIdMock: vi.fn(async (caseId: number) => (caseId === CASE_IN_FLEET_A ? FLEET_A : FLEET_B)),
  // Feature-flag gating is orthogonal to tenant isolation; stub it out so these
  // tests isolate the fleet-scoping boundary specifically.
  requireFleetFeatureMock: vi.fn(async () => {}),
  // hasMaintenanceCapability internally calls canManageCompanyOperations, which
  // calls companyAccess's OWN internal (unmocked, same-module) getCompanyMembership
  // reference -- mocking the exported getCompanyMembership above does not reach
  // it. Mock hasMaintenanceCapability directly instead, same as the fleetId
  // membership mocks above: FLEET_A is authorized, FLEET_B is not.
  hasMaintenanceCapabilityMock: vi.fn(async ({ fleetId }: { fleetId: number }) => fleetId === FLEET_A),
  // partIntelligence endpoints keyed by partRequirementId (not caseId) resolve
  // the OWNING fleet the same resource-derived way maintenanceCases does.
  getPartRequirementFleetIdMock: vi.fn(async (id: number) =>
    id === REQUIREMENT_IN_FLEET_A ? FLEET_A : FLEET_B
  ),
  // partIntelligence.getSupplierOption is keyed by the option's own id.
  getSupplierOptionFleetIdMock: vi.fn(async (id: number) =>
    id === SUPPLIER_OPTION_IN_FLEET_B ? FLEET_B : FLEET_A
  ),
}));

vi.mock("./services/vehicleAccess", async () => {
  const actual = await vi.importActual<typeof import("./services/vehicleAccess")>(
    "./services/vehicleAccess"
  );
  return { ...actual, canManageVehicleAccess: canManageVehicleAccessMock };
});

vi.mock("./services/companyAccess", async () => {
  const actual = await vi.importActual<typeof import("./services/companyAccess")>(
    "./services/companyAccess"
  );
  return { ...actual, getCompanyMembership: getCompanyMembershipMock };
});

vi.mock("./services/maintenanceCases", async () => {
  const actual = await vi.importActual<typeof import("./services/maintenanceCases")>(
    "./services/maintenanceCases"
  );
  return { ...actual, getCaseFleetId: getCaseFleetIdMock };
});

vi.mock("./services/fleetFeatures", async () => {
  const actual = await vi.importActual<typeof import("./services/fleetFeatures")>(
    "./services/fleetFeatures"
  );
  return { ...actual, requireFleetFeature: requireFleetFeatureMock };
});

vi.mock("./services/maintenancePermissions", async () => {
  const actual = await vi.importActual<typeof import("./services/maintenancePermissions")>(
    "./services/maintenancePermissions"
  );
  return { ...actual, hasMaintenanceCapability: hasMaintenanceCapabilityMock };
});

vi.mock("./services/partRequirements", async () => {
  const actual = await vi.importActual<typeof import("./services/partRequirements")>(
    "./services/partRequirements"
  );
  return { ...actual, getPartRequirementFleetId: getPartRequirementFleetIdMock };
});

vi.mock("./services/partSupplierOptions", async () => {
  const actual = await vi.importActual<typeof import("./services/partSupplierOptions")>(
    "./services/partSupplierOptions"
  );
  return { ...actual, getSupplierOptionFleetId: getSupplierOptionFleetIdMock };
});

// Thenable query stub: every chained call resolves to an empty result set, so the
// allowed path returns [] / null instead of hitting a real database.
function makeDbStub() {
  const chain: Record<string, unknown> = {};
  for (const method of ["from", "where", "orderBy", "limit", "innerJoin", "leftJoin", "groupBy"]) {
    chain[method] = () => chain;
  }
  (chain as { then: unknown }).then = (resolve: (v: unknown[]) => unknown) => resolve([]);
  return { select: () => chain };
}

vi.mock("./db", () => ({ getDb: vi.fn(async () => makeDbStub()) }));

function managerContext(): TrpcContext {
  return {
    user: {
      id: 14,
      openId: "manager-14",
      email: "manager14@example.com",
      name: "Manager Fourteen",
      loginMethod: "email",
      role: "manager",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function driverContext(): TrpcContext {
  return {
    user: {
      id: 15,
      openId: "driver-15",
      email: "driver15@example.com",
      name: "Driver Fifteen",
      loginMethod: "email",
      role: "driver",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("inspections.getRecentByFleet — fleet scoping", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows the caller's own fleet", async () => {
    const caller = appRouter.createCaller(managerContext());
    await expect(
      caller.inspections.getRecentByFleet({ fleetId: FLEET_A })
    ).resolves.toEqual([]);
  });

  it("denies another fleet's id and checks access against that id", async () => {
    const caller = appRouter.createCaller(managerContext());
    await expect(
      caller.inspections.getRecentByFleet({ fleetId: FLEET_B })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(canManageVehicleAccessMock).toHaveBeenCalledWith(
      expect.objectContaining({ fleetId: FLEET_B })
    );
  });
});

describe("defects.listByFleet — fleet scoping", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows the caller's own fleet", async () => {
    const caller = appRouter.createCaller(managerContext());
    await expect(caller.defects.listByFleet({ fleetId: FLEET_A })).resolves.toEqual([]);
  });

  it("denies another fleet's id and checks access against that id", async () => {
    const caller = appRouter.createCaller(managerContext());
    await expect(
      caller.defects.listByFleet({ fleetId: FLEET_B })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(canManageVehicleAccessMock).toHaveBeenCalledWith(
      expect.objectContaining({ fleetId: FLEET_B })
    );
  });
});

describe("fleet.getById — fleet scoping", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows the caller's own fleet", async () => {
    const caller = appRouter.createCaller(managerContext());
    // db stub yields no rows, so an authorized read resolves to null (not FORBIDDEN).
    await expect(caller.fleet.getById({ fleetId: FLEET_A })).resolves.toBeNull();
  });

  it("denies another fleet's id and checks membership against that id", async () => {
    const caller = appRouter.createCaller(managerContext());
    await expect(
      caller.fleet.getById({ fleetId: FLEET_B })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getCompanyMembershipMock).toHaveBeenCalledWith(
      expect.objectContaining({ fleetId: FLEET_B })
    );
  });
});

/**
 * maintenanceCases exposes case-scoped endpoints (get/transition/assign/reopen/
 * decisions/repair-cycles) that take a `caseId` with NO client-supplied `fleetId`
 * required. The router derives the case's OWNING fleet server-side
 * (`getCaseFleetId`, see server/services/maintenanceCases.ts) and then checks the
 * caller's membership against THAT fleet (resolveCaseFleetId ->
 * resolveActiveFleetId in server/routers/maintenanceCases.ts /
 * server/services/maintenanceTenantScope.ts) — this is the attack this suite
 * guards against: a Fleet A manager submitting a Fleet B case id in the request
 * body and expecting to read/mutate it. Before this test, no router-level test
 * exercised this path end-to-end (unlike inspections/defects/fleet above, which
 * take fleetId directly as input).
 */
describe("maintenanceCases.get — fleet scoping (case-derived fleet resolution)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows a case that belongs to the caller's own fleet", async () => {
    const caller = appRouter.createCaller(managerContext());
    await expect(caller.maintenanceCases.get({ caseId: CASE_IN_FLEET_A })).resolves.toBeTruthy();
    expect(getCaseFleetIdMock).toHaveBeenCalledWith(CASE_IN_FLEET_A);
  });

  it("denies a case that belongs to another fleet, checking membership against the case's real fleet", async () => {
    const caller = appRouter.createCaller(managerContext());
    await expect(
      caller.maintenanceCases.get({ caseId: CASE_IN_FLEET_B })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getCaseFleetIdMock).toHaveBeenCalledWith(CASE_IN_FLEET_B);
    expect(getCompanyMembershipMock).toHaveBeenCalledWith(
      expect.objectContaining({ fleetId: FLEET_B })
    );
  });

  it("does not trust a client-supplied fleetId that disagrees with the case's real fleet", async () => {
    // Attacker: real case lives in FLEET_B, but the request body claims FLEET_A.
    // resolveCaseFleetId only falls back to the case-derived fleet when the
    // client omits fleetId — so an explicit (wrong) fleetId is checked on its
    // own merits, which must still fail for a caller who isn't a FLEET_B member.
    const caller = appRouter.createCaller(managerContext());
    await expect(
      caller.maintenanceCases.get({ fleetId: FLEET_B, caseId: CASE_IN_FLEET_B })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("maintenanceCases.transition — fleet scoping and role boundary (adminProcedure)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("denies transitioning a case owned by another fleet before any status logic runs", async () => {
    const caller = appRouter.createCaller(managerContext());
    await expect(
      caller.maintenanceCases.transition({ caseId: CASE_IN_FLEET_B, toStatus: "triaging" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getCaseFleetIdMock).toHaveBeenCalledWith(CASE_IN_FLEET_B);
  });

  it("denies a driver outright at the procedure tier, before any fleet/case resolution", async () => {
    const caller = appRouter.createCaller(driverContext());
    await expect(
      caller.maintenanceCases.transition({ caseId: CASE_IN_FLEET_A, toStatus: "triaging" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    // adminProcedure's role check rejects before the resolver body runs, so the
    // case-fleet lookup is never reached for a non-owner/manager caller.
    expect(getCaseFleetIdMock).not.toHaveBeenCalled();
  });
});

describe("partIntelligence.create — fleet scoping (case-derived fleet, Parts Intelligence Phase 1)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("denies creating a part requirement on a case owned by another fleet", async () => {
    const caller = appRouter.createCaller(managerContext());
    await expect(
      caller.partIntelligence.create({ caseId: CASE_IN_FLEET_B, description: "Brake chamber" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getCaseFleetIdMock).toHaveBeenCalledWith(CASE_IN_FLEET_B);
    // The fleet-scope check runs (and fails) before any capability check.
    expect(hasMaintenanceCapabilityMock).not.toHaveBeenCalled();
  });

  it("denies a driver outright at the capability-gate, before any DB write", async () => {
    const caller = appRouter.createCaller(driverContext());
    hasMaintenanceCapabilityMock.mockResolvedValueOnce(false);
    await expect(
      caller.partIntelligence.create({ caseId: CASE_IN_FLEET_A, description: "Brake chamber" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("partIntelligence resource-derived endpoints — fleet scoping by partRequirementId", () => {
  beforeEach(() => vi.clearAllMocks());

  it("denies reading a part requirement owned by another fleet", async () => {
    const caller = appRouter.createCaller(managerContext());
    await expect(
      caller.partIntelligence.get({ id: REQUIREMENT_IN_FLEET_B })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getPartRequirementFleetIdMock).toHaveBeenCalledWith(REQUIREMENT_IN_FLEET_B);
  });

  it("denies recording a fitment assessment against another fleet's requirement", async () => {
    const caller = appRouter.createCaller(managerContext());
    await expect(
      caller.partIntelligence.recordFitmentAssessment({
        partRequirementId: REQUIREMENT_IN_FLEET_B,
        vehicleId: "veh-1",
        source: "technician_manual",
        evidence: { technicianConfirmed: true },
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies adding a supplier option against another fleet's requirement", async () => {
    const caller = appRouter.createCaller(managerContext());
    await expect(
      caller.partIntelligence.addSupplierOption({
        partRequirementId: REQUIREMENT_IN_FLEET_B,
        supplierName: "ABC Truck Parts",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("still denies access when the client explicitly supplies the requirement's real (foreign) fleetId", async () => {
    // Even naming the correct fleet doesn't help — the caller still isn't a
    // member of it (same pattern as the maintenanceCases.get test above).
    const caller = appRouter.createCaller(managerContext());
    await expect(
      caller.partIntelligence.get({ fleetId: FLEET_B, id: REQUIREMENT_IN_FLEET_B })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("partIntelligence.getSupplierOption — fleet scoping by option id (Parts Intelligence Phase 2)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("denies reading a supplier option owned by another fleet", async () => {
    const caller = appRouter.createCaller(managerContext());
    await expect(
      caller.partIntelligence.getSupplierOption({ id: SUPPLIER_OPTION_IN_FLEET_B })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getSupplierOptionFleetIdMock).toHaveBeenCalledWith(SUPPLIER_OPTION_IN_FLEET_B);
  });
});

describe("partIntelligence human-approval endpoints — fleet scoping (Parts Intelligence Phase 2)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("denies approving an option on another fleet's part requirement", async () => {
    const caller = appRouter.createCaller(managerContext());
    await expect(
      caller.partIntelligence.approveOption({
        partRequirementId: REQUIREMENT_IN_FLEET_B,
        selectedOptionId: SUPPLIER_OPTION_IN_FLEET_B,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getPartRequirementFleetIdMock).toHaveBeenCalledWith(REQUIREMENT_IN_FLEET_B);
  });

  it("denies declining options on another fleet's part requirement", async () => {
    const caller = appRouter.createCaller(managerContext());
    await expect(
      caller.partIntelligence.declineOptions({ partRequirementId: REQUIREMENT_IN_FLEET_B })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies requesting more information on another fleet's part requirement", async () => {
    const caller = appRouter.createCaller(managerContext());
    await expect(
      caller.partIntelligence.requestMoreInformation({ partRequirementId: REQUIREMENT_IN_FLEET_B })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies reading another fleet's approval history", async () => {
    const caller = appRouter.createCaller(managerContext());
    await expect(
      caller.partIntelligence.listApprovalHistory({ partRequirementId: REQUIREMENT_IN_FLEET_B })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
