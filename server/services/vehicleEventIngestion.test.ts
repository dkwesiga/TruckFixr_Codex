import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => {
  const state = {
    selectQueue: [] as unknown[][],
    inserted: [] as unknown[],
    failInsert: false,
  };

  const select = () => {
    const result = state.selectQueue.shift() ?? [];
    const chain = {
      from: () => chain,
      where: async () => result,
    };
    return chain;
  };

  const insert = () => ({
    values: async (rows: unknown) => {
      if (state.failInsert) throw new Error("batch failed");
      if (Array.isArray(rows)) state.inserted.push(...rows);
      else state.inserted.push(rows);
    },
  });

  const mockDb = {
    getDb: async () => ({ select, insert }),
    queueSelects: (...r: unknown[][]) => {
      state.selectQueue.splice(0, state.selectQueue.length, ...r);
    },
    inserted: () => state.inserted,
    reset: () => {
      state.selectQueue.splice(0, state.selectQueue.length);
      state.inserted.splice(0, state.inserted.length);
      state.failInsert = false;
    },
  };
  return { mockDb };
});

vi.mock("../db", () => ({ getDb: mockDb.getDb }));
vi.mock("./maintenanceActivityLog", () => ({
  logMaintenanceActivity: async () => {},
}));

import { ingestVehicleEvents } from "./vehicleEventIngestion";

const FLEET = 1;

beforeEach(() => {
  mockDb.reset();
});

describe("ingestVehicleEvents", () => {
  it("imports a valid structured event and marks it trusted", async () => {
    mockDb.queueSelects(
      [{ id: "veh-1" }], // fleet vehicles
      [] // existing idempotency keys
    );
    const summary = await ingestVehicleEvents({
      fleetId: FLEET,
      actorUserId: 5,
      channel: "manual",
      events: [
        {
          vehicleId: "veh-1",
          source: "manual",
          eventType: "odometer",
          eventTimestamp: "2026-07-20T12:00:00Z",
          odometerKm: 123456.789,
        },
      ],
    });
    expect(summary.imported).toBe(1);
    expect(summary.invalid).toBe(0);
    const row = mockDb.inserted()[0] as any;
    expect(row.trustStatus).toBe("trusted");
    expect(row.vehicleId).toBe("veh-1");
    expect(row.idempotencyKey).toBeTruthy();
  });

  it("marks free_text events review_required", async () => {
    mockDb.queueSelects([{ id: "veh-1" }], []);
    await ingestVehicleEvents({
      fleetId: FLEET,
      actorUserId: 5,
      channel: "manual",
      events: [
        {
          vehicleId: "veh-1",
          source: "manual",
          eventType: "free_text",
          eventTimestamp: "2026-07-20T12:00:00Z",
        },
      ],
    });
    const row = mockDb.inserted()[0] as any;
    expect(row.trustStatus).toBe("review_required");
  });

  it("rejects a vehicle that is not in the fleet (cross-tenant)", async () => {
    mockDb.queueSelects([{ id: "veh-1" }], []);
    const summary = await ingestVehicleEvents({
      fleetId: FLEET,
      actorUserId: 5,
      channel: "internal_test",
      events: [
        {
          vehicleId: "veh-OTHER",
          source: "manual",
          eventType: "odometer",
          eventTimestamp: "2026-07-20T12:00:00Z",
        },
      ],
    });
    expect(summary.imported).toBe(0);
    expect(summary.invalid).toBe(1);
    expect(summary.errors[0].code).toBe("unknown_vehicle");
  });

  it("categorizes invalid rows without failing the batch", async () => {
    mockDb.queueSelects([{ id: "veh-1" }], []);
    const summary = await ingestVehicleEvents({
      fleetId: FLEET,
      actorUserId: 5,
      channel: "csv",
      events: [
        { vehicleId: "veh-1", source: "manual", eventType: "odometer", eventTimestamp: "2026-07-20T12:00:00Z" },
        { vehicleId: "veh-1", source: "manual", eventType: "not_a_type", eventTimestamp: "2026-07-20T12:00:00Z" },
        { vehicleId: "veh-1", source: "manual", eventType: "odometer", eventTimestamp: "garbage" },
        { source: "manual", eventType: "odometer", eventTimestamp: "2026-07-20T12:00:00Z" },
      ],
    });
    expect(summary.imported).toBe(1);
    expect(summary.invalid).toBe(3);
    expect(summary.total).toBe(4);
  });

  it("de-duplicates identical rows within the same batch", async () => {
    mockDb.queueSelects([{ id: "veh-1" }], []);
    const event = {
      vehicleId: "veh-1",
      source: "geotab",
      sourceEventId: "evt-1",
      eventType: "dtc_detected",
      eventTimestamp: "2026-07-20T12:00:00Z",
    };
    const summary = await ingestVehicleEvents({
      fleetId: FLEET,
      actorUserId: 5,
      channel: "csv",
      events: [event, { ...event }],
    });
    expect(summary.imported).toBe(1);
    expect(summary.duplicate).toBe(1);
  });

  it("treats already-stored idempotency keys as duplicates", async () => {
    // The existing-keys select must return the key the row will compute. Easiest
    // is to import once, capture the key, then re-run with it pre-existing.
    mockDb.queueSelects([{ id: "veh-1" }], []);
    await ingestVehicleEvents({
      fleetId: FLEET,
      actorUserId: 5,
      channel: "manual",
      events: [
        { vehicleId: "veh-1", source: "geotab", sourceEventId: "evt-9", eventType: "dtc_detected", eventTimestamp: "2026-07-20T12:00:00Z" },
      ],
    });
    const key = (mockDb.inserted()[0] as any).idempotencyKey;
    mockDb.reset();

    mockDb.queueSelects([{ id: "veh-1" }], [{ idempotencyKey: key }]);
    const summary = await ingestVehicleEvents({
      fleetId: FLEET,
      actorUserId: 5,
      channel: "manual",
      events: [
        { vehicleId: "veh-1", source: "geotab", sourceEventId: "evt-9", eventType: "dtc_detected", eventTimestamp: "2026-07-20T12:00:00Z" },
      ],
    });
    expect(summary.imported).toBe(0);
    expect(summary.duplicate).toBe(1);
  });
});
