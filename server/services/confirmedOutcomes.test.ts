import { describe, expect, it } from "vitest";

import {
  buildConfirmedOutcomeReferences,
  scoreHistoricalDiagnosticCase,
  type ConfirmedRepairOutcomeRow,
} from "./confirmedOutcomes";

function outcome(overrides: Partial<ConfirmedRepairOutcomeRow>): ConfirmedRepairOutcomeRow {
  return {
    fleetId: 1,
    confirmedFault: "Unknown fault",
    repairPerformed: "Repair performed",
    partsReplaced: [],
    aiDiagnosisCorrect: "unknown",
    diagnosticCaseId: null,
    returnedToServiceAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("buildConfirmedOutcomeReferences", () => {
  it("ranks more similar same-fleet outcomes first", () => {
    const result = buildConfirmedOutcomeReferences({
      fleetId: 1,
      repairOutcomeRows: [
        outcome({
          confirmedFault: "Brake chamber leak causing slow pressure build",
          repairPerformed: "Replaced front brake chamber",
        }),
        outcome({
          confirmedFault: "DEF aftertreatment derate under heavy load",
          repairPerformed: "Replaced DEF dosing valve and cleared derate",
        }),
      ],
      currentSymptoms: ["DEF aftertreatment derate warning under heavy load"],
      currentFaultCodes: [],
    });

    expect(result.references[0].summary).toContain("DEF aftertreatment derate");
    expect(result.droppedForeignFleetCount).toBe(0);
  });

  it("drops other fleets' outcomes and reports the count (no cross-fleet leakage)", () => {
    const result = buildConfirmedOutcomeReferences({
      fleetId: 1,
      repairOutcomeRows: [
        outcome({ fleetId: 2, confirmedFault: "Company B secret coolant leak" }),
        outcome({ fleetId: 1, confirmedFault: "Company A coolant leak" }),
      ],
      currentSymptoms: ["coolant leak"],
      currentFaultCodes: [],
    });

    expect(result.droppedForeignFleetCount).toBe(1);
    expect(result.references).toHaveLength(1);
    expect(result.references[0].summary).toContain("Company A");
    expect(JSON.stringify(result.references)).not.toContain("Company B");
  });

  it("includes parts, AI accuracy, and case link in the summary", () => {
    const result = buildConfirmedOutcomeReferences({
      fleetId: 1,
      repairOutcomeRows: [
        outcome({
          confirmedFault: "Coolant leak",
          repairPerformed: "Replaced water pump",
          partsReplaced: ["water pump", "gasket"],
          aiDiagnosisCorrect: "correct",
          diagnosticCaseId: "case-123",
        }),
      ],
      currentSymptoms: ["coolant leak"],
      currentFaultCodes: [],
    });

    const summary = result.references[0].summary;
    expect(summary).toContain("Coolant leak: Replaced water pump.");
    expect(summary).toContain("Parts: water pump, gasket.");
    expect(summary).toContain("AI diagnosis: correct.");
    expect(summary).toContain("Case: case-123.");
  });

  it("prioritizes normalized repair outcomes over the looser feedback trail", () => {
    const result = buildConfirmedOutcomeReferences({
      fleetId: 1,
      repairOutcomeRows: [
        outcome({ confirmedFault: "Coolant leak", repairPerformed: "Replaced hose" }),
      ],
      confirmedFeedbackReferences: [{ date: "2026-02-02", summary: "Looser activity-log note" }],
      currentSymptoms: ["coolant leak"],
      currentFaultCodes: [],
      limit: 1,
    });

    expect(result.references).toHaveLength(1);
    expect(result.references[0].summary).toContain("Coolant leak");
  });

  it("falls back to feedback references when no normalized outcomes exist", () => {
    const result = buildConfirmedOutcomeReferences({
      fleetId: 1,
      repairOutcomeRows: [],
      confirmedFeedbackReferences: [{ date: "2026-02-02", summary: "Confirmed via manager feedback" }],
      currentSymptoms: ["coolant leak"],
      currentFaultCodes: [],
    });

    expect(result.references).toEqual([{ date: "2026-02-02", summary: "Confirmed via manager feedback" }]);
  });

  it("uses stored review signals (symptoms + fault codes) to boost similarity", () => {
    const result = buildConfirmedOutcomeReferences({
      fleetId: 1,
      repairOutcomeRows: [
        outcome({
          confirmedFault: "Resolved",
          repairPerformed: "Replaced sensor",
          diagnosticCaseId: "case-xyz",
        }),
      ],
      reviewMetadataByCaseId: new Map([
        [
          "case-xyz",
          {
            diagnosisContext: {
              symptoms: ["intermittent boost pressure loss on grade"],
              faultCodes: ["SPN 102 FMI 18"],
            },
          },
        ],
      ]),
      currentSymptoms: ["boost pressure loss on grade"],
      currentFaultCodes: ["SPN 102 FMI 18"],
    });

    expect(result.references).toHaveLength(1);
  });

  it("returns nothing for an empty fleet history", () => {
    const result = buildConfirmedOutcomeReferences({
      fleetId: 1,
      repairOutcomeRows: [],
      currentSymptoms: ["coolant leak"],
      currentFaultCodes: [],
    });
    expect(result.references).toHaveLength(0);
    expect(result.droppedForeignFleetCount).toBe(0);
  });
});

describe("scoreHistoricalDiagnosticCase", () => {
  it("scores matching fault codes and symptoms higher than unrelated ones", () => {
    const high = scoreHistoricalDiagnosticCase({
      caseSignals: ["DEF aftertreatment derate under load"],
      caseFaultCodes: ["SPN 3364 FMI 18"],
      currentSymptoms: ["DEF aftertreatment derate under load"],
      currentFaultCodes: ["SPN 3364 FMI 18"],
    });
    const low = scoreHistoricalDiagnosticCase({
      caseSignals: ["brake chamber leak"],
      caseFaultCodes: ["ABS 1234"],
      currentSymptoms: ["DEF aftertreatment derate under load"],
      currentFaultCodes: ["SPN 3364 FMI 18"],
    });
    expect(high).toBeGreaterThan(low);
  });
});
