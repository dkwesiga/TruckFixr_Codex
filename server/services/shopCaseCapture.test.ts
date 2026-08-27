import { beforeEach, describe, expect, it, vi } from "vitest";

// Repair-shop Phase 1 spec items 3/4: a shop can create/select a vehicle and
// create an issue (case) from a customer complaint. shopCaseCapture.ts
// composes shopVehicleIntake + maintenanceCases + maintenanceDecisions, so
// mock those module boundaries rather than the DB directly.

const { vehicleStore, vehicleIntakeMock, casesMock, decisionsMock, dbMock } = vi.hoisted(() => {
  const vehicleStore: any[] = [
    { id: "veh-1", fleetId: 1, vin: "1FUJA6CV12LJ12345", make: "Freightliner", model: "Cascadia" },
  ];

  const vehicleIntakeMock = {
    ensureShopVehicle: vi.fn(async (input: any) => ({
      vehicle: { id: "veh-new", fleetId: input.fleetId, vin: input.vin ?? null, make: input.make ?? null, model: input.model ?? null },
      provenance: input.vinSource,
    })),
  };

  const casesMock = {
    createManualCase: vi.fn(async (input: any) => ({
      id: 1,
      reference: "MC-2026-000001",
      fleetId: input.fleetId,
      vehicleId: input.vehicleId,
      summary: input.summary,
      title: input.title,
      status: "reported",
    })),
  };

  const decisionsMock = {
    addDecision: vi.fn(async (input: any) => ({ id: 1, ...input })),
  };

  const dbMock = {
    getDb: vi.fn(async () => ({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => vehicleStore,
            orderBy: async () => vehicleStore,
          }),
        }),
      }),
    })),
  };

  return { vehicleStore, vehicleIntakeMock, casesMock, decisionsMock, dbMock };
});

vi.mock("../db", () => ({ getDb: dbMock.getDb }));
vi.mock("../../drizzle/schema", () => ({ vehicles: { id: "id", fleetId: "fleetId" } }));
vi.mock("drizzle-orm", () => ({ eq: () => true, and: () => true }));
vi.mock("./shopVehicleIntake", () => vehicleIntakeMock);
vi.mock("./maintenanceCases", () => casesMock);
vi.mock("./maintenanceDecisions", () => decisionsMock);

import { createShopCase, listShopVehicles } from "./shopCaseCapture";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createShopCase", () => {
  it("creates a new walk-in vehicle and an issue from the complaint", async () => {
    const result = await createShopCase({
      fleetId: 1,
      actorUserId: 9,
      vehicle: { vin: "1FUJA6CV12LJ99999", vinSource: "technician_input" },
      caseType: "diagnostic_troubleshooting",
      complaint: "Loses power going up hills, especially when cold.",
    });

    expect(vehicleIntakeMock.ensureShopVehicle).toHaveBeenCalledTimes(1);
    expect(casesMock.createManualCase).toHaveBeenCalledTimes(1);
    expect(result.case.summary).toBe("Loses power going up hills, especially when cold.");
    // The original complaint is preserved verbatim as the case summary.
    const caseCall = casesMock.createManualCase.mock.calls[0][0];
    expect(caseCall.summary).toBe("Loses power going up hills, especially when cold.");
  });

  it("selects an existing vehicle instead of creating a new one when vehicleId is given", async () => {
    const result = await createShopCase({
      fleetId: 1,
      actorUserId: 9,
      vehicleId: "veh-1",
      caseType: "customer_inquiry",
      complaint: "Intermittent warning light.",
    });

    expect(vehicleIntakeMock.ensureShopVehicle).not.toHaveBeenCalled();
    expect(result.vehicle.id).toBe("veh-1");
  });

  it("requires a non-empty complaint", async () => {
    await expect(
      createShopCase({ fleetId: 1, actorUserId: 9, vehicleId: "veh-1", caseType: "customer_inquiry", complaint: "  " })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("requires exactly one of vehicleId or vehicle intake details", async () => {
    await expect(
      createShopCase({ fleetId: 1, actorUserId: 9, caseType: "customer_inquiry", complaint: "Won't start." })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("listShopVehicles", () => {
  it("returns every vehicle on file for the shop's fleet", async () => {
    const result = await listShopVehicles({ fleetId: 1 });
    expect(result).toEqual(vehicleStore);
  });
});
