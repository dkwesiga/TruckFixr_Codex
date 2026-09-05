-- Parts Intelligence Phase 2: sourcing -> option comparison -> recommendation
-- -> human approval. Additive only: new columns on partSupplierOptions
-- (all nullable, existing rows/readers stay valid) and one new append-only
-- table, partOptionApprovals. Does not touch repairOutcomes.partsReplaced,
-- partsRequests/partsOffers, or any Phase 1 table's existing columns.
-- See docs/architecture/parts-acquisition.md.

ALTER TABLE "partSupplierOptions" ADD COLUMN IF NOT EXISTS "supplierContact" text;
ALTER TABLE "partSupplierOptions" ADD COLUMN IF NOT EXISTS "supplierLocation" varchar(255);
ALTER TABLE "partSupplierOptions" ADD COLUMN IF NOT EXISTS "externalSupplierId" varchar(120);
ALTER TABLE "partSupplierOptions" ADD COLUMN IF NOT EXISTS "conditionType" varchar(24);
ALTER TABLE "partSupplierOptions" ADD COLUMN IF NOT EXISTS "coreChargeCents" integer;
ALTER TABLE "partSupplierOptions" ADD COLUMN IF NOT EXISTS "availabilityState" varchar(24);
ALTER TABLE "partSupplierOptions" ADD COLUMN IF NOT EXISTS "etaType" varchar(24);
ALTER TABLE "partSupplierOptions" ADD COLUMN IF NOT EXISTS "etaLeadTimeDays" integer;
ALTER TABLE "partSupplierOptions" ADD COLUMN IF NOT EXISTS "quoteExpiresAt" timestamp;
ALTER TABLE "partSupplierOptions" ADD COLUMN IF NOT EXISTS "lastVerifiedAt" timestamp;

-- Append-only human-approval decisions (see drizzle/schema.ts partOptionApprovals
-- for the full rationale: recommendedOptionId is a snapshot, never updated;
-- APPROVED_OPTION != ORDERED, this is a sourcing decision only).
CREATE TABLE IF NOT EXISTS "partOptionApprovals" (
  "id" serial PRIMARY KEY,
  "fleetId" integer NOT NULL REFERENCES "fleets"("id") ON DELETE CASCADE,
  "partRequirementId" integer NOT NULL REFERENCES "partRequirements"("id") ON DELETE CASCADE,
  "decision" varchar(32) NOT NULL,
  "recommendedOptionId" integer REFERENCES "partSupplierOptions"("id") ON DELETE SET NULL,
  "selectedOptionId" integer REFERENCES "partSupplierOptions"("id") ON DELETE SET NULL,
  "reasonNote" text,
  "decidedByUserId" integer NOT NULL,
  "decidedAt" timestamp NOT NULL DEFAULT now(),
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "partOptionApprovals_fleet_idx" ON "partOptionApprovals" ("fleetId");
CREATE INDEX IF NOT EXISTS "partOptionApprovals_requirement_idx" ON "partOptionApprovals" ("partRequirementId");

ALTER TABLE "partOptionApprovals" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "partOptionApprovals_service_role_full_access" ON "partOptionApprovals";
CREATE POLICY "partOptionApprovals_service_role_full_access" ON "partOptionApprovals"
  FOR ALL TO service_role USING (true) WITH CHECK (true);
