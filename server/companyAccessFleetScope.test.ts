import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Application-layer fleet-scoping tests (Batch B).
 *
 * These cover the PRIMARY multi-tenant boundary described in
 * docs/security/tenant-isolation.md: `canManageCompanyOperations` must authorize a
 * user ONLY for fleets they are an active member of or own, and must reject a
 * client-supplied fleetId for any other fleet. RLS is defense-in-depth and does not
 * constrain the application's own DB role, so this logic is the real isolation
 * control and is worth pinning with tests.
 *
 * Mirrors the mocked-db chain pattern in companyAccess.test.ts so no live database
 * is required.
 */
const { select, queueSelectResults } = vi.hoisted(() => {
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

  return { select, queueSelectResults };
});

vi.mock("./db", () => ({
  getDb: vi.fn(async () => ({ select })),
}));

import { canManageCompanyOperations } from "./services/companyAccess";

const manager = { id: 7, role: "manager", email: "mgr@example.com" };
const owner = { id: 7, role: "owner", email: "owner@example.com" };
const driver = { id: 7, role: "driver", email: "driver@example.com" };

const FLEET_A = 1;
const FLEET_B = 2;

describe("canManageCompanyOperations — fleet scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queueSelectResults();
  });

  it("authorizes an active manager for their own fleet", async () => {
    queueSelectResults([
      { fleetId: FLEET_A, userId: manager.id, role: "manager", status: "active" },
    ]);

    await expect(
      canManageCompanyOperations({ fleetId: FLEET_A, user: manager })
    ).resolves.toBe(true);
  });

  it("denies that same manager access to another fleet's id (cross-tenant)", async () => {
    // getCompanyMembership(fleetB): no membership, not owner -> null.
    // canManage fleet-owner fallback: fleet B is owned by someone else.
    queueSelectResults([], [], [{ ownerId: 999 }]);

    await expect(
      canManageCompanyOperations({ fleetId: FLEET_B, user: manager })
    ).resolves.toBe(false);
  });

  it("authorizes a fleet owner via ownership when no membership row exists", async () => {
    // No membership; not surfaced as owner in the membership lookup; but the
    // authoritative fleet-owner check matches the caller.
    queueSelectResults([], [], [{ ownerId: owner.id }]);

    await expect(
      canManageCompanyOperations({ fleetId: FLEET_A, user: owner })
    ).resolves.toBe(true);
  });

  it("does not grant access on an inactive/removed membership", async () => {
    // Membership row exists but is removed -> falls through to owner check, which
    // belongs to someone else.
    queueSelectResults(
      [{ fleetId: FLEET_A, userId: manager.id, role: "manager", status: "removed" }],
      [{ ownerId: 999 }]
    );

    await expect(
      canManageCompanyOperations({ fleetId: FLEET_A, user: manager })
    ).resolves.toBe(false);
  });

  it("denies a driver role outright, with no database lookup", async () => {
    await expect(
      canManageCompanyOperations({ fleetId: FLEET_A, user: driver })
    ).resolves.toBe(false);
    expect(select).not.toHaveBeenCalled();
  });
});
