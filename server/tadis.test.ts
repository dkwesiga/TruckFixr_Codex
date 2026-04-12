import { describe, expect, it } from "vitest";
import {
  analyzeDiagnostic,
  buildDiagnosticContext,
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
      "systems_affected",
      "possible_causes",
      "confidence_score",
      "next_action",
      "clarifying_question",
      "recommended_tests",
      "recommended_fix",
      "risk_level",
    ]);
    expect(result.possible_causes.length).toBeGreaterThan(0);
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
    expect(result.clarifying_question).toContain("temperature");
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
});
