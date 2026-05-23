import { describe, expect, it } from "vitest";
import {
  deriveCombinedCompletionState,
  deriveCombinedHeadlineStatus,
  deriveInspectionReviewSeverity,
  deriveIssueReviewSeverity,
  deriveOperationalStateForDecision,
  deriveOperationalStateForSeverity,
  derivePrimaryQueueDetails,
  deriveProvisionalDriverGuidance,
  deriveReportOutcome,
  deriveUrgentDefectQueueDetails,
} from "./inspectionReviewWorkflow";

describe("inspection review workflow", () => {
  it("derives review severity and outcome from daily inspection defect counts", () => {
    expect(
      deriveInspectionReviewSeverity({
        majorDefectCount: 0,
        minorDefectCount: 0,
      })
    ).toBe("none");
    expect(
      deriveInspectionReviewSeverity({
        majorDefectCount: 0,
        minorDefectCount: 2,
      })
    ).toBe("minor");
    expect(
      deriveInspectionReviewSeverity({
        majorDefectCount: 1,
        minorDefectCount: 0,
      })
    ).toBe("unsafe");

    expect(deriveReportOutcome("none")).toBe("clean");
    expect(deriveReportOutcome("minor")).toBe("minor_review");
    expect(deriveReportOutcome("unsafe")).toBe("major_action_required");
  });

  it("maps driver issue report severities to review severity", () => {
    expect(deriveIssueReviewSeverity("low")).toBe("none");
    expect(deriveIssueReviewSeverity("medium")).toBe("minor");
    expect(deriveIssueReviewSeverity("high")).toBe("major");
    expect(deriveIssueReviewSeverity("critical")).toBe("unsafe");
  });

  it("builds queue metadata and operational state consistently", () => {
    expect(derivePrimaryQueueDetails("none")).toBeNull();
    expect(derivePrimaryQueueDetails("minor")).toMatchObject({
      queueType: "inspection_minor_review",
      priority: "low",
      managerDecisionRequired: false,
    });
    expect(derivePrimaryQueueDetails("unsafe")).toMatchObject({
      queueType: "inspection_major_action",
      priority: "critical",
      requiresDriverInstruction: true,
    });
    expect(deriveUrgentDefectQueueDetails("major")).toMatchObject({
      queueType: "urgent_defect",
      priority: "high",
    });
    expect(deriveUrgentDefectQueueDetails("minor")).toBeNull();
    expect(deriveOperationalStateForSeverity("unsafe")).toBe("blocked_pending_manager_review");
    expect(deriveOperationalStateForSeverity("minor")).toBe("active");
    expect(deriveOperationalStateForDecision("return_to_service")).toBe("returned_to_service");
    expect(deriveOperationalStateForDecision("do_not_operate")).toBe(
      "blocked_pending_manager_review"
    );
  });

  it("returns clear provisional driver guidance", () => {
    expect(deriveProvisionalDriverGuidance("none")).toContain("submitted successfully");
    expect(deriveProvisionalDriverGuidance("minor")).toContain("manager review");
    expect(deriveProvisionalDriverGuidance("unsafe")).toContain("Do not operate");
  });

  it("summarizes combined sessions by worst outcome and partial completion", () => {
    expect(
      deriveCombinedHeadlineStatus({
        truckOutcome: "clean",
        trailerOutcome: "major_action_required",
      })
    ).toBe("urgent");
    expect(
      deriveCombinedHeadlineStatus({
        truckOutcome: "minor_review",
        trailerOutcome: "clean",
      })
    ).toBe("review_needed");
    expect(
      deriveCombinedHeadlineStatus({
        truckOutcome: "reviewed",
        trailerOutcome: "clean",
      })
    ).toBe("reviewed");

    expect(
      deriveCombinedCompletionState({
        truckInspectionId: 11,
        truckOutcome: "reviewed",
        trailerInspectionId: null,
        trailerOutcome: null,
      })
    ).toBe("truck_reviewed_trailer_pending");
    expect(
      deriveCombinedCompletionState({
        truckInspectionId: 11,
        truckOutcome: "major_action_required",
        trailerInspectionId: 12,
        trailerOutcome: "clean",
      })
    ).toBe("truck_pending_trailer_reviewed");
  });
});
