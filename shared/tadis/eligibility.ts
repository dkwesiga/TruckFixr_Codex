// TADIS eligibility classification (§12). Not every shop transaction should
// improve TADIS — this is a pure, explainable SUGGESTION; a human (tenant
// technician/manager or TruckFixr platform admin) can always override it
// (see maintenanceCases.tadisEligibility / tadisEligibilityOverridden* in the
// schema). Routine activity must never silently inflate knowledge metrics.

import { RESOLVED_OUTCOME_STATES, type OutcomeState } from "./outcomeLifecycle";
import type { CaseType } from "./caseTypes";
import type { QualityScoreResult } from "./qualityScore";

export const TADIS_ELIGIBILITY_STATES = [
  "not_assessed",
  "operational_record",
  "tadis_candidate",
  "tadis_learning_record",
  "excluded",
] as const;
export type TadisEligibilityState = (typeof TADIS_ELIGIBILITY_STATES)[number];

// Case types that are routine by nature — they can still be excellent
// operational/shop history, but on their own they are not diagnostic
// learning. A case can still escalate out of this bucket if evidence and
// outcome state say otherwise (e.g. a "preventive_maintenance" visit that
// uncovered and fixed a real fault).
const ROUTINE_CASE_TYPES: CaseType[] = ["parts_only", "administrative"];

export type EligibilityClassificationInput = {
  caseType: CaseType;
  outcomeState: OutcomeState;
  qualityTier: QualityScoreResult["tier"] | null;
  hasRootCauseDocumented: boolean;
  hasResolution: boolean;
};

export type EligibilityClassificationResult = {
  suggested: TadisEligibilityState;
  reason: string;
};

export function classifyCaseEligibility(
  input: EligibilityClassificationInput
): EligibilityClassificationResult {
  if (!input.hasResolution) {
    return {
      suggested: "operational_record",
      reason: "No Resolution has been recorded yet for this case.",
    };
  }

  if (ROUTINE_CASE_TYPES.includes(input.caseType)) {
    return {
      suggested: "operational_record",
      reason: `Case type "${input.caseType}" is routine shop activity, not diagnostic learning.`,
    };
  }

  if (input.caseType === "preventive_maintenance" && input.outcomeState !== "failed") {
    return {
      suggested: "operational_record",
      reason:
        "Preventive maintenance without a confirmed fault is useful vehicle history, not a diagnostic learning record.",
    };
  }

  if (input.caseType === "customer_inquiry" && input.outcomeState === "unknown") {
    return {
      suggested: "operational_record",
      reason: "Inquiry has a Resolution but no follow-up evidence (Outcome: Unknown).",
    };
  }

  // A Failed/Incorrect outcome is always at least a candidate — it is
  // negative evidence and must not be discarded just because the repair
  // didn't work (§9/§15).
  if (input.outcomeState === "failed") {
    return {
      suggested: "tadis_candidate",
      reason: "Failed/incorrect outcome kept as negative evidence for future retrieval.",
    };
  }

  if (!RESOLVED_OUTCOME_STATES.includes(input.outcomeState)) {
    return {
      suggested: "operational_record",
      reason: `Outcome is "${input.outcomeState}" — no verified evidence yet to learn from.`,
    };
  }

  const strongEnough = input.qualityTier === "strong" || input.qualityTier === "confirmed";
  if (
    (input.outcomeState === "confirmed" || input.outcomeState === "verified") &&
    strongEnough &&
    input.hasRootCauseDocumented
  ) {
    return {
      suggested: "tadis_learning_record",
      reason: `${input.outcomeState === "confirmed" ? "Confirmed" : "Verified"} outcome with strong evidence and a documented root cause.`,
    };
  }

  return {
    suggested: "tadis_candidate",
    reason: "Outcome is evidence-backed but does not yet meet the bar for a full learning record.",
  };
}
