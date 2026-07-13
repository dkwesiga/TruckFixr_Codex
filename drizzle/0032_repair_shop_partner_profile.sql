-- Repair shop partner profile (e.g. Mr Diesel Inc).
--
-- Partners are ordinary tenants flagged with fleets.isPartner. Only partner
-- tenants may promote their confirmed repair outcomes into the shared curated
-- fault-code knowledge base (faultCodeReferences), where each candidate still
-- passes through the existing /admin/fault-codes needs_review -> approved gate.

ALTER TABLE "fleets"
  ADD COLUMN IF NOT EXISTS "isPartner" boolean NOT NULL DEFAULT false;

-- Provenance linking a promoted outcome to the reference candidate it seeded.
ALTER TABLE "repairOutcomes"
  ADD COLUMN IF NOT EXISTS "promotedReferenceId" integer,
  ADD COLUMN IF NOT EXISTS "promotedAt" timestamp,
  ADD COLUMN IF NOT EXISTS "promotedByUserId" integer;

CREATE INDEX IF NOT EXISTS "repairOutcomes_promotedReferenceId_idx"
  ON "repairOutcomes" ("promotedReferenceId");
