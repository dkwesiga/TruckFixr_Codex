// Adapter from an existing diagnostic session's OUTPUT to a normalized
// maintenance recommendation. This is read-only: it never mutates diagnosis,
// never re-runs it, and preserves the original recommendation text verbatim.
//
// It accepts a minimal, explicit shape (the already-produced diagnosis fields)
// rather than importing diagnosis internals, keeping the boundary one-directional.

import {
  type MaintenanceAction,
  type MaintenanceSeverity,
} from "./caseWorkflow";

// Minimal read-only view of a completed diagnosis. All fields optional so the
// adapter degrades safely on partial data.
export interface DiagnosticSessionView {
  caseId?: string | null;
  // Diagnosis safe-to-drive decision, e.g. "safe_to_drive" | "drive_with_caution" | "do_not_drive".
  safeToDriveDecision?: string | null;
  // Diagnosis risk level, e.g. "low" | "medium" | "high" | "critical".
  riskLevel?: string | null;
  // TADIS-style urgency if present: "Monitor" | "Attention" | "Critical".
  urgency?: string | null;
  // TADIS-style recommended action if present: "Keep Running" | "Inspect Soon" | "Stop Now".
  recommendedAction?: string | null;
  maintenanceRecommendation?: string | null;
  confidenceScore?: number | null;
  likelyCauses?: string[] | null;
  recommendedTests?: string[] | null;
  model?: string | null;
  promptVersion?: string | null;
}

export interface NormalizedMaintenanceRecommendation {
  severity: MaintenanceSeverity;
  action: MaintenanceAction;
  // The original diagnosis recommendation text, preserved verbatim.
  originalRecommendation: string | null;
  proposedAction: string;
  rationale: string | null;
  likelyCauses: string[];
  immediateChecks: string[];
  confidence: number | null;
  diagnosticSessionId: string | null;
  model: string | null;
  promptVersion: string | null;
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function deriveSeverity(view: DiagnosticSessionView): MaintenanceSeverity {
  const urgency = normalize(view.urgency);
  const risk = normalize(view.riskLevel);
  const safe = normalize(view.safeToDriveDecision);

  if (
    urgency === "critical" ||
    risk === "critical" ||
    safe === "do_not_drive" ||
    safe === "unsafe" ||
    safe === "not_safe"
  ) {
    return "critical";
  }
  if (
    urgency === "attention" ||
    risk === "high" ||
    risk === "medium" ||
    safe === "drive_with_caution"
  ) {
    return "attention";
  }
  return "stable";
}

const ACTION_LABELS: Record<MaintenanceAction, string> = {
  continue_monitor: "Continue operating and monitor",
  complete_trip_then_inspect: "Complete the current trip, then inspect",
  schedule_service: "Schedule service",
  pull_from_service: "Pull the vehicle from service",
  roadside_assistance: "Request roadside assistance",
  tow: "Tow the vehicle",
};

export function deriveAction(view: DiagnosticSessionView): MaintenanceAction {
  const severity = deriveSeverity(view);
  const rec = normalize(view.recommendedAction);
  const safe = normalize(view.safeToDriveDecision);

  if (severity === "critical") {
    // Default critical action is to stop operating; escalate to tow only if the
    // diagnosis explicitly said stop now AND the vehicle cannot continue.
    if (rec === "stop now" || safe === "do_not_drive") return "pull_from_service";
    return "pull_from_service";
  }
  if (severity === "attention") {
    if (safe === "drive_with_caution") return "complete_trip_then_inspect";
    return "schedule_service";
  }
  return "continue_monitor";
}

export const MaintenanceRecommendationAdapter = {
  fromDiagnosticSession(
    view: DiagnosticSessionView
  ): NormalizedMaintenanceRecommendation {
    const severity = deriveSeverity(view);
    const action = deriveAction(view);
    return {
      severity,
      action,
      originalRecommendation: view.maintenanceRecommendation ?? null,
      proposedAction: ACTION_LABELS[action],
      rationale: view.maintenanceRecommendation ?? null,
      likelyCauses: view.likelyCauses ?? [],
      immediateChecks: view.recommendedTests ?? [],
      confidence: view.confidenceScore ?? null,
      diagnosticSessionId: view.caseId ?? null,
      model: view.model ?? null,
      promptVersion: view.promptVersion ?? null,
    };
  },
};
