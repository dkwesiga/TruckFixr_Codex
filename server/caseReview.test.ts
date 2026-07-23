import { describe, expect, it, vi } from "vitest";
import { createCallerFactory } from "./_core/trpc";

vi.mock("./db", () => ({
  getDb: vi.fn(async () => ({
    select: () => ({
      from: () => {
        const chain: any = {
          where: () => chain,
          orderBy: () => chain,
          limit: async () => [],
          then: (r: any) => Promise.resolve([]).then(r),
        };
        return chain;
      },
    }),
  })),
}));

vi.mock("./services/email", () => ({
  sendEmail: vi.fn(async () => ({ delivered: false, skipped: true })),
}));

import { caseReviewRouter } from "./routers/caseReview";

const callerFactory = createCallerFactory(caseReviewRouter);

const staffCtx = { user: { id: 1, role: "manager", email: "admin@truckfixr.com", internalAdminRole: "admin" } } as any;
const driverCtx = { user: { id: 2, role: "driver", email: "driver@example.com", internalAdminRole: null } } as any;
const readOnlyCtx = { user: { id: 3, role: "manager", email: "ro@truckfixr.com", internalAdminRole: "read_only_viewer" } } as any;
const anonCtx = { user: null } as any;

describe("caseReview router authorization", () => {
  it("blocks unauthenticated and non-staff users", async () => {
    await expect(callerFactory(anonCtx).list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(callerFactory(driverCtx).list()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows staff to read the queue", async () => {
    await expect(callerFactory(staffCtx).list()).resolves.toEqual([]);
  });

  it("allows a read-only viewer to read but not to mutate", async () => {
    await expect(callerFactory(readOnlyCtx).list()).resolves.toEqual([]);
    await expect(callerFactory(readOnlyCtx).claim({ id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      callerFactory(readOnlyCtx).complete({ id: 1, outcome: "confirmed_stop" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
