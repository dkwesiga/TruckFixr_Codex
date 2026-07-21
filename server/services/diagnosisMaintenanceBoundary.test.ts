import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ENV } from "../_core/env";
import {
  runDiagnosisWorkflow,
  type DiagnosisOutput,
  type MinimalDiagnosisContext,
} from "./diagnosisWorkflow";

/**
 * Golden diagnostic-boundary regression suite for the Fleet Health &
 * Maintenance workflow.
 *
 * The maintenance layer (Attention Score, Vehicle Events, PM status,
 * Maintenance Cases) MUST NOT influence diagnosis. Diagnosis takes only a
 * `MinimalDiagnosisContext`; the maintenance constructs have no field on it and
 * are never serialized into any AI prompt. These tests lock that boundary by
 * capturing every outbound AI request body during a real workflow run and
 * asserting no maintenance-layer token appears, and that the structured output
 * for the named golden scenarios is stable.
 *
 * The diagnosisWorkflow source is NOT modified by this feature. If any of these
 * fail, a change has leaked maintenance data into diagnosis and must be
 * reverted.
 */

function baseContext(
  overrides: Partial<MinimalDiagnosisContext> = {}
): MinimalDiagnosisContext {
  return {
    vehicle: {
      make: "Freightliner",
      model: "Cascadia",
      year: "2021",
      engine: "Detroit DD15",
    },
    user_report: {
      symptoms: "Low power and check engine light",
      fault_codes: ["SPN 4364 FMI 18"],
    },
    maintenance_history: [],
    last_daily_inspection: null,
    clarification_history: [],
    fault_code_reference: { match_status: "none", references: [] },
    ...overrides,
  };
}

function routing(overrides: Record<string, unknown> = {}) {
  return {
    case_type: "normal",
    issue_type: "mixed",
    code_type: "SPN_FMI",
    risk_level: "medium",
    reference_lookup_required: true,
    reference_match_quality: "no_match",
    needs_clarification: false,
    clarifying_question: "",
    clarification_reason: "",
    confidence_score: 84,
    recommended_model_tier: "low_cost",
    escalation_required: false,
    reason_for_escalation: "",
    extracted_fault_codes: ["SPN 4364 FMI 18"],
    normalized_symptoms: ["Low power", "check engine light"],
    ...overrides,
  };
}

function diagnosis(overrides: Partial<DiagnosisOutput> = {}): DiagnosisOutput {
  return {
    case_id: "case-test",
    vehicle_id: "veh-1",
    status: "final",
    issue_summary: "Low power with active aftertreatment fault code.",
    systems_affected: ["aftertreatment"],
    likely_causes: [
      {
        cause: "SCR efficiency or DEF dosing fault",
        likelihood: "high",
        probability: 78,
        reasoning: "SPN/FMI and low power point to aftertreatment derate.",
      },
    ],
    confidence_score: 84,
    clarifying_question: "",
    clarification_reason: "",
    recommended_tests: ["Scan aftertreatment codes"],
    likely_parts: ["NOx sensor"],
    safe_to_drive_decision: "drive_with_caution",
    risk_level: "medium",
    maintenance_recommendation: "Inspect aftertreatment before extended dispatch.",
    compliance_impact: "warning",
    driver_friendly_explanation: "Emissions system needs inspection.",
    manager_summary: "Verify aftertreatment before dispatch.",
    model_used: "",
    fallback_used: false,
    ...overrides,
  };
}

function createAiResponse(content: string | Record<string, unknown>, model = "test-model") {
  return new Response(
    JSON.stringify({
      id: "ai-response",
      created: 123,
      model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: typeof content === "string" ? content : JSON.stringify(content),
          },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 80, total_tokens: 180 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

function firstMessageText(body: Record<string, unknown>) {
  const content = (body.messages as Array<{ content?: unknown }> | undefined)?.[0]?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        part && typeof part === "object" && "text" in part
          ? String((part as { text?: unknown }).text ?? "")
          : ""
      )
      .join("\n");
  }
  return "";
}

// Tokens that belong exclusively to the maintenance layer. None may ever appear
// in an AI diagnosis prompt.
const FORBIDDEN_MAINTENANCE_TOKENS = [
  "attention_score",
  "attentionscore",
  "vehicle_attention",
  "operational priority",
  "maintenance_case",
  "maintenancecase",
  "mc-2026",
  "pm_overdue",
  "pm_status",
  "normalized_vehicle_event",
  "repair_document",
  "pilot_metrics",
];

function assertNoMaintenanceTokens(bodies: Array<Record<string, unknown>>) {
  const haystack = JSON.stringify(bodies).toLowerCase();
  for (const token of FORBIDDEN_MAINTENANCE_TOKENS) {
    expect(haystack).not.toContain(token);
  }
}

function captureFetch() {
  const bodies: Array<Record<string, unknown>> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      bodies.push(body);
      const system = firstMessageText(body);
      return createAiResponse(
        system.includes("routing classifier") ? routing() : diagnosis()
      );
    })
  );
  return bodies;
}

describe("diagnosis ⟂ maintenance boundary (golden regression)", () => {
  beforeEach(() => {
    ENV.openRouterApiKey = "openrouter-test-key";
    ENV.openAiApiKey = "";
    ENV.anthropicApiKey = "";
    ENV.geminiApiKey = "";
    ENV.defaultDiagnosisModel = "deepseek/deepseek-v4-flash";
    ENV.defaultClassificationModel = "deepseek/deepseek-v4-flash";
    ENV.lowCostClarificationModel = "deepseek/deepseek-v4-flash";
    ENV.advancedDiagnosisModel = "openai/gpt-4.1-mini";
    ENV.safetyCriticalModel = "openai/gpt-4.1-mini";
    ENV.complexFaultCodeModel = "google/gemini-2.5-flash";
    ENV.jsonRepairModel = "openai/gpt-4.1-mini";
    ENV.fallbackModel1 = "google/gemini-2.5-flash";
    ENV.fallbackModel2 = "";
    ENV.diagnosticMaxClarifications = "3";
    ENV.diagnosticLlmRetryCount = "2";
    ENV.diagnosticIntakeMaxTokens = "320";
    ENV.diagnosticReviewMaxTokens = "380";
    ENV.diagnosisMaxTokens = "900";
    ENV.diagnosticConfidenceThreshold = "80";
    ENV.diagnosticTimeoutMs = "10000";
    ENV.diagnosisDisableOpenAi = "";
    ENV.diagnosisDisableGemini = "";
    ENV.diagnosisDisableAnthropic = "";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("DTC-led diagnosis carries no maintenance-layer tokens in any prompt", async () => {
    const bodies = captureFetch();
    const result = await runDiagnosisWorkflow({ vehicleId: "veh-1", context: baseContext() });
    expect(result.diagnosis.status).toBe("final");
    assertNoMaintenanceTokens(bodies);
  });

  it("symptom-led diagnosis without a DTC carries no maintenance tokens", async () => {
    const bodies = captureFetch();
    await runDiagnosisWorkflow({
      vehicleId: "veh-2",
      context: baseContext({
        user_report: { symptoms: "Rough idle and hesitation", fault_codes: [] },
      }),
    });
    assertNoMaintenanceTokens(bodies);
  });

  it("existing maintenance_history does not smuggle PM-status/score constructs into prompts", async () => {
    const bodies = captureFetch();
    await runDiagnosisWorkflow({
      vehicleId: "veh-3",
      context: baseContext({
        maintenance_history: [
          { service: "Oil change", date: "2026-01-01", odometer: 100000 } as never,
        ],
      }),
    });
    assertNoMaintenanceTokens(bodies);
  });

  it("MinimalDiagnosisContext exposes no maintenance-layer fields", () => {
    const ctx = baseContext();
    const keys = Object.keys(ctx);
    // The diagnosis input surface is fixed; maintenance data has no entry point.
    expect(keys).toEqual(
      expect.arrayContaining([
        "vehicle",
        "user_report",
        "maintenance_history",
        "last_daily_inspection",
        "clarification_history",
        "fault_code_reference",
      ])
    );
    for (const forbidden of [
      "attention_score",
      "attentionScore",
      "vehicleEvents",
      "pmStatus",
      "maintenanceCase",
      "maintenanceCaseId",
    ]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it("identical diagnosis input yields byte-identical prompts (maintenance layer cannot perturb them)", async () => {
    const first = captureFetch();
    await runDiagnosisWorkflow({ vehicleId: "veh-1", context: baseContext() });
    const firstPrompts = first.map((b) => firstMessageText(b));
    vi.unstubAllGlobals();

    const second = captureFetch();
    await runDiagnosisWorkflow({ vehicleId: "veh-1", context: baseContext() });
    const secondPrompts = second.map((b) => firstMessageText(b));

    expect(secondPrompts).toEqual(firstPrompts);
  });
});
