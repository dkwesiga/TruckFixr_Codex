// Pure Outcome lifecycle rules (§9/§10 of the Mr Diesel / TADIS pipeline).
// No DB — shared client/server, trivially testable. Mirrors
// shared/maintenance/caseWorkflow.ts's transition-map style.
//
// Outcome Unknown    — no reliable follow-up exists yet.
// Reported Outcome   — customer/third party reports what happened; evidence
//                       insufficient for shop verification.
// Verified Outcome   — repair completed and technically verified by an
//                       authorized technician (see MAINTENANCE_CAPABILITIES
//                       .verifyOutcome in shared/maintenance/permissions.ts).
// Confirmed Outcome  — a Verified Outcome that later gained evidence the
//                       repair held (no comeback within a window, mileage,
//                       follow-up interaction, etc).
// Failed / Incorrect — the repair/resolution did not resolve the issue. This
//                       state is NEVER deleted — it is negative TADIS evidence.

export const OUTCOME_STATES = [
  "unknown",
  "reported",
  "verified",
  "confirmed",
  "failed",
] as const;
export type OutcomeState = (typeof OUTCOME_STATES)[number];

export const OUTCOME_STATE_LABELS: Record<OutcomeState, string> = {
  unknown: "Unknown",
  reported: "Reported",
  verified: "Verified",
  confirmed: "Confirmed",
  failed: "Failed / incorrect",
};

// Outcome states that represent an evidence-backed *result* (i.e. we are
// past "no reliable follow-up exists").
export const RESOLVED_OUTCOME_STATES: OutcomeState[] = ["verified", "confirmed", "failed"];

const TRANSITIONS: Record<OutcomeState, OutcomeState[]> = {
  // A customer/third-party report can arrive, or the shop can jump straight
  // to a technician-verified repair without an intermediate report.
  unknown: ["reported", "verified", "failed"],
  // A reported-only outcome can later be technically verified, or turn out
  // to have failed (customer reports the issue came back / was never fixed).
  reported: ["verified", "failed"],
  // A verified repair can later gain confirming evidence, or a comeback can
  // downgrade it to failed — that downgrade is itself valuable evidence and
  // must go through recordFailureAfterVerification (see outcomeVerification
  // service), never a silent overwrite.
  verified: ["confirmed", "failed"],
  // Even a confirmed outcome can regress to failed if a later comeback is
  // discovered (e.g. the fault returns after the confirmation window).
  confirmed: ["failed"],
  // Failed is not terminal in the trivial sense — a NEW resolution/repair
  // cycle on the same case can produce its own outcome, but that is a new
  // outcome row (new repairCycle), not a transition out of this one.
  failed: [],
};

export function canTransitionOutcome(from: OutcomeState, to: OutcomeState): boolean {
  if (from === to) return false;
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function allowedOutcomeTransitions(from: OutcomeState): OutcomeState[] {
  return TRANSITIONS[from] ?? [];
}

// Verification evidence types (§9). Free-form "other" always allowed with a note.
export const VERIFICATION_METHODS = [
  "road_test",
  "successful_restart",
  "fault_code_cleared",
  "monitor_status",
  "successful_regen",
  "pressure_test",
  "electrical_verification",
  "visual_inspection",
  "functional_test",
  "other",
] as const;
export type VerificationMethod = (typeof VERIFICATION_METHODS)[number];

// Confirmation evidence types (§9) — kept separate from verification methods
// because confirmation is about durability over time, not the repair itself.
export const CONFIRMATION_EVIDENCE_TYPES = [
  "no_comeback_time_elapsed",
  "mileage_accumulated",
  "subsequent_maintenance_confirms",
  "fleet_or_shop_follow_up",
  "other",
] as const;
export type ConfirmationEvidenceType = (typeof CONFIRMATION_EVIDENCE_TYPES)[number];

// How reliable the evidence source is for a reported/confirmed fact. Mirrors
// guestCases.evidenceSource so the two pipelines stay conceptually aligned.
export const EVIDENCE_SOURCES = [
  "shop_verified",
  "customer_reported",
  "truckfixr_estimate",
  "unknown",
] as const;
export type EvidenceSource = (typeof EVIDENCE_SOURCES)[number];

// Default confirmation window (days) used by the simple, configurable MVP
// confirmation rule: "no same-condition comeback within N days of a Verified
// Outcome" is enough to auto-suggest (never auto-apply) a Confirmed Outcome.
// Deliberately simple per §10 — future category-specific rules can replace
// this without changing the Outcome state machine itself.
export const DEFAULT_CONFIRMATION_WINDOW_DAYS = 30;

export function isKnownOutcomeState(value: string): value is OutcomeState {
  return (OUTCOME_STATES as readonly string[]).includes(value);
}

export function isKnownVerificationMethod(value: string): value is VerificationMethod {
  return (VERIFICATION_METHODS as readonly string[]).includes(value);
}
