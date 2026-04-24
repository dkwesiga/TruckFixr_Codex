DO $$ BEGIN
  ALTER TYPE "inspection_status" ADD VALUE IF NOT EXISTS 'completed';
  ALTER TYPE "inspection_status" ADD VALUE IF NOT EXISTS 'incomplete';
  ALTER TYPE "inspection_status" ADD VALUE IF NOT EXISTS 'flagged';
  ALTER TYPE "inspection_status" ADD VALUE IF NOT EXISTS 'needs_review';
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "defect_severity" ADD VALUE IF NOT EXISTS 'minor';
  ALTER TYPE "defect_severity" ADD VALUE IF NOT EXISTS 'moderate';
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "defect_status" ADD VALUE IF NOT EXISTS 'monitoring';
  ALTER TYPE "defect_status" ADD VALUE IF NOT EXISTS 'repair_required';
  ALTER TYPE "defect_status" ADD VALUE IF NOT EXISTS 'dismissed';
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE "inspections"
  ADD COLUMN IF NOT EXISTS "inspectionDate" timestamp,
  ADD COLUMN IF NOT EXISTS "startedAt" timestamp,
  ADD COLUMN IF NOT EXISTS "durationSeconds" integer,
  ADD COLUMN IF NOT EXISTS "overallVehicleResult" varchar(64) DEFAULT 'no_defect',
  ADD COLUMN IF NOT EXISTS "notes" text,
  ADD COLUMN IF NOT EXISTS "locationStatus" varchar(64) DEFAULT 'unavailable',
  ADD COLUMN IF NOT EXISTS "startLatitude" numeric(10,7),
  ADD COLUMN IF NOT EXISTS "startLongitude" numeric(10,7),
  ADD COLUMN IF NOT EXISTS "startLocationAccuracy" numeric(10,2),
  ADD COLUMN IF NOT EXISTS "startLocationCapturedAt" timestamp,
  ADD COLUMN IF NOT EXISTS "submitLatitude" numeric(10,7),
  ADD COLUMN IF NOT EXISTS "submitLongitude" numeric(10,7),
  ADD COLUMN IF NOT EXISTS "submitLocationAccuracy" numeric(10,2),
  ADD COLUMN IF NOT EXISTS "submitLocationCapturedAt" timestamp,
  ADD COLUMN IF NOT EXISTS "integrityScore" integer DEFAULT 100;

ALTER TABLE "defects"
  ADD COLUMN IF NOT EXISTS "latestFollowUpStatus" varchar(64),
  ADD COLUMN IF NOT EXISTS "latestFollowUpAt" timestamp,
  ADD COLUMN IF NOT EXISTS "resolvedByUserId" integer,
  ADD COLUMN IF NOT EXISTS "resolvedAt" timestamp,
  ADD COLUMN IF NOT EXISTS "aiRecommendation" varchar(100),
  ADD COLUMN IF NOT EXISTS "aiConfidenceScore" integer,
  ADD COLUMN IF NOT EXISTS "aiSummary" text;

CREATE TABLE IF NOT EXISTS "inspectionChecklistResponses" (
  "id" serial PRIMARY KEY,
  "inspectionId" integer NOT NULL,
  "fleetId" integer NOT NULL,
  "vehicleId" integer NOT NULL,
  "driverId" integer NOT NULL,
  "checklistItemId" varchar(120) NOT NULL,
  "checklistItemLabel" varchar(255) NOT NULL,
  "category" varchar(100) NOT NULL,
  "result" varchar(32) NOT NULL,
  "defectDescription" text,
  "severity" "defect_severity",
  "note" text,
  "unableToTakePhoto" boolean NOT NULL DEFAULT false,
  "unableToTakePhotoReason" text,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "inspectionPhotos" (
  "id" serial PRIMARY KEY,
  "inspectionId" integer NOT NULL,
  "fleetId" integer NOT NULL,
  "vehicleId" integer NOT NULL,
  "driverId" integer NOT NULL,
  "checklistItemId" varchar(120),
  "photoType" varchar(64) NOT NULL DEFAULT 'defect',
  "imageUrl" text NOT NULL,
  "source" varchar(32) NOT NULL DEFAULT 'upload',
  "notes" text,
  "uploadedAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "randomProofRequests" (
  "id" serial PRIMARY KEY,
  "inspectionId" integer NOT NULL,
  "fleetId" integer NOT NULL,
  "vehicleId" integer NOT NULL,
  "driverId" integer NOT NULL,
  "proofItem" varchar(120) NOT NULL,
  "photoSubmitted" boolean NOT NULL DEFAULT false,
  "photoUrl" text,
  "complianceStatus" varchar(32) NOT NULL DEFAULT 'skipped',
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "inspectionFlags" (
  "id" serial PRIMARY KEY,
  "inspectionId" integer NOT NULL,
  "fleetId" integer NOT NULL,
  "vehicleId" integer NOT NULL,
  "driverId" integer NOT NULL,
  "flagType" varchar(100) NOT NULL,
  "severity" varchar(32) NOT NULL,
  "message" text NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "aiTriageRecords" (
  "id" serial PRIMARY KEY,
  "fleetId" integer NOT NULL,
  "vehicleId" integer NOT NULL,
  "inspectionId" integer,
  "defectId" integer,
  "mostLikelyCause" text,
  "severity" varchar(32) NOT NULL,
  "confidenceScore" integer NOT NULL DEFAULT 0,
  "recommendedAction" varchar(100) NOT NULL,
  "driverMessage" text,
  "managerSummary" text,
  "clarifyingQuestions" jsonb,
  "safetyWarning" text,
  "suggestedNextSteps" jsonb,
  "rawResult" jsonb,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "repairOutcomes" (
  "id" serial PRIMARY KEY,
  "fleetId" integer NOT NULL,
  "vehicleId" integer NOT NULL,
  "defectId" integer NOT NULL,
  "recordedByUserId" integer NOT NULL,
  "confirmedFault" text NOT NULL,
  "repairPerformed" text NOT NULL,
  "partsReplaced" jsonb,
  "aiDiagnosisCorrect" varchar(32) NOT NULL DEFAULT 'unknown',
  "downtimeStart" timestamp,
  "downtimeEnd" timestamp,
  "returnedToServiceAt" timestamp,
  "repairNotes" text,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "inAppAlerts" (
  "id" serial PRIMARY KEY,
  "fleetId" integer NOT NULL,
  "userId" integer,
  "vehicleId" integer,
  "inspectionId" integer,
  "defectId" integer,
  "alertType" varchar(100) NOT NULL,
  "severity" varchar(32) NOT NULL DEFAULT 'info',
  "title" varchar(255) NOT NULL,
  "message" text,
  "status" varchar(32) NOT NULL DEFAULT 'open',
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "inspectionChecklistResponses_inspectionId_idx" ON "inspectionChecklistResponses" ("inspectionId");
CREATE INDEX IF NOT EXISTS "inspectionPhotos_inspectionId_idx" ON "inspectionPhotos" ("inspectionId");
CREATE INDEX IF NOT EXISTS "randomProofRequests_inspectionId_idx" ON "randomProofRequests" ("inspectionId");
CREATE INDEX IF NOT EXISTS "inspectionFlags_inspectionId_idx" ON "inspectionFlags" ("inspectionId");
CREATE INDEX IF NOT EXISTS "aiTriageRecords_defectId_idx" ON "aiTriageRecords" ("defectId");
CREATE INDEX IF NOT EXISTS "repairOutcomes_defectId_idx" ON "repairOutcomes" ("defectId");
CREATE INDEX IF NOT EXISTS "inAppAlerts_fleetId_status_idx" ON "inAppAlerts" ("fleetId", "status");
