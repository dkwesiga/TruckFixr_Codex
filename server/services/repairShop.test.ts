import { beforeEach, describe, expect, it, vi } from "vitest";

// Repair-shop account gating (Phase 1): a "repair shop" is a fleet flagged
// isPartner (the same reusable tenant-kind flag server/routers/partner.ts
// already uses) — deliberately not tied to any specific email/account, so
// any fleet an admin flags isPartner gets the workflow, and a non-partner
// fleet must never inherit it even if it has the maintenance feature and a
// manager/owner caller.

const { store, mockDb, partnerProfileMock, vehicleAccessMock } = vi.hoisted(() => {
  const store = { fleets: [] as any[] };
  const mockDb = {
    getDb: async () => ({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => store.fleets,
          }),
        }),
      }),
    }),
  };
  const partnerProfileMock = { getPartnerProfile: vi.fn(async () => null as any) };
  const vehicleAccessMock = { canManageVehicleAccess: vi.fn(async () => true) };
  return { store, mockDb, partnerProfileMock, vehicleAccessMock };
});

vi.mock("../db", () => ({ getDb: mockDb.getDb }));
vi.mock("../../drizzle/schema", () => ({ fleets: { isPartner: "isPartner" } }));
vi.mock("drizzle-orm", () => ({ eq: () => true }));
vi.mock("./partnerProfiles", () => partnerProfileMock);
vi.mock("./vehicleAccess", () => vehicleAccessMock);

import { assertRepairShopAccess, isRepairShopFleet } from "./repairShop";

beforeEach(() => {
  store.fleets = [];
  vi.clearAllMocks();
  partnerProfileMock.getPartnerProfile.mockResolvedValue(null);
  vehicleAccessMock.canManageVehicleAccess.mockResolvedValue(true);
});

describe("isRepairShopFleet", () => {
  it("is false for an ordinary (non-partner) fleet", async () => {
    store.fleets = [{ isPartner: false }];
    expect(await isRepairShopFleet(1)).toBe(false);
  });

  it("is true for a partner fleet with no explicit profile yet", async () => {
    store.fleets = [{ isPartner: true }];
    expect(await isRepairShopFleet(1)).toBe(true);
  });

  it("respects an explicit non-repair-shop tenantType on the partner profile", async () => {
    store.fleets = [{ isPartner: true }];
    partnerProfileMock.getPartnerProfile.mockResolvedValue({ tenantType: "something_else" });
    expect(await isRepairShopFleet(1)).toBe(false);
  });

  it("is false when the fleet doesn't exist", async () => {
    store.fleets = [];
    expect(await isRepairShopFleet(999)).toBe(false);
  });
});

describe("assertRepairShopAccess", () => {
  const user = { id: 1, role: "owner" };

  it("rejects a non-partner fleet even for its own owner", async () => {
    store.fleets = [{ isPartner: false }];
    await expect(assertRepairShopAccess({ fleetId: 1, user })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects a partner fleet for a caller who doesn't manage it", async () => {
    store.fleets = [{ isPartner: true }];
    vehicleAccessMock.canManageVehicleAccess.mockResolvedValue(false);
    await expect(assertRepairShopAccess({ fleetId: 1, user })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows a partner fleet's manager through", async () => {
    store.fleets = [{ isPartner: true }];
    await expect(assertRepairShopAccess({ fleetId: 1, user })).resolves.toBeUndefined();
  });
});
