export type ReviewSeverity = "none" | "minor" | "major" | "unsafe";
export type ReportOutcome =
  | "clean"
  | "minor_review"
  | "major_action_required"
  | "reviewed"
  | "superseded";
export type QueueType =
  | "inspection_minor_review"
  | "inspection_major_action"
  | "grouped_combined_session"
  | "urgent_defect";
export type QueueStatus = "new" | "in_review" | "decision_made" | "reviewed";
export type QueueHeadlineStatus = "review_needed" | "urgent" | "reviewed";
export type VehicleOperationalState =
  | "active"
  | "blocked_pending_manager_review"
  | "move_for_repair_only"
  | "returned_to_service";

type PrimaryQueueDetails = {
  queueType: Extract<QueueType, "inspection_minor_review" | "inspection_major_action">;
  headlineStatus: Exclude<QueueHeadlineStatus, "reviewed">;
  priority: "low" | "normal" | "high" | "critical";
  managerDecisionRequired: boolean;
  requiresDriverInstruction: boolean;
};

type UrgentQueueDetails = {
  queueType: "urgent_defect";
  headlineStatus: "urgent";
  priority: "high" | "critical";
  managerDecisionRequired: true;
  requiresDriverInstruction: true;
};

export function deriveInspectionReviewSeverity(input: {
  majorDefectCount: number;
  minorDefectCount: number;
}): ReviewSeverity {
  if (input.majorDefectCount > 0) return "unsafe";
  if (input.minorDefectCount > 0) return "minor";
  return "none";
}

export function deriveIssueReviewSeverity(
  severity: "low" | "minor" | "medium" | "moderate" | "high" | "critical"
): ReviewSeverity {
  if (severity === "critical") return "unsafe";
  if (severity === "high") return "major";
  if (severity === "medium" || severity === "moderate" || severity === "minor") return "minor";
  return "none";
}

export function deriveReportOutcome(highestSeverity: ReviewSeverity): ReportOutcome {
  if (highestSeverity === "none") return "clean";
  if (highestSeverity === "minor") return "minor_review";
  return "major_action_required";
}

export function deriveManagerReviewRequired(highestSeverity: ReviewSeverity) {
  return highestSeverity !== "none";
}

export function deriveProvisionalDriverGuidance(highestSeverity: ReviewSeverity) {
  switch (highestSeverity) {
    case "none":
      return "Inspection submitted successfully.";
    case "minor":
      return "Inspection submitted. A manager review has been queued for the reported issue.";
    case "major":
      return "Inspection submitted. Do not operate this asset until a manager reviews the reported issue.";
    case "unsafe":
      return "Inspection submitted. Do not operate this asset until a manager reviews the reported defect.";
    default:
      return "Inspection submitted successfully.";
  }
}

export function derivePrimaryQueueDetails(
  highestSeverity: ReviewSeverity
): PrimaryQueueDetails | null {
  switch (highestSeverity) {
    case "minor":
      return {
        queueType: "inspection_minor_review",
        headlineStatus: "review_needed",
        priority: "low",
        managerDecisionRequired: false,
        requiresDriverInstruction: false,
      };
    case "major":
      return {
        queueType: "inspection_major_action",
        headlineStatus: "urgent",
        priority: "high",
        managerDecisionRequired: true,
        requiresDriverInstruction: true,
      };
    case "unsafe":
      return {
        queueType: "inspection_major_action",
        headlineStatus: "urgent",
        priority: "critical",
        managerDecisionRequired: true,
        requiresDriverInstruction: true,
      };
    default:
      return null;
  }
}

export function deriveUrgentDefectQueueDetails(
  highestSeverity: ReviewSeverity
): UrgentQueueDetails | null {
  if (highestSeverity === "unsafe") {
    return {
      queueType: "urgent_defect",
      headlineStatus: "urgent",
      priority: "critical",
      managerDecisionRequired: true,
      requiresDriverInstruction: true,
    };
  }

  if (highestSeverity === "major") {
    return {
      queueType: "urgent_defect",
      headlineStatus: "urgent",
      priority: "high",
      managerDecisionRequired: true,
      requiresDriverInstruction: true,
    };
  }

  return null;
}

export function deriveOperationalStateForSeverity(
  highestSeverity: ReviewSeverity
): VehicleOperationalState {
  if (highestSeverity === "major" || highestSeverity === "unsafe") {
    return "blocked_pending_manager_review";
  }

  return "active";
}

export function deriveOperationalStateForDecision(
  decision: "return_to_service" | "move_for_repair_only" | "do_not_operate"
): VehicleOperationalState {
  switch (decision) {
    case "return_to_service":
      return "returned_to_service";
    case "move_for_repair_only":
      return "move_for_repair_only";
    case "do_not_operate":
      return "blocked_pending_manager_review";
  }
}

export function isReportOutcomeReviewed(outcome: ReportOutcome | null | undefined) {
  return outcome === "clean" || outcome === "reviewed" || outcome === "superseded";
}

export function deriveCombinedHeadlineStatus(input: {
  truckOutcome?: ReportOutcome | null;
  trailerOutcome?: ReportOutcome | null;
}): QueueHeadlineStatus {
  const outcomes = [input.truckOutcome, input.trailerOutcome].filter(
    (value): value is ReportOutcome => Boolean(value)
  );

  if (outcomes.some((outcome) => outcome === "major_action_required")) {
    return "urgent";
  }

  if (outcomes.some((outcome) => outcome === "minor_review")) {
    return "review_needed";
  }

  return "reviewed";
}

export function deriveCombinedCompletionState(input: {
  truckInspectionId?: number | null;
  trailerInspectionId?: number | null;
  truckOutcome?: ReportOutcome | null;
  trailerOutcome?: ReportOutcome | null;
}) {
  const truckState =
    input.truckInspectionId && isReportOutcomeReviewed(input.truckOutcome) ? "reviewed" : "pending";
  const trailerState =
    input.trailerInspectionId && isReportOutcomeReviewed(input.trailerOutcome)
      ? "reviewed"
      : "pending";

  return `truck_${truckState}_trailer_${trailerState}` as
    | "truck_pending_trailer_pending"
    | "truck_reviewed_trailer_pending"
    | "truck_pending_trailer_reviewed"
    | "truck_reviewed_trailer_reviewed";
}
