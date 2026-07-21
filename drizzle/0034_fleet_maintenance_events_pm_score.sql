-- Fleet Health & Maintenance — Phase 2: normalized vehicle events, preventive
-- maintenance, attention-score persistence, and additive repair-outcome v2
-- columns. Additive only; safe to re-run.

CREATE TABLE IF NOT EXISTS "vehicleEvents" (
  "id" serial PRIMARY KEY NOT NULL,
  "fleetId" integer NOT NULL REFERENCES "fleets"("id") ON DELETE CASCADE,
  "vehicleId" varchar(64) NOT NULL,
  "source" varchar(64) NOT NULL,
  "sourceEventId" varchar(128),
  "eventType" varchar(48) NOT NULL,
  "eventTimestamp" timestamp NOT NULL,
  "odometerKm" numeric(12, 3),
  "engineHours" numeric(12, 2),
  "dtcCode" varchar(32),
  "dtcStatus" varchar(32),
  "severity" varchar(32),
  "latitude" numeric(9, 6),
  "longitude" numeric(9, 6),
  "trustStatus" varchar(32) DEFAULT 'review_required' NOT NULL,
  "reviewedByUserId" integer,
  "reviewedAt" timestamp,
  "reviewNotes" text,
  "idempotencyKey" varchar(64) NOT NULL,
  "normalizedPayloadJson" jsonb,
  "rawPayloadJson" jsonb,
  "createdByUserId" integer,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "vehicleEvents_fleet_idem_unique"
  ON "vehicleEvents" ("fleetId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "vehicleEvents_fleet_vehicle_idx"
  ON "vehicleEvents" ("fleetId", "vehicleId");
CREATE INDEX IF NOT EXISTS "vehicleEvents_fleet_type_idx"
  ON "vehicleEvents" ("fleetId", "eventType");
CREATE INDEX IF NOT EXISTS "vehicleEvents_trust_idx"
  ON "vehicleEvents" ("fleetId", "trustStatus");

CREATE TABLE IF NOT EXISTS "pmTemplates" (
  "id" serial PRIMARY KEY NOT NULL,
  "fleetId" integer NOT NULL REFERENCES "fleets"("id") ON DELETE CASCADE,
  "name" varchar(150) NOT NULL,
  "description" text,
  "intervalKm" integer,
  "intervalEngineHours" integer,
  "intervalDays" integer,
  "warningKm" integer,
  "warningEngineHours" integer,
  "warningDays" integer,
  "whicheverComesFirst" boolean DEFAULT true NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "createdByUserId" integer,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "pmTemplates_fleet_idx" ON "pmTemplates" ("fleetId");

CREATE TABLE IF NOT EXISTS "pmAssignments" (
  "id" serial PRIMARY KEY NOT NULL,
  "fleetId" integer NOT NULL REFERENCES "fleets"("id") ON DELETE CASCADE,
  "vehicleId" varchar(64) NOT NULL,
  "pmTemplateId" integer NOT NULL REFERENCES "pmTemplates"("id") ON DELETE CASCADE,
  "overrideIntervalKm" integer,
  "overrideIntervalEngineHours" integer,
  "overrideIntervalDays" integer,
  "overrideWarningKm" integer,
  "overrideWarningEngineHours" integer,
  "overrideWarningDays" integer,
  "lastCompletedDate" timestamp,
  "lastCompletedOdometerKm" numeric(12, 3),
  "lastCompletedEngineHours" numeric(12, 2),
  "active" boolean DEFAULT true NOT NULL,
  "createdByUserId" integer,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "pmAssignments_vehicle_template_unique"
  ON "pmAssignments" ("fleetId", "vehicleId", "pmTemplateId");
CREATE INDEX IF NOT EXISTS "pmAssignments_fleet_vehicle_idx"
  ON "pmAssignments" ("fleetId", "vehicleId");

CREATE TABLE IF NOT EXISTS "attentionScoreSnapshots" (
  "id" serial PRIMARY KEY NOT NULL,
  "fleetId" integer NOT NULL REFERENCES "fleets"("id") ON DELETE CASCADE,
  "vehicleId" varchar(64) NOT NULL,
  "total" integer NOT NULL,
  "classification" varchar(16) NOT NULL,
  "componentsJson" jsonb,
  "dataQualityWarningsJson" jsonb,
  "reason" varchar(48) NOT NULL,
  "calculatedAt" timestamp NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "attentionScoreSnapshots_fleet_vehicle_idx"
  ON "attentionScoreSnapshots" ("fleetId", "vehicleId");

CREATE TABLE IF NOT EXISTS "attentionScoreOverrides" (
  "id" serial PRIMARY KEY NOT NULL,
  "fleetId" integer NOT NULL REFERENCES "fleets"("id") ON DELETE CASCADE,
  "vehicleId" varchar(64) NOT NULL,
  "acknowledgedByUserId" integer,
  "acknowledgedAt" timestamp,
  "acknowledgementNote" text,
  "overrideClassification" varchar(16),
  "overrideReason" text,
  "overrideByUserId" integer,
  "overrideAt" timestamp,
  "active" boolean DEFAULT true NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "attentionScoreOverrides_vehicle_unique"
  ON "attentionScoreOverrides" ("fleetId", "vehicleId");

-- Repair outcome v2: additive optional columns. Existing rows/payloads stay valid.
ALTER TABLE "repairOutcomes"
  ADD COLUMN IF NOT EXISTS "maintenanceCaseId" integer,
  ADD COLUMN IF NOT EXISTS "repairCycleId" integer,
  ADD COLUMN IF NOT EXISTS "systemCategory" varchar(64),
  ADD COLUMN IF NOT EXISTS "componentCategory" varchar(64),
  ADD COLUMN IF NOT EXISTS "confirmedCauseCode" varchar(64),
  ADD COLUMN IF NOT EXISTS "confirmedFaultCode" varchar(64),
  ADD COLUMN IF NOT EXISTS "repairType" varchar(48),
  ADD COLUMN IF NOT EXISTS "couldContinueAtAssessment" varchar(32),
  ADD COLUMN IF NOT EXISTS "diagnosisCorrectness" varchar(32),
  ADD COLUMN IF NOT EXISTS "agreementClassification" varchar(48),
  ADD COLUMN IF NOT EXISTS "repairResult" varchar(32),
  ADD COLUMN IF NOT EXISTS "repeatFailure" boolean,
  ADD COLUMN IF NOT EXISTS "actualDowntimeHours" numeric(10, 2),
  ADD COLUMN IF NOT EXISTS "actualRepairCostCents" integer,
  ADD COLUMN IF NOT EXISTS "vehicleReturnedToServiceAt" timestamp,
  ADD COLUMN IF NOT EXISTS "technicianNotes" text,
  ADD COLUMN IF NOT EXISTS "submittedByUserId" integer;
