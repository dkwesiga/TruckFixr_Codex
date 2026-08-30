import { beforeEach, describe, expect, it, vi } from "vitest";

// Minimal in-memory mock of the drizzle query builder, following the same
// pattern as maintenanceDecisions.test.ts — covers only the chains
// reopenCase() uses.
const { store, mockDb } = vi.hoisted(() => {
  const store = {
    cases: [] as any[],
    cycles: [] as any[],
  };

  function tableName(tbl: any): string {
    return tbl?._name ?? tbl;
  }

  const chain = (rows: any[]) => {
    const c: any = {
      _rows: rows,
      from() { return c; },
      where(pred: any) { c._rows = c._rows.filter(pred?.__match ?? (() => true)); return c; },
      limit() { return Promise.resolve(c._rows); },
      then(res: any) { return Promise.resolve(c._rows).then(res); },
    };
    return c;
  };

  const mockDb = {
    getDb: async () => ({
      select: () => ({
        from: (tbl: any) => chain(tableName(tbl) === "maintenanceCases" ? store.cases : store.cycles),
      }),
      update: (tbl: any) => ({
        set: (patch: any) => ({
          where: async (pred: any) => {
            const rows = tableName(tbl) === "maintenanceCases" ? store.cases : store.cycles;
            for (const r of rows) {
              if (!pred || (pred.__match ? pred.__match(r) : true)) Object.assign(r, patch);
            }
          },
        }),
      }),
    }),
    reset: () => {
      store.cases = [];
      store.cycles = [];
    },
  };
  return { store, mockDb };
});

vi.mock("drizzle-orm", () => ({
  and: (...ps: any[]) => ({ __match: (r: any) => ps.every((p) => (p?.__match ? p.__match(r) : true)) }),
  eq: (col: any, val: any) => ({ __match: (r: any) => r[col?.__col ?? col] === val }),
  desc: () => ({}),
}));

vi.mock("../../drizzle/schema", () => {
  const mk = (name: string) =>
    new Proxy({ _name: name }, {
      get: (t: any, prop: string) => (prop === "_name" ? name : { __col: prop }),
    });
  return { maintenanceCases: mk("maintenanceCases"), maintenanceDecisions: mk("maintenanceDecisions"), repairCycles: mk("repairCycles") };
});

vi.mock("../db", () => ({ getDb: mockDb.getDb }));
vi.mock("./maintenanceActivityLog", () => ({ logMaintenanceActivity: async () => {} }));
vi.mock("./maintenanceCaseReference", () => ({ nextCaseReference: async () => "MC-2026-000099" }));

import { getCaseFleetId, reopenCase } from "./maintenanceCases";

const FLEET = 1;
const CASE = 100;

beforeEach(() => {
  mockDb.reset();
});

describe("getCaseFleetId", () => {
  it("resolves a case's actual fleet regardless of which fleet is 'active' for the caller", async () => {
    const OTHER_FLEET = 2;
    store.cases.push({ id: CASE, fleetId: OTHER_FLEET, reference: "MC-2026-000001", status: "reported" });
    await expect(getCaseFleetId(CASE)).resolves.toBe(OTHER_FLEET);
  });

  it("returns null for a case id that doesn't exist", async () => {
    await expect(getCaseFleetId(999)).resolves.toBeNull();
  });
});

describe("reopenCase", () => {
  it("reopens a closed case", async () => {
    store.cases.push({ id: CASE, fleetId: FLEET, reference: "MC-2026-000001", status: "closed" });
    await reopenCase({ fleetId: FLEET, caseId: CASE, actorUserId: 9, reason: "customer called back" });
    expect(store.cases[0].status).toBe("reopened");
  });

  it("reopens a return_job case through the explicit reopen path", async () => {
    store.cases.push({ id: CASE, fleetId: FLEET, reference: "MC-2026-000001", status: "return_job" });
    await reopenCase({ fleetId: FLEET, caseId: CASE, actorUserId: 9, reason: "return job was a mistake" });
    expect(store.cases[0].status).toBe("reopened");
  });

  it("refuses to reopen an in-progress case", async () => {
    store.cases.push({ id: CASE, fleetId: FLEET, reference: "MC-2026-000001", status: "in_repair" });
    await expect(
      reopenCase({ fleetId: FLEET, caseId: CASE, actorUserId: 9, reason: "x" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("requires a reason", async () => {
    store.cases.push({ id: CASE, fleetId: FLEET, reference: "MC-2026-000001", status: "closed" });
    await expect(
      reopenCase({ fleetId: FLEET, caseId: CASE, actorUserId: 9, reason: "  " })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
