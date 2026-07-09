import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDb, queueSelectResults, insertedValues } = vi.hoisted(() => {
  const selectQueue: unknown[][] = [];
  const insertedValues: Array<Record<string, unknown>> = [];

  const db = {
    select: vi.fn(() => {
      const result = selectQueue.shift() ?? [];
      const chain: Record<string, unknown> = {};
      for (const method of ["from", "where", "orderBy"]) {
        chain[method] = vi.fn(() => chain);
      }
      chain.limit = vi.fn(async () => result);
      chain.then = (resolve: (value: unknown[]) => unknown) => resolve(result);
      return chain;
    }),
    insert: vi.fn(() => ({
      values: vi.fn(async (values: Record<string, unknown>) => {
        insertedValues.push(values);
        return [values];
      }),
    })),
  };

  return {
    getDb: vi.fn(async () => db),
    queueSelectResults: (...results: unknown[][]) => {
      selectQueue.splice(0, selectQueue.length, ...results);
    },
    insertedValues,
  };
});

vi.mock("../db", () => ({ getDb }));

import { recordPilotMilestone } from "./pilotAccess";

const redemption = {
  id: 1,
  codeId: 10,
  userId: 7,
  fleetId: 42,
  activatedAt: new Date("2026-07-01T00:00:00.000Z"),
  expiresAt: new Date("2099-07-31T00:00:00.000Z"),
  status: "active",
  createdAt: new Date("2026-07-01T00:00:00.000Z"),
  updatedAt: new Date("2026-07-01T00:00:00.000Z"),
};

const code = {
  id: 10,
  code: "PILOT-AUTHORITATIVE",
  fleetId: 42,
  fleetName: "Authoritative Fleet",
  status: "active",
  maxUsers: 5,
  maxVehicles: 10,
  hardExpiryDate: null,
};

function queueActiveOverview(existingEvent: unknown[] = []) {
  queueSelectResults(
    [redemption],
    [code],
    [{ count: 1 }],
    [{ count: 2 }],
    [{ name: "Authoritative Fleet" }],
    existingEvent
  );
}

describe("recordPilotMilestone ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertedValues.splice(0, insertedValues.length);
    queueSelectResults();
  });

  it("persists the fleet from the active pilot redemption and remains idempotent", async () => {
    queueActiveOverview();

    await recordPilotMilestone({
      userId: 7,
      eventType: "upgrade_prompt_shown",
      eventMetadata: { source: "driver_dashboard" },
    });

    queueActiveOverview([{ id: 99 }]);

    await recordPilotMilestone({
      userId: 7,
      eventType: "upgrade_prompt_shown",
      eventMetadata: { source: "driver_dashboard" },
    });

    expect(insertedValues).toHaveLength(1);
    expect(insertedValues[0]).toMatchObject({
      userId: 7,
      fleetId: 42,
      codeId: 10,
      eventType: "upgrade_prompt_shown",
      eventMetadata: { source: "driver_dashboard" },
    });
  });
});
