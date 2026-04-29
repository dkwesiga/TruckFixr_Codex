import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ENV } from "./_core/env";
import {
  analyzeDiagnostic,
  analyzeDiagnosticWithAi,
  buildDiagnosticContext,
  parseClarifyingQuestionResponse,
  retrieveSimilarCases,
} from "./services/tadisCore";

function createReviewResponse(review: Record<string, unknown> | string) {
  return new Response(
    JSON.stringify({
      id: "openrouter-response",
      created: 123456,
      model: "openrouter/free",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: typeof review === "string" ? review : JSON.stringify(review),
          },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 200,
        completion_tokens: 120,
        total_tokens: 320,
      },
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
}

function baseLlmReview(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    next_action: "finalize",
    clarifying_question: null,
    question_rationale: null,
    missing_evidence: [],
    ambiguity_drivers: [],
    top_ranked_causes: [
      {
        cause_id: "coolant_leak",
        cause_name: "Coolant leak or low coolant level",
        is_new_cause: false,
        probability: 71,
        evidence_summary: ["Coolant smell and P0128 align with a cooling-system fault"],
        ranking_rationale: ["Cooling symptoms and repair history best fit coolant loss"],
        symptom_support_score: 83,
        fault_code_support_score: 74,
        repair_history_support_score: 60,
        maintenance_history_support_score: 42,
        recent_parts_support_score: 18,
        recurring_failure_support_score: 22,
        cause_library_fit_score: 88,
        novel_cause_support_score: null,
      },
      {
        cause_id: "thermostat_stuck",
        cause_name: "Thermostat stuck closed or opening late",
        is_new_cause: false,
        probability: 29,
        evidence_summary: ["Still plausible but weaker than coolant loss"],
        ranking_rationale: ["Secondary candidate after cooling-leak evidence"],
        symptom_support_score: 64,
        fault_code_support_score: 65,
        repair_history_support_score: 35,
        maintenance_history_support_score: 20,
        recent_parts_support_score: 10,
        recurring_failure_support_score: 16,
        cause_library_fit_score: 62,
        novel_cause_support_score: null,
      },
    ],
    overall_confidence_score: 84,
    confidence_rationale: ["Fault code and symptoms align cleanly with the top cooling cause."],
    fault_code_interpretations: [
      {
        code: "P0128",
        interpretation: "Cooling temperature is staying below the expected operating range.",
        role: "primary",
        signal_strength: 81,
      },
    ],
    driver_action_recommendation: {
      llm_driver_action: "drive_to_shop",
      driver_action_reason: "The truck should be routed to service before extended use.",
      risk_summary: "Cooling fault may worsen under load if left unresolved.",
      safety_note: "Monitor temperature and stop if the gauge continues to climb.",
      compliance_note: "No confirmed compliance-critical violation yet, but escalation is recommended.",
      monitoring_instructions: ["Watch coolant temperature", "Check for active leaks after shutdown"],
      distance_or_time_limit: "Short distance only until inspected",
    },
    top_cause_repair_guidance: {
      top_most_likely_cause: "Coolant leak or low coolant level",
      confirm_before_replacement: true,
      likely_replacement_parts: ["coolant hose", "hose clamp", "radiator"],
      inspection_related_parts: ["surge tank", "coolant level sensor"],
      adjacent_parts_to_check: ["water pump", "thermostat housing"],
      recommended_tests: ["Pressure-test the cooling system", "Inspect hoses and radiator seams"],
      diagnostic_verification_labor_hours: {
        min: 1,
        max: 2,
      },
      repair_labor_hours: {
        min: 2,
        max: 4,
      },
      total_estimated_labor_hours: {
        min: 3,
        max: 6,
      },
      labor_time_confidence: 76,
      labor_time_basis: ["Cooling-system leak confirmation", "Typical Class 8 access time"],
    },
    ...overrides,
  };
}

function baseIntakeInterpretation(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    normalized_symptoms: ["engine oil mixing with coolant"],
    primary_symptoms: ["oil in coolant"],
    secondary_symptoms: ["contaminated coolant"],
    interpreted_fault_codes: [],
    inferred_systems: ["engine", "cooling", "lubrication"],
    likely_failure_modes: ["internal oil/coolant cross-contamination"],
    maintenance_history_signals: [],
    repair_history_signals: [],
    recent_parts_signals: [],
    recurrence_signals: [],
    evidence_keywords: ["oil in coolant", "coolant in oil", "milky oil"],
    candidate_cause_hints: ["engine oil cooler internal leak", "head gasket leak"],
    risk_flags: ["do not operate with contaminated oil and coolant"],
    missing_evidence: ["Need oil and coolant sample confirmation"],
    ambiguity_drivers: ["Oil cooler, head gasket, EGR cooler, or liner failure still need separation"],
    interpretation_rationale: ["Fluid contamination wording points to an internal leak path before rule scoring."],
    ...overrides,
  };
}

function stubFetchSequence(responses: Array<Record<string, unknown> | string | Error>) {
  let index = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      const current = responses[Math.min(index++, responses.length - 1)];
      if (current instanceof Error) {
        throw current;
      }

      return createReviewResponse(current);
    })
  );
}

describe("TADIS Service Layer", () => {
  beforeEach(() => {
    ENV.openRouterApiKey = "openrouter-test-key";
    ENV.openRouterModel = "openrouter/free";
    ENV.openRouterFallbackModel = "";
    ENV.geminiApiKey = "";
    ENV.geminiModel = "";
    ENV.simpleTadisMode = "false";
    ENV.diagnosticConfidenceThreshold = "85";
    ENV.diagnosticNewCauseMinConfidence = "62";
    ENV.diagnosticTimeoutMs = "4500";
    process.env.DIAGNOSTIC_LLM_RETRY_COUNT = "2";
  });

  afterEach(() => {
    delete process.env.DIAGNOSTIC_INTAKE_MAX_TOKENS;
    delete process.env.DIAGNOSTIC_REVIEW_MAX_TOKENS;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns the expanded structured contract and preserves the baseline audit trail", async () => {
    stubFetchSequence([baseLlmReview()]);

    const result = await analyzeDiagnostic({
      vehicleId: 42,
      vehicle: {
        id: 42,
        make: "Peterbilt",
        model: "579",
        year: 2022,
        mileage: 245320,
        engine: "Cummins X15",
        configuration: { airBrakes: true },
      },
      symptoms: ["Engine overheating"],
      faultCodes: ["P0128"],
      driverNotes: "Coolant smell after shutdown",
    });

    expect(result.vehicle_id).toBe("42");
    expect(result.rule_engine_baseline.possible_causes.length).toBeGreaterThan(0);
    expect(result.final_llm_ranking.length).toBeGreaterThan(0);
    expect(result.internal_engine_baseline).toEqual(result.rule_engine_baseline);
    expect(result.llm_final_ranking).toEqual(result.final_llm_ranking);
    expect(result.ranked_likely_causes).toEqual(result.final_llm_ranking);
    expect(result.similar_confirmed_cases_used.length).toBeGreaterThan(0);
    expect(result.llm_status).toBe("ok");
    expect(result.fallback_used).toBe(false);
    expect(result.possible_causes.reduce((sum, item) => sum + item.probability, 0)).toBeGreaterThan(99);
    expect(result.confidence_rationale.length).toBeGreaterThan(0);
  });

  it("uses OpenRouter free even when stale Gemini variables are configured", async () => {
    ENV.geminiApiKey = "gemini-test-key";
    ENV.geminiModel = "gemini-2.5-flash";
    ENV.openRouterModel = "openrouter/free";
    ENV.openRouterFallbackModel = "openrouter/free";

    const requestedUrls: string[] = [];
    const requestedBodies: Array<Record<string, unknown>> = [];
    let callIndex = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        requestedUrls.push(url);
        requestedBodies.push(JSON.parse(String(init?.body ?? "{}")));

        return createReviewResponse(callIndex++ === 0 ? baseIntakeInterpretation() : baseLlmReview());
      })
    );

    const result = await analyzeDiagnostic({
      vehicleId: 42,
      vehicle: {
        id: 42,
        make: "Peterbilt",
        model: "579",
        year: 2022,
        mileage: 245320,
        engine: "Cummins X15",
        configuration: { airBrakes: true },
      },
      symptoms: ["Engine oil mixing with coolant"],
      faultCodes: [],
      driverNotes: "Milky residue in the surge tank",
    });

    expect(requestedUrls.length).toBeGreaterThan(0);
    expect(
      requestedUrls.every((url) => url.startsWith("https://openrouter.ai/api/v1/"))
    ).toBe(true);
      expect(
        requestedBodies.every(
          (body) => typeof body.model === "string" && String(body.model).includes("google/gemma-4-26b-a4b-it:free")
        )
      ).toBe(true);
    expect(result.llm_provider).toBe("openrouter");
    expect(result.llm_status).toBe("ok");
    expect(result.fallback_used).toBe(false);
  });

  it("uses the simple TADIS prompt path when SIMPLE_TADIS_MODE is enabled", async () => {
    ENV.simpleTadisMode = "true";

    const requestedBodies: Array<Record<string, unknown>> = [];
    let callIndex = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        requestedBodies.push(JSON.parse(String(init?.body ?? "{}")));
        return createReviewResponse(
          callIndex++ === 0
            ? {
                primary_category: "critical_engine_internal",
                secondary_category: "cooling_system",
                risk_level: "critical",
                classification_confidence: 97,
                clarifying_question: null,
              }
            : {
                top_likely_cause: "Internal engine oil/coolant cross-contamination",
                confidence_score: 92,
                clarifying_question: null,
                driver_action: "do_not_operate_until_repaired",
                safety_note: "Stop operating and arrange tow or on-site service.",
                shop_next_steps: ["Inspect oil and coolant samples", "Pressure-test the cooling system"],
                should_escalate_to_mechanic: true,
              }
        );
      })
    );

    const result = await analyzeDiagnostic({
      vehicleId: 42,
      vehicle: {
        id: 42,
        make: "Peterbilt",
        model: "579",
        year: 2022,
        mileage: 245320,
        engine: "Cummins X15",
        configuration: { airBrakes: true },
      },
      symptoms: ["Engine oil mixing with coolant", "Milky residue in the surge tank"],
      faultCodes: ["P0128"],
      driverNotes: "Recent repair notes and history should not be sent to the AI.",
      operatingConditions: "Under load",
      issueHistory: {
        priorDiagnostics: [
          { summary: "Old diagnostic should stay out of simple mode", status: "confirmed" },
        ],
        priorDefects: [{ summary: "Old defect", status: "open" }],
        recentInspections: [{ summary: "Old inspection", status: "submitted" }],
        recentRepairs: [{ summary: "Old repair", status: "completed" }],
        repairHistory: [{ summary: "Repair history that should be excluded", status: "completed" }],
        maintenanceHistory: [{ summary: "Maintenance history that should be excluded", status: "completed" }],
        recentPartsReplaced: [{ part: "thermostat", replacedAt: new Date().toISOString() }],
        complianceHistory: [{ summary: "Compliance history", status: "green" }],
      },
      similarCases: [
        {
          id: "historical-1",
          source: "historical",
          causeId: "coolant_leak",
          cause: "Coolant leak or low coolant level",
          systems_affected: ["cooling"],
          symptomSignals: ["coolant leak"],
          faultCodes: [],
          summary: "Historical case",
          resolution: "Fixed",
          confirmedFix: "Clamp replacement",
          resolutionSuccess: true,
          risk_level: "high",
          similarity: 0.8,
        },
      ],
      clarificationHistory: [],
    });

    expect(requestedBodies).toHaveLength(2);
    const [classifierBody, diagnosisBody] = requestedBodies;
    const classifierPrompt = String((classifierBody.messages as Array<Record<string, unknown>>)[1].content);
    const diagnosisPrompt = String((diagnosisBody.messages as Array<Record<string, unknown>>)[1].content);
    expect(classifierPrompt).toContain('"asset_type"');
    expect(classifierPrompt).not.toContain("repair_history");
    expect(classifierPrompt).not.toContain("similar_cases");
    expect(diagnosisPrompt).toContain('"current_issue"');
    expect(diagnosisPrompt).not.toContain("maintenance_history");
    expect(diagnosisPrompt).not.toContain("similar_confirmed_cases");
    expect(result.llm_status).toBe("ok");
    expect(result.fallback_used).toBe(false);
    expect(result.top_most_likely_cause).toContain("oil/coolant cross-contamination");
  });

  it("enriches generic LLM wording with case-specific evidence before returning the final result", async () => {
    stubFetchSequence([
      baseLlmReview({
        top_ranked_causes: [
          {
            cause_id: "coolant_leak",
            cause_name: "Coolant leak or low coolant level",
            is_new_cause: false,
            probability: 71,
            evidence_summary: ["Symptoms align with the issue"],
            ranking_rationale: ["This remains the top cause in context"],
            symptom_support_score: 83,
            fault_code_support_score: 74,
            repair_history_support_score: 60,
            maintenance_history_support_score: 42,
            recent_parts_support_score: 18,
            recurring_failure_support_score: 22,
            cause_library_fit_score: 88,
            novel_cause_support_score: null,
          },
          {
            cause_id: "thermostat_stuck",
            cause_name: "Thermostat stuck closed or opening late",
            is_new_cause: false,
            probability: 29,
            evidence_summary: ["Still plausible"],
            ranking_rationale: ["Secondary candidate"],
            symptom_support_score: 64,
            fault_code_support_score: 65,
            repair_history_support_score: 35,
            maintenance_history_support_score: 20,
            recent_parts_support_score: 10,
            recurring_failure_support_score: 16,
            cause_library_fit_score: 62,
            novel_cause_support_score: null,
          },
        ],
        confidence_rationale: ["The evidence supports the top cause."],
        driver_action_recommendation: {
          ...baseLlmReview().driver_action_recommendation,
          driver_action_reason: "The truck should be routed to service.",
          risk_summary: "This may worsen if ignored.",
        },
      }),
    ]);

    const result = await analyzeDiagnostic({
      vehicleId: 42,
      vehicle: {
        id: 42,
        make: "Peterbilt",
        model: "579",
        year: 2022,
        mileage: 245320,
        engine: "Cummins X15",
      },
      symptoms: ["Engine overheating"],
      faultCodes: ["P0128"],
      driverNotes: "Coolant smell after shutdown",
    });

    expect(result.final_llm_ranking[0]?.evidence_summary.join(" ")).toMatch(/coolant|P0128|overheating/i);
    expect(result.final_llm_ranking[0]?.ranking_rationale.join(" ")).not.toMatch(/top cause in context/i);
    expect(result.confidence_rationale.join(" ")).toMatch(/confidence|P0128|coolant/i);
    expect(result.recommended_fix).toMatch(/confirm|pressure-test|coolant hose|radiator/i);
  });

  it("retrieves a top 5-10 similar case set for RAG support", () => {
    const context = buildDiagnosticContext({
      vehicleId: 42,
      vehicle: {
        id: 42,
        make: "Peterbilt",
        model: "579",
        year: 2022,
      },
      symptoms: ["Brake warning light", "ABS light on"],
      faultCodes: ["C0035"],
      driverNotes: "Braking still feels normal",
    });

    const similarCases = retrieveSimilarCases(context);

    expect(similarCases.length).toBeGreaterThanOrEqual(5);
    expect(similarCases.length).toBeLessThanOrEqual(10);
    expect(similarCases[0]?.cause).toBeTruthy();
  });

  it("allows the LLM to reshape the final ranking over the baseline result", async () => {
    stubFetchSequence([
      baseLlmReview({
        top_ranked_causes: [
          {
            cause_id: "thermostat_stuck",
            cause_name: "Thermostat stuck closed or opening late",
            is_new_cause: false,
            probability: 68,
            evidence_summary: ["The symptom pattern is more consistent with restricted thermostat flow"],
            ranking_rationale: ["LLM elevated thermostat behavior over leak cues"],
            symptom_support_score: 82,
            fault_code_support_score: 73,
            repair_history_support_score: 44,
            maintenance_history_support_score: 37,
            recent_parts_support_score: 11,
            recurring_failure_support_score: 18,
            cause_library_fit_score: 79,
            novel_cause_support_score: null,
          },
          {
            cause_id: "coolant_leak",
            cause_name: "Coolant leak or low coolant level",
            is_new_cause: false,
            probability: 32,
            evidence_summary: ["Leak remains plausible but secondary"],
            ranking_rationale: ["Ranked below thermostat after full evidence review"],
            symptom_support_score: 70,
            fault_code_support_score: 72,
            repair_history_support_score: 33,
            maintenance_history_support_score: 22,
            recent_parts_support_score: 8,
            recurring_failure_support_score: 16,
            cause_library_fit_score: 58,
            novel_cause_support_score: null,
          },
        ],
        top_cause_repair_guidance: {
          ...baseLlmReview().top_cause_repair_guidance,
          top_most_likely_cause: "Thermostat stuck closed or opening late",
          likely_replacement_parts: ["thermostat", "thermostat gasket", "coolant"],
        },
      }),
    ]);

    const result = await analyzeDiagnostic({
      vehicleId: 42,
      vehicle: {
        id: 42,
        make: "Peterbilt",
        model: "579",
        year: 2022,
        mileage: 245320,
        engine: "Cummins X15",
      },
      symptoms: ["Engine overheating"],
      faultCodes: ["P0128"],
      driverNotes: "Coolant smell after shutdown",
    });

    expect(result.ranking_delta.top_cause_changed).toBe(true);
    expect(result.final_llm_ranking[0]?.cause_name).toContain("Thermostat");
    expect(result.llm_adjustments[0]).toContain("LLM");
  });

  it("captures LLM-proposed new causes for review", async () => {
    stubFetchSequence([
      baseLlmReview({
        top_ranked_causes: [
          {
            cause_id: null,
            cause_name: "EGR cooler internal coolant leak",
            is_new_cause: true,
            probability: 64,
            evidence_summary: ["Cooling loss and heat behavior may reflect an internal cooler leak"],
            ranking_rationale: ["The evidence suggests a cooling failure mode not yet in the hardcoded library"],
            symptom_support_score: 80,
            fault_code_support_score: 62,
            repair_history_support_score: 48,
            maintenance_history_support_score: 34,
            recent_parts_support_score: 12,
            recurring_failure_support_score: 24,
            cause_library_fit_score: 18,
            novel_cause_support_score: 77,
          },
          {
            cause_id: "coolant_leak",
            cause_name: "Coolant leak or low coolant level",
            is_new_cause: false,
            probability: 36,
            evidence_summary: ["Fallback library cause still plausible"],
            ranking_rationale: ["Kept as a secondary hardcoded candidate"],
            symptom_support_score: 74,
            fault_code_support_score: 70,
            repair_history_support_score: 25,
            maintenance_history_support_score: 20,
            recent_parts_support_score: 8,
            recurring_failure_support_score: 12,
            cause_library_fit_score: 51,
            novel_cause_support_score: null,
          },
        ],
        overall_confidence_score: 85,
      }),
    ]);

    const result = await analyzeDiagnostic({
      vehicleId: 42,
      vehicle: {
        id: 42,
        make: "Peterbilt",
        model: "579",
        year: 2022,
        mileage: 245320,
        engine: "Cummins X15",
      },
      symptoms: ["Engine overheating"],
      faultCodes: ["P0128"],
      driverNotes: "Coolant smell after shutdown",
    });

    expect(result.new_candidate_causes).toContain("EGR cooler internal coolant leak");
    expect(result.new_candidate_causes_review_required).toBe(true);
  });

  it("falls back cleanly when the LLM returns invalid schema", async () => {
    stubFetchSequence(['{"not":"valid"}']);

    const result = await analyzeDiagnostic({
      vehicleId: 42,
      vehicle: {
        id: 42,
        make: "Peterbilt",
        model: "579",
        year: 2022,
      },
      symptoms: ["Engine overheating"],
      faultCodes: ["P0128"],
      driverNotes: "Temperature rises on route",
    });

    expect(result.llm_status).toBe("invalid_schema");
    expect(result.fallback_used).toBe(true);
    expect(result.confidence_score).toBeLessThan(85);
    expect(result.next_action).toBe("ask_question");
    expect(result.clarifying_question.trim().length).toBeGreaterThan(0);
    expect(result.final_llm_ranking[0]?.cause_name).toBe(result.rule_engine_baseline.possible_causes[0]?.cause);
  });

  it("rejects zero-confidence LLM payloads and falls back to a clarification path", async () => {
    stubFetchSequence([
      {
        nextAction: "finalize",
        clarifyingQuestion: null,
        questionRationale: null,
        missingEvidence: [],
        ambiguityDrivers: [],
        topRankedCauses: [
          {
            causeName: "Coolant leak or low coolant level",
            probability: 70,
            evidenceSummary: ["P0128 and coolant smell support coolant loss"],
            rankingRationale: ["This remains the top cause"],
            symptomSupportScore: 84,
            faultCodeSupportScore: 77,
            repairHistorySupportScore: 42,
            maintenanceHistorySupportScore: 28,
            recentPartsSupportScore: 14,
            recurringFailureSupportScore: 18,
            causeLibraryFitScore: 88,
          },
        ],
        overallConfidenceScore: 0,
        confidenceRationale: [],
        faultCodeInterpretations: [],
        driverActionRecommendation: {
          llmDriverAction: "drive_to_shop",
          driverActionReason: "Route the truck to the shop.",
          riskSummary: "Cooling issue.",
          safetyNote: "Monitor the truck.",
          complianceNote: "Review required.",
          monitoringInstructions: [],
          distanceOrTimeLimit: null,
        },
        topCauseRepairGuidance: {
          topMostLikelyCause: "Coolant leak or low coolant level",
          confirmBeforeReplacement: true,
          likelyReplacementParts: ["coolant hose"],
          inspectionRelatedParts: [],
          adjacentPartsToCheck: [],
          recommendedTests: ["Pressure-test the cooling system"],
          diagnosticVerificationLaborHours: { min: 1, max: 2 },
          repairLaborHours: { min: 2, max: 4 },
          totalEstimatedLaborHours: { min: 3, max: 6 },
          laborTimeConfidence: 76,
          laborTimeBasis: ["Cooling-system leak confirmation"],
        },
      },
    ]);

    const result = await analyzeDiagnostic({
      vehicleId: 42,
      vehicle: {
        id: 42,
        make: "Peterbilt",
        model: "579",
        year: 2022,
      },
      symptoms: ["Engine overheating"],
      faultCodes: ["P0128"],
      driverNotes: "Coolant smell after shutdown",
    });

    expect(result.llm_status).toBe("invalid_schema");
    expect(result.fallback_used).toBe(true);
    expect(result.confidence_score).toBeLessThan(85);
    expect(result.next_action).toBe("ask_question");
    expect(result.clarifying_question).toMatch(/coolant|thermostat|engine overheating/i);
  });

  it("forces a fallback clarifying question after parse failure even when prior clarification rounds exist", async () => {
    stubFetchSequence(["not valid json"]);

    const result = await analyzeDiagnostic({
      vehicleId: 42,
      vehicle: {
        id: 42,
        make: "Peterbilt",
        model: "579",
        year: 2022,
      },
      symptoms: ["Engine overheating"],
      faultCodes: ["P0128"],
      driverNotes: "Coolant smell after shutdown",
      clarificationHistory: [
        { question: "Does the cab heat stay weak when it overheats?", answer: "Yes" },
        { question: "Do you see coolant around the radiator seams?", answer: "No" },
        { question: "Does the fan clutch sound engaged when the gauge climbs?", answer: "Unsure" },
        { question: "Is the issue worse under load than at idle?", answer: "Under load" },
        { question: "Does the warning start immediately after startup?", answer: "No" },
      ],
    });

    expect(result.llm_status).toBe("invalid_schema");
    expect(result.fallback_used).toBe(true);
    expect(result.confidence_score).toBeLessThan(85);
    expect(result.next_action).toBe("ask_question");
    expect(result.clarifying_question.trim().length).toBeGreaterThan(0);
  });

  it("accepts near-valid JSON with camelCase keys and proceed-style actions instead of falling back", async () => {
    stubFetchSequence([
      {
        nextAction: "proceed",
        clarifyingQuestion: null,
        questionRationale: null,
        missingEvidence: [],
        ambiguityDrivers: [],
        topRankedCauses: [
          {
            causeId: "coolant_leak",
            causeName: "Coolant leak or low coolant level",
            isNewCause: false,
            probability: "72",
            evidenceSummary: ["P0128 and coolant smell both support coolant loss"],
            rankingRationale: ["This outranks thermostat restriction after the full evidence review"],
            symptomSupportScore: "84",
            faultCodeSupportScore: "77",
            repairHistorySupportScore: "42",
            maintenanceHistorySupportScore: "28",
            recentPartsSupportScore: "14",
            recurringFailureSupportScore: "18",
            causeLibraryFitScore: "88",
            novelCauseSupportScore: null,
          },
        ],
        overallConfidenceScore: "82",
        confidenceRationale: ["Exact code and symptom cues strongly support the top cause."],
        faultCodeInterpretations: [
          {
            code: "P0128",
            interpretation: "Cooling temperature is staying below the expected range.",
            role: "primary",
            signalStrength: "80",
          },
        ],
        driverActionRecommendation: {
          llmDriverAction: "drive_to_shop",
          driverActionReason: "Route the truck to the shop before extended use.",
          riskSummary: "Cooling performance may worsen under load.",
          safetyNote: "Stop if temperature rises rapidly.",
          complianceNote: "Prompt service is recommended.",
          monitoringInstructions: ["Monitor coolant temperature"],
          distanceOrTimeLimit: "Short distance only",
        },
        topCauseRepairGuidance: {
          topMostLikelyCause: "Coolant leak or low coolant level",
          confirmBeforeReplacement: true,
          likelyReplacementParts: ["coolant hose", "hose clamp"],
          inspectionRelatedParts: ["surge tank"],
          adjacentPartsToCheck: ["thermostat housing"],
          recommendedTests: ["Pressure-test the cooling system"],
          diagnosticVerificationLaborHours: { min: "1", max: "2" },
          repairLaborHours: { min: "2", max: "4" },
          totalEstimatedLaborHours: { min: "3", max: "6" },
          laborTimeConfidence: "76",
          laborTimeBasis: ["Cooling-system leak confirmation"],
        },
      },
    ]);

    const result = await analyzeDiagnostic({
      vehicleId: 42,
      vehicle: {
        id: 42,
        make: "Peterbilt",
        model: "579",
        year: 2022,
      },
      symptoms: ["Engine overheating"],
      faultCodes: ["P0128"],
      driverNotes: "Coolant smell after shutdown",
    });

    expect(result.llm_status).toBe("ok");
    expect(result.fallback_used).toBe(false);
    expect(result.confidence_score).toBeGreaterThanOrEqual(80);
    expect(result.final_llm_ranking[0]?.cause_name).toContain("Coolant leak");
  });

  it("parses wrapped markdown JSON payloads from the LLM instead of falling back", async () => {
    stubFetchSequence([
      `Here is the structured diagnostic review:

\`\`\`json
{
  "result": ${JSON.stringify(baseLlmReview(), null, 2)}
}
\`\`\`
`,
    ]);

    const result = await analyzeDiagnostic({
      vehicleId: 42,
      vehicle: {
        id: 42,
        make: "Peterbilt",
        model: "579",
        year: 2022,
      },
      symptoms: ["Engine overheating"],
      faultCodes: ["P0128"],
      driverNotes: "Coolant smell after shutdown",
    });

    expect(result.llm_status).toBe("ok");
    expect(result.fallback_used).toBe(false);
    expect(result.confidence_score).toBeGreaterThanOrEqual(80);
    expect(result.final_llm_ranking[0]?.cause_name).toContain("Coolant leak");
  });

  it("parses provider-shaped diagnostic review aliases instead of falling back", async () => {
    stubFetchSequence([
      baseIntakeInterpretation(),
      {
        diagnostic_review: {
          nextAction: "finalize",
          ranked_likely_causes: [
            {
              cause: "Engine oil cooler internal leak",
              likelihood: 72,
              evidence: [
                "Driver reported engine oil mixing with coolant and contaminated surge tank residue",
              ],
              reasoning: ["Oil-to-coolant cross-contamination fits an internal exchanger leak."],
              scores: {
                symptoms: 91,
                repair_history: 30,
                maintenance_history: 20,
                recent_parts: 10,
                recurring_failure: 15,
                library_fit: 66,
              },
            },
            {
              cause: "Cylinder head gasket leak",
              likelihood: 28,
              evidence: ["Still possible if pressure testing shows combustion gas intrusion."],
              reasoning: ["Ranks below oil cooler until combustion-gas evidence is present."],
              scores: {
                symptoms: 74,
                repair_history: 25,
                maintenance_history: 18,
                recent_parts: 8,
                recurring_failure: 12,
                library_fit: 52,
              },
            },
          ],
          confidenceScore: 78,
          confidenceReasoning: [
            "The fluid cross-contamination wording strongly supports an internal leak path.",
          ],
          driverAction: {
            action: "do_not_operate_until_repaired",
            reason: "Oil and coolant contamination can damage bearings and cooling passages.",
            riskSummary: "Engine damage risk is high if operated further.",
            safetyNote: "Do not run except briefly for controlled verification.",
            complianceNote: "Treat as a major mechanical defect until repaired.",
          },
          repairGuidance: {
            topMostLikelyCause: "Engine oil cooler internal leak",
            confirmBeforeReplacement: true,
            likelyReplacementParts: ["engine oil cooler", "coolant", "engine oil", "filters"],
            recommendedTests: ["Pressure-test the oil cooler", "Inspect oil and coolant samples"],
            diagnosticVerificationLaborHours: { min: 1, max: 2 },
            repairLaborHours: { min: 4, max: 7 },
            totalEstimatedLaborHours: { min: 5, max: 9 },
            laborTimeConfidence: 70,
            laborTimeBasis: ["Oil cooler access and fluid flush time vary by engine configuration"],
          },
        },
      },
    ]);

    const result = await analyzeDiagnostic({
      vehicleId: 42,
      vehicle: {
        id: 42,
        make: "Peterbilt",
        model: "579",
        year: 2022,
        mileage: 245320,
        engine: "Cummins X15",
      },
      symptoms: ["Engine oil mixing with coolant"],
      driverNotes: "Milky residue in the surge tank",
    });

    expect(result.llm_status).toBe("ok");
    expect(result.fallback_used).toBe(false);
    expect(result.final_llm_ranking.some((cause) => cause.cause_name.includes("Engine oil cooler"))).toBe(true);
  });

  it("accepts alternate ranked cause and confidence field names from OpenRouter models", async () => {
    stubFetchSequence([
      {
        nextAction: "proceed",
        ranked_causes: [
          {
            id: "coolant_leak",
            name: "Coolant leak or low coolant level",
            probability_score: 74,
            evidence: ["Driver reported coolant smell after shutdown and fault code P0128 is present"],
            reasoning: ["Coolant loss better explains the odor than thermostat-only restriction"],
            scores: {
              symptoms: 86,
              fault_codes: 78,
              repair_history: 30,
              maintenance_history: 20,
              recent_parts: 10,
              recurring_failure: 15,
              library_fit: 88,
            },
          },
          {
            id: "thermostat_stuck",
            name: "Thermostat stuck closed or opening late",
            probability_score: 26,
            evidence: ["P0128 can also support thermostat behavior"],
            reasoning: ["Less likely than coolant loss because odor points to fluid escape"],
            scores: {
              symptoms: 62,
              fault_codes: 70,
              library_fit: 70,
            },
          },
        ],
        confidence_score: 81,
        confidence_reasoning: ["The exact P0128 code and coolant smell point to a cooling-system fault."],
        code_interpretations: [
          {
            code: "P0128",
            interpretation: "Coolant temperature is not reaching expected range.",
            role: "primary",
            signalStrength: 80,
          },
        ],
        driver_action: {
          action: "drive_to_shop",
          reason: "Cooling faults can worsen under load.",
          riskSummary: "Temperature control may degrade if fluid loss continues.",
          safetyNote: "Stop if the gauge rises quickly.",
          complianceNote: "No confirmed out-of-service defect yet.",
          monitoringInstructions: ["Watch the coolant temperature gauge"],
          distanceOrTimeLimit: "Short distance only",
        },
        repair_guidance: {
          cause: "Coolant leak or low coolant level",
          confirmBeforeReplacement: true,
          likelyReplacementParts: ["coolant hose", "hose clamp"],
          inspectionRelatedParts: ["surge tank"],
          adjacentPartsToCheck: ["water pump"],
          recommendedTests: ["Pressure-test the cooling system"],
          diagnosticVerificationLaborHours: { min: 1, max: 2 },
          repairLaborHours: { min: 2, max: 4 },
          totalEstimatedLaborHours: { min: 3, max: 6 },
          laborTimeConfidence: 72,
          laborTimeBasis: ["Cooling-system pressure test and hose access"],
        },
      },
    ]);

    const result = await analyzeDiagnostic({
      vehicleId: 42,
      vehicle: {
        id: 42,
        make: "Peterbilt",
        model: "579",
        year: 2022,
      },
      symptoms: ["Engine overheating"],
      faultCodes: ["P0128"],
      driverNotes: "Coolant smell after shutdown",
    });

    expect(result.llm_status).toBe("ok");
    expect(result.fallback_used).toBe(false);
    expect(result.confidence_score).toBeGreaterThanOrEqual(80);
    expect(result.final_llm_ranking[0]?.cause_name).toContain("Coolant leak");
  });

  it("retries a timed-out OpenRouter review before falling back", async () => {
    stubFetchSequence([baseIntakeInterpretation(), new Error("AI request timed out"), baseLlmReview()]);

    const result = await analyzeDiagnostic({
      vehicleId: 42,
      vehicle: {
        id: 42,
        make: "Peterbilt",
        model: "579",
        year: 2022,
      },
      symptoms: ["Engine overheating"],
      faultCodes: ["P0128"],
      driverNotes: "Coolant smell after shutdown",
    });

    expect(result.llm_status).toBe("ok");
    expect(result.fallback_used).toBe(true);
    expect(result.fallback_reason).toContain("succeeded after retry");
    expect(result.confidence_score).toBeGreaterThanOrEqual(80);
  });

  it("shrinks the OpenRouter completion budget and retries after a 402 credit-limit response", async () => {
    process.env.DIAGNOSTIC_REVIEW_MAX_TOKENS = "1600";
    stubFetchSequence([
      baseIntakeInterpretation(),
      new Error(
        "OpenRouter request failed (402 Payment Required): This request requires more credits, or fewer max_tokens. You requested up to 1600 tokens, but can only afford 385."
      ),
      baseLlmReview(),
    ]);

    const result = await analyzeDiagnostic({
      vehicleId: 42,
      vehicle: {
        id: 42,
        make: "Peterbilt",
        model: "579",
        year: 2022,
      },
      symptoms: ["Engine overheating"],
      faultCodes: ["P0128"],
      driverNotes: "Coolant smell after shutdown",
    });

    expect(result.llm_status).toBe("ok");
    expect(result.fallback_used).toBe(true);
    expect(result.fallback_reason).toContain("succeeded after retry");
    expect(result.confidence_score).toBeGreaterThanOrEqual(80);
  });

  it("retries with a more compact prompt when OpenRouter rejects the review prompt size", async () => {
    stubFetchSequence([
      baseIntakeInterpretation(),
      new Error(
        "OpenRouter request failed (402 Payment Required): Prompt tokens limit exceeded: 3944 > 3796. To increase, visit https://openrouter.ai/settings/credits and upgrade to a paid account"
      ),
      baseLlmReview(),
    ]);

    const result = await analyzeDiagnostic({
      vehicleId: 42,
      vehicle: {
        id: 42,
        make: "Peterbilt",
        model: "579",
        year: 2022,
      },
      symptoms: ["Engine overheating"],
      faultCodes: ["P0128"],
      driverNotes: "Coolant smell after shutdown",
    });

    expect(result.llm_status).toBe("ok");
    expect(result.fallback_used).toBe(true);
    expect(result.fallback_reason).toContain("succeeded after retry");
    expect(result.confidence_score).toBeGreaterThanOrEqual(80);
  });

  it("repairs malformed review prose into structured JSON instead of falling back to the rule engine", async () => {
    stubFetchSequence([
      {
        normalized_symptoms: ["engine overheating"],
        primary_symptoms: ["engine overheating"],
        secondary_symptoms: ["coolant smell after shutdown"],
        interpreted_fault_codes: [
          {
            code: "P0128",
            interpretation: "Coolant temperature is not reaching expected range.",
            role: "primary",
            signal_strength: 80,
          },
        ],
        inferred_systems: ["cooling"],
        likely_failure_modes: ["coolant loss", "thermostat restriction"],
        maintenance_history_signals: [],
        repair_history_signals: [],
        recent_parts_signals: [],
        recurrence_signals: [],
        evidence_keywords: ["engine overheating", "coolant smell", "P0128"],
        candidate_cause_hints: ["coolant leak", "thermostat stuck"],
        risk_flags: [],
        missing_evidence: [],
        ambiguity_drivers: ["Need to separate coolant loss from thermostat restriction"],
        interpretation_rationale: ["Cooling symptoms and P0128 point to a cooling-system fault path."],
      },
      `Most likely cause: Coolant leak or low coolant level.
Confidence: 82%.
Why: Coolant smell after shutdown with P0128 still points most strongly to coolant loss.
Runner up: Thermostat stuck closed.
Driver action: Drive to shop and monitor temperature.
Recommended tests: Pressure-test the cooling system and inspect hoses.`,
      baseLlmReview(),
    ]);

    const result = await analyzeDiagnostic({
      vehicleId: 42,
      vehicle: {
        id: 42,
        make: "Peterbilt",
        model: "579",
        year: 2022,
      },
      symptoms: ["Engine overheating"],
      faultCodes: ["P0128"],
      driverNotes: "Coolant smell after shutdown",
    });

    expect(result.llm_status).toBe("ok");
    expect(result.fallback_used).toBe(true);
    expect(result.fallback_reason).toContain("JSON repair");
    expect(result.final_llm_ranking[0]?.cause_name).toContain("Coolant leak");
    expect(result.confidence_score).toBeGreaterThanOrEqual(80);
  });

  it("falls back cleanly when the LLM times out", async () => {
    stubFetchSequence([new Error("AI request timed out")]);

    const result = await analyzeDiagnostic({
      vehicleId: 42,
      vehicle: {
        id: 42,
        make: "Peterbilt",
        model: "579",
        year: 2022,
      },
      symptoms: ["Engine overheating"],
      faultCodes: ["P0128"],
      driverNotes: "Temperature rises on route",
    });

    expect(result.llm_status).toBe("timeout");
    expect(result.fallback_used).toBe(true);
    expect(result.fallback_reason?.toLowerCase()).toContain("timed out");
  });

  it("returns one targeted clarifying question when the LLM requests more evidence", async () => {
    stubFetchSequence([
      baseLlmReview({
        next_action: "ask_question",
        clarifying_question:
          "When the gauge climbs, does cabin heat stay weak instead of blowing consistently hot air?",
        question_rationale: "This separates thermostat restriction from external coolant loss.",
        overall_confidence_score: 58,
        ambiguity_drivers: ["The cooling symptoms still split between leak and thermostat hypotheses"],
      }),
    ]);

    const result = await analyzeDiagnostic({
      vehicleId: 42,
      vehicle: {
        id: 42,
        make: "Peterbilt",
        model: "579",
        year: 2022,
      },
      symptoms: ["Engine overheating"],
      faultCodes: ["P0128"],
      driverNotes: "Temperature rises on route",
    });

    expect(result.next_action).toBe("ask_question");
    expect(result.clarifying_question).toContain("cabin heat");
    expect(result.question_rationale).toContain("thermostat");
  });

  it("finalizes when the LLM confidence reaches the configured threshold", async () => {
    ENV.diagnosticConfidenceThreshold = "85";
    stubFetchSequence([
      baseLlmReview({
        next_action: "finalize",
        clarifying_question: null,
        question_rationale: null,
        overall_confidence_score: 85,
        confidence_rationale: ["Evidence is strong enough to finalize at the configured threshold."],
      }),
    ]);

    const result = await analyzeDiagnostic({
      vehicleId: 42,
      vehicle: {
        id: 42,
        make: "Peterbilt",
        model: "579",
        year: 2022,
      },
      symptoms: ["Engine overheating"],
      faultCodes: ["P0128"],
      driverNotes: "Coolant smell after shutdown",
    });

    expect(result.llm_status).toBe("ok");
    expect(result.confidence_score).toBe(85);
    expect(result.next_action).toBe("proceed");
    expect(result.clarifying_question).toBe("");
  });

  it("applies the hardcoded safety override for brake-hold complaints", async () => {
    stubFetchSequence([
      baseLlmReview({
        top_ranked_causes: [
          {
            cause_id: "parking_brake_hold_failure",
            cause_name: "Parking brake chamber, valve, or adjustment fault",
            is_new_cause: false,
            probability: 78,
            evidence_summary: ["Vehicle creeps on grade with parking brake applied"],
            ranking_rationale: ["Symptoms indicate a brake-hold failure path"],
            symptom_support_score: 88,
            fault_code_support_score: 0,
            repair_history_support_score: 32,
            maintenance_history_support_score: 20,
            recent_parts_support_score: 10,
            recurring_failure_support_score: 12,
            cause_library_fit_score: 91,
            novel_cause_support_score: null,
          },
        ],
        driver_action_recommendation: {
          llm_driver_action: "keep_running_monitor",
          driver_action_reason: "The truck may still move to service with care.",
          risk_summary: "Brake hold is degraded.",
          safety_note: "Use caution.",
          compliance_note: "Review required.",
          monitoring_instructions: ["Confirm no rollback"],
          distance_or_time_limit: "Short distance",
        },
        top_cause_repair_guidance: {
          ...baseLlmReview().top_cause_repair_guidance,
          top_most_likely_cause: "Parking brake chamber, valve, or adjustment fault",
          likely_replacement_parts: ["parking brake chamber", "parking brake valve"],
        },
      }),
    ]);

    const result = await analyzeDiagnostic({
      vehicleId: 42,
      vehicle: {
        id: 42,
        make: "Peterbilt",
        model: "579",
        year: 2022,
        mileage: 245320,
        configuration: { airBrakes: true },
      },
      symptoms: ["Park brake not holding"],
      faultCodes: [],
      driverNotes: "Truck creeps on a slight grade with the parking brake applied.",
    });

    expect(result.safety_override_applied).toBe(true);
    expect(result.driver_action).toBe("do_not_operate_until_repaired");
    expect(result.safety_override_reason).toContain("Brake-system");
  });

  it("scores recurring failures and recent replacement decay signals", async () => {
    stubFetchSequence([baseLlmReview()]);

    const freshReplacement = await analyzeDiagnostic({
      vehicleId: 42,
      vehicle: {
        id: 42,
        make: "Peterbilt",
        model: "579",
        year: 2022,
      },
      symptoms: ["Engine overheating"],
      faultCodes: ["P0128"],
      driverNotes: "Temperature rises again after the last repair",
      issueHistory: {
        priorDiagnostics: [{ summary: "P0128 returned last month after coolant hose repair" }],
        priorDefects: [{ summary: "Overheating complaint reopened with the same code" }],
        recentInspections: [],
        recentRepairs: [],
        repairHistory: [{ summary: "Replaced coolant hose but overheating returned", status: "open" }],
        maintenanceHistory: [{ summary: "Cooling system service deferred" }],
        recentPartsReplaced: [
          {
            part: "coolant hose",
            replacedAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
            days_since_replacement: 3,
            replacement_effect_direction: "possible_incomplete_root_cause_repair",
            replacement_decay_weight: 1,
            relevance_score: 80,
          },
        ],
        complianceHistory: [],
      },
    });

    const oldReplacement = await analyzeDiagnostic({
      vehicleId: 42,
      vehicle: {
        id: 42,
        make: "Peterbilt",
        model: "579",
        year: 2022,
      },
      symptoms: ["Engine overheating"],
      faultCodes: ["P0128"],
      driverNotes: "Temperature rises again after the last repair",
      issueHistory: {
        priorDiagnostics: [{ summary: "P0128 returned last month after coolant hose repair" }],
        priorDefects: [{ summary: "Overheating complaint reopened with the same code" }],
        recentInspections: [],
        recentRepairs: [],
        repairHistory: [{ summary: "Replaced coolant hose but overheating returned", status: "open" }],
        maintenanceHistory: [{ summary: "Cooling system service deferred" }],
        recentPartsReplaced: [
          {
            part: "coolant hose",
            replacedAt: new Date(Date.now() - 210 * 86_400_000).toISOString(),
            days_since_replacement: 210,
            replacement_effect_direction: "possible_incomplete_root_cause_repair",
            replacement_decay_weight: 0.2,
            relevance_score: 80,
          },
        ],
        complianceHistory: [],
      },
    });

    expect(freshReplacement.recurring_failure_score).toBeGreaterThan(0);
    expect(freshReplacement.recurring_pattern_type.length).toBeGreaterThan(0);
    expect(freshReplacement.recent_parts_replaced[0]?.replacement_decay_weight).toBeGreaterThan(
      oldReplacement.recent_parts_replaced[0]?.replacement_decay_weight ?? 0
    );
  });

  it("returns top-cause parts, labor, and driver action guidance", async () => {
    stubFetchSequence([baseLlmReview()]);

    const result = await analyzeDiagnostic({
      vehicleId: 42,
      vehicle: {
        id: 42,
        make: "Peterbilt",
        model: "579",
        year: 2022,
      },
      symptoms: ["Engine overheating"],
      faultCodes: ["P0128"],
      driverNotes: "Coolant smell after shutdown",
    });

    expect(result.possible_replacement_parts.length).toBeGreaterThan(0);
    expect(result.total_estimated_labor_hours.max).toBeGreaterThanOrEqual(
      result.total_estimated_labor_hours.min
    );
    expect(result.driver_action).toBeTruthy();
    expect(result.driver_action_reason.length).toBeGreaterThan(0);
  });

  it("treats engine oil mixing with coolant as internal cross-contamination even if the LLM ranks a generic cooling cause", async () => {
    stubFetchSequence([
      baseLlmReview({
        top_ranked_causes: [
          {
            cause_id: "thermostat_stuck",
            cause_name: "Thermostat stuck closed or opening late",
            is_new_cause: false,
            probability: 80,
            evidence_summary: ["Cooling issue appears likely"],
            ranking_rationale: ["Generic cooling fault ranked first"],
            symptom_support_score: 70,
            fault_code_support_score: 20,
            repair_history_support_score: 0,
            maintenance_history_support_score: 0,
            recent_parts_support_score: 0,
            recurring_failure_support_score: 0,
            cause_library_fit_score: 65,
            novel_cause_support_score: null,
          },
          {
            cause_id: "coolant_leak",
            cause_name: "Coolant leak or low coolant level",
            is_new_cause: false,
            probability: 20,
            evidence_summary: ["Coolant is involved"],
            ranking_rationale: ["Possible cooling system issue"],
            symptom_support_score: 75,
            fault_code_support_score: 10,
            repair_history_support_score: 0,
            maintenance_history_support_score: 0,
            recent_parts_support_score: 0,
            recurring_failure_support_score: 0,
            cause_library_fit_score: 60,
            novel_cause_support_score: null,
          },
        ],
        overall_confidence_score: 64,
        confidence_rationale: ["The model underweighted the contamination wording."],
        top_cause_repair_guidance: {
          ...baseLlmReview().top_cause_repair_guidance,
          top_most_likely_cause: "Thermostat stuck closed or opening late",
          likely_replacement_parts: ["thermostat"],
          recommended_tests: ["Check thermostat opening temperature"],
        },
      }),
    ]);

    const result = await analyzeDiagnostic({
      vehicleId: 42,
      vehicle: {
        id: 42,
        make: "Peterbilt",
        model: "579",
        year: 2022,
        engine: "Cummins X15",
      },
      symptoms: ["Engine is mixing engine oil with coolant"],
      faultCodes: [],
      driverNotes: "Coolant reservoir has oily sludge and engine oil looks milky.",
    });

    expect(result.final_llm_ranking[0]?.cause_id).toBe("oil_coolant_cross_contamination");
    expect(result.top_most_likely_cause).toBe("Internal engine oil/coolant cross-contamination");
    expect(result.driver_action).toBe("do_not_operate_until_repaired");
    expect(result.possible_replacement_parts.join(" ")).toMatch(/oil cooler|head gasket|engine oil/i);
    expect(result.llm_adjustments.join(" ")).toMatch(/cross-contamination/i);
    expect(result.confidence_score).toBeGreaterThanOrEqual(82);
  });

  it("uses the LLM intake interpretation before the rules engine scores maintenance-history-driven candidates", async () => {
    stubFetchSequence([
      baseIntakeInterpretation(),
      baseLlmReview({
        top_ranked_causes: [
          {
            cause_id: "coolant_leak",
            cause_name: "Coolant leak or low coolant level",
            is_new_cause: false,
            probability: 74,
            evidence_summary: ["The maintenance history references a prior coolant hose repair"],
            ranking_rationale: ["The history points to a known cooling repair"],
            symptom_support_score: 55,
            fault_code_support_score: 0,
            repair_history_support_score: 80,
            maintenance_history_support_score: 70,
            recent_parts_support_score: 0,
            recurring_failure_support_score: 20,
            cause_library_fit_score: 70,
            novel_cause_support_score: null,
          },
          {
            cause_id: "thermostat_stuck",
            cause_name: "Thermostat stuck closed or opening late",
            is_new_cause: false,
            probability: 26,
            evidence_summary: ["Temperature control could still be involved"],
            ranking_rationale: ["Secondary cooling candidate"],
            symptom_support_score: 40,
            fault_code_support_score: 0,
            repair_history_support_score: 10,
            maintenance_history_support_score: 10,
            recent_parts_support_score: 0,
            recurring_failure_support_score: 0,
            cause_library_fit_score: 45,
            novel_cause_support_score: null,
          },
        ],
        overall_confidence_score: 68,
      }),
    ]);

    const result = await analyzeDiagnostic({
      vehicleId: 42,
      vehicle: {
        id: 42,
        make: "Peterbilt",
        model: "579",
        year: 2022,
        engine: "Cummins X15",
      },
      symptoms: ["Fluid contamination found during pre-trip"],
      driverNotes: "Driver says the reservoir and dipstick fluid look wrong.",
      issueHistory: {
        repairHistory: [{ summary: "Replaced coolant hose last month", status: "closed" }],
        maintenanceHistory: [{ summary: "Cooling system service completed recently", status: "closed" }],
      },
    });

    expect(result.normalized_symptoms).toContain("oil in coolant");
    expect(result.rule_engine_baseline.possible_causes[0]?.cause).toBe(
      "Internal engine oil/coolant cross-contamination"
    );
    expect(result.final_llm_ranking[0]?.cause_id).toBe("oil_coolant_cross_contamination");
    expect(result.llm_adjustments.join(" ")).toMatch(/interpreted raw symptoms/i);
  });

  it("parses a clarifying question from wrapped JSON model output", () => {
    const question = parseClarifyingQuestionResponse(
      'Here is the JSON: {"question":"Does the issue happen only under load?"}'
    );

    expect(question).toBe("Does the issue happen only under load?");
  });

  it("parses a clarifying question from fenced JSON model output", () => {
    const question = parseClarifyingQuestionResponse(
      '```json\n{"question":"Do you hear the fan clutch engage when temperature rises?"}\n```'
    );

    expect(question).toBe("Do you hear the fan clutch engage when temperature rises?");
  });

  it("runs the OpenRouter-backed review on the main analyzeDiagnosticWithAi path too", async () => {
    stubFetchSequence([baseLlmReview()]);

    const result = await analyzeDiagnosticWithAi({
      vehicleId: 42,
      vehicle: {
        id: 42,
        make: "Peterbilt",
        model: "579",
        year: 2022,
      },
      symptoms: ["Engine overheating"],
      faultCodes: ["P0128"],
      driverNotes: "Temperature rises on route",
    });

    expect(result.llm_status).toBe("ok");
    expect(result.final_llm_ranking.length).toBeGreaterThan(0);
  });
});
