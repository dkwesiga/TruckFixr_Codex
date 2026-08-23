import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// In-memory drizzle mock keyed by table name (via getTableName). Covers exactly
// the insert/select/update chains guestCaseService uses.
const h = vi.hoisted(() => ({
  store: { seq: 0, rows: {} as Record<string, any[]> },
  sentEmails: [] as Array<{ to: string[]; subject: string; text: string }>,
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
          // A real drizzle query builder is awaitable without a trailing
          // .limit()/.orderBy() (e.g. `await db.select().from(t).where(x)`);
          // mirror that so callers using that form don't await a bare object.
          then: (resolve: any, reject: any) =>
            Promise.resolve(rowsFor(name).map((r) => ({ ...r }))).then(resolve, reject),
        };
        return chain;
      },
    });
    const update = (tbl: any) => ({
      set: (vals: any) => ({
        where: async () => {
          // Ignores the predicate (as the rest of this mock does) but targets
          // the most-recently-inserted row rather than always the first —
          // matches every real call site here, which always updates the row
          // it just loaded/created, and correctly distinguishes rows once a
          // test has more than one per table.
          const arr = rowsFor(getTableName(tbl));
          const last = arr[arr.length - 1];
          if (last) Object.assign(last, vals);
        },
      }),
    });
    return { insert, select, update };
  },
}));

vi.mock("./email", () => ({
  sendEmail: vi.fn(async (input: { to: string[]; subject: string; text: string }) => {
    h.sentEmails.push(input);
    return { delivered: false, skipped: true };
  }),
}));

// This suite exercises guestCaseService.ts's own orchestration (persistence,
// contact verification, free-case limits) — not the AI-augmented severity
// classification, which is covered separately in guestCaseAi.test.ts. Without
// this mock, generateGuestAssessment/generateGuestNextQuestion would make
// real network calls to a live OpenRouter key (present in this repo's .env),
// making every test slow and non-deterministic depending on live LLM output
// and network conditions. Delegating straight to the same deterministic
// engine guestCaseAi.ts itself falls back to on any AI failure reproduces
// exactly what these tests were implicitly (and flakily) already exercising.
vi.mock("./guestCaseAi", async () => {
  const { assessGuestCase } = await import("./guestCaseAssessment");
  const { nextAdaptiveQuestion } = await import("../../shared/maintenance/guestCaseFlow");
  return {
    CONFIDENCE_THRESHOLD: 85,
    generateGuestAssessment: async (ctx: { input: any; answers: Record<string, string> }) =>
      assessGuestCase(ctx.input, ctx.answers),
    generateGuestNextQuestion: async (ctx: { input: any; answers: Record<string, string> }) =>
      nextAdaptiveQuestion(ctx.input, Object.keys(ctx.answers)),
  };
});

// Same reasoning as the ./guestCaseAi mock above: generateGuestLikelyCauses
// is a second, independent AI call (submitGuestContact's "possible causes"
// enrichment) that would otherwise also hit the live network. No causes
// available is exactly the pre-existing "AI unavailable" fallback shape these
// tests already assert on (possibleCausesSuppressed: true).
vi.mock("./guestCaseAiReport", () => ({
  generateGuestLikelyCauses: vi.fn(async () => []),
}));

import {
  answerGuestQuestion,
  getGuestCase,
  resendGuestContactCode,
  startGuestCase,
  submitGuestContact,
  verifyGuestContactCode,
} from "./guestCaseService";

const rows = (name: string) => h.store.rows[name] ?? [];

/** Pull the 6-digit code out of the most recently "sent" verification email. */
function latestSentCode(): string {
  const last = h.sentEmails[h.sentEmails.length - 1];
  const match = last?.text.match(/\b(\d{6})\b/);
  if (!match) throw new Error("No verification code found in sent emails.");
  return match[1];
}

beforeAll(() => {
  process.env.GUEST_TOKEN_SECRET = "svc-test-secret";
});

beforeEach(() => {
  h.store.seq = 0;
  h.store.rows = {};
  h.sentEmails = [];
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
  const ack = { disclaimerAcknowledged: true, disclaimerVersion: "test-v1" } as const;

  it("requires an email address", async () => {
    const { publicToken } = await startGuestCase({
      concernText: "amber light",
      operatingStatus: "operating_normally",
      concernCategory: "warning_light",
    });
    await expect(submitGuestContact({ publicToken, ...ack })).rejects.toThrow(/email address is required/i);
  });

  it("requires the disclaimer acknowledgment before releasing the decision", async () => {
    const { publicToken } = await startGuestCase({
      concernText: "amber light",
      operatingStatus: "operating_normally",
      concernCategory: "warning_light",
    });
    await expect(
      submitGuestContact({ publicToken, email: "ops@fleet-a.com" })
    ).rejects.toThrow(/acknowledge the disclaimer/i);
  });

  it("sends a verification code instead of releasing the decision directly", async () => {
    const { publicToken } = await startGuestCase({
      concernText: "amber light",
      operatingStatus: "operating_normally",
      concernCategory: "warning_light",
    });
    const res = await submitGuestContact({ publicToken, email: "ops@fleet-a.com", consentEmail: true, ...ack });
    expect(res.codeSent).toBe(true);
    expect(res.maskedDestination).toContain("@fleet-a.com");
    expect((res as any).decision).toBeUndefined();
    const contact = rows("guestCaseContacts")[0];
    expect(contact.consentEmail).toBe(true);
    expect(contact.consentSms).toBe(false);
    expect(contact.consentWhatsapp).toBe(false);
    expect(contact.consentMarketing).toBe(false);
    expect(contact.disclaimerAcknowledged).toBe(true);
    expect(contact.disclaimerVersion).toBe("test-v1");
    expect(contact.disclaimerAcknowledgedAt).toBeInstanceOf(Date);
  });

  it("releases the decision only after the emailed code is verified", async () => {
    const { publicToken } = await startGuestCase({
      concernText: "amber light",
      operatingStatus: "operating_normally",
      concernCategory: "warning_light",
    });
    await submitGuestContact({ publicToken, email: "ops@fleet-a.com", ...ack });

    await expect(verifyGuestContactCode({ publicToken, code: "000000" })).rejects.toThrow(/isn't right/i);

    const res = await verifyGuestContactCode({ publicToken, code: latestSentCode() });
    expect(res.decision.readiness).toBeDefined();
    expect(res.decision.possibleCausesSuppressed).toBe(true);
  });

  it("resend issues a new code that also verifies", async () => {
    const { publicToken } = await startGuestCase({ concernText: "amber light", operatingStatus: "operating_normally", concernCategory: "warning_light" });
    await submitGuestContact({ publicToken, email: "ops@fleet-a.com", ...ack });
    // Resend is cooldown-limited (60s) — advance past it rather than hitting
    // the real "please wait" guard immediately after the first send.
    vi.useFakeTimers();
    try {
      vi.advanceTimersByTime(61_000);
      const resend = await resendGuestContactCode({ publicToken });
      expect(resend.codeSent).toBe(true);
    } finally {
      vi.useRealTimers();
    }
    const res = await verifyGuestContactCode({ publicToken, code: latestSentCode() });
    expect(res.decision.readiness).toBeDefined();
  });

  it("flags the free-case limit gracefully on a repeat non-critical submission (never hard-blocks)", async () => {
    const first = await startGuestCase({ concernText: "amber light", operatingStatus: "operating_normally", concernCategory: "warning_light" });
    await submitGuestContact({ publicToken: first.publicToken, email: "ops@fleet-a.com", ...ack });
    const r1 = await verifyGuestContactCode({ publicToken: first.publicToken, code: latestSentCode() });
    expect(r1.freeCaseLimitReached).toBe(false);

    const second = await startGuestCase({ concernText: "another amber light", operatingStatus: "operating_normally", concernCategory: "warning_light" });
    await submitGuestContact({ publicToken: second.publicToken, email: "ops@fleet-a.com", ...ack });
    const r2 = await verifyGuestContactCode({ publicToken: second.publicToken, code: latestSentCode() });
    expect(r2.freeCaseLimitReached).toBe(true);
    expect(r2.pilotSuggested).toBe(true);
    // Guidance is still returned — not blocked.
    expect(r2.decision.recommendation).toBeTruthy();
  });

  it("never applies the free-case limit to a critical case", async () => {
    // Seed the ledger via a prior non-critical submission with the same email.
    const seed = await startGuestCase({ concernText: "amber light", operatingStatus: "operating_normally", concernCategory: "warning_light" });
    await submitGuestContact({ publicToken: seed.publicToken, email: "driver@fleet-b.com", ...ack });
    await verifyGuestContactCode({ publicToken: seed.publicToken, code: latestSentCode() });

    const crit = await startGuestCase({ concernText: "smoke from the engine", operatingStatus: "stopped", concernCategory: "symptom" });
    await submitGuestContact({ publicToken: crit.publicToken, email: "driver@fleet-b.com", ...ack });
    const res = await verifyGuestContactCode({ publicToken: crit.publicToken, code: latestSentCode() });
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
