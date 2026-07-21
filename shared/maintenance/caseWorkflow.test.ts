import { describe, expect, it } from "vitest";

import {
  approvalRequirementFor,
  canTransition,
  formatCaseReference,
  isCriticalAction,
} from "./caseWorkflow";
import {
  deriveAction,
  deriveSeverity,
  MaintenanceRecommendationAdapter,
} from "./recommendationAdapter";

describe("case status transitions", () => {
  it("allows valid forward transitions", () => {
    expect(canTransition("reported", "triaging")).toBe(true);
    expect(canTransition("out_of_service", "in_repair")).toBe(true);
    expect(canTransition("ready_for_return", "completed")).toBe(true);
    expect(canTransition("completed", "closed")).toBe(true);
  });

  it("rejects invalid transitions", () => {
    expect(canTransition("reported", "completed")).toBe(false);
    expect(canTransition("closed", "in_repair")).toBe(false);
    expect(canTransition("stable" as never, "closed")).toBe(false);
  });

  it("rejects a no-op transition to the same status", () => {
    expect(canTransition("in_repair", "in_repair")).toBe(false);
  });

  it("allows reopening from terminal states", () => {
    expect(canTransition("closed", "reopened")).toBe(true);
    expect(canTransition("cancelled", "reopened")).toBe(true);
  });
});

describe("approval requirements", () => {
  it("maps severity to approval policy", () => {
    expect(approvalRequirementFor("stable")).toBe("auto_record");
    expect(approvalRequirementFor("attention")).toBe("manager_approval");
    expect(approvalRequirementFor("critical")).toBe("critical_approval");
  });

  it("flags critical actions", () => {
    expect(isCriticalAction("tow")).toBe(true);
    expect(isCriticalAction("pull_from_service")).toBe(true);
    expect(isCriticalAction("roadside_assistance")).toBe(true);
    expect(isCriticalAction("schedule_service")).toBe(false);
    expect(isCriticalAction("continue_monitor")).toBe(false);
  });
});

describe("case reference format", () => {
  it("zero-pads the sequence to 6 digits", () => {
    expect(formatCaseReference(2026, 123)).toBe("MC-2026-000123");
    expect(formatCaseReference(2026, 1)).toBe("MC-2026-000001");
    expect(formatCaseReference(2026, 1234567)).toBe("MC-2026-1234567");
  });
});

describe("recommendation adapter", () => {
  it("derives critical severity + stop action from an unsafe diagnosis", () => {
    const view = { safeToDriveDecision: "do_not_drive", riskLevel: "critical" };
    expect(deriveSeverity(view)).toBe("critical");
    expect(deriveAction(view)).toBe("pull_from_service");
  });

  it("derives attention + complete-trip from drive-with-caution", () => {
    const view = { safeToDriveDecision: "drive_with_caution", riskLevel: "medium" };
    expect(deriveSeverity(view)).toBe("attention");
    expect(deriveAction(view)).toBe("complete_trip_then_inspect");
  });

  it("derives stable + monitor from a safe diagnosis", () => {
    const view = { safeToDriveDecision: "safe_to_drive", riskLevel: "low" };
    expect(deriveSeverity(view)).toBe("stable");
    expect(deriveAction(view)).toBe("continue_monitor");
  });

  it("respects TADIS urgency when present", () => {
    expect(deriveSeverity({ urgency: "Critical" })).toBe("critical");
    expect(deriveSeverity({ urgency: "Attention" })).toBe("attention");
    expect(deriveSeverity({ urgency: "Monitor" })).toBe("stable");
  });

  it("preserves the original recommendation text verbatim", () => {
    const rec = MaintenanceRecommendationAdapter.fromDiagnosticSession({
      maintenanceRecommendation: "Inspect aftertreatment before extended dispatch.",
      riskLevel: "medium",
      confidenceScore: 82,
      likelyCauses: ["SCR efficiency"],
    });
    expect(rec.originalRecommendation).toBe(
      "Inspect aftertreatment before extended dispatch."
    );
    expect(rec.severity).toBe("attention");
    expect(rec.confidence).toBe(82);
    expect(rec.likelyCauses).toEqual(["SCR efficiency"]);
  });
});
