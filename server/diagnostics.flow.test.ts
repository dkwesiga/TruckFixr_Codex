import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { ENV } from "./_core/env";

function createDriverContext(): TrpcContext {
  return {
    user: {
      id: 14,
      openId: "driver-14",
      email: "driver14@example.com",
      name: "Driver Fourteen",
      loginMethod: "email",
      role: "driver",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function createLlmResponse(review: Record<string, unknown>) {
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
            content: JSON.stringify(review),
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

describe("diagnostics router full loop", () => {
  beforeEach(() => {
    ENV.openRouterApiKey = "openrouter-test-key";
    ENV.openRouterModel = "openrouter/free";

    const responses = [
      {
        next_action: "ask_question",
        clarifying_question:
          "When the gauge climbs, does cabin heat stay weak instead of blowing consistently hot air?",
        question_rationale: "This separates thermostat restriction from coolant loss.",
        missing_evidence: ["Cabin heat behavior under temperature rise"],
        ambiguity_drivers: ["Cooling evidence is still split between thermostat and leak causes"],
        top_ranked_causes: [
          {
            cause_id: "thermostat_stuck",
            cause_name: "Thermostat stuck closed or opening late",
            is_new_cause: false,
            probability: 52,
            evidence_summary: ["Heat behavior is still missing"],
            ranking_rationale: ["Current evidence is incomplete"],
            symptom_support_score: 74,
            fault_code_support_score: 70,
            repair_history_support_score: 20,
            maintenance_history_support_score: 16,
            recent_parts_support_score: 8,
            recurring_failure_support_score: 10,
            cause_library_fit_score: 68,
            novel_cause_support_score: null,
          },
          {
            cause_id: "coolant_leak",
            cause_name: "Coolant leak or low coolant level",
            is_new_cause: false,
            probability: 48,
            evidence_summary: ["Still plausible if coolant smell persists"],
            ranking_rationale: ["Competing cooling hypothesis remains open"],
            symptom_support_score: 71,
            fault_code_support_score: 72,
            repair_history_support_score: 18,
            maintenance_history_support_score: 15,
            recent_parts_support_score: 8,
            recurring_failure_support_score: 10,
            cause_library_fit_score: 66,
            novel_cause_support_score: null,
          },
        ],
        overall_confidence_score: 58,
        confidence_rationale: ["A single targeted question should reduce the uncertainty."],
        fault_code_interpretations: [
          {
            code: "P0128",
            interpretation: "Cooling temperature is not reaching the expected range.",
            role: "primary",
            signal_strength: 80,
          },
        ],
        driver_action_recommendation: {
          llm_driver_action: "drive_to_shop",
          driver_action_reason: "The truck should go to service after the clarifying symptom is confirmed.",
          risk_summary: "Cooling fault could worsen if ignored.",
          safety_note: "Stop if temperature spikes sharply.",
          compliance_note: "No confirmed compliance-critical defect yet.",
          monitoring_instructions: ["Watch the temperature gauge"],
          distance_or_time_limit: "Short distance only",
        },
        top_cause_repair_guidance: {
          top_most_likely_cause: "Thermostat stuck closed or opening late",
          confirm_before_replacement: true,
          likely_replacement_parts: ["thermostat", "thermostat gasket", "coolant"],
          inspection_related_parts: ["upper hose", "heater circuit"],
          adjacent_parts_to_check: ["fan clutch", "radiator flow"],
          recommended_tests: ["Check hose temperature delta", "Confirm cabin heat behavior"],
          diagnostic_verification_labor_hours: { min: 1, max: 1.5 },
          repair_labor_hours: { min: 2, max: 3 },
          total_estimated_labor_hours: { min: 3, max: 4.5 },
          labor_time_confidence: 73,
          labor_time_basis: ["Cooling-system verification time"],
        },
      },
      {
        next_action: "finalize",
        clarifying_question: null,
        question_rationale: null,
        missing_evidence: [],
        ambiguity_drivers: [],
        top_ranked_causes: [
          {
            cause_id: "thermostat_stuck",
            cause_name: "Thermostat stuck closed or opening late",
            is_new_cause: false,
            probability: 74,
            evidence_summary: ["Weak cab heat while overheating strongly supports thermostat restriction"],
            ranking_rationale: ["The clarification resolved the main ambiguity"],
            symptom_support_score: 86,
            fault_code_support_score: 76,
            repair_history_support_score: 26,
            maintenance_history_support_score: 18,
            recent_parts_support_score: 8,
            recurring_failure_support_score: 12,
            cause_library_fit_score: 84,
            novel_cause_support_score: null,
          },
          {
            cause_id: "coolant_leak",
            cause_name: "Coolant leak or low coolant level",
            is_new_cause: false,
            probability: 26,
            evidence_summary: ["Cooling leak remains secondary"],
            ranking_rationale: ["Less consistent after the clarifying answer"],
            symptom_support_score: 64,
            fault_code_support_score: 70,
            repair_history_support_score: 18,
            maintenance_history_support_score: 15,
            recent_parts_support_score: 8,
            recurring_failure_support_score: 10,
            cause_library_fit_score: 58,
            novel_cause_support_score: null,
          },
        ],
        overall_confidence_score: 86,
        confidence_rationale: ["The clarifying answer resolved the top competing causes."],
        fault_code_interpretations: [
          {
            code: "P0128",
            interpretation: "Cooling temperature is not reaching the expected range.",
            role: "primary",
            signal_strength: 80,
          },
        ],
        driver_action_recommendation: {
          llm_driver_action: "drive_to_shop",
          driver_action_reason: "The truck can be routed to service for thermostat repair.",
          risk_summary: "Cooling performance is degraded but not yet a confirmed tow scenario.",
          safety_note: "Stop if temperature climbs beyond normal range.",
          compliance_note: "Service promptly to avoid escalation.",
          monitoring_instructions: ["Monitor temperature", "Watch cab heat consistency"],
          distance_or_time_limit: "Short distance only",
        },
        top_cause_repair_guidance: {
          top_most_likely_cause: "Thermostat stuck closed or opening late",
          confirm_before_replacement: true,
          likely_replacement_parts: ["thermostat", "thermostat gasket", "coolant"],
          inspection_related_parts: ["upper hose", "heater circuit"],
          adjacent_parts_to_check: ["fan clutch", "radiator flow"],
          recommended_tests: ["Check hose temperature delta", "Verify cab heat behavior"],
          diagnostic_verification_labor_hours: { min: 1, max: 1.5 },
          repair_labor_hours: { min: 2, max: 3 },
          total_estimated_labor_hours: { min: 3, max: 4.5 },
          labor_time_confidence: 76,
          labor_time_basis: ["Cooling-system verification time"],
        },
      },
    ];
    let responseIndex = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => createLlmResponse(responses[Math.min(responseIndex++, responses.length - 1)]))
    );
  });

  it("asks one question and then finalizes after the answer changes the evidence state", async () => {
    const caller = appRouter.createCaller(createDriverContext());

    const firstPass = await caller.diagnostics.analyze({
      fleetId: 1,
      vehicleId: 42,
      symptoms: ["Engine overheating"],
      faultCodes: ["P0128"],
      driverNotes: "Temperature rises on route",
      photoUrls: [],
      clarificationHistory: [],
    });

    expect(firstPass.next_action).toBe("ask_question");
    expect(firstPass.clarifying_question).toContain("cabin heat");
    expect(firstPass.llm_status).toBe("ok");

    const secondPass = await caller.diagnostics.analyze({
      fleetId: 1,
      vehicleId: 42,
      symptoms: ["Engine overheating"],
      faultCodes: ["P0128"],
      driverNotes: "Temperature rises on route",
      photoUrls: [],
      clarificationHistory: [
        {
          question: firstPass.clarifying_question,
          answer: "Yes, cab heat stays weak when the engine starts running hot.",
        },
      ],
    });

    expect(secondPass.next_action).toBe("proceed");
    expect(secondPass.possible_causes[0]?.cause).toContain("Thermostat");
    expect(secondPass.confidence_score).toBeGreaterThan(firstPass.confidence_score);
  });
});
