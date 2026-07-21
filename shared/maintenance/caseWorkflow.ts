// Pure domain rules for Maintenance Cases: statuses, allowed transitions,
// normalized severity/action vocabularies, approval rules, and safety
// disclaimers. No DB — trivially testable and shared client/server.

export const CASE_STATUSES = [
  "reported",
  "triaging",
  "decision_pending",
  "monitoring",
  "scheduled",
  "out_of_service",
  "in_repair",
  "awaiting_parts",
  "ready_for_return",
  "completed",
  "closed",
  "reopened",
  "cancelled",
] as const;

export type CaseStatus = (typeof CASE_STATUSES)[number];

// Terminal statuses cannot transition except via an explicit reopen.
export const TERMINAL_STATUSES: CaseStatus[] = ["closed", "cancelled"];

// Explicit allowed transitions. Anything not listed is rejected. Reopen is a
// dedicated action (owners/managers only) handled outside this map.
const TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  reported: ["triaging", "decision_pending", "monitoring", "cancelled"],
  triaging: ["decision_pending", "monitoring", "scheduled", "cancelled"],
  decision_pending: ["monitoring", "scheduled", "out_of_service", "cancelled"],
  monitoring: ["decision_pending", "scheduled", "out_of_service", "closed", "cancelled"],
  scheduled: ["out_of_service", "in_repair", "monitoring", "cancelled"],
  out_of_service: ["in_repair", "awaiting_parts", "cancelled"],
  in_repair: ["awaiting_parts", "ready_for_return", "out_of_service"],
  awaiting_parts: ["in_repair", "ready_for_return", "out_of_service"],
  ready_for_return: ["completed", "in_repair"],
  completed: ["closed", "reopened"],
  closed: ["reopened"],
  reopened: ["triaging", "decision_pending", "scheduled", "out_of_service", "in_repair"],
  cancelled: ["reopened"],
};

export function canTransition(from: CaseStatus, to: CaseStatus): boolean {
  if (from === to) return false;
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function allowedTransitions(from: CaseStatus): CaseStatus[] {
  return TRANSITIONS[from] ?? [];
}

// Statuses that represent an operationally-active case (shown on the Downtime
// Board and counted as active).
export const ACTIVE_CASE_STATUSES: CaseStatus[] = [
  "reported",
  "triaging",
  "decision_pending",
  "monitoring",
  "scheduled",
  "out_of_service",
  "in_repair",
  "awaiting_parts",
  "ready_for_return",
  "reopened",
];

// Normalized maintenance severity (distinct from diagnosis severity/confidence).
export const MAINTENANCE_SEVERITIES = ["stable", "attention", "critical"] as const;
export type MaintenanceSeverity = (typeof MAINTENANCE_SEVERITIES)[number];

// Normalized operating actions.
export const MAINTENANCE_ACTIONS = [
  "continue_monitor",
  "complete_trip_then_inspect",
  "schedule_service",
  "pull_from_service",
  "roadside_assistance",
  "tow",
] as const;
export type MaintenanceAction = (typeof MAINTENANCE_ACTIONS)[number];

export function isCriticalAction(action: MaintenanceAction): boolean {
  return action === "pull_from_service" || action === "roadside_assistance" || action === "tow";
}

// Approval policy by severity (§25).
export type ApprovalRequirement = "auto_record" | "manager_approval" | "critical_approval";

export function approvalRequirementFor(severity: MaintenanceSeverity): ApprovalRequirement {
  switch (severity) {
    case "stable":
      return "auto_record";
    case "attention":
      return "manager_approval";
    case "critical":
      return "critical_approval";
  }
}

export const SAFETY_DISCLAIMERS = {
  full:
    "TruckFixr provides decision support based on the information available. It does not replace inspection, diagnosis, or judgment by a qualified fleet manager, technician, or other authorized professional. When safety is uncertain, stop operation and obtain qualified assistance.",
  short: "Decision support only. Confirm safety-critical actions with qualified personnel.",
  critical:
    "Do not operate unless an authorized qualified person has assessed the vehicle and an owner or manager has recorded the reason for overriding this recommendation.",
} as const;

// Human-readable case reference: MC-{YEAR}-{6-digit zero-padded sequence}.
export function formatCaseReference(year: number, sequence: number): string {
  return `MC-${year}-${String(sequence).padStart(6, "0")}`;
}
