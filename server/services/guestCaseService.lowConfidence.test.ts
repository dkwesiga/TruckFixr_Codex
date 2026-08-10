import { beforeEach, describe, expect, it, vi } from "vitest";

// Same in-memory drizzle mock as guestCaseService.test.ts (see that file for
// the full rationale) — duplicated here rather than shared, matching how
// this repo's test files are already structured independently per file.
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
          limit: async () => rowsFor(name).slice(-1).map((r) => ({ ...r })),
        };
        return chain;
      },
    });
    const update = (tbl: any) => ({
      set: (vals: any) => ({
        where: async () => {
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

// Mock the AI layer directly — this test is about how guestCaseService.ts
// wires the AI module's output into review-queue escalation, not about the
// AI module's own internals (those are covered in guestCaseAi.test.ts).
vi.mock("./guestCaseAi", () => ({
  generateGuestAssessment: vi.fn(),
  generateGuestNextQuestion: vi.fn(),
  CONFIDENCE_THRESHOLD: 85,
}));

import { generateGuestAssessment, generateGuestNextQuestion } from "./guestCaseAi";
import { answerGuestQuestion, startGuestCase } from "./guestCaseService";
import type { GuestAssessment } from "./guestCaseAssessment";

const rows = (name: string) => h.store.rows[name] ?? [];

function nonCriticalAssessment(overrides: Partial<GuestAssessment> = {}): GuestAssessment {
  return {
    criticalTrigger: null,
    criticalTriggered: false,
    internalSeverity: "attention",
    operatingAction: "schedule_service",
    customerReadiness: "service_soon",
    recommendation: "Limit operation and arrange an inspection or service promptly.",
    safetyGuidance: null,
    reviewCategory: null,
    reviewStatus: "automated_guidance_only",
    explanation: "Test explanation.",
    confidence: 55,
    confidenceLow: false,
    ...overrides,
  };
}

beforeEach(() => {
  h.store.seq = 0;
  h.store.rows = {};
  h.sentEmails = [];
  vi.mocked(generateGuestAssessment).mockReset();
  vi.mocked(generateGuestNextQuestion).mockReset();
});

describe("low-confidence escalation wiring in guestCaseService.ts", () => {
  it("flags the case for technical review once the AI stays under-confident and no further question is coming", async () => {
    vi.mocked(generateGuestAssessment).mockResolvedValue(nonCriticalAssessment({ confidence: 55 }));
    vi.mocked(generateGuestNextQuestion).mockResolvedValue(null);

    const res = await startGuestCase({
      concernText: "truck won't start",
      operatingStatus: "stopped",
    });

    expect(res.nextQuestion).toBeNull();
    expect(res.preliminary.confidenceLow).toBe(true);
    expect(res.preliminary.lowConfidenceNotice).toBeTruthy();

    expect(rows("caseReviewQueueItems")).toHaveLength(1);
    expect(rows("caseReviewQueueItems")[0].category).toBe("technical_uncertainty");
    expect(rows("guestCases")[0].reviewStatus).toBe("review_queued");
  });

  it("does not flag the case when confidence already clears the threshold", async () => {
    vi.mocked(generateGuestAssessment).mockResolvedValue(nonCriticalAssessment({ confidence: 90 }));
    vi.mocked(generateGuestNextQuestion).mockResolvedValue(null);

    const res = await startGuestCase({
      concernText: "amber light, runs fine",
      operatingStatus: "operating_normally",
    });

    expect(res.preliminary.confidenceLow).toBe(false);
    expect(res.preliminary.lowConfidenceNotice).toBeNull();
    expect(rows("caseReviewQueueItems") ?? []).toHaveLength(0);
  });

  it("does not flag the case while a follow-up question is still coming, even if confidence is currently low", async () => {
    vi.mocked(generateGuestAssessment).mockResolvedValue(nonCriticalAssessment({ confidence: 40 }));
    vi.mocked(generateGuestNextQuestion).mockResolvedValue({
      id: "confidence_followup",
      prompt: "One more detail?",
      options: [{ value: "a", label: "A" }],
      impacts: [],
    });

    const res = await startGuestCase({
      concernText: "truck won't start",
      operatingStatus: "stopped",
    });

    expect(res.nextQuestion).not.toBeNull();
    expect(res.preliminary.confidenceLow).toBe(false);
    expect(rows("caseReviewQueueItems") ?? []).toHaveLength(0);
  });

  it("never double-enqueues if the low-confidence state persists across a later answerGuestQuestion call", async () => {
    // Turn 1: still asking, not yet flagged.
    vi.mocked(generateGuestAssessment).mockResolvedValueOnce(nonCriticalAssessment({ confidence: 50 }));
    vi.mocked(generateGuestNextQuestion).mockResolvedValueOnce({
      id: "confidence_followup",
      prompt: "One more detail?",
      options: [{ value: "a", label: "A" }],
      impacts: [],
    });
    const started = await startGuestCase({
      concernText: "truck won't start",
      operatingStatus: "stopped",
    });
    expect(rows("caseReviewQueueItems") ?? []).toHaveLength(0);

    // Turn 2: budget exhausted, confidence still low — flags and enqueues once.
    vi.mocked(generateGuestAssessment).mockResolvedValueOnce(nonCriticalAssessment({ confidence: 50 }));
    vi.mocked(generateGuestNextQuestion).mockResolvedValueOnce(null);
    const answered = await answerGuestQuestion({
      publicToken: started.publicToken,
      questionId: "confidence_followup",
      answer: "a",
    });
    expect(answered.preliminary.confidenceLow).toBe(true);
    expect(rows("caseReviewQueueItems")).toHaveLength(1);

    // Turn 3 (defensive — shouldn't normally happen once nextQuestion was
    // null, but simulates a retry/duplicate call): still low, still no
    // further question — must not enqueue a second time.
    vi.mocked(generateGuestAssessment).mockResolvedValueOnce(nonCriticalAssessment({ confidence: 50 }));
    vi.mocked(generateGuestNextQuestion).mockResolvedValueOnce(null);
    await answerGuestQuestion({
      publicToken: started.publicToken,
      questionId: "confidence_followup_retry",
      answer: "a",
    });
    expect(rows("caseReviewQueueItems")).toHaveLength(1);
  });
});
