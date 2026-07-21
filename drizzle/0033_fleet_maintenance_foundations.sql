-- Fleet Health & Maintenance Decision Workflow — Phase 1 foundations.
--
-- Additive only. Creates per-fleet feature flags and narrow, fleet-scoped
-- maintenance permission grants. No rows are seeded, so every fleet starts with
-- the pilot fully disabled (feature checks fail closed in application code).
-- Safe to re-run: all statements are guarded with IF NOT EXISTS.

-- Per-fleet feature flags. Distinct from the global `features` catalog and
-- `planFeatures`; gates pilot capabilities per tenant.
CREATE TABLE IF NOT EXISTS "fleetFeatures" (
  "id" serial PRIMARY KEY NOT NULL,
  "fleetId" integer NOT NULL REFERENCES "fleets"("id") ON DELETE CASCADE,
  "featureKey" varchar(100) NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "valueJson" jsonb,
  "createdByUserId" integer,
  "updatedByUserId" integer,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "fleetFeatures_fleet_key_unique"
  ON "fleetFeatures" ("fleetId", "featureKey");
CREATE INDEX IF NOT EXISTS "fleetFeatures_fleet_idx"
  ON "fleetFeatures" ("fleetId");
CREATE INDEX IF NOT EXISTS "fleetFeatures_key_idx"
  ON "fleetFeatures" ("featureKey");

-- Narrow, fleet-scoped operational grants for selected members. NOT a
-- membership role; grants specific maintenance capabilities without elevating
-- the member to manager/owner or internal admin.
CREATE TABLE IF NOT EXISTS "maintenancePermissions" (
  "id" serial PRIMARY KEY NOT NULL,
  "fleetId" integer NOT NULL REFERENCES "fleets"("id") ON DELETE CASCADE,
  "userId" integer NOT NULL,
  "capabilitiesJson" jsonb NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "grantedByUserId" integer,
  "revokedByUserId" integer,
  "revokedAt" timestamp,
  "notes" text,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "maintenancePermissions_fleet_user_unique"
  ON "maintenancePermissions" ("fleetId", "userId");
CREATE INDEX IF NOT EXISTS "maintenancePermissions_fleet_idx"
  ON "maintenancePermissions" ("fleetId");
CREATE INDEX IF NOT EXISTS "maintenancePermissions_user_idx"
  ON "maintenancePermissions" ("userId");
