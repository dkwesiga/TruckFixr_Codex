import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ store: { seq: 0, rows: {} as Record<string, any[]> }, emails: [] as any[] }));

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
      set: (vals: any) => ({ where: async () => { const arr = rowsFor(getTableName(tbl)); if (arr[0]) Object.assign(arr[0], vals); } }),
    });
    return { insert, select, update };
  },
}));

vi.mock("./email", () => ({
  sendEmail: vi.fn(async (args: any) => { h.emails.push(args); return { delivered: true, skipped: false }; }),
}));

import { processDueFollowUps } from "./guestFollowUps";

const followUps = () => h.store.rows["guestCaseFollowUps"] ?? [];
const twoDaysAgo = () => new Date(Date.now() - 2 * 24 * 3600 * 1000);

beforeEach(() => {
  h.store.seq = 0;
  h.store.rows = {};
  h.emails = [];
});

describe("processDueFollowUps", () => {
  it("sends a due follow-up by email and records it", async () => {
    h.store.rows["guestCases"] = [{ id: 1, status: "decided", createdAt: twoDaysAgo(), confirmedRepair: null, outcomeConfirmedAt: null }];
    h.store.rows["guestCaseContacts"] = [{ id: 1, guestCaseId: 1, email: "ops@fleet.com", consentEmail: true }];

    const res = await processDueFollowUps();
    expect(res.sent).toBe(1);
    expect(h.emails).toHaveLength(1);
    expect(h.emails[0].to).toEqual(["ops@fleet.com"]);
    expect(followUps()[0].stage).toBe("24h");
    expect(followUps()[0].status).toBe("sent");
    expect(h.store.rows["guestCases"][0].lastFollowUpStage).toBe("24h");
  });

  it("skips (records but does not email) when there is no operational email consent", async () => {
    h.store.rows["guestCases"] = [{ id: 1, status: "decided", createdAt: twoDaysAgo(), confirmedRepair: null, outcomeConfirmedAt: null }];
    h.store.rows["guestCaseContacts"] = [{ id: 1, guestCaseId: 1, email: "ops@fleet.com", consentEmail: false }];

    const res = await processDueFollowUps();
    expect(res.sent).toBe(0);
    expect(res.skipped).toBe(1);
    expect(h.emails).toHaveLength(0);
    expect(followUps()[0].status).toBe("skipped");
  });

  it("does not follow up on a confirmed-outcome case", async () => {
    h.store.rows["guestCases"] = [{ id: 1, status: "closed", createdAt: twoDaysAgo(), confirmedRepair: true, outcomeConfirmedAt: new Date() }];
    h.store.rows["guestCaseContacts"] = [{ id: 1, guestCaseId: 1, email: "ops@fleet.com", consentEmail: true }];

    const res = await processDueFollowUps();
    expect(res.sent).toBe(0);
    expect(followUps()).toHaveLength(0);
  });
});
