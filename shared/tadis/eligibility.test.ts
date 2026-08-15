import { describe, expect, it } from "vitest";
import { classifyCaseEligibility } from "./eligibility";

describe("classifyCaseEligibility", () => {
  it("classifies a routine oil change (preventive maintenance, no fault) as an operational record", () => {
    const result = classifyCaseEligibility({
      caseType: "preventive_maintenance",
      outcomeState: "verified",
      qualityTier: "strong",
      hasRootCauseDocumented: false,
      hasResolution: true,
    });
    expect(result.suggested).toBe("operational_record");
  });

  it("classifies an oil-pressure complaint diagnosed, repaired, and verified as a learning record", () => {
    const result = classifyCaseEligibility({
      caseType: "diagnostic_troubleshooting",
      outcomeState: "verified",
      qualityTier: "strong",
      hasRootCauseDocumented: true,
      hasResolution: true,
    });
    expect(result.suggested).toBe("tadis_learning_record");
  });

  it("classifies an inquiry with no follow-up as an operational record (Outcome: Unknown)", () => {
    const result = classifyCaseEligibility({
      caseType: "customer_inquiry",
      outcomeState: "unknown",
      qualityTier: null,
      hasRootCauseDocumented: false,
      hasResolution: true,
    });
    expect(result.suggested).toBe("operational_record");
  });

  it("keeps a failed repair as a TADIS candidate (negative evidence), never discarded", () => {
    const result = classifyCaseEligibility({
      caseType: "corrective_repair",
      outcomeState: "failed",
      qualityTier: "moderate",
      hasRootCauseDocumented: true,
      hasResolution: true,
    });
    expect(result.suggested).toBe("tadis_candidate");
  });

  it("does not promote weak-evidence verified repairs straight to a learning record", () => {
    const result = classifyCaseEligibility({
      caseType: "corrective_repair",
      outcomeState: "verified",
      qualityTier: "moderate",
      hasRootCauseDocumented: false,
      hasResolution: true,
    });
    expect(result.suggested).toBe("tadis_candidate");
  });

  it("treats a case with no resolution yet as an operational record", () => {
    const result = classifyCaseEligibility({
      caseType: "diagnostic_troubleshooting",
      outcomeState: "unknown",
      qualityTier: null,
      hasRootCauseDocumented: false,
      hasResolution: false,
    });
    expect(result.suggested).toBe("operational_record");
  });
});
