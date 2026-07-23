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
        const chain: any = { where: () => chain, orderBy: () => chain, limit: async (n: number) => current().slice(0, n), then: (res: any, rej: any) => Promise.resolve(current()).then(res, rej) };
        return chain;
      },
    });
    const update = (tbl: any) => ({ set: (vals: any) => ({ where: async () => { const arr = rowsFor(getTableName(tbl)); if (arr[0]) Object.assign(arr[0], vals); } }) });
    return { insert, select, update };
  },
}));

import {
  acceptAgreement,
  activatePilot,
  applyForPilot,
  beginCheckout,
  completePilot,
  markPilotPaid,
  recordConversionCredit,
  recordKickoff,
} from "./pilotApplications";

const app = () => h.store.rows["pilotApplications"][0];

beforeEach(() => {
  h.store.seq = 0;
  h.store.rows = {};
});

describe("applyForPilot", () => {
  it("qualifies a small fleet and emits analytics", async () => {
    const res = await applyForPilot({ fleetName: "Brampton Freight", vehicleCount: 4, expectedCases30d: 3 });
    expect(res.qualificationResult).toBe("qualified");
    expect(res.state).toBe("qualified");
    const events = (h.store.rows["analyticsEvents"] ?? []).map((e) => e.event);
    expect(events).toContain("pilot_interest_submitted");
    expect(events).toContain("pilot_qualified");
  });

  it("declines a zero-vehicle application", async () => {
    const res = await applyForPilot({ fleetName: "No Trucks Co", vehicleCount: 0 });
    expect(res.qualificationResult).toBe("not_a_fit");
    expect(res.state).toBe("declined");
  });
});

describe("payment does not activate; full activation path", () => {
  it("blocks activation after payment until agreement + kickoff are done", async () => {
    const { id } = await applyForPilot({ fleetName: "Fleet A", vehicleCount: 3, expectedCases30d: 3 });
    await beginCheckout({ applicationId: id });
    await markPilotPaid({ applicationId: id, paymentRef: "cs_test_123" });
    expect(app().state).toBe("paid");

    // Paid but no agreement/owner/baseline/vehicles -> activation refused.
    await expect(activatePilot({ applicationId: id })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("activates once payment, agreement, owner, baseline, and vehicles are all present", async () => {
    const { id } = await applyForPilot({ fleetName: "Fleet B", vehicleCount: 3, expectedCases30d: 3 });
    await beginCheckout({ applicationId: id });
    await markPilotPaid({ applicationId: id, paymentRef: "cs_test_456" });
    await acceptAgreement({ applicationId: id, agreementVersion: "2026-07-provisional", acceptedByUserId: 5, fleetId: 10 });
    await recordKickoff({ applicationId: id, vehicleIds: ["V1", "V2"], baseline: { odo: 100000 } });
    expect(app().state).toBe("kickoff_pending");

    const active = await activatePilot({ applicationId: id });
    expect(active.state).toBe("active");
    expect(active.startDate).toBeInstanceOf(Date);
    expect(active.endDate).toBeInstanceOf(Date);
  });

  it("caps enrolled vehicles at the pilot limit of 5", async () => {
    const { id } = await applyForPilot({ fleetName: "Fleet C", vehicleCount: 8, expectedCases30d: 3 });
    // vehicleCount 8 is <=25 so still qualified.
    await beginCheckout({ applicationId: id });
    await markPilotPaid({ applicationId: id, paymentRef: "cs" });
    await recordKickoff({ applicationId: id, vehicleIds: ["1", "2", "3", "4", "5", "6", "7"] });
    expect(app().enrolledVehicleIdsJson).toHaveLength(5);
  });
});

describe("subscription credit", () => {
  it("credits CAD $99 when converting within the window", async () => {
    const { id } = await applyForPilot({ fleetName: "Fleet D", vehicleCount: 3, expectedCases30d: 3 });
    await beginCheckout({ applicationId: id });
    await markPilotPaid({ applicationId: id, paymentRef: "cs" });
    await acceptAgreement({ applicationId: id, agreementVersion: "v1", acceptedByUserId: 1, fleetId: 2 });
    await recordKickoff({ applicationId: id, vehicleIds: ["1"] });
    await activatePilot({ applicationId: id });
    await completePilot({ applicationId: id });

    const res = await recordConversionCredit({ applicationId: id });
    expect(res.credited).toBe(true);
    expect(res.amountCents).toBe(9900);
    expect(app().state).toBe("converted");
    expect(app().pilotCreditAmountCents).toBe(9900);
  });

  it("does not credit outside the window", async () => {
    const { id } = await applyForPilot({ fleetName: "Fleet E", vehicleCount: 3, expectedCases30d: 3 });
    await beginCheckout({ applicationId: id });
    await markPilotPaid({ applicationId: id, paymentRef: "cs" });
    await acceptAgreement({ applicationId: id, agreementVersion: "v1", acceptedByUserId: 1, fleetId: 2 });
    await recordKickoff({ applicationId: id, vehicleIds: ["1"] });
    await activatePilot({ applicationId: id });
    await completePilot({ applicationId: id });
    // Force pilot end far in the past.
    app().endDate = new Date("2026-01-01T00:00:00Z");
    const res = await recordConversionCredit({ applicationId: id, now: new Date("2026-07-01T00:00:00Z") });
    expect(res.credited).toBe(false);
  });
});
