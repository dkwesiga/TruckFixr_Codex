// Pure domain rules for Parts Intelligence Phase 1 part requirements: status
// vocabulary and allowed transitions. No DB — trivially testable and shared
// client/server. Mirrors the style of shared/maintenance/caseWorkflow.ts and
// shared/tadis/outcomeLifecycle.ts.
//
// Deliberately stops at OPTIONS_AVAILABLE — no ORDERED/IN_TRANSIT/RECEIVED/
// INSTALLED/WARRANTY_CLAIM states exist yet (Phase 2+). See
// docs/architecture/parts-acquisition.md.

export const PART_REQUIREMENT_STATUSES = [
  "part_required",
  "identifying",
  "fitment_review",
  "fitment_verified",
  "sourcing",
  "options_available",
  // Exception states.
  "fitment_ambiguous",
  "part_not_found",
  "cancelled",
] as const;

export type PartRequirementStatus = (typeof PART_REQUIREMENT_STATUSES)[number];

export const TERMINAL_PART_REQUIREMENT_STATUSES: PartRequirementStatus[] = [
  "options_available",
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
  options_available: [],
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
