import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ store: { seq: 0, rows: {} as Record<string, any[]> } }));

vi.mock("../db", () => ({
  getDb: async () => {
    const { getTableName } = await import("drizzle-orm");
    const rowsFor = (name: string) => (h.store.rows[name] ??= []);
    const insert = (tbl: any) => ({
      values(vals: any) {
        const row = { id: ++h.store.seq, ...vals };
        rowsFor(getTableName(tbl)).push(row);
        const p: Promise<any> = Promise.resolve(undefined);
        return { returning: async () => [row], then: p.then.bind(p), catch: p.catch.bind(p) };
      },
    });
    const select = () => ({
      from(tbl: any) {
        const name = getTableName(tbl);
        const current = () => rowsFor(name).map((r) => ({ ...r }));
        const chain: any = {
          where: () => chain,
          orderBy: () => chain,
          limit: async (n: number) => current().slice(0, n),
          then: (res: any, rej: any) => Promise.resolve(current()).then(res, rej),
        };
        return chain;
      },
    });
    const update = (tbl: any) => ({
      set: (vals: any) => ({
        where: async () => {
          const arr = rowsFor(getTableName(tbl));
          if (arr[0]) Object.assign(arr[0], vals);
        },
      }),
    });
    return { insert, select, update };
  },
}));

import {
  decisionTimeMinutes,
  isRepeatWithin30Days,
  recordOutcome,
  vehicleKey,
} from "./guestCaseOutcomes";

const guestRows = () => h.store.rows["guestCases"] ?? [];

beforeEach(() => {
  h.store.seq = 10;
  h.store.rows = {};
});

describe("decisionTimeMinutes", () => {
  it("computes minutes and tolerates missing values", () => {
    const from = new Date("2026-07-20T12:00:00Z");
    const to = new Date("2026-07-20T13:30:00Z");
    expect(decisionTimeMinutes(from, to)).toBe(90);
    expect(decisionTimeMinutes(null, to)).toBeNull();
    expect(decisionTimeMinutes(from, null)).toBeNull();
  });
});

describe("vehicleKey", () => {
  it("prefers VIN, falls back to unit, else null", () => {
    expect(vehicleKey({ vin: "1fujgldr", unitNumber: "214" })).toBe("vin:1FUJGLDR");
    expect(vehicleKey({ unitNumber: "214" })).toBe("unit:214");
    expect(vehicleKey({})).toBeNull();
    expect(vehicleKey(null)).toBeNull();
  });
});

describe("isRepeatWithin30Days", () => {
  const now = new Date("2026-07-20T00:00:00Z");
  it("flags a prior confirmed repair on the same vehicle within 30 days", () => {
    expect(
      isRepeatWithin30Days({
        currentId: 2,
        currentVehicle: { vin: "ABC" },
        referenceAt: now,
        priorCases: [{ id: 1, confirmedRepair: true, repairCompletedAt: new Date("2026-07-05T00:00:00Z"), vehicleIdentifier: { vin: "ABC" } }],
      })
    ).toBe(true);
  });
  it("does not flag a different vehicle, an unconfirmed prior, or one older than 30 days", () => {
    const base = { currentId: 2, currentVehicle: { vin: "ABC" }, referenceAt: now };
    expect(isRepeatWithin30Days({ ...base, priorCases: [{ id: 1, confirmedRepair: true, repairCompletedAt: new Date("2026-07-05T00:00:00Z"), vehicleIdentifier: { vin: "XYZ" } }] })).toBe(false);
    expect(isRepeatWithin30Days({ ...base, priorCases: [{ id: 1, confirmedRepair: false, repairCompletedAt: new Date("2026-07-05T00:00:00Z"), vehicleIdentifier: { vin: "ABC" } }] })).toBe(false);
    expect(isRepeatWithin30Days({ ...base, priorCases: [{ id: 1, confirmedRepair: true, repairCompletedAt: new Date("2026-05-01T00:00:00Z"), vehicleIdentifier: { vin: "ABC" } }] })).toBe(false);
    expect(isRepeatWithin30Days({ ...base, currentId: 1, priorCases: [{ id: 1, confirmedRepair: true, repairCompletedAt: new Date("2026-07-05T00:00:00Z"), vehicleIdentifier: { vin: "ABC" } }] })).toBe(false); // excludes self
  });
});

describe("recordOutcome", () => {
  it("records an outcome, defaults evidence to unknown, and closes the case", async () => {
    h.store.rows["guestCases"] = [
      { id: 1, publicToken: "tok", vehicleIdentifier: { vin: "ABC" }, createdAt: new Date(), customerReadiness: "service_soon", internalSeverity: "attention" },
    ];
    const res = await recordOutcome({ publicToken: "tok", confirmedRepair: true, actualDowntimeHours: 4.5 });
    expect(res.confirmedRepair).toBe(true);
    expect(res.evidenceSource).toBe("unknown");
    expect(guestRows()[0].status).toBe("closed");
    expect(guestRows()[0].outcomeConfirmedAt).toBeInstanceOf(Date);
    expect(guestRows()[0].actualDowntimeHours).toBe("4.5"); // numeric stored as string
    expect(h.store.rows["analyticsEvents"]?.[0]?.event).toBe("outcome_confirmed");
  });

  it("flags a repeat issue when a prior confirmed repair on the same vehicle is within 30 days", async () => {
    const now = new Date();
    h.store.rows["guestCases"] = [
      { id: 1, publicToken: "current", vehicleIdentifier: { vin: "ABC" }, createdAt: now },
      { id: 2, confirmedRepair: true, repairCompletedAt: new Date(now.getTime() - 10 * 24 * 3600 * 1000), vehicleIdentifier: { vin: "ABC" } },
    ];
    const res = await recordOutcome({ publicToken: "current", confirmedRepair: true, evidenceSource: "measured" });
    expect(res.repeatIssueWithin30Days).toBe(true);
    expect(guestRows()[0].repeatIssueWithin30Days).toBe(true);
  });

  it("does not force cost/downtime — allows an unknown-evidence confirmation with no numbers", async () => {
    h.store.rows["guestCases"] = [{ id: 1, publicToken: "tok", vehicleIdentifier: { unitNumber: "9" }, createdAt: new Date() }];
    const res = await recordOutcome({ publicToken: "tok", confirmedRepair: true, evidenceSource: "unknown" });
    expect(res.confirmedRepair).toBe(true);
    expect(guestRows()[0].repairCostCents ?? null).toBeNull();
    expect(guestRows()[0].actualDowntimeHours ?? null).toBeNull();
  });
});
