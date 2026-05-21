import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RunDiagnosisWorkflowResult } from "./services/diagnosisWorkflow";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { ENV } from "./_core/env";

const { runDiagnosisWorkflowMock } = vi.hoisted(() => ({
  runDiagnosisWorkflowMock: vi.fn(),
}));

vi.mock("./services/vehicleAccess", async () => {
  const actual = await vi.importActual<typeof import("./services/vehicleAccess")>(
    "./services/vehicleAccess"
  );
  return {
    ...actual,
    canDiagnoseVehicle: vi.fn(async () => true),
  };
});

vi.mock("./services/diagnosisWorkflow", async () => {
  const actual = await vi.importActual<typeof import("./services/diagnosisWorkflow")>(
    "./services/diagnosisWorkflow"
  );
  return {
    ...actual,
    runDiagnosisWorkflow: runDiagnosisWorkflowMock,
  };
});

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

function createWorkflowResult(
  overrides: Partial<RunDiagnosisWorkflowResult["diagnosis"]>
): RunDiagnosisWorkflowResult {
  return {
    diagnosis: {
      case_id: "diag-case-42",
      vehicle_id: "42",
      status: "clarification_needed",
      issue_summary: "Engine overheating with cooling-system evidence.",
      systems_affected: ["cooling"],
      likely_causes: [
        {
          cause: "Thermostat stuck closed or opening late",
          likelihood: "high",
          probability: 58,
          reasoning: "Current evidence still splits thermostat restriction from coolant loss.",
        },
        {
          cause: "Coolant leak or low coolant level",
          likelihood: "medium",
          probability: 42,
          reasoning: "Coolant loss remains plausible until the heat-behavior answer is confirmed.",
        },
      ],
      confidence_score: 58,
      clarifying_question:
        "When the gauge climbs, does cabin heat stay weak instead of blowing consistently hot air?",
      clarification_reason: "This separates thermostat restriction from coolant loss.",
      recommended_tests: ["Check hose temperature delta", "Confirm cabin heat behavior"],
      likely_parts: ["thermostat", "coolant"],
      safe_to_drive_decision: "drive_with_caution",
      risk_level: "medium",
      maintenance_recommendation: "Schedule cooling-system inspection.",
      compliance_impact: "warning",
      driver_friendly_explanation:
        "The truck shows a cooling issue that needs one more symptom detail before final ranking.",
      manager_summary: "Cooling fault needs one targeted clarification before dispatch decision.",
      advanced_ai_review_used: false,
      model_used: "openrouter/free",
      fallback_used: false,
      ...overrides,
    },
    classification: "normal",
    routing: {
      case_type: "fault_code",
      issue_type: "mixed",
      code_type: "OBD_DTC",
      risk_level: "medium",
      reference_lookup_required: true,
      reference_match_quality: "no_match",
      needs_clarification: true,
      clarifying_question:
        "When the gauge climbs, does cabin heat stay weak instead of blowing consistently hot air?",
      clarification_reason: "This separates thermostat restriction from coolant loss.",
      confidence_score: 58,
      recommended_model_tier: "low_cost",
      escalation_required: false,
      reason_for_escalation: "",
      extracted_fault_codes: ["P0128"],
      normalized_symptoms: ["engine overheating", "temperature rises on route"],
    },
    preprocessing: {
      normalizedFaultCodes: ["P0128"],
      detectedCodeType: "OBD_DTC",
      likelyIssueType: "mixed",
      referenceLookupRequired: true,
      normalizedSymptoms: ["engine overheating", "temperature rises on route"],
    },
    referenceLookup: {
      match_status: "no_match",
      references: [],
    },
    aiCallHistory: [],
    promptContext: {
      vehicle: {
        make: "Peterbilt",
        model: "579",
        year: 2022,
        engine: "Cummins X15",
      },
      user_report: {
        symptoms: "Engine overheating. Temperature rises on route.",
        fault_codes: ["P0128"],
      },
      maintenance_history: [],
      last_daily_inspection: null,
      clarification_history: [],
      fault_code_reference: {
        match_status: "no_match",
        references: [],
      },
      confirmed_outcome_references: [],
    },
    providerErrors: [],
  };
}

describe("diagnostics router full loop", () => {
  beforeEach(() => {
    ENV.openRouterApiKey = "openrouter-test-key";
    ENV.openRouterModel = "openrouter/free";
    ENV.geminiApiKey = "";
    ENV.geminiModel = "";
    runDiagnosisWorkflowMock.mockReset();
    runDiagnosisWorkflowMock
      .mockResolvedValueOnce(createWorkflowResult({}))
      .mockResolvedValueOnce(
        createWorkflowResult({
          status: "final",
          confidence_score: 86,
          clarifying_question: "",
          clarification_reason: "",
          likely_causes: [
            {
              cause: "Thermostat stuck closed or opening late",
              likelihood: "high",
              probability: 74,
              reasoning: "Weak cab heat while overheating resolved the main ambiguity.",
            },
            {
              cause: "Coolant leak or low coolant level",
              likelihood: "low",
              probability: 26,
              reasoning: "Still possible, but less consistent after the clarifying answer.",
            },
          ],
          recommended_tests: ["Check hose temperature delta", "Verify cab heat behavior"],
          safe_to_drive_decision: "drive_with_caution",
          risk_level: "medium",
          driver_friendly_explanation:
            "The answer points most strongly to thermostat restriction rather than coolant loss.",
          manager_summary: "Route the truck to service for thermostat confirmation and repair.",
        })
      );
  });

  it("asks one question and then finalizes after the answer changes the evidence state", async () => {
    const caller = appRouter.createCaller(createDriverContext());

    const firstPass = await caller.diagnostics.analyze({
      fleetId: 1,
      vehicleId: 42,
      vehicleContext: {
        id: 42,
        vin: "TESTVIN0000000001",
        make: "Peterbilt",
        model: "579",
        year: 2022,
        mileage: 245320,
        status: "active",
        complianceStatus: "green",
        configuration: { airBrakes: true },
      },
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
      vehicleContext: {
        id: 42,
        vin: "TESTVIN0000000001",
        make: "Peterbilt",
        model: "579",
        year: 2022,
        mileage: 245320,
        status: "active",
        complianceStatus: "green",
        configuration: { airBrakes: true },
      },
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
    expect(runDiagnosisWorkflowMock).toHaveBeenCalledTimes(2);
  });

  it("asks for asset clarification before diagnosing truck-only symptoms on a dry van trailer", async () => {
    const caller = appRouter.createCaller(createDriverContext());

    const response = await caller.diagnostics.analyze({
      fleetId: 1,
      vehicleId: "trailer-12",
      vehicleContext: {
        id: "trailer-12",
        vin: "TRAILER000000001",
        make: "Great Dane",
        model: "Dry Van",
        year: 2020,
        assetType: "dry_van_trailer",
        assetCategory: "trailer",
        vehicleType: "dry_van",
        isPoweredVehicle: false,
        isTrailer: true,
        mileage: 0,
        status: "active",
        complianceStatus: "green",
        configuration: {},
      },
      symptoms: ["Engine overheating and transmission slipping"],
      faultCodes: [],
      driverNotes: "Driver may have picked the wrong unit.",
      photoUrls: [],
      clarificationHistory: [],
    });

    expect(response.next_action).toBe("ask_question");
    expect(response.clarifying_question).toContain("This sounds like a truck issue");
    expect(response.clarifying_question).toContain("dry van trailer");
    expect(response.model_used).toBe("asset-scope-rule");
    expect(runDiagnosisWorkflowMock).not.toHaveBeenCalled();
  });

  it("allows reefer-unit symptoms on a reefer trailer while constraining the AI scope", async () => {
    const caller = appRouter.createCaller(createDriverContext());

    await caller.diagnostics.analyze({
      fleetId: 1,
      vehicleId: "reefer-9",
      vehicleContext: {
        id: "reefer-9",
        vin: "REEFER0000000009",
        make: "Utility",
        model: "Reefer Trailer",
        year: 2021,
        assetType: "reefer_trailer",
        assetCategory: "trailer",
        vehicleType: "reefer",
        isPoweredVehicle: false,
        isTrailer: true,
        mileage: 0,
        status: "active",
        complianceStatus: "green",
        configuration: { reeferUnit: true },
      },
      symptoms: ["Reefer engine will not start and the box temp is rising"],
      faultCodes: [],
      driverNotes: "Thermo King unit showing alarm.",
      photoUrls: [],
      clarificationHistory: [],
    });

    expect(runDiagnosisWorkflowMock).toHaveBeenCalledTimes(1);
    const workflowInput = runDiagnosisWorkflowMock.mock.calls[0]?.[0];
    expect(workflowInput.context.user_report.symptoms).toContain(
      "Asset diagnosis scope: reefer_trailer"
    );
    expect(workflowInput.context.user_report.symptoms).toContain(
      "refrigeration-unit systems only"
    );
  });
});
