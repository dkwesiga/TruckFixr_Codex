import { z } from "zod";

export const complianceStatusSchema = z.enum(["green", "yellow", "red"]);
export type ComplianceStatus = z.infer<typeof complianceStatusSchema>;

export const diagnosticUrgencySchema = z.enum(["Monitor", "Attention", "Critical"]);
export type DiagnosticUrgency = z.infer<typeof diagnosticUrgencySchema>;

const compliancePriority: Record<ComplianceStatus, number> = {
  green: 0,
  yellow: 1,
  red: 2,
};

export function getInspectionComplianceStatus(input: {
  majorDefectCount: number;
  minorDefectCount: number;
}): ComplianceStatus {
  if (input.majorDefectCount > 0) return "red";
  if (input.minorDefectCount > 0) return "yellow";
  return "green";
}

export function getDiagnosticComplianceStatus(urgency: DiagnosticUrgency): ComplianceStatus {
  if (urgency === "Critical") return "red";
  if (urgency === "Attention") return "yellow";
  return "green";
}

export function mergeComplianceStatus(...statuses: Array<ComplianceStatus | null | undefined>): ComplianceStatus {
  return statuses.reduce<ComplianceStatus>((current, candidate) => {
    if (!candidate) return current;
    return compliancePriority[candidate] > compliancePriority[current] ? candidate : current;
  }, "green");
}

export function getCompliancePresentation(status: ComplianceStatus) {
  switch (status) {
    case "red":
      return {
        label: "RED",
        title: "Non-Compliant",
        description: "Major defect reported. The vehicle should not operate until corrected.",
      };
    case "yellow":
      return {
        label: "YELLOW",
        title: "Warning",
        description: "Minor defect or diagnostic concern reported. Review before the next dispatch.",
      };
    default:
      return {
        label: "GREEN",
        title: "Compliant",
        description: "No active inspection or diagnostic issues were reported.",
      };
  }
}
