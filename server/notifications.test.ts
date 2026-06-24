import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { createCallerFactory } from "./_core/trpc";

// vi.mock factories must not reference outer variables (hoisting constraint).
// We use vi.fn() inside the factory, then retrieve the mock via vi.mocked().

vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

vi.mock("./services/vehicleAccess", () => ({
  canManageVehicleAccess: vi.fn(),
}));

import { getDb } from "./db";
import { canManageVehicleAccess } from "./services/vehicleAccess";
import { notificationsRouter } from "./routers/notifications";

const mockGetDb = vi.mocked(getDb);
const mockAccess = vi.mocked(canManageVehicleAccess);

const managerCtx = { user: { id: 1, role: "manager", email: "mgr@test.com" } } as any;
const driverCtx = { user: { id: 2, role: "driver", email: "drv@test.com" } } as any;

const callerFactory = createCallerFactory(notificationsRouter);

function alert(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    fleetId: 10,
    vehicleId: "TRUCK-1",
    alertType: "driver_issue_submitted",
    status: "open",
    title: "New issue",
    body: null,
    defectId: null,
    inspectionId: null,
    metadata: null,
    createdAt: new Date("2026-06-23T10:00:00Z"),
    updatedAt: new Date("2026-06-23T10:00:00Z"),
    ...overrides,
  };
}

// Builds a Drizzle-style chain whose terminal call resolves to `rows`.
function selectChain(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const orderBy = vi.fn(() => ({ limit }));
  const where = vi.fn(() => ({ orderBy, limit }));
  const from = vi.fn(() => ({ where, orderBy }));
  return { select: vi.fn(() => ({ from })) };
}

function countChain(count: number) {
  const where = vi.fn().mockResolvedValue([{ count }]);
  const from = vi.fn(() => ({ where }));
  return { select: vi.fn(() => ({ from })) };
}

function updateChain() {
  const updateWhere = vi.fn().mockResolvedValue([]);
  const set = vi.fn(() => ({ where: updateWhere }));
  return { update: vi.fn(() => ({ set })) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("notifications.list", () => {
  it("returns alerts for an authorized manager", async () => {
    mockAccess.mockResolvedValue(true);
    const rows = [alert()];
    const db = selectChain(rows) as any;
    mockGetDb.mockResolvedValue(db);

    const result = await callerFactory(managerCtx).list({ fleetId: 10 });
    expect(result).toEqual(rows);
    expect(mockAccess).toHaveBeenCalledWith({ fleetId: 10, user: { id: 1, role: "manager" } });
  });

  it("throws FORBIDDEN when user has no fleet access", async () => {
    mockAccess.mockResolvedValue(false);
    await expect(callerFactory(managerCtx).list({ fleetId: 10 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("notifications.unreadCount", () => {
  it("returns 0 when user lacks access", async () => {
    mockAccess.mockResolvedValue(false);
    const count = await callerFactory(driverCtx).unreadCount({ fleetId: 10 });
    expect(count).toBe(0);
  });

  it("returns the unread count for an authorized manager", async () => {
    mockAccess.mockResolvedValue(true);
    const db = countChain(3) as any;
    mockGetDb.mockResolvedValue(db);

    const count = await callerFactory(managerCtx).unreadCount({ fleetId: 10 });
    expect(count).toBe(3);
  });
});

describe("notifications.markRead", () => {
  it("marks the alert read and returns success", async () => {
    mockAccess.mockResolvedValue(true);
    const alertRow = alert({ id: 5, fleetId: 10 });

    // First call → select (fetch alert); second call → update
    const selectDb = selectChain([alertRow]) as any;
    const upDb = updateChain() as any;
    const mergedDb = { ...selectDb, ...upDb };
    mockGetDb.mockResolvedValue(mergedDb);

    const result = await callerFactory(managerCtx).markRead({ id: 5 });
    expect(result).toEqual({ success: true });
    expect(mergedDb.update).toHaveBeenCalled();
  });

  it("throws NOT_FOUND when alert does not exist", async () => {
    const db = selectChain([]) as any;
    mockGetDb.mockResolvedValue(db);

    await expect(callerFactory(managerCtx).markRead({ id: 999 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("throws FORBIDDEN when user cannot access the alert's fleet", async () => {
    const alertRow = alert({ id: 5, fleetId: 99 });
    const db = selectChain([alertRow]) as any;
    mockGetDb.mockResolvedValue(db);
    mockAccess.mockResolvedValue(false);

    await expect(callerFactory(managerCtx).markRead({ id: 5 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("notifications.markAllRead", () => {
  it("marks all open alerts read for an authorized manager", async () => {
    mockAccess.mockResolvedValue(true);
    const db = updateChain() as any;
    mockGetDb.mockResolvedValue(db);

    const result = await callerFactory(managerCtx).markAllRead({ fleetId: 10 });
    expect(result).toEqual({ success: true });
    expect(db.update).toHaveBeenCalled();
  });

  it("throws FORBIDDEN when user lacks access", async () => {
    mockAccess.mockResolvedValue(false);
    await expect(callerFactory(managerCtx).markAllRead({ fleetId: 10 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
