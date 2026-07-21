import { beforeEach, describe, expect, it, vi } from "vitest";

// Stateful in-memory mock of the drizzle query builder covering exactly the
// chains maintenanceDecisions.ts uses.
const { store, mockDb } = vi.hoisted(() => {
  const store = {
    cases: [] as any[],
    decisions: [] as any[],
    seq: { decisions: 0 },
  };

  function tableName(tbl: any): string {
    return tbl?._name ?? tbl;
  }

  // Very small predicate model: we ignore the exact drizzle condition objects and
  // instead let each call site filter via the queued matcher.
  const chain = (rows: any[]) => {
    const c: any = {
      _rows: rows,
      from() { return c; },
      where(pred: any) { c._rows = c._rows.filter(pred?.__match ?? (() => true)); return c; },
      orderBy(cmp: any) { if (cmp?.__cmp) c._rows = [...c._rows].sort(cmp.__cmp); return c; },
      limit() { return Promise.resolve(c._rows); },
      then(res: any) { return Promise.resolve(c._rows).then(res); },
    };
    return c;
  };

  const mockDb = {
    getDb: async () => ({
      select: () => ({
        from: (tbl: any) => {
          const name = tableName(tbl);
          return chain(name === "maintenanceCases" ? store.cases : store.decisions);
        },
      }),
      insert: (tbl: any) => ({
        values: (vals: any) => ({
          returning: async () => {
            const name = tableName(tbl);
            const row = { id: ++store.seq.decisions, ...vals };
            if (name === "maintenanceDecisions") store.decisions.push(row);
            return [row];
          },
        }),
      }),
      update: (tbl: any) => ({
        set: (patch: any) => ({
          where: async (pred: any) => {
            const name = tableName(tbl);
            const rows = name === "maintenanceCases" ? store.cases : store.decisions;
            for (const r of rows) {
              if (!pred || (pred.__match ? pred.__match(r) : true)) Object.assign(r, patch);
            }
          },
        }),
      }),
    }),
    reset: () => {
      store.cases = [];
      store.decisions = [];
      store.seq.decisions = 0;
    },
  };
  return { store, mockDb };
});

// drizzle helpers return opaque predicate objects; we replace them with tagged
// matchers so the mock chain can apply them.
vi.mock("drizzle-orm", () => ({
  and: (...ps: any[]) => ({ __match: (r: any) => ps.every((p) => (p?.__match ? p.__match(r) : true)) }),
  eq: (col: any, val: any) => ({ __match: (r: any) => r[col?.__col ?? col] === val }),
  desc: (col: any) => ({ __cmp: (a: any, b: any) => (b[col?.__col ?? col] ?? 0) - (a[col?.__col ?? col] ?? 0) }),
}));

// Provide column proxies whose property access yields a { __col } tag matching
// the object keys we store.
vi.mock("../../drizzle/schema", () => {
  const mk = (name: string) =>
    new Proxy({ _name: name }, {
      get: (t: any, prop: string) => (prop === "_name" ? name : { __col: prop }),
    });
  return {
    maintenanceCases: mk("maintenanceCases"),
    maintenanceDecisions: mk("maintenanceDecisions"),
  };
});

vi.mock("../db", () => ({ getDb: mockDb.getDb }));
vi.mock("./maintenanceActivityLog", () => ({ logMaintenanceActivity: async () => {} }));

import {
  addDecision,
  approveCurrentDecision,
  recordCriticalOverride,
} from "./maintenanceDecisions";

const FLEET = 1;
const CASE = 100;

beforeEach(() => {
  mockDb.reset();
  store.cases.push({ id: CASE, fleetId: FLEET, reference: "MC-2026-000001", severity: null });
});

describe("addDecision versioning", () => {
  it("assigns incrementing versions and keeps exactly one current", async () => {
    await addDecision({
      fleetId: FLEET, caseId: CASE, actorUserId: 5, source: "manual",
      severity: "attention", proposedAction: "schedule_service",
    });
    await addDecision({
      fleetId: FLEET, caseId: CASE, actorUserId: 5, source: "manual",
      severity: "critical", proposedAction: "pull_from_service",
    });

    expect(store.decisions).toHaveLength(2);
    expect(store.decisions[0].version).toBe(1);
    expect(store.decisions[1].version).toBe(2);
    const current = store.decisions.filter((d) => d.isCurrent);
    expect(current).toHaveLength(1);
    expect(current[0].version).toBe(2);
  });

  it("auto-records stable decisions but leaves attention pending", async () => {
    await addDecision({
      fleetId: FLEET, caseId: CASE, actorUserId: 5, source: "manual",
      severity: "stable", proposedAction: "continue_monitor",
    });
    expect(store.decisions[0].approvalState).toBe("auto_recorded");

    await addDecision({
      fleetId: FLEET, caseId: CASE, actorUserId: 5, source: "manual",
      severity: "attention", proposedAction: "schedule_service",
    });
    const latest = store.decisions.find((d) => d.isCurrent);
    expect(latest.approvalState).toBe("pending");
  });
});

describe("approveCurrentDecision", () => {
  it("approves an attention decision", async () => {
    await addDecision({
      fleetId: FLEET, caseId: CASE, actorUserId: 5, source: "manual",
      severity: "attention", proposedAction: "schedule_service",
    });
    await approveCurrentDecision({ fleetId: FLEET, caseId: CASE, actorUserId: 9 });
    const current = store.decisions.find((d) => d.isCurrent);
    expect(current.approvalState).toBe("approved");
    expect(current.approvedByUserId).toBe(9);
  });

  it("refuses plain approval on a critical decision", async () => {
    await addDecision({
      fleetId: FLEET, caseId: CASE, actorUserId: 5, source: "manual",
      severity: "critical", proposedAction: "pull_from_service",
    });
    await expect(
      approveCurrentDecision({ fleetId: FLEET, caseId: CASE, actorUserId: 9 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("recordCriticalOverride", () => {
  it("requires a reason", async () => {
    await expect(
      recordCriticalOverride({ fleetId: FLEET, caseId: CASE, actorUserId: 9, finalAction: "schedule_service", overrideReason: "  " })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("only applies to a critical decision", async () => {
    await addDecision({
      fleetId: FLEET, caseId: CASE, actorUserId: 5, source: "manual",
      severity: "attention", proposedAction: "schedule_service",
    });
    await expect(
      recordCriticalOverride({ fleetId: FLEET, caseId: CASE, actorUserId: 9, finalAction: "schedule_service", overrideReason: "safe per shop" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("creates a new approved version preserving the original recommendation", async () => {
    await addDecision({
      fleetId: FLEET, caseId: CASE, actorUserId: 5, source: "ai",
      severity: "critical", proposedAction: "pull_from_service",
      originalRecommendation: { text: "Stop now" },
    });
    await recordCriticalOverride({
      fleetId: FLEET, caseId: CASE, actorUserId: 9,
      finalAction: "schedule_service", overrideReason: "Shop inspected; safe to move to yard",
    });
    const current = store.decisions.find((d) => d.isCurrent);
    expect(current.version).toBe(2);
    expect(current.overrideState).toBe("overridden");
    expect(current.overrideReason).toContain("Shop inspected");
    expect(current.finalAction).toBe("schedule_service");
    expect(current.approvalState).toBe("approved");
    expect(current.approvedByUserId).toBe(9);
    // Original AI recommendation preserved.
    expect(current.originalRecommendationJson).toEqual({ text: "Stop now" });
  });
});
