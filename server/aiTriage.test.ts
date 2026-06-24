import { afterEach, describe, expect, it, vi } from "vitest";

const analyzeDiagnosticWithAi = vi.fn();

vi.mock("./services/tadisCore", () => ({
  analyzeDiagnosticWithAi: (...args: unknown[]) => analyzeDiagnosticWithAi(...args),
}));

import { mapTriageAction, runDefectTriage } from "./services/aiTriage";

const vehicle = { id: "TRUCK-1", vin: "VIN", make: "Volvo", model: "VNL", year: 2021 };

function analysis(overrides: Record<string, unknown> = {}) {
  return {
    confidence_score: 90,
    risk_level: "medium",
    top_most_likely_cause: "Worn brake pads",
    possible_causes: [{ cause: "Worn brake pads" }],
    clarifying_question: "When did it start?",
    confidence_rationale: ["Strong signal"],
    safety_note: "",
    risk_summary: "",
    recommended_tests: ["Inspect pads"],
    ...overrides,
  };
}

afterEach(() => {
  analyzeDiagnosticWithAi.mockReset();
});

describe("mapTriageAction", () => {
  it("maps critical risk to do_not_operate", () => {
    expect(mapTriageAction("critical", 90)).toBe("do_not_operate");
    expect(mapTriageAction("Stop now", 90)).toBe("do_not_operate");
  });
  it("maps high risk to repair_before_next_dispatch", () => {
    expect(mapTriageAction("high", 90)).toBe("repair_before_next_dispatch");
  });
  it("maps low confidence to continue_but_monitor", () => {
    expect(mapTriageAction("low", 50)).toBe("continue_but_monitor");
  });
  it("defaults to book_repair", () => {
    expect(mapTriageAction("low", 95)).toBe("book_repair");
  });
});

describe("runDefectTriage", () => {
  it("forces do_not_operate for critical severity regardless of AI risk", async () => {
    analyzeDiagnosticWithAi.mockResolvedValue(analysis({ risk_level: "low" }));
    const result = await runDefectTriage({
      vehicleId: "TRUCK-1",
      vehicle,
      defectDescription: "Brake warning light",
      category: "brakes",
      severity: "critical",
    });
    expect(result.recommended_action).toBe("do_not_operate");
    expect(result.confidence_score).toBe(90);
    expect(result.most_likely_cause).toBe("Worn brake pads");
  });

  it("derives action from AI risk for non-critical severity", async () => {
    analyzeDiagnosticWithAi.mockResolvedValue(analysis({ risk_level: "high" }));
    const result = await runDefectTriage({
      vehicleId: "TRUCK-1",
      vehicle,
      defectDescription: "Squealing brakes",
      severity: "medium",
    });
    expect(result.recommended_action).toBe("repair_before_next_dispatch");
  });

  it("includes a safety disclaimer when the AI returns no safety note", async () => {
    analyzeDiagnosticWithAi.mockResolvedValue(analysis());
    const result = await runDefectTriage({
      vehicleId: "TRUCK-1",
      vehicle,
      defectDescription: "Minor rattle",
      severity: "low",
    });
    expect(result.safety_warning.toLowerCase()).toContain("decision-support only");
  });

  it("returns a conservative fallback when AI triage throws", async () => {
    analyzeDiagnosticWithAi.mockRejectedValue(new Error("provider down"));
    const result = await runDefectTriage({
      vehicleId: "TRUCK-1",
      vehicle,
      defectDescription: "Coolant leak",
      severity: "medium",
    });
    expect(result.confidence_score).toBe(0);
    expect(result.recommended_action).toBe("book_repair");
    expect(result.manager_summary).toContain("AI triage was unavailable");
  });

  it("fallback forces do_not_operate for critical severity", async () => {
    analyzeDiagnosticWithAi.mockRejectedValue(new Error("provider down"));
    const result = await runDefectTriage({
      vehicleId: "TRUCK-1",
      vehicle,
      defectDescription: "Brake failure",
      severity: "critical",
    });
    expect(result.recommended_action).toBe("do_not_operate");
  });
});
