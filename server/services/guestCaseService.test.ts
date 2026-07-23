import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// In-memory drizzle mock keyed by table name (via getTableName). Covers exactly
// the insert/select/update chains guestCaseService uses.
const h = vi.hoisted(() => ({
  store: { seq: 0, rows: {} as Record<string, any[]> },
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
          return {
            returning: async () => [row],
            then: p.then.bind(p),
            catch: p.catch.bind(p),
          };
        },
      };
    };
    const select = () => ({
      from(tbl: any) {
        const name = getTableName(tbl);
        const chain: any = {
          where: () => chain,
          orderBy: () => chain,
          // Return copies so a later update() cannot alias an already-read row
          // (mirrors real DB read-then-write semantics).
          limit: async () => rowsFor(name).slice(-1).map((r) => ({ ...r })),
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
  sendEmail: vi.fn(async () => ({ delivered: false, skipped: true })),
}));

import {
  answerGuestQuestion,
  getGuestCase,
  startGuestCase,
  submitGuestContact,
} from "./guestCaseService";

const rows = (name: string) => h.store.rows[name] ?? [];

beforeAll(() => {
  process.env.GUEST_TOKEN_SECRET = "svc-test-secret";
});

beforeEach(() => {
  h.store.seq = 0;
  h.store.rows = {};
});

describe("startGuestCase — critical path", () => {
  it("persists the case, returns safety guidance immediately, and queues review before any contact", async () => {
    const res = await startGuestCase({
      concernText: "the brakes failed on the highway",
      operatingStatus: "stopped",
      concernCategory: "symptom",
    });

    expect(res.criticalTriggered).toBe(true);
    expect(res.safetyGuidance).toBeTruthy();
    expect(res.nextQuestion).toBeNull();

    // Case row persisted with critical fields.
    expect(rows("guestCases")).toHaveLength(1);
    expect(rows("guestCases")[0].criticalTriggered).toBe(true);
    expect(rows("guestCases")[0].customerReadiness).toBe("stop");

    // Review item queued (auditable escalation) — and NO contact row yet.
    expect(rows("caseReviewQueueItems")).toHaveLength(1);
    expect(rows("caseReviewQueueItems")[0].category).toBe("critical_safety");
    expect(rows("caseReviewQueueItems")[0].slaDueAt).toBeInstanceOf(Date);
    expect(rows("guestCaseContacts") ?? []).toHaveLength(0);

    // Events include submitted + critical_triggered.
    const eventTypes = rows("guestCaseEvents").map((e) => e.type);
    expect(eventTypes).toContain("submitted");
    expect(eventTypes).toContain("critical_triggered");
  });
});

describe("startGuestCase — non-critical path", () => {
  it("does not trigger critical and offers a next question", async () => {
    const res = await startGuestCase({
      concernText: "amber check engine light, runs fine",
      operatingStatus: "operating_normally",
      concernCategory: "warning_light",
    });
    expect(res.criticalTriggered).toBe(false);
    expect(res.safetyGuidance).toBeNull();
    expect(res.nextQuestion).not.toBeNull();
    expect(rows("caseReviewQueueItems") ?? []).toHaveLength(0);
  });
});

describe("answerGuestQuestion — safety sweep can escalate", () => {
  it("promotes a benign case to critical when the sweep reveals smoke/fire", async () => {
    const { publicToken } = await startGuestCase({
      concernText: "odd noise from the back",
      operatingStatus: "operating_with_symptoms",
      concernCategory: "symptom",
    });
    const res = await answerGuestQuestion({ publicToken, questionId: "safety_sweep", answer: "smoke_fire" });
    expect(res.criticalTriggered).toBe(true);
    expect(res.safetyGuidance).toBeTruthy();
    expect(res.nextQuestion).toBeNull();
    expect(rows("caseReviewQueueItems")).toHaveLength(1);
  });
});

describe("submitGuestContact", () => {
  it("requires at least one contact method", async () => {
    const { publicToken } = await startGuestCase({
      concernText: "amber light",
      operatingStatus: "operating_normally",
      concernCategory: "warning_light",
    });
    await expect(submitGuestContact({ publicToken })).rejects.toThrow(/email address or a mobile number/i);
  });

  it("records contact + decision and consents default to what was passed (not preselected)", async () => {
    const { publicToken } = await startGuestCase({
      concernText: "amber light",
      operatingStatus: "operating_normally",
      concernCategory: "warning_light",
    });
    const res = await submitGuestContact({ publicToken, email: "ops@fleet-a.com", consentEmail: true });
    expect(res.decision.readiness).toBeDefined();
    expect(res.decision.possibleCausesSuppressed).toBe(true);
    const contact = rows("guestCaseContacts")[0];
    expect(contact.consentEmail).toBe(true);
    expect(contact.consentSms).toBe(false);
    expect(contact.consentWhatsapp).toBe(false);
    expect(contact.consentMarketing).toBe(false);
  });

  it("flags the free-case limit gracefully on a repeat non-critical submission (never hard-blocks)", async () => {
    const first = await startGuestCase({ concernText: "amber light", operatingStatus: "operating_normally", concernCategory: "warning_light" });
    const r1 = await submitGuestContact({ publicToken: first.publicToken, email: "ops@fleet-a.com" });
    expect(r1.freeCaseLimitReached).toBe(false);

    const second = await startGuestCase({ concernText: "another amber light", operatingStatus: "operating_normally", concernCategory: "warning_light" });
    const r2 = await submitGuestContact({ publicToken: second.publicToken, email: "ops@fleet-a.com" });
    expect(r2.freeCaseLimitReached).toBe(true);
    expect(r2.pilotSuggested).toBe(true);
    // Guidance is still returned — not blocked.
    expect(r2.decision.recommendation).toBeTruthy();
  });

  it("never applies the free-case limit to a critical case", async () => {
    // Seed the ledger via a prior non-critical submission with the same email.
    const seed = await startGuestCase({ concernText: "amber light", operatingStatus: "operating_normally", concernCategory: "warning_light" });
    await submitGuestContact({ publicToken: seed.publicToken, email: "driver@fleet-b.com" });

    const crit = await startGuestCase({ concernText: "smoke from the engine", operatingStatus: "stopped", concernCategory: "symptom" });
    const res = await submitGuestContact({ publicToken: crit.publicToken, email: "driver@fleet-b.com" });
    expect(res.freeCaseLimitReached).toBe(false);
  });
});

describe("getGuestCase", () => {
  it("returns a guest-safe view with no fleet data", async () => {
    const { publicToken } = await startGuestCase({ concernText: "amber light", operatingStatus: "operating_normally", concernCategory: "warning_light" });
    const view = await getGuestCase(publicToken);
    expect(view.publicToken).toBe(publicToken);
    expect(view).not.toHaveProperty("matchedFleetId");
    expect(view.preliminary.readiness).toBeDefined();
  });
});
