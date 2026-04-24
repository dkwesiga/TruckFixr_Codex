DO $$ BEGIN
  CREATE TYPE "asset_type" AS ENUM ('tractor', 'straight_truck', 'trailer', 'other');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "vehicles"
  ADD COLUMN IF NOT EXISTS "assetType" "asset_type" NOT NULL DEFAULT 'tractor';

CREATE TABLE IF NOT EXISTS "vehicleAssignments" (
  "id" serial PRIMARY KEY,
  "fleetId" integer NOT NULL,
  "vehicleId" integer NOT NULL,
  "driverUserId" integer NOT NULL,
  "assignedByUserId" integer NOT NULL,
  "accessType" varchar(32) NOT NULL DEFAULT 'permanent',
  "startsAt" timestamp NOT NULL DEFAULT now(),
  "expiresAt" timestamp,
  "status" varchar(32) NOT NULL DEFAULT 'active',
  "notes" text,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "vehicleAccessRequests" (
  "id" serial PRIMARY KEY,
  "fleetId" integer NOT NULL,
  "vehicleId" integer,
  "requestedVehicleIdentifier" varchar(255),
  "requestedByDriverId" integer NOT NULL,
  "reason" varchar(64) NOT NULL,
  "note" text,
  "status" varchar(32) NOT NULL DEFAULT 'pending',
  "reviewedByUserId" integer,
  "reviewedAt" timestamp,
  "managerNote" text,
  "accessTypeGranted" varchar(32),
  "expiresAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "vehicleAssignments_fleet_driver_idx"
ON "vehicleAssignments" ("fleetId", "driverUserId", "status");

CREATE INDEX IF NOT EXISTS "vehicleAssignments_vehicle_idx"
ON "vehicleAssignments" ("vehicleId", "status");

CREATE INDEX IF NOT EXISTS "vehicleAccessRequests_fleet_status_idx"
ON "vehicleAccessRequests" ("fleetId", "status");

CREATE INDEX IF NOT EXISTS "vehicleAccessRequests_driver_status_idx"
ON "vehicleAccessRequests" ("requestedByDriverId", "status");
