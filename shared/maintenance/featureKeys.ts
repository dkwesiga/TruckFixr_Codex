// Feature-flag keys for the Fleet Health & Maintenance pilot.
//
// The umbrella flag establishes eligibility only. It does NOT enable any
// capability. Each capability must be explicitly enabled. Backend checks are
// authoritative and fail closed (see server/services/fleetFeatures.ts).

export const FLEET_MAINTENANCE_UMBRELLA_FLAG = "fleet_maintenance_pilot" as const;

export const FLEET_MAINTENANCE_CAPABILITY_FLAGS = {
  fleetHealthDashboard: "fleet_health_dashboard",
  vehicleAttentionScore: "vehicle_attention_score",
  normalizedVehicleEvents: "normalized_vehicle_events",
  integrationIngestion: "integration_ingestion",
  pmSchedules: "pm_schedules",
  repairOutcomeCaptureV2: "repair_outcome_capture_v2",
  maintenanceCases: "maintenance_cases",
  repairDocumentReview: "repair_document_review",
  pilotMetrics: "pilot_metrics",
} as const;

export type FleetMaintenanceCapabilityFlag =
  (typeof FLEET_MAINTENANCE_CAPABILITY_FLAGS)[keyof typeof FLEET_MAINTENANCE_CAPABILITY_FLAGS];

export const ALL_FLEET_MAINTENANCE_FEATURE_KEYS = [
  FLEET_MAINTENANCE_UMBRELLA_FLAG,
  ...Object.values(FLEET_MAINTENANCE_CAPABILITY_FLAGS),
] as const;

export type FleetMaintenanceFeatureKey =
  (typeof ALL_FLEET_MAINTENANCE_FEATURE_KEYS)[number];

export function isKnownFleetMaintenanceFeatureKey(
  key: string
): key is FleetMaintenanceFeatureKey {
  return (ALL_FLEET_MAINTENANCE_FEATURE_KEYS as readonly string[]).includes(key);
}
