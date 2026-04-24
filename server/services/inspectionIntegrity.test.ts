import { describe, expect, it } from "vitest";
import { calculateInspectionIntegrity, getInspectionStatusFromIntegrity } from "./inspectionIntegrity";

const baseChecklistResponse = {
  itemId: "dashboard-warning-lights",
  itemLabel: "No active warning lights",
  category: "dashboard_warning_lights",
  result: "pass" as const,
  photoUrls: [],
  unableToTakePhoto: false,
};

describe("inspection integrity scoring", () => {
  it("flags very fast inspections and missing proof signals", () => {
    const result = calculateInspectionIntegrity({
      durationSeconds: 24,
      locationStatus: "denied",
      missingRequiredDefectPhoto: true,
      skippedRandomProof: true,
      knownDefectNotAcknowledged: true,
      checklistResponses: [
        baseChecklistResponse,
        {
          ...baseChecklistResponse,
          itemId: "other",
          itemLabel: "Other issue",
          result: "not_checked",
        },
      ],
    });

    expect(result.score).toBe(0);
    expect(result.flags.map((flag) => flag.flagType)).toEqual([
      "too_fast",
      "missing_required_defect_photo",
      "skipped_random_proof",
      "location_unavailable",
      "known_defect_not_acknowledged",
      "not_checked_without_explanation",
    ]);
    expect(
      getInspectionStatusFromIntegrity({
        durationSeconds: 24,
        flags: result.flags,
        hasCriticalDefect: false,
      })
    ).toBe("flagged");
  });

  it("marks 30 to 60 second inspections for review without failing clean proof", () => {
    const result = calculateInspectionIntegrity({
      durationSeconds: 45,
      locationStatus: "granted",
      missingRequiredDefectPhoto: false,
      skippedRandomProof: false,
      knownDefectNotAcknowledged: false,
      checklistResponses: [baseChecklistResponse],
    });

    expect(result.score).toBe(85);
    expect(result.flags).toHaveLength(1);
    expect(
      getInspectionStatusFromIntegrity({
        durationSeconds: 45,
        flags: result.flags,
        hasCriticalDefect: false,
      })
    ).toBe("needs_review");
  });
});
