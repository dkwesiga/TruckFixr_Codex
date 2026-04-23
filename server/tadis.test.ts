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
    ENV.diagnosticConfidenceThreshold = "75";
    ENV.diagnosticNewCauseMinConfidence = "62";
    ENV.diagnosticTimeoutMs = "4500";
  });

  afterEach(() => {
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
    expect(result.llm_status).toBe("ok");
    expect(result.fallback_used).toBe(false);
    expect(result.possible_causes.reduce((sum, item) => sum + item.probability, 0)).toBeGreaterThan(99);
    expect(result.confidence_rationale.length).toBeGreaterThan(0);
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
    expect(result.confidence_score).toBeLessThan(75);
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
    expect(result.confidence_score).toBeLessThan(75);
    expect(result.next_action).toBe("ask_question");
    expect(result.clarifying_question).toMatch(/coolant|thermostat|engine overheating/i);
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
