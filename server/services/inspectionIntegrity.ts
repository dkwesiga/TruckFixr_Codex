import type { SubmitVerifiedInspectionInput } from "../../shared/inspection";

export type InspectionFlagDraft = {
  flagType: string;
  severity: "info" | "warning" | "critical";
  message: string;
};

export function calculateInspectionIntegrity(input: {
  durationSeconds: number;
  locationStatus: "granted" | "denied" | "unavailable";
  missingRequiredDefectPhoto: boolean;
  skippedRandomProof: boolean;
  knownDefectNotAcknowledged: boolean;
  checklistResponses: SubmitVerifiedInspectionInput["checklistResponses"];
}) {
  const flags: InspectionFlagDraft[] = [];
  let score = 100;

  if (input.durationSeconds < 30) {
    score -= 30;
    flags.push({
      flagType: "too_fast",
      severity: "critical",
      message: "Inspection was completed in under 30 seconds.",
    });
  } else if (input.durationSeconds < 60) {
    score -= 15;
    flags.push({
      flagType: "too_fast",
      severity: "warning",
      message: "Inspection was completed between 30 and 60 seconds and needs review.",
    });
  }

  if (input.missingRequiredDefectPhoto) {
    score -= 20;
    flags.push({
      flagType: "missing_required_defect_photo",
      severity: "warning",
      message: "A reported defect is missing required photo proof.",
    });
  }

  if (input.skippedRandomProof) {
    score -= 15;
    flags.push({
      flagType: "skipped_random_proof",
      severity: "warning",
      message: "One or more random verification photos were skipped.",
    });
  }

  if (input.locationStatus !== "granted") {
    score -= 10;
    flags.push({
      flagType: "location_unavailable",
      severity: "info",
      message: "Location proof was unavailable or denied.",
    });
  }

  if (input.knownDefectNotAcknowledged) {
    score -= 20;
    flags.push({
      flagType: "known_defect_not_acknowledged",
      severity: "critical",
      message: "An existing open defect was not acknowledged during the inspection.",
    });
  }

  const unexplainedNotChecked = input.checklistResponses.some(
    (item) => item.result === "not_checked" && !item.note?.trim()
  );

  if (unexplainedNotChecked) {
    score -= 10;
    flags.push({
      flagType: "not_checked_without_explanation",
      severity: "warning",
      message: "At least one checklist item was marked not checked without an explanation.",
    });
  }

  return {
    score: Math.max(0, score),
    flags,
  };
}

export function getInspectionStatusFromIntegrity(input: {
  durationSeconds: number;
  flags: InspectionFlagDraft[];
  hasCriticalDefect: boolean;
}) {
  if (input.hasCriticalDefect || input.flags.some((flag) => flag.severity === "critical")) {
    return "flagged" as const;
  }

  if (input.durationSeconds < 60 || input.flags.length > 0) {
    return "needs_review" as const;
  }

  return "completed" as const;
}
