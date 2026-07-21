-- Fleet Health & Maintenance — Phase 4: repair documents + repair authorization.
-- Additive; safe to re-run.

CREATE TABLE IF NOT EXISTS "repairDocuments" (
  "id" serial PRIMARY KEY NOT NULL,
  "fleetId" integer NOT NULL REFERENCES "fleets"("id") ON DELETE CASCADE,
  "caseId" integer NOT NULL REFERENCES "maintenanceCases"("id") ON DELETE CASCADE,
  "repairCycleId" integer,
  "documentType" varchar(24) DEFAULT 'unknown' NOT NULL,
  "originalFilename" varchar(255) NOT NULL,
  "storageKey" varchar(512) NOT NULL,
  "sizeBytes" integer NOT NULL,
  "mimeType" varchar(64) NOT NULL,
  "checksumSha256" varchar(64) NOT NULL,
  "uploadedByUserId" integer,
  "processingState" varchar(24) DEFAULT 'uploaded' NOT NULL,
  "extractionAttempts" integer DEFAULT 0 NOT NULL,
  "extractedRawText" text,
  "normalizedFieldsJson" jsonb,
  "extractionProvider" varchar(64),
  "extractionModel" varchar(150),
  "schemaVersion" varchar(32),
  "region" varchar(64),
  "consentAtUpload" boolean DEFAULT false NOT NULL,
  "confidence" integer,
  "uncertaintyJson" jsonb,
  "correctionsJson" jsonb,
  "supersededDocumentId" integer,
  "duplicateOfDocumentId" integer,
  "isApprovedEstimate" boolean DEFAULT false NOT NULL,
  "isFinalInvoice" boolean DEFAULT false NOT NULL,
  "deletedAt" timestamp,
  "deletedByUserId" integer,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "repairDocuments_case_idx" ON "repairDocuments" ("caseId");
CREATE INDEX IF NOT EXISTS "repairDocuments_fleet_checksum_idx"
  ON "repairDocuments" ("fleetId", "checksumSha256");
CREATE INDEX IF NOT EXISTS "repairDocuments_state_idx"
  ON "repairDocuments" ("fleetId", "processingState");

CREATE TABLE IF NOT EXISTS "repairAuthorizations" (
  "id" serial PRIMARY KEY NOT NULL,
  "fleetId" integer NOT NULL REFERENCES "fleets"("id") ON DELETE CASCADE,
  "caseId" integer NOT NULL REFERENCES "maintenanceCases"("id") ON DELETE CASCADE,
  "repairCycleId" integer,
  "limitCents" integer,
  "approvedAmountCents" integer,
  "currency" varchar(8) DEFAULT 'CAD' NOT NULL,
  "state" varchar(24) DEFAULT 'pending' NOT NULL,
  "approverUserId" integer,
  "approvedAt" timestamp,
  "note" text,
  "createdByUserId" integer,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "repairAuthorizations_case_idx"
  ON "repairAuthorizations" ("caseId");
