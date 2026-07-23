import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCallerFactory } from "./_core/trpc";

const h = vi.hoisted(() => ({ store: { seq: 0, rows: {} as Record<string, any[]> } }));

vi.mock("./db", () => ({
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
    return { insert, select };
  },
}));

vi.mock("./_core/rateLimit", () => ({ enforceIpRateLimit: vi.fn() }));

import { pilotApplicationsRouter } from "./routers/pilotApplications";

const callerFactory = createCallerFactory(pilotApplicationsRouter);
const anonCtx = { user: null, req: {} } as any;
const driverCtx = { user: { id: 2, role: "driver", email: "d@e.com" }, req: {} } as any;
const ownerCtx = { user: { id: 1, role: "owner", email: "o@e.com" }, req: {} } as any;

beforeEach(() => {
  h.store.seq = 0;
  h.store.rows = {};
});

describe("pilotApplications router authorization", () => {
  it("lets anyone apply (public) and returns a qualification result", async () => {
    const res = await callerFactory(anonCtx).submit({ fleetName: "Public Fleet", vehicleCount: 3, expectedCases30d: 3 });
    expect(res.qualificationResult).toBe("qualified");
  });

  it("blocks non-owners from accepting the agreement", async () => {
    await expect(
      callerFactory(driverCtx).acceptAgreement({ applicationId: 1, agreementVersion: "v1", fleetId: 10 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks non-staff from the manual mark-paid step", async () => {
    await expect(
      callerFactory(driverCtx).markPaid({ applicationId: 1, paymentRef: "x" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("passes the owner gate (reaches the service, not FORBIDDEN)", async () => {
    // No application seeded -> the service throws NOT_FOUND, proving the gate passed.
    await expect(
      callerFactory(ownerCtx).activate({ applicationId: 999 })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
