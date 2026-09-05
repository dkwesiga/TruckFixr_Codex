import { describe, expect, it } from "vitest";
import { assessFitment } from "./fitmentEvidence";

describe("assessFitment", () => {
  it("confirms fitment on an exact current part-number match", () => {
    const result = assessFitment({ exactCurrentPartNumberMatch: true });
    expect(result.state).toBe("confirmed");
    expect(result.supportingEvidence).toContain("exact current part-number match");
    expect(result.conflicts).toHaveLength(0);
  });

  it("confirms fitment on a manufacturer-confirmed application alone", () => {
    const result = assessFitment({ manufacturerConfirmed: true });
    expect(result.state).toBe("confirmed");
  });

  it("confirms fitment on a technician's manual physical confirmation", () => {
    const result = assessFitment({ technicianConfirmed: true });
    expect(result.state).toBe("confirmed");
  });

  it("treats vehicle-configuration match alone as likely, not confirmed", () => {
    const result = assessFitment({ vehicleConfigurationMatch: true });
    expect(result.state).toBe("likely");
    expect(result.missingEvidence.length).toBeGreaterThan(0);
  });

  it("never treats an aftermarket cross-reference alone as OEM-confirmed fitment", () => {
    const result = assessFitment({ crossReferenceMatch: true });
    expect(result.state).toBe("likely");
    expect(result.state).not.toBe("confirmed");
  });

  it("marks conflicting evidence as ambiguous even when some evidence looks positive", () => {
    const result = assessFitment({
      crossReferenceMatch: true,
      conflictingEvidence: true,
    });
    expect(result.state).toBe("ambiguous");
    expect(result.conflicts.length).toBeGreaterThan(0);
  });

  it("detects an internal conflict when vehicle configuration mismatches a positive match, without needing the caller to say so", () => {
    const result = assessFitment({
      oemCatalogMatch: true,
      vehicleConfigurationMatch: false,
    });
    expect(result.state).toBe("ambiguous");
    expect(result.conflicts[0]).toMatch(/vehicle configuration mismatch/);
  });

  it("does not silently upgrade a conflicting match to confirmed just because a strong signal is also present", () => {
    const result = assessFitment({
      exactCurrentPartNumberMatch: true,
      conflictingEvidence: true,
    });
    expect(result.state).toBe("ambiguous");
  });

  it("returns not_confirmed for insufficient evidence", () => {
    const result = assessFitment({});
    expect(result.state).toBe("not_confirmed");
    expect(result.supportingEvidence).toHaveLength(0);
  });

  it("returns not_confirmed and preserves missing-field hints when evidence is sparse", () => {
    const result = assessFitment({ missingFields: ["vin", "engineSerialNumber"] });
    expect(result.state).toBe("not_confirmed");
    expect(result.missingEvidence).toEqual(expect.arrayContaining(["vin", "engineSerialNumber"]));
  });
});
