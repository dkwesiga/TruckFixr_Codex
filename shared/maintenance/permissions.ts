// Narrow, fleet-scoped maintenance capabilities that can be granted to an
// existing member (typically an in-house technician-style user) WITHOUT
// adding a new membership role or elevating them to manager/owner.
//
// These grants never include: feature management, pilot configuration,
// fleet-wide exports, estimate approval, critical override finalization, or
// internal-admin access. Financial totals/variance/limits/approvals remain
// restricted to owners and managers even for granted users.

export const MAINTENANCE_CAPABILITIES = {
  viewAssignedCases: "view_assigned_cases",
  updateRepairStatus: "update_repair_status",
  recordExpectedCompletion: "record_expected_completion",
  uploadDocuments: "upload_documents",
  viewOperationalRepairDetails: "view_operational_repair_details",
  submitTechnicianAssessment: "submit_technician_assessment",
  submitRepairOutcome: "submit_repair_outcome",
  recordReturnToService: "record_return_to_service",
  // Mr Diesel / TADIS pipeline additions (Service Advisor / Technician split,
  // §4). Owners/managers already implicitly hold all of these.
  createCase: "create_case",
  recordResolution: "record_resolution",
  // The one capability that gates marking a technical Outcome Verified. A
  // Service Advisor grant must never include this; only a Technician grant
  // should (see SERVICE_ADVISOR_CAPABILITIES / TECHNICIAN_CAPABILITIES below).
  verifyOutcome: "verify_outcome",
  confirmOutcome: "confirm_outcome",
  // Parts Intelligence Phase 1: create/update a case's part requirements,
  // record fitment assessments, and add supplier options. Does not include
  // any procurement/ordering action (none exists yet).
  managePartRequirements: "manage_part_requirements",
} as const;

export type MaintenanceCapability =
  (typeof MAINTENANCE_CAPABILITIES)[keyof typeof MAINTENANCE_CAPABILITIES];

export const ALL_MAINTENANCE_CAPABILITIES = Object.values(
  MAINTENANCE_CAPABILITIES
) as MaintenanceCapability[];

// Capabilities a maintenance-permitted user may NEVER hold. Enforced when a
// grant is created so a malformed grant cannot smuggle in privileged actions.
export const FORBIDDEN_MAINTENANCE_CAPABILITIES = [
  "manage_features",
  "configure_pilot",
  "fleet_exports",
  "approve_estimate",
  "finalize_critical_override",
  "internal_admin",
] as const;

export function isKnownMaintenanceCapability(
  key: string
): key is MaintenanceCapability {
  return (ALL_MAINTENANCE_CAPABILITIES as readonly string[]).includes(key);
}

export function sanitizeMaintenanceCapabilities(
  input: readonly string[]
): MaintenanceCapability[] {
  const seen = new Set<MaintenanceCapability>();
  for (const raw of input) {
    const key = raw.trim();
    if (isKnownMaintenanceCapability(key)) {
      seen.add(key);
    }
  }
  return Array.from(seen);
}

// Named capability presets for the two repair-shop staff roles described in
// the Mr Diesel workflow (§4). These are NOT new membership roles — they are
// just a convenient, reviewable starting grant a manager can hand to an
// existing member via setMaintenanceGrant. A manager may still customize the
// grant afterward; these are defaults, not an enforced role.
export const SERVICE_ADVISOR_CAPABILITIES: MaintenanceCapability[] = [
  MAINTENANCE_CAPABILITIES.viewAssignedCases,
  MAINTENANCE_CAPABILITIES.createCase,
  MAINTENANCE_CAPABILITIES.uploadDocuments,
  MAINTENANCE_CAPABILITIES.updateRepairStatus,
  MAINTENANCE_CAPABILITIES.recordExpectedCompletion,
  MAINTENANCE_CAPABILITIES.managePartRequirements,
];

// Technician capabilities are a superset of Service Advisor — a technician
// can do everything a service advisor can, plus record diagnostic
// Resolutions and verify/confirm technical Outcomes.
export const TECHNICIAN_CAPABILITIES: MaintenanceCapability[] = [
  ...SERVICE_ADVISOR_CAPABILITIES,
  MAINTENANCE_CAPABILITIES.viewOperationalRepairDetails,
  MAINTENANCE_CAPABILITIES.submitTechnicianAssessment,
  MAINTENANCE_CAPABILITIES.recordResolution,
  MAINTENANCE_CAPABILITIES.submitRepairOutcome,
  MAINTENANCE_CAPABILITIES.verifyOutcome,
  MAINTENANCE_CAPABILITIES.confirmOutcome,
  MAINTENANCE_CAPABILITIES.recordReturnToService,
];
