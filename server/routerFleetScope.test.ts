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

const { canManageVehicleAccessMock, getCompanyMembershipMock } = vi.hoisted(() => ({
  canManageVehicleAccessMock: vi.fn(async ({ fleetId }: { fleetId: number }) => fleetId === FLEET_A),
  getCompanyMembershipMock: vi.fn(async ({ fleetId }: { fleetId?: number | null }) =>
    fleetId === FLEET_A
      ? { fleetId: FLEET_A, userId: 14, role: "manager", status: "active" }
      : null
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
