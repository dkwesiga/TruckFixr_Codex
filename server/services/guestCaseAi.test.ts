import { beforeEach, describe, expect, it } from "vitest";
import { ENV } from "../_core/env";
import { evidenceCompletenessCeiling, generateGuestAssessment, generateGuestNextQuestion } from "./guestCaseAi";
import { assessGuestCase } from "./guestCaseAssessment";
import { nextAdaptiveQuestion, SAFETY_SWEEP_QUESTION } from "../../shared/maintenance/guestCaseFlow";
import type { GuestCaseInput } from "../../shared/maintenance/guestCaseFlow";

function clearAllProviders() {
  ENV.openRouterApiKey = "";
  ENV.groqApiKey = "";
  ENV.openAiApiKey = "";
  ENV.anthropicApiKey = "";
  ENV.geminiApiKey = "";
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function chatCompletion(content: string) {
  return {
    id: "test",
    created: 0,
    model: "test-model",
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
  };
}

const benignInput: GuestCaseInput = {
  concernText: "amber check engine light, runs fine",
  operatingStatus: "operating_normally",
  concernCategory: "warning_light",
};

const criticalInput: GuestCaseInput = {
  concernText: "smoke coming from the engine",
  operatingStatus: "stopped",
};

beforeEach(() => {
  clearAllProviders();
});

describe("generateGuestNextQuestion — safety floors (no AI needed)", () => {
  it("returns null for a critical input without ever calling AI", async () => {
    ENV.openRouterApiKey = "test-key";
    const q = await generateGuestNextQuestion(
      { input: criticalInput, answers: {} },
      { fetcher: async () => { throw new Error("must not be called"); } }
    );
    expect(q).toBeNull();
  });

  it("returns null once MAX_ADAPTIVE_QUESTIONS have been answered", async () => {
    const answers = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`q${i}`, "x"]));
    const q = await generateGuestNextQuestion({ input: benignInput, answers });
    expect(q).toBeNull();
  });

  it("always forces the mandatory safety sweep as the second question", async () => {
    ENV.openRouterApiKey = "test-key";
    const q = await generateGuestNextQuestion(
      { input: benignInput, answers: { first_question: "some_answer" } },
      { fetcher: async () => { throw new Error("must not be called for the forced safety sweep"); } }
    );
    expect(q?.id).toBe(SAFETY_SWEEP_QUESTION.id);
  });

  it("forces the safety sweep on the last available slot if it still hasn't been asked", async () => {
    ENV.openRouterApiKey = "test-key";
    const answers = { a: "x", b: "x", c: "x", d: "x" }; // 4 answered, 1 slot left, no safety_sweep yet
    const q = await generateGuestNextQuestion(
      { input: benignInput, answers },
      { fetcher: async () => { throw new Error("must not be called"); } }
    );
    expect(q?.id).toBe(SAFETY_SWEEP_QUESTION.id);
  });
});

describe("generateGuestNextQuestion — AI path", () => {
  it("falls back to the deterministic bank when no provider is configured", async () => {
    const q = await generateGuestNextQuestion({ input: benignInput, answers: {} });
    const expected = nextAdaptiveQuestion(benignInput, []);
    expect(q?.id).toBe(expected?.id);
  });

  it("returns the model-generated question on success", async () => {
    ENV.openRouterApiKey = "test-key";
    const q = await generateGuestNextQuestion(
      { input: benignInput, answers: { first_question: "some_answer" ,[SAFETY_SWEEP_QUESTION.id]: "none"} },
      {
        fetcher: async () =>
          jsonResponse(
            chatCompletion(
              JSON.stringify({
                id: "warning_light_pattern",
                prompt: "Does the amber light stay on solid or flash?",
                options: [
                  { value: "solid", label: "Solid" },
                  { value: "flashing", label: "Flashing" },
                ],
              })
            )
          ),
      }
    );
    expect(q).toEqual({
      id: "warning_light_pattern",
      prompt: "Does the amber light stay on solid or flash?",
      options: [
        { value: "solid", label: "Solid" },
        { value: "flashing", label: "Flashing" },
      ],
      impacts: [],
    });
  });

  it("still succeeds when the model wraps its JSON in a markdown code fence (a common non-conformance even under json_object mode)", async () => {
    ENV.openRouterApiKey = "test-key";
    const q = await generateGuestNextQuestion(
      { input: benignInput, answers: { first_question: "x", [SAFETY_SWEEP_QUESTION.id]: "none" } },
      {
        fetcher: async () =>
          jsonResponse(
            chatCompletion(
              [
                "Here's a good follow-up question:",
                "```json",
                JSON.stringify({
                  id: "fenced_question",
                  prompt: "Does it happen every time or only sometimes?",
                  options: [
                    { value: "every_time", label: "Every time" },
                    { value: "sometimes", label: "Sometimes" },
                  ],
                }),
                "```",
              ].join("\n")
            )
          ),
      }
    );
    expect(q?.id).toBe("fenced_question");
  });

  it("renames an AI-returned 'safety_sweep' id to avoid colliding with the reserved one", async () => {
    ENV.openRouterApiKey = "test-key";
    const q = await generateGuestNextQuestion(
      { input: benignInput, answers: { first_question: "x", [SAFETY_SWEEP_QUESTION.id]: "none" } },
      {
        fetcher: async () =>
          jsonResponse(
            chatCompletion(
              JSON.stringify({
                id: "safety_sweep",
                prompt: "Some question",
                options: [
                  { value: "a", label: "A" },
                  { value: "b", label: "B" },
                ],
              })
            )
          ),
      }
    );
    expect(q?.id).toBe("safety_sweep_ai");
  });

  it("falls back to the deterministic bank when the AI reuses an already-answered id", async () => {
    ENV.openRouterApiKey = "test-key";
    const answers = { first_question: "x", [SAFETY_SWEEP_QUESTION.id]: "none" };
    const q = await generateGuestNextQuestion(
      { input: benignInput, answers },
      {
        fetcher: async () =>
          jsonResponse(
            chatCompletion(
              JSON.stringify({
                id: "first_question",
                prompt: "Repeat",
                options: [
                  { value: "a", label: "A" },
                  { value: "b", label: "B" },
                ],
              })
            )
          ),
      }
    );
    const expected = nextAdaptiveQuestion(benignInput, Object.keys(answers));
    expect(q?.id).toBe(expected?.id);
  });

  it("falls back to the deterministic bank on invalid AI output", async () => {
    ENV.openRouterApiKey = "test-key";
    const answers = { first_question: "x", [SAFETY_SWEEP_QUESTION.id]: "none" };
    const q = await generateGuestNextQuestion(
      { input: benignInput, answers },
      { fetcher: async () => jsonResponse(chatCompletion("not json")) }
    );
    const expected = nextAdaptiveQuestion(benignInput, Object.keys(answers));
    expect(q?.id).toBe(expected?.id);
  });
});

describe("generateGuestNextQuestion — confidence-driven question budget", () => {
  const answeredThroughSafetySweep = { first_question: "x", [SAFETY_SWEEP_QUESTION.id]: "none" };

  it("stops asking once confidence clears the threshold, without calling AI again", async () => {
    ENV.openRouterApiKey = "test-key";
    const q = await generateGuestNextQuestion(
      { input: benignInput, answers: answeredThroughSafetySweep, confidence: 85 },
      { fetcher: async () => { throw new Error("must not be called once confident"); } }
    );
    expect(q).toBeNull();
  });

  it("keeps asking while confidence is below threshold and the budget isn't exhausted yet", async () => {
    ENV.openRouterApiKey = "test-key";
    const q = await generateGuestNextQuestion(
      { input: benignInput, answers: answeredThroughSafetySweep, confidence: 60 },
      {
        fetcher: async () =>
          jsonResponse(
            chatCompletion(
              JSON.stringify({
                id: "confidence_followup",
                prompt: "One more detail?",
                options: [
                  { value: "a", label: "A" },
                  { value: "b", label: "B" },
                ],
              })
            )
          ),
      }
    );
    expect(q?.id).toBe("confidence_followup");
  });

  it("stops once the confidence-question budget (3 total) is exhausted, even though confidence is still low and the hard 5-cap hasn't been hit", async () => {
    ENV.openRouterApiKey = "test-key";
    const answers = { ...answeredThroughSafetySweep, confidence_followup: "x" }; // 3 answered
    const q = await generateGuestNextQuestion(
      { input: benignInput, answers, confidence: 40 },
      { fetcher: async () => { throw new Error("must not be called once the budget is exhausted"); } }
    );
    expect(q).toBeNull();
  });

  it("still asks the mandatory safety sweep on turn 2 even when confidence is already high", async () => {
    ENV.openRouterApiKey = "test-key";
    const q = await generateGuestNextQuestion(
      { input: benignInput, answers: { first_question: "x" }, confidence: 95 },
      { fetcher: async () => { throw new Error("must not be called — the safety sweep is forced, not AI-generated"); } }
    );
    expect(q?.id).toBe(SAFETY_SWEEP_QUESTION.id);
  });

  it("ignores the confidence budget entirely when no confidence signal is present (unconfigured/deterministic path unchanged)", async () => {
    const q = await generateGuestNextQuestion({ input: benignInput, answers: answeredThroughSafetySweep });
    // No AI configured in this test's env (cleared in beforeEach) — falls back
    // to the deterministic bank exactly as it did before confidence existed.
    const expected = nextAdaptiveQuestion(benignInput, Object.keys(answeredThroughSafetySweep));
    expect(q?.id).toBe(expected?.id);
  });
});

describe("generateGuestAssessment — safety floor (no AI needed)", () => {
  it("returns the deterministic critical result unchanged, without calling AI", async () => {
    ENV.openRouterApiKey = "test-key";
    const a = await generateGuestAssessment(
      { input: criticalInput, answers: {} },
      { fetcher: async () => { throw new Error("must not be called"); } }
    );
    const expected = assessGuestCase(criticalInput, {});
    expect(a).toEqual(expected);
  });
});

describe("generateGuestAssessment — AI path", () => {
  it("falls back to the deterministic engine when no provider is configured", async () => {
    const a = await generateGuestAssessment({ input: benignInput, answers: {} });
    const expected = assessGuestCase(benignInput, {});
    expect(a.customerReadiness).toBe(expected.customerReadiness);
    expect(a.internalSeverity).toBe(expected.internalSeverity);
    expect(a.explanation).toBeNull();
  });

  it("uses the model's severity/action, mapped through the deterministic readiness table, plus its explanation", async () => {
    ENV.openRouterApiKey = "test-key";
    const a = await generateGuestAssessment(
      { input: benignInput, answers: {} },
      {
        fetcher: async () =>
          jsonResponse(
            chatCompletion(
              JSON.stringify({
                severity: "attention",
                action: "schedule_service",
                explanation: "The amber light plus rough idle suggests a sensor or ignition issue worth checking soon.",
                confidence: 72,
              })
            )
          ),
      }
    );
    expect(a.internalSeverity).toBe("attention");
    expect(a.operatingAction).toBe("schedule_service");
    expect(a.customerReadiness).toBe("service_soon");
    expect(a.criticalTriggered).toBe(false);
    expect(a.explanation).toContain("sensor or ignition");
    expect(a.confidence).toBe(72);
    // recommendation stays the fixed, non-AI-worded string for this readiness bucket.
    expect(a.recommendation).toBe("Limit operation and arrange an inspection or service promptly.");
  });

  it("still succeeds when the model wraps its JSON in a markdown code fence", async () => {
    ENV.openRouterApiKey = "test-key";
    const a = await generateGuestAssessment(
      { input: benignInput, answers: {} },
      {
        fetcher: async () =>
          jsonResponse(
            chatCompletion(
              [
                "```json",
                JSON.stringify({
                  severity: "attention",
                  action: "schedule_service",
                  explanation: "Worth a look given the described symptom.",
                  confidence: 70,
                }),
                "```",
              ].join("\n")
            )
          ),
      }
    );
    expect(a.internalSeverity).toBe("attention");
    expect(a.customerReadiness).toBe("service_soon");
    expect(a.confidence).toBe(70);
  });

  it("treats an AI-classified critical severity the same as a deterministic critical trigger, once at least one clarifying answer is on record", async () => {
    ENV.openRouterApiKey = "test-key";
    const a = await generateGuestAssessment(
      { input: benignInput, answers: { symptom_frequency: "worsening" } },
      {
        fetcher: async () =>
          jsonResponse(
            chatCompletion(
              JSON.stringify({
                severity: "critical",
                action: "pull_from_service",
                explanation: "Given what was described, this should not keep operating.",
                confidence: 90,
              })
            )
          ),
      }
    );
    expect(a.criticalTriggered).toBe(true);
    expect(a.customerReadiness).toBe("stop");
    expect(a.safetyGuidance).toBeTruthy();
    expect(a.reviewStatus).toBe("review_required");
  });

  it("does NOT let the AI escalate straight to critical on the very first turn (no clarifying answers yet) — falls back to the rule-based result so a question still gets asked", async () => {
    ENV.openRouterApiKey = "test-key";
    const wontStartInput: GuestCaseInput = {
      concernText: "truck won't start",
      operatingStatus: "stopped",
    };
    const a = await generateGuestAssessment(
      { input: wontStartInput, answers: {} },
      {
        fetcher: async () =>
          jsonResponse(
            chatCompletion(
              JSON.stringify({
                severity: "critical",
                action: "tow",
                explanation: "A vehicle that won't start should be towed immediately.",
                confidence: 90,
              })
            )
          ),
      }
    );
    expect(a.criticalTriggered).toBe(false);
    expect(a.customerReadiness).not.toBe("stop");
    expect(a.safetyGuidance).toBeNull();
    // Matches the rule-based engine exactly (no AI explanation attached either,
    // since the AI's turn-1 verdict was discarded).
    const expected = assessGuestCase(wontStartInput, {});
    expect(a).toEqual(expected);
  });

  it("falls back to the deterministic engine on invalid AI output (bad enum value)", async () => {
    ENV.openRouterApiKey = "test-key";
    const a = await generateGuestAssessment(
      { input: benignInput, answers: {} },
      {
        fetcher: async () =>
          jsonResponse(
            chatCompletion(
              JSON.stringify({ severity: "not_a_real_severity", action: "schedule_service", explanation: "x", confidence: 90 })
            )
          ),
      }
    );
    const expected = assessGuestCase(benignInput, {});
    expect(a.customerReadiness).toBe(expected.customerReadiness);
    expect(a.explanation).toBeNull();
  });

  it("clamps an over-confident model score down to the evidence-completeness ceiling for a thin, unspecified case", async () => {
    ENV.openRouterApiKey = "test-key";
    const vagueInput: GuestCaseInput = { concernText: "truck's acting weird lately", operatingStatus: "unknown" };
    const a = await generateGuestAssessment(
      { input: vagueInput, answers: {} },
      {
        fetcher: async () =>
          jsonResponse(
            chatCompletion(
              JSON.stringify({ severity: "attention", action: "schedule_service", explanation: "Needs a look.", confidence: 95 })
            )
          ),
      }
    );
    // No category, unknown status, no fault codes, 0 answers -> ceiling 60, well below the model's claimed 95.
    expect(a.confidence).toBe(60);
  });

  it("does not clamp a well-evidenced case even at turn 0 (category + known status + fault codes already push the ceiling to 95)", async () => {
    ENV.openRouterApiKey = "test-key";
    const wellSpecifiedInput: GuestCaseInput = {
      concernText: "P0420 catalyst efficiency code, runs fine otherwise",
      operatingStatus: "operating_normally",
      concernCategory: "fault_code",
      faultCodes: ["P0420"],
    };
    const a = await generateGuestAssessment(
      { input: wellSpecifiedInput, answers: {} },
      {
        fetcher: async () =>
          jsonResponse(
            chatCompletion(
              JSON.stringify({ severity: "attention", action: "schedule_service", explanation: "Catalyst code, schedule service.", confidence: 88 })
            )
          ),
      }
    );
    expect(a.confidence).toBe(88); // below the 95 ceiling, so unclamped
  });
});

describe("evidenceCompletenessCeiling", () => {
  it("caps at 60 for a bare, unstructured description with nothing else known", () => {
    expect(
      evidenceCompletenessCeiling({ input: { concernText: "x", operatingStatus: "unknown" }, answeredCount: 0 })
    ).toBe(60);
  });

  it("increases with each structured signal", () => {
    const base = { concernText: "x", operatingStatus: "unknown" as const };
    expect(evidenceCompletenessCeiling({ input: { ...base, concernCategory: "symptom" }, answeredCount: 0 })).toBe(75);
    expect(evidenceCompletenessCeiling({ input: { ...base, operatingStatus: "operating_normally" }, answeredCount: 0 })).toBe(70);
    expect(evidenceCompletenessCeiling({ input: { ...base, faultCodes: ["P0420"] }, answeredCount: 0 })).toBe(70);
    expect(evidenceCompletenessCeiling({ input: base, answeredCount: 1 })).toBe(65);
    expect(evidenceCompletenessCeiling({ input: base, answeredCount: 2 })).toBe(75);
  });

  it("never exceeds 100", () => {
    expect(
      evidenceCompletenessCeiling({
        input: { concernText: "x", operatingStatus: "operating_normally", concernCategory: "fault_code", faultCodes: ["P0420"] },
        answeredCount: 3,
      })
    ).toBe(100);
  });
});
