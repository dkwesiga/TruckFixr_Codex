import { describe, expect, it } from "vitest";
import {
  inferHistoricalCauseId,
  jaccardSimilarity,
  scoreHistoricalDiagnosticCase,
  tokenizeDiagnosticText,
} from "./routers/diagnostics";

describe("diagnostic support data helpers", () => {
  it("scores similar historical cases from symptoms and fault-code overlap", () => {
    const score = scoreHistoricalDiagnosticCase({
      caseSignals: ["DEF warning and aftertreatment derate under load"],
      caseFaultCodes: ["SPN 4364 FMI 18"],
      currentSymptoms: ["Aftertreatment warning with DEF derate risk"],
      currentFaultCodes: ["SPN 4364 FMI 18"],
    });

    expect(score).toBeGreaterThan(0.45);
  });

  it("does not poison unknown history into the fuel-delivery bucket", () => {
    expect(inferHistoricalCauseId("driver reported an unclear intermittent concern")).toBe(
      "unclassified"
    );
  });

  it("recognizes fleet-specific diesel issue families", () => {
    expect(inferHistoricalCauseId("NOx sensor caused DEF derate")).toBe("aftertreatment_derate");
    expect(inferHistoricalCauseId("dump body PTO hydraulic hose leak")).toBe("hydraulic_pto_fault");
    expect(inferHistoricalCauseId("annual MTO safety inspection due")).toBe(
      "compliance_inspection_due"
    );
  });

  it("tokenizes and compares text without punctuation noise", () => {
    expect(
      jaccardSimilarity(
        tokenizeDiagnosticText("DEF/aftertreatment warning"),
        tokenizeDiagnosticText("aftertreatment warning")
      )
    ).toBeGreaterThan(0.5);
  });
});
