import { describe, expect, it } from "vitest";
import { getDiagnosticRuntimeConfig } from "./diagnosticConfig";
import {
  INSUFFICIENT_EVIDENCE_CAUSE_LABEL,
  INSUFFICIENT_EVIDENCE_CONFIDENCE_CAP,
  INSUFFICIENT_EVIDENCE_RECOMMENDED_FIX,
  buildBaselineStage,
  type DiagnosticInputRequest,
} from "./tadisCore";

// Regression coverage for the tie-to-first-array-entry bug: when a complaint matches
// no keyword/domain/fault-code signal for ANY cause in CAUSE_LIBRARY, every cause used
// to tie at the same base score and a stable sort silently surfaced whichever cause is
// declared first in CAUSE_LIBRARY (oil_coolant_cross_contamination) as if it were a
// confident diagnosis. See tadisCore.ts evaluateCause()/buildBaselineStage().

const config = getDiagnosticRuntimeConfig();

function baseInput(overrides: Partial<DiagnosticInputRequest> = {}): DiagnosticInputRequest {
  return {
    vehicleId: "veh-1",
    symptoms: ["There's a rattling noise from the dashboard trim panel when going over bumps"],
    faultCodes: [],
    clarificationHistory: [],
    ...overrides,
  };
}

describe("buildBaselineStage insufficient-evidence fallback", () => {
  it("does not silently present the first CAUSE_LIBRARY entry as a confident cause when nothing matches", () => {
    const stage = buildBaselineStage(baseInput(), config);

    expect(stage.baseline.insufficient_evidence).toBe(true);
    expect(stage.baseline.confidence_score).toBeLessThanOrEqual(INSUFFICIENT_EVIDENCE_CONFIDENCE_CAP);
    expect(stage.baseline.possible_causes).toHaveLength(1);
    expect(stage.baseline.possible_causes[0]).toEqual({
      cause: INSUFFICIENT_EVIDENCE_CAUSE_LABEL,
      probability: 0,
    });
    expect(stage.baseline.matched_library_causes).toEqual([]);
    expect(stage.baseline.partial_library_matches).toEqual([]);

    // The old bug: every cause tied at score 1, and the stable sort returned
    // CAUSE_LIBRARY's declared order verbatim (oil_coolant_cross_contamination first).
    // Confirm the internal ranking is no longer defaulting to declaration order for ties.
    const evidenceFreeCauses = stage.ranked.filter((item) => item.evidenceMatches === 0);
    expect(evidenceFreeCauses.length).toBeGreaterThan(1);
    expect(stage.ranked[0]?.cause.id).not.toBe("oil_coolant_cross_contamination");
  });

  it("asks a clarifying question instead of proceeding on a guessed cause when clarification rounds remain", () => {
    const stage = buildBaselineStage(baseInput({ clarificationHistory: [] }), config);

    expect(stage.baseline.next_action).toBe("ask_question");
    expect(stage.baseline.clarifying_question.length).toBeGreaterThan(0);
  });

  it("surfaces the insufficient-evidence state explicitly once clarification rounds are exhausted", () => {
    const stage = buildBaselineStage(
      baseInput({
        clarificationHistory: [
          {
            question: "Are there any active dashboard warning lights?",
            answer: "no",
          },
        ],
      }),
      config
    );

    expect(stage.baseline.next_action).toBe("proceed");
    expect(stage.baseline.insufficient_evidence).toBe(true);
    expect(stage.baseline.possible_causes).toEqual([
      { cause: INSUFFICIENT_EVIDENCE_CAUSE_LABEL, probability: 0 },
    ]);
    expect(stage.baseline.recommended_fix).toBe(INSUFFICIENT_EVIDENCE_RECOMMENDED_FIX);
  });

  it("still ranks a matching cause normally and does not mark it as insufficient evidence", () => {
    const stage = buildBaselineStage(
      baseInput({
        symptoms: ["Coolant is visibly leaking under the truck and the temperature gauge runs hot"],
      }),
      config
    );

    expect(stage.baseline.insufficient_evidence).toBe(false);
    expect(stage.baseline.possible_causes[0]?.cause).not.toBe(INSUFFICIENT_EVIDENCE_CAUSE_LABEL);
  });
});
