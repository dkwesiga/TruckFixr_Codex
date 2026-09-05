// Deterministic fitment-assessment logic (Parts Intelligence Phase 1). No DB,
// no LLM call — this is a pure decision function over evidence the caller
// supplies, exactly the "Fitment Assessment Service" described in the parts
// architecture. See docs/architecture/parts-acquisition.md and
// .claude/skills/truckfixr-parts-fitment/SKILL.md.
//
// Core safety invariant this file exists to enforce: a search-result
// description match or an aftermarket cross-reference must NEVER become
// "confirmed" on its own. Only strong, specific evidence (an exact current
// part-number match, a real OEM catalog match, an explicit manufacturer
// confirmation, or a technician's manual physical confirmation) reaches
// `confirmed`. Everything else is at most `likely`, and any conflict between
// evidence sources caps the result at `ambiguous` regardless of how much
// other evidence looks positive.

export const FITMENT_STATES = ["not_confirmed", "ambiguous", "likely", "confirmed"] as const;
export type FitmentState = (typeof FITMENT_STATES)[number];

export interface FitmentEvidenceInput {
  /** The candidate's number exactly matches the part currently/previously installed on this vehicle. */
  exactCurrentPartNumberMatch?: boolean;
  /** The candidate's OEM number matches a known OEM catalog entry confirmed applicable to this vehicle. */
  oemCatalogMatch?: boolean;
  /** The vehicle's known configuration (make/model/year/engine/etc.) matches the candidate's stated application. */
  vehicleConfigurationMatch?: boolean;
  /** An aftermarket/cross-reference number maps to this candidate. Evidence only — never itself OEM confirmation. */
  crossReferenceMatch?: boolean;
  /** The manufacturer (or an authoritative catalog) has explicitly confirmed this application. */
  manufacturerConfirmed?: boolean;
  /** A technician has manually confirmed fitment via physical inspection. */
  technicianConfirmed?: boolean;
  /** Two or more evidence sources disagree (caller-asserted, in addition to the internal check below). */
  conflictingEvidence?: boolean;
  /** Vehicle/part attributes needed but not available, e.g. ["vin", "engineSerialNumber", "axleConfiguration"]. */
  missingFields?: string[];
}

export interface FitmentAssessmentResult {
  state: FitmentState;
  supportingEvidence: string[];
  missingEvidence: string[];
  conflicts: string[];
}

const CONFIRMED_TIER_LABELS: Array<[keyof FitmentEvidenceInput, string]> = [
  ["exactCurrentPartNumberMatch", "exact current part-number match"],
  ["oemCatalogMatch", "OEM catalog match"],
  ["manufacturerConfirmed", "manufacturer-confirmed application"],
  ["technicianConfirmed", "technician manual confirmation"],
];

export function assessFitment(evidence: FitmentEvidenceInput): FitmentAssessmentResult {
  const supportingEvidence: string[] = [];
  const conflicts: string[] = [];
  const missingEvidence: string[] = [...(evidence.missingFields ?? [])];

  for (const [key, label] of CONFIRMED_TIER_LABELS) {
    if (evidence[key] === true) supportingEvidence.push(label);
  }
  if (evidence.vehicleConfigurationMatch === true) supportingEvidence.push("vehicle configuration match");
  if (evidence.crossReferenceMatch === true) supportingEvidence.push("aftermarket cross-reference match");

  // A known vehicle-configuration MISMATCH alongside any positive signal is a
  // direct internal conflict — don't rely solely on the caller's own
  // `conflictingEvidence` flag for this specific, safety-critical case.
  const hasAnyPositiveSignal =
    evidence.exactCurrentPartNumberMatch === true ||
    evidence.oemCatalogMatch === true ||
    evidence.manufacturerConfirmed === true ||
    evidence.technicianConfirmed === true ||
    evidence.crossReferenceMatch === true;
  const internalConflict = evidence.vehicleConfigurationMatch === false && hasAnyPositiveSignal;
  if (internalConflict) {
    conflicts.push("vehicle configuration mismatch conflicts with a positive identity match");
  }
  if (evidence.conflictingEvidence === true) {
    conflicts.push("caller-reported conflicting evidence");
  }

  const hasConflict = conflicts.length > 0;
  const hasConfirmedTierEvidence = CONFIRMED_TIER_LABELS.some(([key]) => evidence[key] === true);

  let state: FitmentState;
  if (hasConflict) {
    state = "ambiguous";
  } else if (hasConfirmedTierEvidence) {
    state = "confirmed";
  } else if (evidence.vehicleConfigurationMatch === true || evidence.crossReferenceMatch === true) {
    // Strong-but-incomplete evidence: a cross-reference or configuration
    // match alone is never enough for "confirmed" — see the invariant above.
    state = "likely";
  } else {
    state = "not_confirmed";
  }

  if (state !== "confirmed") {
    const missingForConfirmation = CONFIRMED_TIER_LABELS.filter(([key]) => evidence[key] !== true).map(
      ([, label]) => label
    );
    for (const item of missingForConfirmation) {
      if (!missingEvidence.includes(item)) missingEvidence.push(item);
    }
  }

  return { state, supportingEvidence, missingEvidence, conflicts };
}
