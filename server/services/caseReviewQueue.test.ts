import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  store: { seq: 0, rows: {} as Record<string, any[]> },
  emails: [] as any[],
}));

vi.mock("../db", () => ({
  getDb: async () => {
    const { getTableName } = await import("drizzle-orm");
    const rowsFor = (name: string) => (h.store.rows[name] ??= []);
    const insert = (tbl: any) => {
      const name = getTableName(tbl);
      return {
        values(vals: any) {
          const row = { id: ++h.store.seq, ...vals };
          rowsFor(name).push(row);
          const p: Promise<any> = Promise.resolve(undefined);
          return { returning: async () => [row], then: p.then.bind(p), catch: p.catch.bind(p) };
        },
      };
    };
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

vi.mock("./email", () => ({
  sendEmail: vi.fn(async (args: any) => {
    h.emails.push(args);
    return { delivered: true, skipped: false };
  }),
}));

import {
  claimReview,
  completeReview,
  enqueueReview,
  escalateToTechnician,
  listReviewQueue,
} from "./caseReviewQueue";

const items = () => h.store.rows["caseReviewQueueItems"] ?? [];

beforeEach(() => {
  h.store.seq = 0;
  h.store.rows = {};
  h.emails = [];
  process.env.CASE_REVIEWER_EMAIL = "reviewer@truckfixr.com";
  process.env.CASE_BACKUP_REVIEWER_EMAIL = "tech310t@truckfixr.com";
});

describe("enqueueReview", () => {
  it("creates an item with an SLA due date, priority, and alerts the reviewer", async () => {
    const item = await enqueueReview({ guestCaseId: 1, category: "critical_safety" });
    expect(item.category).toBe("critical_safety");
    expect(item.status).toBe("review_required");
    expect(item.priority).toBe("urgent");
    expect(item.slaDueAt).toBeInstanceOf(Date);
    expect(item.reviewerNotifiedAt).toBeInstanceOf(Date);
    expect(items()).toHaveLength(1);
    // Reviewer alert email sent to the configured primary reviewer.
    expect(h.emails).toHaveLength(1);
    expect(h.emails[0].to).toEqual(["reviewer@truckfixr.com"]);
  });

  it("uses normal priority for non-critical categories", async () => {
    const item = await enqueueReview({ guestCaseId: 2, category: "technical_uncertainty" });
    expect(item.priority).toBe("normal");
  });

  it("can suppress the reviewer alert", async () => {
    await enqueueReview({ guestCaseId: 3, category: "high_cost_risk", notifyReviewer: false });
    expect(h.emails).toHaveLength(0);
  });
});

describe("claim / complete", () => {
  it("claims an item into review_in_progress", async () => {
    const item = await enqueueReview({ guestCaseId: 1, category: "critical_safety" });
    const claimed = await claimReview({ id: item.id, reviewerUserId: 7 });
    expect(claimed.status).toBe("review_in_progress");
    expect(claimed.reviewerUserId).toBe(7);
    expect(claimed.reviewStartedAt).toBeInstanceOf(Date);
  });

  it("marks SLA met when completed before the due time", async () => {
    const item = await enqueueReview({ guestCaseId: 1, category: "critical_safety" });
    const done = await completeReview({ id: item.id, outcome: "confirmed_stop", reviewerNotes: "Air system checked." });
    expect(done.status).toBe("review_completed");
    expect(done.completedAt).toBeInstanceOf(Date);
    expect(done.slaMet).toBe(true);
    expect(done.outcome).toBe("confirmed_stop");
  });

  it("marks SLA missed when the due time has passed", async () => {
    const item = await enqueueReview({ guestCaseId: 1, category: "critical_safety" });
    // Force the due date into the past.
    items()[0].slaDueAt = new Date(Date.now() - 60_000);
    const done = await completeReview({ id: item.id, outcome: "confirmed_stop" });
    expect(done.slaMet).toBe(false);
  });
});

describe("escalateToTechnician", () => {
  it("raises priority, records the reason, and alerts the backup 310T reviewer", async () => {
    const item = await enqueueReview({ guestCaseId: 1, category: "technical_uncertainty" });
    h.emails = [];
    const escalated = await escalateToTechnician({ id: item.id, backupReviewerUserId: 9, reason: "needs 310T judgment" });
    expect(escalated.priority).toBe("urgent");
    expect(escalated.escalationReason).toBe("needs 310T judgment");
    expect(escalated.backupReviewerUserId).toBe(9);
    expect(h.emails[0].to).toEqual(["tech310t@truckfixr.com"]);
    expect(h.emails[0].subject).toContain("ESCALATION");
  });
});

describe("listReviewQueue", () => {
  it("returns enqueued items", async () => {
    await enqueueReview({ guestCaseId: 1, category: "critical_safety", notifyReviewer: false });
    await enqueueReview({ guestCaseId: 2, category: "technical_uncertainty", notifyReviewer: false });
    const list = await listReviewQueue();
    expect(list).toHaveLength(2);
  });
});
