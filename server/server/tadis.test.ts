import { describe, expect, it } from "vitest";
import {
  analyzeDiagnostic,
  analyzeDiagnosticWithAi,
  buildDiagnosticContext,
  parseClarifyingQuestionResponse,
  retrieveSimilarCases,
} from "./services/tadisCore";

describe("TADIS Service Layer", () => {
  it("returns the strict JSON output shape", () => {
    const result = analyzeDiagnostic({
      vehicleId: 42,
      vehicle: {
        id: 42,
        make: "Peterbilt",
        model: "579",
        year: 2022,
        mileage: 245320,
        configuration: { airBrakes: true },
      },
      symptoms: ["Engine overheating"],
      faultCodes: ["P0128"],
      driverNotes: "Coolant smell after shutdown",
    });

    expect(Object.keys(result)).toEqual([
      "vehicle_id",
      "systems_affected",
      "possible_causes",
      "confidence_score",
      "next_action",
      "clarifying_question",
      "recommended_tests",
      "recommended_fix",
      "risk_level",
      "maintenance_recommendations",
      "compliance_impact",
    ]);
    expect(result.vehicle_id).toBe("42");
    expect(result.possible_causes.length).toBeGreaterThan(0);
    expect(result.possible_causes.reduce((sum, item) => sum + item.probability, 0)).toBeGreaterThan(99);
    expect(result.confidence_score).toBeGreaterThan(0);
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

  it("asks one specific clarifying question when confidence is below 75", () => {
    const result = analyzeDiagnostic({
      vehicleId: 42,
      vehicle: {
        id: 42,
        make: "Peterbilt",
        model: "579",
        year: 2022,
        mileage: 245320,
      },
      symptoms: ["Engine overheating"],
      faultCodes: [],
      driverNotes: "Temperature rises on route",
    });

    expect(result.confidence_score).toBeLessThan(75);
    expect(result.next_action).toBe("ask_question");
    expect(result.clarifying_question).toContain("To separate");
    expect(result.clarifying_question).toContain("Peterbilt 579");
    expect(result.clarifying_question.toLowerCase()).toContain("engine overheating");
  });

  it("recomputes and increases confidence after a clarifying answer", () => {
    const firstPass = analyzeDiagnostic({
      vehicleId: 42,
      vehicle: {
        id: 42,
        make: "Peterbilt",
        model: "579",
        year: 2022,
        mileage: 245320,
      },
      symptoms: ["Engine overheating"],
      faultCodes: [],
      driverNotes: "Temperature rises on route",
    });

    const secondPass = analyzeDiagnostic({
      vehicleId: 42,
      vehicle: {
        id: 42,
        make: "Peterbilt",
        model: "579",
        year: 2022,
        mileage: 245320,
      },
      symptoms: ["Engine overheating"],
      faultCodes: [],
      driverNotes: "Temperature rises on route",
      clarificationHistory: [
        {
          question: firstPass.clarifying_question,
          answer: "Yes, coolant level is dropping and there is wet residue after shutdown.",
        },
      ],
    });

    expect(secondPass.confidence_score).toBeGreaterThan(firstPass.confidence_score);
    expect(secondPass.possible_causes[0]?.cause).toContain("Coolant leak");
  });

  it("does not repeat the same clarifying question across iterations", () => {
    const firstPass = analyzeDiagnostic({
      vehicleId: 42,
      vehicle: {
        id: 42,
        make: "Peterbilt",
        model: "579",
        year: 2022,
        mileage: 245320,
      },
      symptoms: ["Engine overheating"],
      faultCodes: [],
      driverNotes: "Temperature rises in traffic",
    });

    const secondPass = analyzeDiagnostic({
      vehicleId: 42,
      vehicle: {
        id: 42,
        make: "Peterbilt",
        model: "579",
        year: 2022,
        mileage: 245320,
      },
      symptoms: ["Engine overheating"],
      faultCodes: [],
      driverNotes: "Temperature rises in traffic",
      clarificationHistory: [
        {
          question: firstPass.clarifying_question,
          answer: "No visible coolant loss, but it cools back down at highway speed.",
        },
      ],
    });

    if (secondPass.next_action === "ask_question") {
      expect(secondPass.clarifying_question).not.toBe(firstPass.clarifying_question);
    }
  });

  it("returns a low-confidence summary after 5 clarification rounds", () => {
    const result = analyzeDiagnostic({
      vehicleId: 42,
      vehicle: {
        id: 42,
        make: "Peterbilt",
        model: "579",
        year: 2022,
        mileage: 245320,
      },
      symptoms: ["Engine overheating"],
      faultCodes: [],
      driverNotes: "Temperature rises on route",
      clarificationHistory: [
        {
          question: "To separate Coolant leak or low coolant level from Thermostat stuck closed or opening late on this Peterbilt 579 for engine overheating: When the engine temperature rises, is coolant level dropping or do you see wet coolant residue under the truck after shutdown?",
          answer: "Not sure.",
        },
        {
          question: "To separate Cooling fan clutch or fan control failure from Coolant leak or low coolant level on this Peterbilt 579 for engine overheating: Does the truck run hotter mainly while idling or in slow traffic, but cool down once road speed increases?",
          answer: "Not sure.",
        },
        {
          question: "To separate Radiator airflow restriction or external blockage from Coolant leak or low coolant level on this Peterbilt 579 for engine overheating: Is there dirt, road debris, or visible blockage packed into the radiator or cooler fins?",
          answer: "Not sure.",
        },
        {
          question: "Question 4 placeholder",
          answer: "Not sure.",
        },
        {
          question: "Question 5 placeholder",
          answer: "Not sure.",
        },
      ],
    });

    expect(result.next_action).toBe("proceed");
    expect(result.confidence_score).toBeLessThan(75);
    expect(result.possible_causes.length).toBeGreaterThan(0);
  });

  it("matches prefixed clarification questions back into the reasoning engine", () => {
    const result = analyzeDiagnostic({
      vehicleId: 42,
      vehicle: {
        id: 42,
        make: "Peterbilt",
        model: "579",
        year: 2022,
        mileage: 245320,
      },
      symptoms: ["Brake warning light", "ABS light on"],
      faultCodes: ["C0035"],
      driverNotes: "Braking still feels normal",
      clarificationHistory: [
        {
          question:
            "To separate ABS wheel speed sensor or tone ring fault from Brake friction material wear or rotor/drum damage on this Peterbilt 579 for brake warning light: Does the warning appear intermittently while the truck still stops normally without grinding or pulsation?",
          answer: "Yes, the warning is intermittent and braking feels normal.",
        },
      ],
    });

    expect(result.possible_causes[0]?.cause).toContain("ABS");
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

  it("keeps parking brake complaints inside the brake-system clarification path", () => {
    const result = analyzeDiagnostic({
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
      driverNotes: "Truck creeps on a slight grade with the parking brake applied, but no low-air warning is active.",
    });

    expect(result.possible_causes[0]?.cause).toContain("Parking brake");
    expect(result.possible_causes.slice(0, 2).some((item) => item.cause.includes("Coolant"))).toBe(false);
    if (result.next_action === "ask_question") {
      expect(result.clarifying_question.toLowerCase()).toContain("parking brake");
    }
  });

  it("falls back to the built-in clarifying question when AI generation returns empty output", async () => {
    const result = await analyzeDiagnosticWithAi({
      vehicleId: 42,
      vehicle: {
        id: 42,
        make: "Peterbilt",
        model: "579",
        year: 2022,
        mileage: 245320,
      },
      symptoms: ["Engine overheating"],
      faultCodes: [],
      driverNotes: "Temperature rises on route",
    });

    expect(result.next_action).toBe("ask_question");
    expect(result.clarifying_question.trim().length).toBeGreaterThan(0);
  });
});
