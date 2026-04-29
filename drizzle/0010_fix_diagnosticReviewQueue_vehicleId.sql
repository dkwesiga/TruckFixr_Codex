-- Fix schema drift: diagnosticReviewQueue.vehicleId should be varchar to support UUIDs

-- First, drop any dependent indexes
DROP INDEX IF EXISTS "diagnosticReviewQueue_vehicle_idx";

-- Add new varchar column
ALTER TABLE "diagnosticReviewQueue" ADD COLUMN "vehicleId_new" varchar(64);

-- Copy data from old column to new
UPDATE "diagnosticReviewQueue" SET "vehicleId_new" = "vehicleId"::varchar(64);

-- Drop old column and rename new one
ALTER TABLE "diagnosticReviewQueue" DROP COLUMN "vehicleId";
ALTER TABLE "diagnosticReviewQueue" RENAME COLUMN "vehicleId_new" TO "vehicleId";
ALTER TABLE "diagnosticReviewQueue" ALTER COLUMN "vehicleId" SET NOT NULL;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS "diagnosticReviewQueue_vehicle_idx"
ON "diagnosticReviewQueue" ("vehicleId", "status");
