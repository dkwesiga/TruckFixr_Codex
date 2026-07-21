import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the DB layer with a queue of select() results, mirroring the pattern in
// companyAccessFleetScope.test.ts.
const { mockDb } = vi.hoisted(() => {
  const state = { queue: [] as unknown[][], dbNull: false };

  const select = () => {
    const result = state.queue.shift() ?? [];
    const chain = {
      from: () => chain,
      where: () => chain,
      limit: async () => result,
      // getFleetMaintenanceCapabilities awaits the where() directly (no limit()).
      then: (resolve: (rows: unknown[]) => unknown) => resolve(result),
    };
    return chain;
  };

  const mockDb = {
    getDb: async () => (state.dbNull ? null : { select }),
    queueSelectResults: (...results: unknown[][]) => {
      state.queue.splice(0, state.queue.length, ...results);
    },
    setDbNull: (value: boolean) => {
      state.dbNull = value;
    },
  };
  return { mockDb };
});

vi.mock("../db", () => ({ getDb: mockDb.getDb }));

// Keep the activity log a no-op in these tests.
vi.mock("./maintenanceActivityLog", () => ({
  logMaintenanceActivity: async () => {},
}));

const { queueSelectResults, setDbNull } = mockDb;

import {
  getFleetMaintenanceCapabilities,
  isFleetCapabilityEnabled,
  isFleetFeatureEnabled,
  requireFleetFeature,
} from "./fleetFeatures";
import {
  FLEET_MAINTENANCE_CAPABILITY_FLAGS,
  FLEET_MAINTENANCE_UMBRELLA_FLAG,
} from "@shared/maintenance/featureKeys";

beforeEach(() => {
  vi.clearAllMocks();
  setDbNull(false);
  queueSelectResults();
});

describe("fleet feature flags — fail closed", () => {
  it("returns false when no row exists (default disabled)", async () => {
    queueSelectResults([]);
    await expect(
      isFleetFeatureEnabled(1, FLEET_MAINTENANCE_UMBRELLA_FLAG)
    ).resolves.toBe(false);
  });

  it("returns false when the database is unavailable", async () => {
    setDbNull(true);
    await expect(
      isFleetFeatureEnabled(1, FLEET_MAINTENANCE_UMBRELLA_FLAG)
    ).resolves.toBe(false);
  });

  it("returns true only when a row is explicitly enabled", async () => {
    queueSelectResults([
      { fleetId: 1, featureKey: FLEET_MAINTENANCE_UMBRELLA_FLAG, enabled: true, valueJson: null },
    ]);
    await expect(
      isFleetFeatureEnabled(1, FLEET_MAINTENANCE_UMBRELLA_FLAG)
    ).resolves.toBe(true);
  });
});

describe("capability gating requires the umbrella flag", () => {
  it("capability enabled but umbrella disabled -> effective false", async () => {
    // isFleetCapabilityEnabled issues two selects: umbrella, then capability.
    queueSelectResults(
      [], // umbrella: not enabled
      [
        {
          fleetId: 1,
          featureKey: FLEET_MAINTENANCE_CAPABILITY_FLAGS.maintenanceCases,
          enabled: true,
          valueJson: null,
        },
      ]
    );
    await expect(
      isFleetCapabilityEnabled(1, FLEET_MAINTENANCE_CAPABILITY_FLAGS.maintenanceCases)
    ).resolves.toBe(false);
  });

  it("both umbrella and capability enabled -> effective true", async () => {
    queueSelectResults(
      [{ fleetId: 1, featureKey: FLEET_MAINTENANCE_UMBRELLA_FLAG, enabled: true, valueJson: null }],
      [
        {
          fleetId: 1,
          featureKey: FLEET_MAINTENANCE_CAPABILITY_FLAGS.maintenanceCases,
          enabled: true,
          valueJson: null,
        },
      ]
    );
    await expect(
      isFleetCapabilityEnabled(1, FLEET_MAINTENANCE_CAPABILITY_FLAGS.maintenanceCases)
    ).resolves.toBe(true);
  });
});

describe("getFleetMaintenanceCapabilities", () => {
  it("reports everything off when the umbrella flag is absent", async () => {
    queueSelectResults([
      {
        featureKey: FLEET_MAINTENANCE_CAPABILITY_FLAGS.maintenanceCases,
        enabled: true,
      },
    ]);
    const caps = await getFleetMaintenanceCapabilities(1);
    expect(caps.pilotEligible).toBe(false);
    expect(caps.maintenanceCases).toBe(false);
  });

  it("reports individual capabilities when the umbrella is on", async () => {
    queueSelectResults([
      { featureKey: FLEET_MAINTENANCE_UMBRELLA_FLAG, enabled: true },
      { featureKey: FLEET_MAINTENANCE_CAPABILITY_FLAGS.maintenanceCases, enabled: true },
      { featureKey: FLEET_MAINTENANCE_CAPABILITY_FLAGS.pmSchedules, enabled: false },
    ]);
    const caps = await getFleetMaintenanceCapabilities(1);
    expect(caps.pilotEligible).toBe(true);
    expect(caps.maintenanceCases).toBe(true);
    expect(caps.pmSchedules).toBe(false);
    expect(caps.repairDocumentReview).toBe(false);
  });
});

describe("requireFleetFeature", () => {
  it("throws FORBIDDEN when the umbrella flag is off", async () => {
    queueSelectResults([]); // umbrella check -> disabled
    await expect(
      requireFleetFeature(1, FLEET_MAINTENANCE_CAPABILITY_FLAGS.maintenanceCases)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("passes when umbrella and capability are both enabled", async () => {
    queueSelectResults(
      [{ enabled: true }], // umbrella
      [{ enabled: true }] // capability
    );
    await expect(
      requireFleetFeature(1, FLEET_MAINTENANCE_CAPABILITY_FLAGS.maintenanceCases)
    ).resolves.toBeUndefined();
  });
});
