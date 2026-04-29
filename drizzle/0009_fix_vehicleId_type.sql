-- Fix schema drift: vehicleAssignments.vehicleId should be varchar to support UUIDs and flexible identifiers

-- First, drop dependent indexes
DROP INDEX IF EXISTS "vehicleAssignments_vehicle_idx";
DROP INDEX IF EXISTS "vehicleAccessRequests_vehicle_idx";

-- Add new varchar column
ALTER TABLE "vehicleAssignments" ADD COLUMN "vehicleId_new" varchar(64);
ALTER TABLE "vehicleAccessRequests" ADD COLUMN "vehicleId_new" varchar(64);

-- Copy data
UPDATE "vehicleAssignments" SET "vehicleId_new" = "vehicleId"::varchar(64);
UPDATE "vehicleAccessRequests" SET "vehicleId_new" = "vehicleId"::varchar(64);

-- Drop old column and rename new one
ALTER TABLE "vehicleAssignments" DROP COLUMN "vehicleId";
ALTER TABLE "vehicleAssignments" RENAME COLUMN "vehicleId_new" TO "vehicleId";
ALTER TABLE "vehicleAssignments" ALTER COLUMN "vehicleId" SET NOT NULL;

ALTER TABLE "vehicleAccessRequests" DROP COLUMN "vehicleId";
ALTER TABLE "vehicleAccessRequests" RENAME COLUMN "vehicleId_new" TO "vehicleId";

-- Recreate indexes
CREATE INDEX IF NOT EXISTS "vehicleAssignments_vehicle_idx"
ON "vehicleAssignments" ("vehicleId", "status");

CREATE INDEX IF NOT EXISTS "vehicleAccessRequests_vehicle_idx"
ON "vehicleAccessRequests" ("vehicleId", "status");
