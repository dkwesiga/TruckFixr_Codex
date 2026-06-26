ALTER TABLE "vehicleAssignments"
  ADD COLUMN IF NOT EXISTS "driverInvitationId" integer,
  ADD COLUMN IF NOT EXISTS "revokedAt" timestamp,
  ADD COLUMN IF NOT EXISTS "revokedByUserId" integer;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'vehicleAssignments'
      AND column_name = 'vehicleId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "vehicleAssignments" ADD COLUMN IF NOT EXISTS "vehicleId_new" varchar(64);
    UPDATE "vehicleAssignments"
    SET "vehicleId_new" = "vehicleId"::varchar(64)
    WHERE "vehicleId_new" IS NULL;
    ALTER TABLE "vehicleAssignments" DROP COLUMN "vehicleId";
    ALTER TABLE "vehicleAssignments" RENAME COLUMN "vehicleId_new" TO "vehicleId";
    ALTER TABLE "vehicleAssignments" ALTER COLUMN "vehicleId" SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'vehicleAccessRequests'
      AND column_name = 'vehicleId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "vehicleAccessRequests" ADD COLUMN IF NOT EXISTS "vehicleId_new" varchar(64);
    UPDATE "vehicleAccessRequests"
    SET "vehicleId_new" = "vehicleId"::varchar(64)
    WHERE "vehicleId_new" IS NULL;
    ALTER TABLE "vehicleAccessRequests" DROP COLUMN "vehicleId";
    ALTER TABLE "vehicleAccessRequests" RENAME COLUMN "vehicleId_new" TO "vehicleId";
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "vehicleAssignments_vehicle_idx"
  ON "vehicleAssignments" ("vehicleId", "status");

CREATE INDEX IF NOT EXISTS "vehicleAccessRequests_vehicle_idx"
  ON "vehicleAccessRequests" ("vehicleId", "status");
