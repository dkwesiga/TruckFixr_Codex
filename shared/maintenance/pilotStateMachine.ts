// CAD $99 pilot lifecycle (§29–§30). Pure domain rules: states, transitions,
// qualification, and activation requirements. Payment alone must NOT activate a
// pilot — activation requires payment AND agreement AND accountable owner AND
// kickoff baseline AND at least one vehicle added.

export const PILOT_STATES = [
  "applied",
  "under_review",
  "qualified",
  "payment_pending",
  "paid",
  "kickoff_pending",
  "active",
  "completed",
  "converted",
  "declined",
] as const;
export type PilotState = (typeof PILOT_STATES)[number];

// Pilot terms.
export const PILOT_PRICE_CAD_CENTS = 9900; // CAD $99, one-time
export const PILOT_VEHICLE_LIMIT = 5;
export const PILOT_DURATION_DAYS = 30;
export const PILOT_CONVERSION_WINDOW_DAYS = 14;

const TRANSITIONS: Record<PilotState, PilotState[]> = {
  applied: ["under_review", "qualified", "declined"],
  under_review: ["qualified", "declined"],
  qualified: ["payment_pending", "declined"],
  payment_pending: ["paid", "declined"],
  paid: ["kickoff_pending", "declined"],
  kickoff_pending: ["active", "declined"],
  active: ["completed", "declined"],
  completed: ["converted", "declined"],
  converted: [],
  declined: [],
};

export function canTransitionPilot(from: PilotState, to: PilotState): boolean {
  if (from === to) return false;
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function allowedPilotTransitions(from: PilotState): PilotState[] {
  return TRANSITIONS[from] ?? [];
}

export type QualificationResult = "qualified" | "needs_review" | "not_a_fit";

export interface QualificationInput {
  vehicleCount?: number | null;
  expectedCases30d?: number | null;
  hasMaintenanceManager?: boolean | null;
  outsourced?: boolean | null;
}

/**
 * Deterministic qualification for the assisted pilot (up to 5 vehicles). Larger
 * fleets or those with no expected cases are routed to manual review rather than
 * auto-qualified or hard-rejected.
 */
export function qualifyPilot(input: QualificationInput): QualificationResult {
  const vehicleCount = input.vehicleCount ?? 0;
  if (vehicleCount < 1) return "not_a_fit";
  // Well beyond the assisted-pilot size — a human should scope it.
  if (vehicleCount > 25) return "needs_review";
  if ((input.expectedCases30d ?? 0) < 1) return "needs_review";
  return "qualified";
}

export interface PilotActivationState {
  paid: boolean;
  agreementAccepted: boolean;
  hasAccountableOwner: boolean;
  baselineRecorded: boolean;
  vehiclesAdded: number;
}

/** Missing requirements that block activation (§30). Empty => ready to activate. */
export function activationBlockers(a: PilotActivationState): string[] {
  const blockers: string[] = [];
  if (!a.paid) blockers.push("payment_incomplete");
  if (!a.agreementAccepted) blockers.push("agreement_not_accepted");
  if (!a.hasAccountableOwner) blockers.push("no_accountable_owner");
  if (!a.baselineRecorded) blockers.push("no_baseline");
  if (a.vehiclesAdded < 1) blockers.push("no_vehicles_added");
  return blockers;
}

export function canActivatePilot(a: PilotActivationState): boolean {
  return activationBlockers(a).length === 0;
}

/** Whether a completed pilot is still within the subscription-credit window. */
export function isWithinConversionWindow(
  completedAt: Date | string,
  now: Date = new Date()
): boolean {
  const end = new Date(completedAt).getTime() + PILOT_CONVERSION_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return now.getTime() <= end;
}
