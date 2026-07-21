-- Fleet Health & Maintenance — Phase 5: pilot settings + external-AI consent.
-- Additive; safe to re-run.

CREATE TABLE IF NOT EXISTS "pilotSettings" (
  "id" serial PRIMARY KEY NOT NULL,
  "fleetId" integer NOT NULL REFERENCES "fleets"("id") ON DELETE CASCADE,
  "status" varchar(24) DEFAULT 'not_started' NOT NULL,
  "startDate" timestamp,
  "endDate" timestamp,
  "primaryManagerUserId" integer,
  "backupManagerUserId" integer,
  "enrolledVehicleIdsJson" jsonb,
  "notificationRecipientsJson" jsonb,
  "baselineJson" jsonb,
  "authorizationPolicyJson" jsonb,
  "createdByUserId" integer,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "pilotSettings_fleet_unique"
  ON "pilotSettings" ("fleetId");

CREATE TABLE IF NOT EXISTS "externalAiConsent" (
  "id" serial PRIMARY KEY NOT NULL,
  "fleetId" integer NOT NULL REFERENCES "fleets"("id") ON DELETE CASCADE,
  "status" varchar(16) DEFAULT 'none' NOT NULL,
  "purpose" varchar(255),
  "consentAt" timestamp,
  "expiresAt" timestamp,
  "withdrawnAt" timestamp,
  "consentingUserId" integer,
  "internalRecorderUserId" integer,
  "source" varchar(32),
  "evidenceJson" jsonb,
  "provider" varchar(64),
  "model" varchar(150),
  "regionDisclosure" varchar(255),
  "disclosureVersion" varchar(32),
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "externalAiConsent_fleet_unique"
  ON "externalAiConsent" ("fleetId");
