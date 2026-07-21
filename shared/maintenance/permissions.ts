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
