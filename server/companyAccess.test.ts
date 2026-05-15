import { beforeEach, describe, expect, it, vi } from "vitest";

const { select, getDb, queueSelectResults } = vi.hoisted(() => {
  const selectQueue: unknown[][] = [];

  const queueSelectResults = (...results: unknown[][]) => {
    selectQueue.splice(0, selectQueue.length, ...results);
  };

  const select = vi.fn(() => {
    const result = selectQueue.shift() ?? [];
    const chain = {
      from: vi.fn(() => chain),
      where: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      limit: vi.fn(async () => result),
    };
    return chain;
  });

  return {
    select,
    getDb: vi.fn(async () => ({ select })),
    queueSelectResults,
  };
});

vi.mock("./db", () => ({
  getDb,
}));

import { getCompanyMembership, getUserPrimaryFleetId } from "./services/companyAccess";

describe("getCompanyMembership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queueSelectResults();
  });

  it("does not fall back to another fleet membership when a specific fleet is requested", async () => {
    queueSelectResults([], []);

    await expect(getCompanyMembership({ userId: 42, fleetId: 9 })).resolves.toBeNull();
    expect(select).toHaveBeenCalledTimes(2);
  });
});

describe("getUserPrimaryFleetId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queueSelectResults();
  });

  it("prefers an existing company membership", async () => {
    queueSelectResults([
      {
        fleetId: 9,
        userId: 42,
        role: "manager",
        status: "active",
      },
    ]);

    await expect(getUserPrimaryFleetId(42)).resolves.toBe(9);
    expect(select).toHaveBeenCalledTimes(1);
  });

  it("falls back to an owned fleet when no membership exists", async () => {
    queueSelectResults([], [{ id: 7 }]);

    await expect(getUserPrimaryFleetId(42)).resolves.toBe(7);
    expect(select).toHaveBeenCalledTimes(2);
  });

  it("uses an active assignment fleet without mutating company membership", async () => {
    queueSelectResults([], [], [{ fleetId: 11 }]);

    await expect(getUserPrimaryFleetId(42)).resolves.toBe(11);
    expect(select).toHaveBeenCalledTimes(3);
  });

  it("uses a direct assigned vehicle fleet when no membership, ownership, or assignment exists", async () => {
    queueSelectResults([], [], [], [{ fleetId: 13 }]);

    await expect(getUserPrimaryFleetId(42)).resolves.toBe(13);
    expect(select).toHaveBeenCalledTimes(4);
  });

  it("does not infer fleet membership from legacy manager relationships alone", async () => {
    queueSelectResults([], [], [], []);

    await expect(getUserPrimaryFleetId(42)).resolves.toBeNull();
    expect(select).toHaveBeenCalledTimes(4);
  });
});
