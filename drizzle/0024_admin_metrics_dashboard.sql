ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "internalAdminRole" varchar(32);

ALTER TABLE "fleets"
ADD COLUMN IF NOT EXISTS "accountType" varchar(32) NOT NULL DEFAULT 'production';

ALTER TABLE "fleets"
ADD COLUMN IF NOT EXISTS "isDemoAccount" boolean NOT NULL DEFAULT false;

ALTER TABLE "fleets"
ADD COLUMN IF NOT EXISTS "lastActiveAt" timestamp;

ALTER TABLE "fleets"
ADD COLUMN IF NOT EXISTS "setupCompletedAt" timestamp;

ALTER TABLE "fleets"
ADD COLUMN IF NOT EXISTS "onboardingStatus" varchar(64) NOT NULL DEFAULT 'not_started';

ALTER TABLE "fleets"
ADD COLUMN IF NOT EXISTS "adminFollowUpStatus" varchar(64) NOT NULL DEFAULT 'healthy';

ALTER TABLE "fleets"
ADD COLUMN IF NOT EXISTS "riskStatus" varchar(64) NOT NULL DEFAULT 'healthy';

ALTER TABLE "fleets"
ADD COLUMN IF NOT EXISTS "riskReason" text;

ALTER TABLE "fleets"
ADD COLUMN IF NOT EXISTS "nextFollowUpAt" timestamp;

ALTER TABLE "fleets"
ADD COLUMN IF NOT EXISTS "adminOwnerId" integer;

CREATE TABLE IF NOT EXISTS "adminFleetNotes" (
  "id" serial PRIMARY KEY,
  "fleetId" integer NOT NULL,
  "createdByUserId" integer NOT NULL,
  "note" text NOT NULL,
  "noteType" varchar(64) NOT NULL DEFAULT 'general',
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);
