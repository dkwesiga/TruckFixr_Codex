-- Link confirmed repair outcomes back to diagnostic cases for TADIS learning.

ALTER TABLE "repairOutcomes"
  ADD COLUMN IF NOT EXISTS "diagnosticCaseId" varchar(128),
  ADD COLUMN IF NOT EXISTS "confirmationState" varchar(64) NOT NULL DEFAULT 'manager_confirmed',
  ADD COLUMN IF NOT EXISTS "source" varchar(64) NOT NULL DEFAULT 'inspection_repair_outcome';

CREATE INDEX IF NOT EXISTS "repairOutcomes_diagnosticCaseId_idx"
  ON "repairOutcomes" ("diagnosticCaseId");

CREATE INDEX IF NOT EXISTS "repairOutcomes_fleet_vehicle_case_idx"
  ON "repairOutcomes" ("fleetId", "vehicleId", "diagnosticCaseId");
