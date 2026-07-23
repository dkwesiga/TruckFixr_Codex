-- Gate 4: pilot kickoff baseline + enrolled vehicles (activation requirements).
-- Additive and idempotent; applied in filename order after 0039.

ALTER TABLE "pilotApplications" ADD COLUMN IF NOT EXISTS "baselineJson" jsonb;
ALTER TABLE "pilotApplications" ADD COLUMN IF NOT EXISTS "enrolledVehicleIdsJson" jsonb;
ALTER TABLE "pilotApplications" ADD COLUMN IF NOT EXISTS "startDate" timestamp;
ALTER TABLE "pilotApplications" ADD COLUMN IF NOT EXISTS "endDate" timestamp;
