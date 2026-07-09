import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

/**
 * Negative-authz tests for an `adminProcedure` endpoint (Batch B).
 *
 * `adminProcedure` only gates on the customer fleet role (owner/manager) — it does
 * NOT scope to a fleet by itself. Each cross-fleet endpoint must additionally verify
 * the caller's access to the *requested* fleetId. `diagnostics.getManagerActionQueue`
 * is the representative case: a manager must not be able to read another fleet's
 * activity by passing its fleetId. These tests lock that in.
 */
const { canManageVehicleAccessMock } = vi.hoisted(() => ({
  canManageVehicleAccessMock: vi.fn(),
}));

vi.mock("./services/vehicleAccess", async () => {
  const actual = await vi.importActual<typeof import("./services/vehicleAccess")>(
    "./services/vehicleAccess"
  );
  return { ...actual, canManageVehicleAccess: canManageVehicleAccessMock };
});

// Keep the test hermetic: no live database. The handler returns [] when db is null.
vi.mock("./db", () => ({ getDb: vi.fn(async () => null) }));

function contextForRole(role: "owner" | "manager" | "driver"): TrpcContext {
  return {
    user: {
      id: 14,
      openId: `user-${role}-14`,
      email: `${role}14@example.com`,
      name: `User ${role}`,
      loginMethod: "email",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("diagnostics.getManagerActionQueue — cross-fleet authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a driver via the adminProcedure role gate", async () => {
    const caller = appRouter.createCaller(contextForRole("driver"));

    await expect(
      caller.diagnostics.getManagerActionQueue({ fleetId: 2 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    // Never even reaches the fleet-access check.
    expect(canManageVehicleAccessMock).not.toHaveBeenCalled();
  });

  it("rejects a manager who lacks access to the requested fleet", async () => {
    canManageVehicleAccessMock.mockResolvedValue(false);
    const caller = appRouter.createCaller(contextForRole("manager"));

    await expect(
      caller.diagnostics.getManagerActionQueue({ fleetId: 2 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(canManageVehicleAccessMock).toHaveBeenCalledWith(
      expect.objectContaining({ fleetId: 2 })
    );
  });

  it("allows a manager with access to the requested fleet", async () => {
    canManageVehicleAccessMock.mockResolvedValue(true);
    const caller = appRouter.createCaller(contextForRole("manager"));

    await expect(
      caller.diagnostics.getManagerActionQueue({ fleetId: 2 })
    ).resolves.toEqual([]);
  });
});
