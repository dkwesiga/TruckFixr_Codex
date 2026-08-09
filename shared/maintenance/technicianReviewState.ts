// Paid ($99 CAD) technician-reviewed Resolution report lifecycle (PRD v1.1 §5).
// Pure domain rules: states and transitions. Payment alone does not start the
// SLA clock — the clock only begins once a technician marks the case Review
// Ready (evidence complete). See technicianReviewSla.ts for the SLA timing.

export const TECHNICIAN_REVIEW_STATES = [
  "payment_pending",
  "paid",
  "missing_evidence",
  "call_proposed",
  "review_ready",
  "under_review",
  "reviewed",
  "delivered",
  "refunded",
  "cancelled",
] as const;
export type TechnicianReviewState = (typeof TECHNICIAN_REVIEW_STATES)[number];

export const TECHNICIAN_REVIEW_PRICE_CAD_CENTS = 9900; // CAD $99, one-time
export const TECHNICIAN_REVIEW_SLA_TARGET_MINUTES = 120; // 2 business hours
export const TECHNICIAN_REVIEW_CALL_MAX_MINUTES = 15;

const TRANSITIONS: Record<TechnicianReviewState, TechnicianReviewState[]> = {
  payment_pending: ["paid", "cancelled"],
  paid: ["missing_evidence", "call_proposed", "review_ready", "refunded"],
  missing_evidence: ["call_proposed", "review_ready", "refunded"],
  call_proposed: ["missing_evidence", "review_ready", "refunded"],
  review_ready: ["under_review", "refunded"],
  under_review: ["reviewed", "refunded"],
  reviewed: ["delivered"],
  delivered: [],
  refunded: [],
  cancelled: [],
};

export function canTransitionTechnicianReview(
  from: TechnicianReviewState,
  to: TechnicianReviewState
): boolean {
  if (from === to) return false;
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function allowedTechnicianReviewTransitions(
  from: TechnicianReviewState
): TechnicianReviewState[] {
  return TRANSITIONS[from] ?? [];
}

// Missing-evidence reminder cadence (§5.3): 24h, 72h, then a final notice on
// day 6. If still unresponsive, day 7 triggers a full refund and closes the
// paid review (enforced by the service layer, not this pure schedule).
export const MISSING_EVIDENCE_REMINDER_STAGES = [
  { stage: "24h", offsetMs: 24 * 60 * 60 * 1000 },
  { stage: "72h", offsetMs: 72 * 60 * 60 * 1000 },
  { stage: "day6", offsetMs: 6 * 24 * 60 * 60 * 1000 },
] as const;
export const MISSING_EVIDENCE_AUTO_REFUND_OFFSET_MS = 7 * 24 * 60 * 60 * 1000; // day 7
