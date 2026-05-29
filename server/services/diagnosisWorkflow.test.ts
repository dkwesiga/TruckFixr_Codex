import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ENV } from "../_core/env";
import {
  buildDiagnosisModelRoute,
  classifyDiagnosticIssue,
  runDiagnosisWorkflow,
  type DiagnosisOutput,
  type MinimalDiagnosisContext,
} from "./diagnosisWorkflow";

function baseContext(overrides: Partial<MinimalDiagnosisContext> = {}): MinimalDiagnosisContext {
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
    fault_code_reference: {
      match_status: "none",
      references: [],
    },
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
    confidence_score: 82,
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
    systems_affected: ["aftertreatment", "engine performance"],
    likely_causes: [
      {
        cause: "SCR efficiency or DEF dosing fault",
        likelihood: "high",
        probability: 78,
        reasoning: "The SPN/FMI and low-power complaint point to aftertreatment derate behavior.",
      },
    ],
    confidence_score: 82,
    clarifying_question: "",
    clarification_reason: "",
    recommended_tests: ["Scan aftertreatment codes", "Check DEF quality and dosing data"],
    likely_parts: ["NOx sensor", "DEF doser"],
    safe_to_drive_decision: "drive_with_caution",
    risk_level: "medium",
    maintenance_recommendation: "Inspect aftertreatment before extended dispatch.",
    compliance_impact: "warning",
    driver_friendly_explanation: "The truck may be derating because the emissions system needs inspection.",
    manager_summary: "Aftertreatment diagnosis should be verified before dispatch.",
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
      usage: {
        prompt_tokens: 100,
        completion_tokens: 80,
        total_tokens: 180,
      },
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
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

describe("MVP diagnosis workflow", () => {
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

  it("routes a normal fault-code issue to DeepSeek on OpenRouter first", async () => {
    const requestedBodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}"));
        requestedBodies.push(body);
        const system = firstMessageText(body);
        return createAiResponse(
          system.includes("routing classifier")
            ? routing({ confidence_score: 84 })
            : diagnosis({ confidence_score: 84 })
        );
      })
    );

    const result = await runDiagnosisWorkflow({
      vehicleId: "veh-1",
      context: baseContext(),
    });

    expect(result.classification).toBe("normal");
    expect(requestedBodies[0]?.model).toBe("deepseek/deepseek-v4-flash");
    expect(result.diagnosis.status).toBe("final");
    expect(result.diagnosis.confidence_score).toBe(84);
  });

  it("keeps the same case id and skips the classifier on clarification rounds", async () => {
    const requestedBodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}"));
        requestedBodies.push(body);
        return createAiResponse(diagnosis({ confidence_score: 86 }));
      })
    );

    const result = await runDiagnosisWorkflow({
      caseId: "case-persisted",
      vehicleId: "veh-1",
      context: baseContext(),
      clarificationHistory: [
        {
          question: "Does low power happen under load or all the time?",
          answer: "Mostly under load on the highway.",
        },
      ],
    });

    expect(result.diagnosis.case_id).toBe("case-persisted");
    expect(result.aiCallHistory.some((call) => call.callType === "classifier")).toBe(false);
    expect(
      requestedBodies.some((body) => firstMessageText(body).includes("routing classifier"))
    ).toBe(false);
  });

  it("includes confirmed repair outcomes in compact diagnosis prompts", async () => {
    const requestedBodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}"));
        requestedBodies.push(body);
        const system = firstMessageText(body);
        return createAiResponse(
          system.includes("routing classifier")
            ? routing({ confidence_score: 84 })
            : diagnosis({ confidence_score: 84 })
        );
      })
    );

    await runDiagnosisWorkflow({
      vehicleId: "veh-1",
      context: baseContext({
        confirmed_outcome_references: [
          {
            date: "2026-05-12",
            summary: "NOx sensor fault: replaced outlet NOx sensor and cleared derate.",
          },
        ],
      }),
    });

    expect(JSON.stringify(requestedBodies)).toContain("replaced outlet NOx sensor");
  });

  it("escalates safety-critical brake symptoms to an advanced OpenRouter model when configured", async () => {
    const requestedUrls: string[] = [];
    const requestedBodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        requestedUrls.push(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
        const body = JSON.parse(String(init?.body ?? "{}"));
        requestedBodies.push(body);
        const system = firstMessageText(body);
        return createAiResponse(
          system.includes("routing classifier")
            ? routing({
                case_type: "safety_critical",
                issue_type: "symptom_only",
                code_type: "none",
                risk_level: "high",
                recommended_model_tier: "advanced",
                escalation_required: true,
                confidence_score: 91,
              })
            : diagnosis({
                issue_summary: "Brake pedal going soft.",
                safe_to_drive_decision: "stop_and_inspect",
                risk_level: "high",
                confidence_score: 81,
              }),
          "gpt-4.1-mini"
        );
      })
    );

    const result = await runDiagnosisWorkflow({
      vehicleId: "veh-1",
      context: baseContext({
        user_report: {
          symptoms: "Brake pedal going soft",
          fault_codes: [],
        },
      }),
    });

    expect(result.classification).toBe("safety_critical");
    expect(requestedUrls.every((url) => url.includes("openrouter.ai"))).toBe(true);
    expect(requestedBodies.some((body) => body.model === "openai/gpt-4.1-mini")).toBe(true);
    expect(result.diagnosis.advanced_ai_review_used).toBe(true);
    expect(["stop_and_inspect", "tow_or_repair_immediately"]).toContain(
      result.diagnosis.safe_to_drive_decision
    );
  });

  it("normalizes bare OpenAI model names before sending advanced requests through OpenRouter", async () => {
    ENV.advancedDiagnosisModel = "";
    ENV.safetyCriticalModel = "";
    ENV.complexFaultCodeModel = "";
    ENV.openAiModel = "gpt-4.1-mini";
    const requestedBodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}"));
        requestedBodies.push(body);
        const system = firstMessageText(body);
        return createAiResponse(
          system.includes("routing classifier")
            ? routing({
                case_type: "safety_critical",
                issue_type: "symptom_only",
                code_type: "none",
                risk_level: "high",
                recommended_model_tier: "advanced",
                escalation_required: true,
                confidence_score: 91,
              })
            : diagnosis({
                issue_summary: "Brake warning reported.",
                safe_to_drive_decision: "stop_and_inspect",
                risk_level: "high",
                confidence_score: 84,
              }),
          "openai/gpt-4.1-mini"
        );
      })
    );

    await runDiagnosisWorkflow({
      vehicleId: "veh-1",
      context: baseContext({
        user_report: {
          symptoms: "Brake warning light and soft pedal",
          fault_codes: [],
        },
      }),
    });

    expect(requestedBodies.some((body) => body.model === "openai/gpt-4.1-mini")).toBe(true);
    expect(requestedBodies.every((body) => body.model !== "gpt-4.1-mini")).toBe(true);
  });

  it("treats coolant and oil mixing as complex high risk and prevents safe_to_drive", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}"));
        const system = firstMessageText(body);
        return createAiResponse(
          system.includes("routing classifier")
            ? routing({
                case_type: "complex",
                issue_type: "symptom_only",
                code_type: "none",
                risk_level: "high",
                recommended_model_tier: "advanced",
                escalation_required: true,
                confidence_score: 92,
              })
            : diagnosis({
                issue_summary: "Coolant and oil appear to be mixing.",
                safe_to_drive_decision: "safe_to_drive",
                risk_level: "low",
                confidence_score: 88,
              })
        );
      })
    );

    const result = await runDiagnosisWorkflow({
      vehicleId: "veh-1",
      context: baseContext({
        user_report: {
          symptoms: "Coolant mixed with oil and milky oil on dipstick",
          fault_codes: [],
        },
      }),
    });

    expect(result.classification).toBe("complex_high_risk");
    expect(result.diagnosis.safe_to_drive_decision).not.toBe("safe_to_drive");
    expect(["high", "critical"]).toContain(result.diagnosis.risk_level);
  });

  it("continues when no history or inspection record exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}"));
        const system = firstMessageText(body);
        return createAiResponse(system.includes("routing classifier") ? routing() : diagnosis());
      })
    );

    const result = await runDiagnosisWorkflow({
      vehicleId: "veh-no-history",
      context: baseContext({
        maintenance_history: [],
        last_daily_inspection: null,
      }),
    });

    expect(result.promptContext.maintenance_history).toEqual([]);
    expect(result.promptContext.last_daily_inspection).toBeNull();
    expect(result.diagnosis.status).toBe("final");
  });

  it("asks one AI-generated clarification below 80 confidence and stops after three", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}"));
        const system = firstMessageText(body);
        return createAiResponse(
          system.includes("routing classifier")
            ? routing({
                needs_clarification: true,
                clarifying_question: "Does the low power happen only under load?",
                clarification_reason: "This separates fuel delivery from aftertreatment derate.",
                confidence_score: 62,
              })
            : diagnosis({
                status: "clarification_needed",
                confidence_score: 62,
                clarifying_question: "Does the low power happen only under load?",
                clarification_reason: "This separates fuel delivery from aftertreatment derate.",
              })
        );
      })
    );

    const first = await runDiagnosisWorkflow({
      vehicleId: "veh-1",
      context: baseContext(),
    });
    const afterThree = await runDiagnosisWorkflow({
      vehicleId: "veh-1",
      context: baseContext(),
      clarificationHistory: [
        { question: "Q1?", answer: "A1" },
        { question: "Q2?", answer: "A2" },
        { question: "Q3?", answer: "A3" },
      ],
    });

    expect(first.diagnosis.status).toBe("clarification_needed");
    expect(first.diagnosis.clarifying_question).toContain("under load");
    expect(afterThree.diagnosis.status).toBe("final");
    expect(afterThree.diagnosis.clarifying_question).toBe("");
  });

  it("repairs invalid AI JSON once before accepting the response", async () => {
    let callIndex = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        callIndex += 1;
        const body = JSON.parse(String(init?.body ?? "{}"));
        const system = firstMessageText(body);
        if (system.includes("routing classifier")) {
          return createAiResponse(routing({ confidence_score: 82 }));
        }
        return callIndex === 2
          ? createAiResponse("Likely cause: DEF dosing fault. Confidence 82%.")
          : createAiResponse(diagnosis({ confidence_score: 82 }));
      })
    );

    const result = await runDiagnosisWorkflow({
      vehicleId: "veh-1",
      context: baseContext(),
    });

    expect(callIndex).toBe(3);
    expect(result.diagnosis.status).toBe("final");
    expect(result.diagnosis.fallback_used).toBe(true);
  });

  it("falls back safely when OpenRouter models return controlled fallback payloads", async () => {
    const requestedUrls: string[] = [];
    const requestedBodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        requestedUrls.push(url);
        requestedBodies.push(JSON.parse(String(init?.body ?? "{}")));

        if (url.includes("openrouter.ai")) {
          return new Response(
            JSON.stringify({
              error: {
                message: "No endpoints found that support data policy requirements.",
              },
            }),
            {
              status: 429,
              headers: { "Content-Type": "application/json" },
            }
          );
        }

        return createAiResponse(diagnosis({ confidence_score: 83 }));
      })
    );

    const result = await runDiagnosisWorkflow({
      vehicleId: "veh-1",
      context: baseContext(),
    });

    expect(requestedUrls.every((url) => url.includes("openrouter.ai"))).toBe(true);
    expect(requestedBodies.some((body) => body.model === "google/gemini-2.5-flash")).toBe(true);
    expect(result.diagnosis.fallback_used).toBe(true);
    expect(["clarification_needed", "final"]).toContain(result.diagnosis.status);
  });

  it("skips empty fallback model output and tries the next configured fallback", async () => {
    ENV.jsonRepairModel = "openai/gpt-4.1-mini";
    ENV.fallbackModel2 = "openai/gpt-4.1-mini";
    const requestedBodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}"));
        requestedBodies.push(body);
        const system = firstMessageText(body);

        if (system.includes("routing classifier")) {
          return createAiResponse(routing({ confidence_score: 82 }));
        }

        if (body.model === "deepseek/deepseek-v4-flash") {
          return new Response(
            JSON.stringify({ error: { message: "Provider returned error" } }),
            { status: 429, headers: { "Content-Type": "application/json" } }
          );
        }

        if (body.model === "google/gemini-2.5-flash") {
          return createAiResponse("", "google/gemini-2.5-flash");
        }

        return createAiResponse(diagnosis({ confidence_score: 83 }), "openai/gpt-4.1-mini");
      })
    );

    const result = await runDiagnosisWorkflow({
      vehicleId: "veh-1",
      context: baseContext(),
    });

    expect(requestedBodies.some((body) => body.model === "google/gemini-2.5-flash")).toBe(true);
    expect(requestedBodies.some((body) => body.model === "openai/gpt-4.1-mini")).toBe(true);
    expect(result.diagnosis.status).toBe("final");
    expect(result.diagnosis.model_used).toBe("openai/gpt-4.1-mini");
    expect(result.diagnosis.fallback_used).toBe(true);
  });

  it("uses customer-facing wording in the safe fallback diagnosis", async () => {
    ENV.openRouterApiKey = "";
    ENV.openAiApiKey = "";
    ENV.anthropicApiKey = "";
    ENV.geminiApiKey = "";

    const result = await runDiagnosisWorkflow({
      vehicleId: "veh-1",
      context: baseContext(),
    });

    expect(result.diagnosis.likely_causes[0]?.reasoning).not.toMatch(/AI response was unavailable|invalid/i);
    expect(result.diagnosis.likely_causes[0]?.reasoning).toContain("targeted inspection");
  });

  it("does not repeat fallback clarification questions", async () => {
    ENV.openRouterApiKey = "";
    ENV.openAiApiKey = "";
    ENV.anthropicApiKey = "";
    ENV.geminiApiKey = "";

    const first = await runDiagnosisWorkflow({
      vehicleId: "veh-1",
      context: baseContext(),
    });

    const second = await runDiagnosisWorkflow({
      vehicleId: "veh-1",
      context: baseContext(),
      clarificationHistory: [
        {
          question: first.diagnosis.clarifying_question,
          answer: "It happens all the time.",
        },
      ],
    });

    expect(first.diagnosis.status).toBe("clarification_needed");
    if (second.diagnosis.status === "clarification_needed") {
      expect(second.diagnosis.clarifying_question).not.toBe(first.diagnosis.clarifying_question);
    } else {
      expect(second.diagnosis.clarifying_question).toBe("");
    }
  });

  it("asks a fallback third question when confidence stays low and the AI repeats itself", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}"));
        const system = firstMessageText(body);
        return createAiResponse(
          system.includes("routing classifier")
            ? routing({
                needs_clarification: true,
                clarifying_question: "Does the low power happen only under load?",
                clarification_reason: "This separates fuel delivery from aftertreatment derate.",
                confidence_score: 75,
              })
            : diagnosis({
                status: "clarification_needed",
                confidence_score: 75,
                clarifying_question: "Does the low power happen only under load?",
                clarification_reason: "This separates fuel delivery from aftertreatment derate.",
              })
        );
      })
    );

    const result = await runDiagnosisWorkflow({
      vehicleId: "veh-1",
      context: baseContext(),
      clarificationHistory: [
        {
          question: "Did this start right after fueling, a recent repair, or a filter/DEF service?",
          answer: "No recent fueling or repair change.",
        },
        {
          question: "Does the low power happen only under load?",
          answer: "Yes, mostly under load.",
        },
      ],
    });

    expect(result.diagnosis.confidence_score).toBe(75);
    expect(result.diagnosis.status).toBe("clarification_needed");
    expect(result.diagnosis.clarifying_question).not.toBe(
      "Does the low power happen only under load?"
    );
    expect(result.diagnosis.clarifying_question.length).toBeGreaterThan(0);
  });

  it("can force diagnosis routing to OpenRouter only", () => {
    ENV.openAiApiKey = "openai-test-key";
    ENV.geminiApiKey = "gemini-test-key";
    ENV.anthropicApiKey = "anthropic-test-key";
    ENV.diagnosisDisableOpenAi = "true";
    ENV.diagnosisDisableGemini = "true";
    ENV.diagnosisDisableAnthropic = "true";

    const normalRoute = buildDiagnosisModelRoute("normal");
    const safetyRoute = buildDiagnosisModelRoute("safety_critical");

    expect(normalRoute.length).toBeGreaterThanOrEqual(1);
    expect(normalRoute.every((candidate) => candidate.provider === "openrouter")).toBe(true);
    expect(safetyRoute.length).toBeGreaterThanOrEqual(1);
    expect(safetyRoute.every((candidate) => candidate.provider === "openrouter")).toBe(true);
  });

  it("classifies no-code symptoms without blocking diagnosis", () => {
    expect(classifyDiagnosticIssue({ symptoms: "Rough idle and vibration", faultCodes: [] })).toBe("normal");
  });

  // Regression: production logs on 2026-05-29 showed every diagnosis call
  // failing Zod validation because small LLMs were echoing the prompt template
  // literally (e.g. status: "clarification_needed/final"). The coercer
  // should normalize these so the pipeline still returns a usable answer.
  it("rescues responses where the LLM echoes the slash-joined enum template", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}"));
        const system = firstMessageText(body);
        if (system.includes("routing classifier")) {
          // Routing classifier echoing every enum field with the slash joiner
          return createAiResponse({
            case_type: "normal/fault_code/safety_critical/complex",
            issue_type: "symptom_only/fault_code/mixed",
            code_type: "SPN_FMI/MID_PID_SID_FMI/OBD_DTC/ABS/transmission/aftertreatment/unknown/none",
            risk_level: "low/medium/high/critical",
            reference_lookup_required: true,
            reference_match_quality: "approved_match/no_match/needs_review_internal/none",
            needs_clarification: false,
            clarifying_question: "",
            clarification_reason: "",
            confidence_score: 82,
            recommended_model_tier: "low_cost/advanced",
            escalation_required: false,
            reason_for_escalation: "",
            extracted_fault_codes: ["SPN 4364 FMI 18"],
            normalized_symptoms: ["Low power"],
          });
        }
        // Diagnosis stage echoing slash strings + a few synonym variants
        return createAiResponse({
          case_id: "case-test",
          vehicle_id: "veh-1",
          status: "clarification_needed/final",
          issue_summary: "Low power with aftertreatment fault.",
          systems_affected: ["aftertreatment"],
          likely_causes: [
            {
              cause: "SCR/DEF dosing fault",
              likelihood: "high/medium/low",
              probability: 78,
              reasoning: "SPN/FMI points to aftertreatment derate.",
            },
          ],
          confidence_score: 85,
          clarifying_question: "",
          clarification_reason: "",
          recommended_tests: ["Scan aftertreatment codes"],
          likely_parts: ["NOx sensor"],
          safe_to_drive_decision:
            "safe_to_drive/drive_with_caution/stop_and_inspect/tow_or_repair_immediately",
          risk_level: "low/medium/high/critical",
          maintenance_recommendation: "Inspect aftertreatment.",
          compliance_impact: "none/warning/critical",
          driver_friendly_explanation: "Emissions system may need attention.",
          manager_summary: "Verify aftertreatment before dispatch.",
          model_used: "",
          fallback_used: false,
        });
      })
    );

    const result = await runDiagnosisWorkflow({
      vehicleId: "veh-1",
      context: baseContext(),
    });

    // All enum fields should be normalized to the first valid value
    // listed in the slash-joined template (or a safe default).
    expect(["clarification_needed", "final"]).toContain(result.diagnosis.status);
    expect(["safe_to_drive", "drive_with_caution", "stop_and_inspect", "tow_or_repair_immediately"]).toContain(
      result.diagnosis.safe_to_drive_decision
    );
    expect(["low", "medium", "high", "critical"]).toContain(result.diagnosis.risk_level);
    expect(["none", "warning", "critical"]).toContain(result.diagnosis.compliance_impact);
    expect(["high", "medium", "low"]).toContain(result.diagnosis.likely_causes[0]?.likelihood);
    // And we should have a real diagnosis, not the rule-engine fallback path
    expect(result.diagnosis.issue_summary).toContain("aftertreatment");
  });

  it("normalizes near-synonym variants the LLM may use instead of canonical enum values", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}"));
        const system = firstMessageText(body);
        if (system.includes("routing classifier")) return createAiResponse(routing({ confidence_score: 84 }));
        return createAiResponse({
          ...diagnosis({ confidence_score: 90 }),
          // Synonyms / variant spellings small models commonly produce.
          // (Note: risk_level may be overridden downstream by safety logic,
          // so we don't assert it here — the coercer is exercised through
          // the slash-template test above.)
          status: "done",
          compliance_impact: "warn",
          likely_causes: [
            { cause: "Test cause", likelihood: "moderate", probability: 70, reasoning: "" },
          ],
        });
      })
    );

    const result = await runDiagnosisWorkflow({
      vehicleId: "veh-1",
      context: baseContext(),
    });

    // Synonyms should be normalized to canonical enum values — and crucially,
    // the response should NOT have been rejected as invalid by Zod.
    expect(result.diagnosis.status).toBe("final");
    expect(result.diagnosis.compliance_impact).toBe("warning");
    expect(result.diagnosis.likely_causes[0]?.likelihood).toBe("medium");
  });
});
