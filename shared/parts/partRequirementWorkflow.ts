// Pure domain rules for Parts Intelligence part requirements: status
// vocabulary and allowed transitions. No DB — trivially testable and shared
// client/server. Mirrors the style of shared/maintenance/caseWorkflow.ts and
// shared/tadis/outcomeLifecycle.ts.
//
// Phase 1 stopped at OPTIONS_AVAILABLE. Phase 2 adds the comparison/approval
// tail: RECOMMENDATION_READY -> AWAITING_APPROVAL -> APPROVED (terminal) |
// DECLINED (terminal) | NEEDS_MORE_INFORMATION (recoverable). Still no
// ORDERED/IN_TRANSIT/RECEIVED/INSTALLED/WARRANTY_CLAIM states — those are
// Phase 3+ (order execution), deliberately out of scope. APPROVED means "the
// fleet/shop selected this sourcing option," never "an order was placed" —
// see docs/architecture/parts-acquisition.md.

export const PART_REQUIREMENT_STATUSES = [
  "part_required",
  "identifying",
  "fitment_review",
  "fitment_verified",
  "sourcing",
  "options_available",
  // Phase 2: comparison + human approval.
  "recommendation_ready",
  "awaiting_approval",
  "approved",
  "declined",
  // Exception states.
  "fitment_ambiguous",
  "part_not_found",
  "needs_more_information",
  "cancelled",
] as const;

export type PartRequirementStatus = (typeof PART_REQUIREMENT_STATUSES)[number];

export const TERMINAL_PART_REQUIREMENT_STATUSES: PartRequirementStatus[] = [
  "approved",
  "declined",
  "part_not_found",
  "cancelled",
];

const TRANSITIONS: Record<PartRequirementStatus, PartRequirementStatus[]> = {
  part_required: ["identifying", "cancelled"],
  identifying: ["fitment_review", "part_not_found", "cancelled"],
  fitment_review: ["fitment_verified", "fitment_ambiguous", "part_not_found", "cancelled"],
  // An ambiguous fitment is not terminal — more evidence can move it forward,
  // or it can still turn out the part doesn't exist for this vehicle.
  fitment_ambiguous: ["fitment_review", "fitment_verified", "part_not_found", "cancelled"],
  fitment_verified: ["sourcing", "cancelled"],
  sourcing: ["options_available", "cancelled"],
  options_available: ["recommendation_ready", "sourcing", "cancelled"],
  // A re-ranking (new option captured) can legally happen more than once
  // before a human ever decides — recommendation_ready can return to itself
  // via sourcing, but not transition to itself directly (canTransition
  // rejects from===to); re-entering via "sourcing" models "still gathering
  // options" honestly instead of pretending nothing changed.
  recommendation_ready: ["awaiting_approval", "sourcing", "cancelled"],
  awaiting_approval: ["approved", "declined", "needs_more_information", "cancelled"],
  // Not terminal — more evidence/options can be gathered, then a new
  // approval cycle begins.
  needs_more_information: ["fitment_review", "sourcing", "cancelled"],
  approved: [],
  declined: [],
  part_not_found: [],
  cancelled: [],
};

export function canTransitionPartRequirement(
  from: PartRequirementStatus,
  to: PartRequirementStatus
): boolean {
  if (from === to) return false;
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function allowedPartRequirementTransitions(
  from: PartRequirementStatus
): PartRequirementStatus[] {
  return TRANSITIONS[from] ?? [];
}

export function isTerminalPartRequirementStatus(status: PartRequirementStatus): boolean {
  return TERMINAL_PART_REQUIREMENT_STATUSES.includes(status);
}
