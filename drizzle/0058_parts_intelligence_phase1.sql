-- Parts Intelligence Phase 1: structured part requirement -> identification
-- -> fitment assessment -> supplier option representation, embedded in the
-- maintenance-case workflow (distinct from the staff concierge flow —
-- partsRequests/partsOffers — which links to the legacy "cases" table, not
-- "maintenanceCases"). See docs/architecture/parts-acquisition.md.
--
-- All additive, backward compatible. Does not touch repairOutcomes.partsReplaced
-- or any existing table. Idempotent (IF NOT EXISTS), applied in filename order
-- via apply-readiness-migrations.ts, same as prior migrations.
--
-- RLS follows the established post-0012 convention (0048/0056): enable RLS,
-- service_role full access. TruckFixr routes all application data access
-- through the backend service connection — the application layer (not RLS)
-- is the tenant boundary here, same as every other table added since 0043.
-- See docs/security/tenant-isolation.md.

-- Shared, cross-fleet part-identity catalog (no fleetId — analogous to
-- faultCodeReferences: an OEM part number is a fact about the part, not
-- about any one fleet).
CREATE TABLE IF NOT EXISTS "parts" (
  "id" serial PRIMARY KEY,
  "manufacturer" varchar(255),
  "oemPartNumber" varchar(120),
  "manufacturerPartNumber" varchar(120),
  "supersededPartNumber" varchar(120),
  "crossReferences" jsonb,
  "description" text,
  "category" varchar(100),
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "parts_oemPartNumber_idx" ON "parts" ("oemPartNumber");
CREATE INDEX IF NOT EXISTS "parts_manufacturerPartNumber_idx" ON "parts" ("manufacturerPartNumber");

ALTER TABLE "parts" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "parts_service_role_full_access" ON "parts";
CREATE POLICY "parts_service_role_full_access" ON "parts"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- A maintenance case's need for a part. partId is nullable — "unresolved" is
-- a valid state, not an error (see server/services/partIdentification.ts).
CREATE TABLE IF NOT EXISTS "partRequirements" (
  "id" serial PRIMARY KEY,
  "fleetId" integer NOT NULL REFERENCES "fleets"("id") ON DELETE CASCADE,
  "caseId" integer NOT NULL REFERENCES "maintenanceCases"("id") ON DELETE CASCADE,
  "repairCycleId" integer,
  "partId" integer REFERENCES "parts"("id") ON DELETE SET NULL,
  "description" text NOT NULL,
  "reasonContext" text,
  "quantity" integer NOT NULL DEFAULT 1,
  "status" varchar(32) NOT NULL DEFAULT 'part_required',
  "requestedByUserId" integer NOT NULL,
  "requestedAt" timestamp NOT NULL DEFAULT now(),
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "partRequirements_fleet_idx" ON "partRequirements" ("fleetId");
CREATE INDEX IF NOT EXISTS "partRequirements_case_idx" ON "partRequirements" ("caseId");

ALTER TABLE "partRequirements" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "partRequirements_service_role_full_access" ON "partRequirements";
CREATE POLICY "partRequirements_service_role_full_access" ON "partRequirements"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Append-only: TruckFixr's own evidence-based fitment determination.
-- Distinct from a supplier's fitment CLAIM (partSupplierOptions.fitmentClaim).
-- Never updated in place -- a re-assessment is a new row.
CREATE TABLE IF NOT EXISTS "partFitmentAssessments" (
  "id" serial PRIMARY KEY,
  "fleetId" integer NOT NULL REFERENCES "fleets"("id") ON DELETE CASCADE,
  "partRequirementId" integer NOT NULL REFERENCES "partRequirements"("id") ON DELETE CASCADE,
  "partId" integer REFERENCES "parts"("id") ON DELETE SET NULL,
  "vehicleId" varchar(64) NOT NULL,
  "state" varchar(16) NOT NULL,
  "evidenceJson" jsonb NOT NULL,
  "missingEvidenceJson" jsonb,
  "conflictsJson" jsonb,
  "source" varchar(32) NOT NULL,
  "assessedByUserId" integer,
  "assessedAt" timestamp NOT NULL DEFAULT now(),
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "partFitmentAssessments_fleet_idx" ON "partFitmentAssessments" ("fleetId");
CREATE INDEX IF NOT EXISTS "partFitmentAssessments_requirement_idx" ON "partFitmentAssessments" ("partRequirementId");

ALTER TABLE "partFitmentAssessments" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "partFitmentAssessments_service_role_full_access" ON "partFitmentAssessments";
CREATE POLICY "partFitmentAssessments_service_role_full_access" ON "partFitmentAssessments"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- A candidate sourcing option for a requirement. No ordering/procurement.
-- fitmentClaim is the supplier's own, UNVERIFIED statement -- distinct from
-- partFitmentAssessments.
CREATE TABLE IF NOT EXISTS "partSupplierOptions" (
  "id" serial PRIMARY KEY,
  "fleetId" integer NOT NULL REFERENCES "fleets"("id") ON DELETE CASCADE,
  "partRequirementId" integer NOT NULL REFERENCES "partRequirements"("id") ON DELETE CASCADE,
  "partId" integer REFERENCES "parts"("id") ON DELETE SET NULL,
  "supplierName" varchar(255) NOT NULL,
  "quotedPartNumber" varchar(120),
  "priceCents" integer,
  "currency" varchar(8) NOT NULL DEFAULT 'CAD',
  "freightCents" integer,
  "stockStatus" varchar(40),
  "etaAt" timestamp,
  "warrantyText" text,
  "returnable" boolean,
  "quoteReference" varchar(120),
  "source" varchar(32) NOT NULL DEFAULT 'manual_entry',
  "fitmentClaim" text,
  "notes" text,
  "capturedByUserId" integer NOT NULL,
  "capturedAt" timestamp NOT NULL DEFAULT now(),
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "partSupplierOptions_fleet_idx" ON "partSupplierOptions" ("fleetId");
CREATE INDEX IF NOT EXISTS "partSupplierOptions_requirement_idx" ON "partSupplierOptions" ("partRequirementId");

ALTER TABLE "partSupplierOptions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "partSupplierOptions_service_role_full_access" ON "partSupplierOptions";
CREATE POLICY "partSupplierOptions_service_role_full_access" ON "partSupplierOptions"
  FOR ALL TO service_role USING (true) WITH CHECK (true);
