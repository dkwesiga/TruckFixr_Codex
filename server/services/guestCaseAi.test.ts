import { beforeEach, describe, expect, it } from "vitest";
import { ENV } from "../_core/env";
import { generateGuestAssessment, generateGuestNextQuestion } from "./guestCaseAi";
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
    // recommendation stays the fixed, non-AI-worded string for this readiness bucket.
    expect(a.recommendation).toBe("Limit operation and arrange an inspection or service promptly.");
  });

  it("treats an AI-classified critical severity the same as a deterministic critical trigger", async () => {
    ENV.openRouterApiKey = "test-key";
    const a = await generateGuestAssessment(
      { input: benignInput, answers: {} },
      {
        fetcher: async () =>
          jsonResponse(
            chatCompletion(
              JSON.stringify({
                severity: "critical",
                action: "pull_from_service",
                explanation: "Given what was described, this should not keep operating.",
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

  it("falls back to the deterministic engine on invalid AI output (bad enum value)", async () => {
    ENV.openRouterApiKey = "test-key";
    const a = await generateGuestAssessment(
      { input: benignInput, answers: {} },
      {
        fetcher: async () =>
          jsonResponse(
            chatCompletion(JSON.stringify({ severity: "not_a_real_severity", action: "schedule_service", explanation: "x" }))
          ),
      }
    );
    const expected = assessGuestCase(benignInput, {});
    expect(a.customerReadiness).toBe(expected.customerReadiness);
    expect(a.explanation).toBeNull();
  });
});
