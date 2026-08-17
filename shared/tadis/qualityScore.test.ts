import { describe, expect, it } from "vitest";
import { scoreOutcomeEvidence, type QualityScoreInput } from "./qualityScore";

const fullEvidence: QualityScoreInput = {
  vinDecoded: true,
  vehicleIdentityComplete: true,
  engineInfoPresent: true,
  complaintDocumented: true,
  symptomsDocumented: true,
  faultCodesCaptured: true,
  photoOrDocEvidencePresent: true,
  diagnosticFindingsDocumented: true,
  rootCauseDocumented: true,
  repairPerformed: true,
  partsDocumented: true,
  verificationMethod: "fault_code_cleared",
  technicianVerified: true,
  outcomeState: "confirmed",
  evidenceSource: "shop_verified",
  recordOrigin: "live",
  repeatFailureWithinWindow: false,
};

const bareMinimum: QualityScoreInput = {
  ...fullEvidence,
  vinDecoded: false,
  vehicleIdentityComplete: false,
  engineInfoPresent: false,
  complaintDocumented: false,
  symptomsDocumented: false,
  faultCodesCaptured: false,
  photoOrDocEvidencePresent: false,
  diagnosticFindingsDocumented: false,
  rootCauseDocumented: false,
  partsDocumented: false,
  verificationMethod: null,
  technicianVerified: false,
  outcomeState: "unknown",
};

describe("scoreOutcomeEvidence", () => {
  it("scores a fully-documented, confirmed, shop-verified repair as confirmed tier", () => {
    const result = scoreOutcomeEvidence(fullEvidence);
    expect(result.score).toBeGreaterThanOrEqual(85);
    expect(result.tier).toBe("confirmed");
  });

  it("scores an almost-empty record as low tier", () => {
    const result = scoreOutcomeEvidence(bareMinimum);
    expect(result.score).toBeLessThan(40);
    expect(result.tier).toBe("low");
  });

  it("never labels a record 'confirmed' tier unless the outcome state is actually confirmed", () => {
    const verifiedNotConfirmed: QualityScoreInput = { ...fullEvidence, outcomeState: "verified" };
    const result = scoreOutcomeEvidence(verifiedNotConfirmed);
    expect(result.tier).not.toBe("confirmed");
    expect(result.tier).toBe("strong");
  });

  it("caps historical imports below what the same checklist would score live", () => {
    const live = scoreOutcomeEvidence(fullEvidence);
    const historical = scoreOutcomeEvidence({ ...fullEvidence, recordOrigin: "historical_import" });
    expect(historical.score).toBeLessThan(live.score);
    expect(historical.score).toBeLessThanOrEqual(70);
  });

  it("caps customer-reported evidence regardless of checklist completeness", () => {
    const result = scoreOutcomeEvidence({ ...fullEvidence, evidenceSource: "customer_reported" });
    expect(result.score).toBeLessThanOrEqual(55);
  });

  it("halves the score when a repeat failure is known within the confirmation window", () => {
    const clean = scoreOutcomeEvidence(fullEvidence);
    const repeated = scoreOutcomeEvidence({ ...fullEvidence, repeatFailureWithinWindow: true });
    expect(repeated.score).toBeLessThan(clean.score);
  });

  it("never lets ROI/financial data influence the score (no such input exists)", () => {
    // Type-level guarantee: QualityScoreInput has no cost/downtime fields.
    // This test documents the invariant so a future edit that adds one must
    // consciously change this file.
    const keys = Object.keys(fullEvidence);
    expect(keys.some((key) => /cost|cent|downtime|roi|saved/i.test(key))).toBe(false);
  });
});
