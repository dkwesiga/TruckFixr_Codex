-- MVP readiness hardening for support recovery, core workflow timing, and
-- verified diagnosis outcome reuse.

ALTER TABLE "supportRecoveryActions"
  ADD COLUMN IF NOT EXISTS "targetInspectionId" integer,
  ADD COLUMN IF NOT EXISTS "targetDiagnosticCaseId" varchar(128);

ALTER TABLE "repairOutcomes"
  ALTER COLUMN "defectId" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "supportRecoveryActions_targetFleet_created_idx"
  ON "supportRecoveryActions" ("targetFleetId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "supportRecoveryActions_targetUser_created_idx"
  ON "supportRecoveryActions" ("targetUserId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "supportRecoveryActions_targetVehicle_created_idx"
  ON "supportRecoveryActions" ("targetVehicleId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "supportRecoveryActions_targetInspection_created_idx"
  ON "supportRecoveryActions" ("targetInspectionId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "supportRecoveryActions_targetDiagnostic_created_idx"
  ON "supportRecoveryActions" ("targetDiagnosticCaseId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "inspections_fleet_vehicle_created_idx"
  ON "inspections" ("fleetId", "vehicleId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "activityLogs_fleet_vehicle_action_created_idx"
  ON "activityLogs" ("fleetId", "entityId", "action", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "aiQualityReviews_fleet_vehicle_case_idx"
  ON "aiQualityReviews" ("fleetId", "vehicleId", "diagnosticCaseId");

CREATE INDEX IF NOT EXISTS "aiUsageLogs_fleet_vehicle_created_idx"
  ON "aiUsageLogs" ("fleetId", "vehicleId", "createdAt" DESC);
