// Pure taxonomy for the Mr Diesel / TADIS closed-loop pipeline (case type,
// resolution category, repair category). No DB — shared client/server,
// trivially testable. Mirrors the style of shared/maintenance/caseWorkflow.ts.

// What kind of shop interaction a Case represents. Distinct from
// CaseStatus (workflow state) and MaintenanceSeverity (urgency) — this
// classifies WHY the case exists, which drives TADIS eligibility (see
// eligibility.ts) so routine activity does not inflate knowledge metrics.
export const CASE_TYPES = [
  "diagnostic_troubleshooting",
  "corrective_repair",
  "preventive_maintenance",
  "compliance_inspection",
  "customer_inquiry",
  "repeat_comeback",
  "parts_only",
  "administrative",
  "other",
] as const;
export type CaseType = (typeof CASE_TYPES)[number];

export const CASE_TYPE_LABELS: Record<CaseType, string> = {
  diagnostic_troubleshooting: "Diagnostic / troubleshooting",
  corrective_repair: "Corrective repair",
  preventive_maintenance: "Preventive maintenance",
  compliance_inspection: "Compliance / inspection",
  customer_inquiry: "Customer inquiry",
  repeat_comeback: "Repeat / comeback",
  parts_only: "Parts only",
  administrative: "Administrative",
  other: "Other",
};

// A Resolution is a recommendation, not necessarily a completed repair.
// One Case may accumulate several Resolution attempts (maintenanceDecisions
// rows); this tags what KIND of recommendation each one is.
export const RESOLUTION_CATEGORIES = [
  "likely_cause",
  "recommended_test",
  "recommended_repair",
  "monitor",
  "schedule_maintenance",
  "pull_from_service",
  "tow",
  "continue_operating",
  "replace_component",
  "perform_regen",
  "inspect_wiring",
  "verify_fuel_pressure",
  "further_diagnostics",
  "other",
] as const;
export type ResolutionCategory = (typeof RESOLUTION_CATEGORIES)[number];

export const RESOLUTION_CATEGORY_LABELS: Record<ResolutionCategory, string> = {
  likely_cause: "Likely cause",
  recommended_test: "Recommended test",
  recommended_repair: "Recommended repair",
  monitor: "Monitor",
  schedule_maintenance: "Schedule maintenance",
  pull_from_service: "Pull from service",
  tow: "Tow",
  continue_operating: "Continue operating",
  replace_component: "Replace component",
  perform_regen: "Perform regen",
  inspect_wiring: "Inspect wiring",
  verify_fuel_pressure: "Verify fuel pressure",
  further_diagnostics: "Further diagnostics",
  other: "Other",
};

// Broad repair category, used for admin filtering and future category-specific
// confirmation rules (§10). Kept coarse and open-ended on purpose.
export const REPAIR_CATEGORIES = [
  "emissions_aftertreatment",
  "engine",
  "starting_charging",
  "brakes_air",
  "steering_suspension",
  "electrical",
  "cooling",
  "fuel_system",
  "drivetrain",
  "tires_wheels",
  "body_trailer",
  "other",
] as const;
export type RepairCategory = (typeof REPAIR_CATEGORIES)[number];

export function isKnownCaseType(value: string): value is CaseType {
  return (CASE_TYPES as readonly string[]).includes(value);
}

export function isKnownResolutionCategory(value: string): value is ResolutionCategory {
  return (RESOLUTION_CATEGORIES as readonly string[]).includes(value);
}
