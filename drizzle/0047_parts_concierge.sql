-- Parts concierge (PRD v1.1 §6). Manual-first MVP.
-- Idempotent; applied in filename order via apply-readiness-migrations.ts.

CREATE TABLE IF NOT EXISTS "partsRequests" (
  "id" serial PRIMARY KEY,
  "publicToken" varchar(64) NOT NULL,
  "caseId" integer REFERENCES "cases"("id") ON DELETE SET NULL,
  "guestCaseId" integer REFERENCES "guestCases"("id") ON DELETE SET NULL,
  "route" varchar(24) NOT NULL,
  "status" varchar(24) NOT NULL DEFAULT 'draft',
  "customerName" varchar(255),
  "customerEmail" varchar(320),
  "customerPhone" varchar(40),
  "vehicleIdentifier" jsonb,
  "partNumber" varchar(120),
  "partDescription" text,
  "confirmedByType" varchar(32),
  "confirmedByName" varchar(255),
  "evidenceNotes" text,
  "selectedOfferId" integer,
  "referredAt" timestamp,
  "transactionStatus" varchar(24),
  "transactionConfirmedAt" timestamp,
  "createdByUserId" integer,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "partsRequests_publicToken_unique" ON "partsRequests" ("publicToken");
CREATE INDEX IF NOT EXISTS "partsRequests_status_idx" ON "partsRequests" ("status");
CREATE INDEX IF NOT EXISTS "partsRequests_caseId_idx" ON "partsRequests" ("caseId");

CREATE TABLE IF NOT EXISTS "partsOffers" (
  "id" serial PRIMARY KEY,
  "partsRequestId" integer NOT NULL REFERENCES "partsRequests"("id") ON DELETE CASCADE,
  "status" varchar(16) NOT NULL DEFAULT 'submitted',
  "supplierName" varchar(255) NOT NULL,
  "supplierBranch" varchar(255),
  "respondentName" varchar(255),
  "respondentContact" varchar(255),
  "skuPartNumber" varchar(120) NOT NULL,
  "description" text,
  "brandManufacturer" varchar(255),
  "conditionType" varchar(24),
  "quantity" integer NOT NULL DEFAULT 1,
  "supersessionNotes" text,
  "fitmentConfirmed" boolean NOT NULL DEFAULT false,
  "fitmentBasis" text,
  "fitmentExclusions" text,
  "requiredSerialOrCalibration" text,
  "priceCents" integer NOT NULL,
  "currency" varchar(8) NOT NULL DEFAULT 'CAD',
  "taxesIncluded" boolean NOT NULL DEFAULT false,
  "coreChargeCents" integer,
  "coreReturnTerms" text,
  "depositCents" integer,
  "warrantyText" text,
  "quoteExpiresAt" timestamp,
  "stockStatus" varchar(40),
  "availableQuantity" integer,
  "pickupLocation" text,
  "deliveryOption" varchar(40),
  "deliveryCostCents" integer,
  "estimatedReadyAt" timestamp,
  "submittedAt" timestamp NOT NULL DEFAULT now(),
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "partsOffers_request_idx" ON "partsOffers" ("partsRequestId");
CREATE INDEX IF NOT EXISTS "partsOffers_status_idx" ON "partsOffers" ("status");
