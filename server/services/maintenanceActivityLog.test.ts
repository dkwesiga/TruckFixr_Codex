import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => {
  const state = { inserted: [] as unknown[] };
  const insert = () => ({
    values: async (row: unknown) => {
      state.inserted.push(row);
    },
  });
  const mockDb = {
    getDb: async () => ({ insert }),
    lastInserted: () => state.inserted[state.inserted.length - 1] as any,
    reset: () => {
      state.inserted.splice(0, state.inserted.length);
    },
  };
  return { mockDb };
});

vi.mock("../db", () => ({ getDb: mockDb.getDb }));

import { logMaintenanceActivity } from "./maintenanceActivityLog";

beforeEach(() => {
  mockDb.reset();
});

describe("logMaintenanceActivity redaction", () => {
  it("redacts forbidden keys and never writes secrets", async () => {
    await logMaintenanceActivity({
      fleetId: 1,
      userId: 2,
      action: "repair_document_uploaded",
      entityType: "repairDocument",
      entityId: 42,
      details: {
        filename: "invoice.pdf",
        signedUrl: "https://storage/secret?sig=abc",
        storageKey: "maintenance-cases/1/42/invoice.pdf",
        jwt: "eyJ...",
        nested: { password: "hunter2", ok: "value" },
      },
    });

    const row = mockDb.lastInserted();
    expect(row.action).toBe("repair_document_uploaded");
    expect(row.entityId).toBe(42);
    const serialized = JSON.stringify(row.details);
    expect(serialized).not.toContain("https://storage/secret");
    expect(serialized).not.toContain("hunter2");
    expect(serialized).not.toContain("eyJ...");
    expect(row.details.filename).toBe("invoice.pdf");
    expect(row.details.signedUrl).toBe("[redacted]");
    expect(row.details.nested.password).toBe("[redacted]");
    expect(row.details.nested.ok).toBe("value");
  });

  it("merges entityRef into details", async () => {
    await logMaintenanceActivity({
      fleetId: 1,
      userId: 2,
      action: "vehicle_out_of_service",
      entityRef: "MC-2026-000123",
    });
    const row = mockDb.lastInserted();
    expect(row.details.entityRef).toBe("MC-2026-000123");
  });
});
