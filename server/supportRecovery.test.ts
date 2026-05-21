import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { ENV } from "./_core/env";

const {
  getSupportRecoverySnapshot,
  deactivateUserFromFleet,
  moveUserToFleet,
  reassignVehicleFleet,
  reactivateUserInFleet,
  resetPilotCode,
  overrideFleetBillingStatus,
  setVehicleRecoveryStatus,
} = vi.hoisted(() => ({
  getSupportRecoverySnapshot: vi.fn(),
  deactivateUserFromFleet: vi.fn(),
  moveUserToFleet: vi.fn(),
  reassignVehicleFleet: vi.fn(),
  reactivateUserInFleet: vi.fn(),
  resetPilotCode: vi.fn(),
  overrideFleetBillingStatus: vi.fn(),
  setVehicleRecoveryStatus: vi.fn(),
}));

vi.mock("./services/supportRecovery", () => ({
  getSupportRecoverySnapshot,
  deactivateUserFromFleet,
  moveUserToFleet,
  reassignVehicleFleet,
  reactivateUserInFleet,
  resetPilotCode,
  overrideFleetBillingStatus,
  setVehicleRecoveryStatus,
}));

import { supportRecoveryRouter } from "./routers/supportRecovery";

function context(email = "staff@truckfixr.com", role = "driver"): TrpcContext {
  return {
    user: {
      id: 99,
      openId: "staff-99",
      email,
      name: "Support Staff",
      loginMethod: "email",
      role,
      managerEmail: null,
      managerUserId: null,
      subscriptionTier: "free",
      billingCadence: "monthly",
      billingStatus: "active",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripePriceId: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      trialStart: null,
      trialEnd: null,
      cancelAtPeriodEnd: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("support recovery router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ENV.adminEmails = "staff@truckfixr.com";
    getSupportRecoverySnapshot.mockResolvedValue({ fleets: [], users: [], vehicles: [] });
    moveUserToFleet.mockResolvedValue({ targetMembership: { id: 1 } });
    deactivateUserFromFleet.mockResolvedValue({ deactivated: true, revokedAssignments: 2 });
    reassignVehicleFleet.mockResolvedValue({ vehicle: { id: "veh-1" }, assignment: null });
    reactivateUserInFleet.mockResolvedValue({ reactivated: true, membership: { id: 2 } });
    setVehicleRecoveryStatus.mockResolvedValue({ vehicle: { id: "veh-1", status: "retired" } });
    resetPilotCode.mockResolvedValue({ code: { id: 1 }, revokedRedemptions: 1 });
    overrideFleetBillingStatus.mockResolvedValue({ fleet: { id: 1, billingStatus: "active" } });
  });

  it("blocks non-staff users from recovery actions even when they are owners", async () => {
    const caller = supportRecoveryRouter.createCaller(context("owner@example.com", "owner"));

    await expect(
      caller.moveUserToFleet({
        userId: 7,
        toFleetId: 3,
        role: "driver",
        reason: "Wrong company assignment during pilot onboarding",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(moveUserToFleet).not.toHaveBeenCalled();
  });

  it("requires an audit reason before staff can make recovery changes", async () => {
    const caller = supportRecoveryRouter.createCaller(context());

    await expect(
      caller.resetPilotCode({
        codeId: 5,
        reason: "too short",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(resetPilotCode).not.toHaveBeenCalled();
  });

  it("passes staff identity and reason into audited recovery services", async () => {
    const caller = supportRecoveryRouter.createCaller(context());

    await caller.moveUserToFleet({
      userId: 7,
      toFleetId: 3,
      fromFleetId: 2,
      role: "driver",
      reason: "Correct driver company assignment after support verification",
    });

    expect(moveUserToFleet).toHaveBeenCalledWith(
      expect.objectContaining({
        staffUserId: 99,
        userId: 7,
        fromFleetId: 2,
        toFleetId: 3,
        role: "driver",
        reason: "Correct driver company assignment after support verification",
      })
    );
  });

  it("passes staff identity into user deactivation recovery actions", async () => {
    const caller = supportRecoveryRouter.createCaller(context());

    await caller.deactivateUserFromFleet({
      userId: 7,
      fleetId: 3,
      reason: "Deactivate driver access after support verified wrong company assignment",
    });

    expect(deactivateUserFromFleet).toHaveBeenCalledWith(
      expect.objectContaining({
        staffUserId: 99,
        userId: 7,
        fleetId: 3,
        reason: "Deactivate driver access after support verified wrong company assignment",
      })
    );
  });

  it("passes staff identity into vehicle recovery status actions", async () => {
    const caller = supportRecoveryRouter.createCaller(context());

    await caller.setVehicleRecoveryStatus({
      vehicleId: "veh-1",
      status: "retired",
      assetRecordStatus: "archived",
      reason: "Archive duplicate vehicle record after support verification",
    });

    expect(setVehicleRecoveryStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        staffUserId: 99,
        vehicleId: "veh-1",
        status: "retired",
        assetRecordStatus: "archived",
        reason: "Archive duplicate vehicle record after support verification",
      })
    );
  });

  it("passes staff identity into user reactivation recovery actions", async () => {
    const caller = supportRecoveryRouter.createCaller(context());

    await caller.reactivateUserInFleet({
      userId: 7,
      fleetId: 3,
      role: "driver",
      vehicleId: "veh-2",
      reason: "Reactivate driver after support verified the company and vehicle assignment",
    });

    expect(reactivateUserInFleet).toHaveBeenCalledWith(
      expect.objectContaining({
        staffUserId: 99,
        userId: 7,
        fleetId: 3,
        role: "driver",
        vehicleId: "veh-2",
        reason: "Reactivate driver after support verified the company and vehicle assignment",
      })
    );
  });
});
