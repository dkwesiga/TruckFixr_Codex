import { describe, expect, it } from "vitest";

import {
  buildReferenceCandidate,
  detectLikelyPii,
  normalizePartsReplaced,
  type BuildReferenceCandidateInput,
} from "./partnerKnowledge";

function input(
  overrides: Partial<BuildReferenceCandidateInput> = {}
): BuildReferenceCandidateInput {
  const base: BuildReferenceCandidateInput = {
    fleetId: 7,
    isPartnerFleet: true,
    promotedByUserId: 42,
    outcome: {
      id: 100,
      fleetId: 7,
      source: "partner_shop",
      confirmedFault: "Aftertreatment SCR efficiency below threshold",
      repairPerformed: "Replaced DEF dosing valve and cleared derate",
      partsReplaced: ["DEF dosing valve", "  ", 5],
      aiDiagnosisCorrect: "yes",
      diagnosticCaseId: "case-abc-123",
      promotedReferenceId: null,
    },
    reference: {
      codeSystem: "J1939",
      code: "SPN 4364 FMI 18",
      category: "aftertreatment",
      title: "SCR efficiency derate on DEF dosing failure",
      riskLevel: "high",
      recommendedChecks: ["Inspect DEF dosing valve", "Check DEF quality"],
    },
  };
  return {
    ...base,
    ...overrides,
    outcome: { ...base.outcome, ...overrides.outcome },
    reference: { ...base.reference, ...overrides.reference },
  };
}

describe("buildReferenceCandidate", () => {
  it("builds a needs_review candidate from a partner outcome", () => {
    const result = buildReferenceCandidate(input());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.candidate.reviewStatus).toBe("needs_review");
    expect(result.candidate.normalizedCode).toBe("SPN 4364 FMI 18");
    expect(result.candidate.summary).toContain("Confirmed fix: Replaced DEF dosing valve");
    expect(result.candidate.summary).toContain("DEF dosing valve");
    expect(result.candidate.metadata).toMatchObject({
      originRepairOutcomeId: 100,
      partnerFleetId: "7",
      promotedByUserId: 42,
      diagnosticCaseId: "case-abc-123",
      partsReplaced: ["DEF dosing valve"],
    });
  });

  it("rejects promotion from a non-partner fleet", () => {
    const result = buildReferenceCandidate(input({ isPartnerFleet: false }));
    expect(result).toEqual({ ok: false, error: "not_partner" });
  });

  it("rejects an outcome that belongs to another fleet", () => {
    const result = buildReferenceCandidate(input({ outcome: { fleetId: 9 } as any }));
    expect(result).toEqual({ ok: false, error: "wrong_fleet" });
  });

  it("rejects an outcome that was already promoted", () => {
    const result = buildReferenceCandidate(input({ outcome: { promotedReferenceId: 55 } as any }));
    expect(result).toEqual({ ok: false, error: "already_promoted" });
  });

  it("reports missing required fields", () => {
    const result = buildReferenceCandidate(input({ reference: { code: "", title: "" } as any }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("missing_fields");
    expect(result.details).toEqual(expect.arrayContaining(["code", "title"]));
  });

  it("blocks candidates carrying customer-specific PII", () => {
    const result = buildReferenceCandidate(
      input({
        reference: {
          title: "Fix for VIN 1HGCM82633A004352 aftertreatment",
        } as any,
      })
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("pii_detected");
    expect(result.details).toContain("vin");
  });
});

describe("detectLikelyPii", () => {
  it("flags VINs, emails, and phone numbers", () => {
    expect(detectLikelyPii("VIN 1HGCM82633A004352")).toContain("vin");
    expect(detectLikelyPii("contact bob@example.com")).toContain("email");
    expect(detectLikelyPii("call 416-555-0199 today")).toContain("phone");
  });

  it("does not flag ordinary fault-code text", () => {
    expect(detectLikelyPii("SPN 4364 FMI 18 aftertreatment derate")).toEqual([]);
  });
});

describe("normalizePartsReplaced", () => {
  it("keeps only non-empty trimmed strings", () => {
    expect(normalizePartsReplaced(["a", "  ", 3, " b "])).toEqual(["a", "b"]);
    expect(normalizePartsReplaced(null)).toEqual([]);
  });
});
