-- Mr Diesel -> TADIS closed-loop knowledge pipeline (§0-32 of the pipeline spec).
--
-- Additive only. Every new column is nullable or has a safe default so
-- existing pilot rows (maintenanceCases, maintenanceDecisions, repairOutcomes)
-- stay valid without backfill. Two new tables: partnerProfiles (repair-shop
-- tenant profile — also closes a pre-existing gap where scripts/verify/rls.ts
-- already asserted RLS on a "partnerProfiles" table that never existed) and
-- tadisLearningRecords (de-identified knowledge-base candidates), plus an
-- append-only outcomeRevisions audit trail.

-- ---------------------------------------------------------------------------
-- maintenanceCases: case classification + TADIS eligibility (§12)
-- ---------------------------------------------------------------------------
ALTER TABLE "maintenanceCases"
  ADD COLUMN IF NOT EXISTS "caseType" varchar(32),
  ADD COLUMN IF NOT EXISTS "tadisEligibility" varchar(32) NOT NULL DEFAULT 'not_assessed',
  ADD COLUMN IF NOT EXISTS "tadisEligibilityReason" text,
  ADD COLUMN IF NOT EXISTS "tadisEligibilityOverriddenByUserId" integer,
  ADD COLUMN IF NOT EXISTS "tadisEligibilityOverriddenAt" timestamp,
  ADD COLUMN IF NOT EXISTS "recordOrigin" varchar(24) NOT NULL DEFAULT 'live',
  ADD COLUMN IF NOT EXISTS "vehicleContextProvenanceJson" jsonb;

CREATE INDEX IF NOT EXISTS "maintenanceCases_tadisEligibility_idx"
  ON "maintenanceCases" ("tadisEligibility");

-- ---------------------------------------------------------------------------
-- maintenanceDecisions (= Resolution, §8): taxonomy tag
-- ---------------------------------------------------------------------------
ALTER TABLE "maintenanceDecisions"
  ADD COLUMN IF NOT EXISTS "resolutionCategory" varchar(32);

-- ---------------------------------------------------------------------------
-- repairOutcomes (= Outcome, §9/§10/§14/§20): lifecycle, verification,
-- evidence-quality scoring, revision control, optional ROI fields.
-- ---------------------------------------------------------------------------
ALTER TABLE "repairOutcomes"
  ADD COLUMN IF NOT EXISTS "outcomeState" varchar(16) NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS "reportedAt" timestamp,
  ADD COLUMN IF NOT EXISTS "reportedByUserId" integer,
  ADD COLUMN IF NOT EXISTS "evidenceSource" varchar(24) NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS "verifiedAt" timestamp,
  ADD COLUMN IF NOT EXISTS "verifiedByUserId" integer,
  ADD COLUMN IF NOT EXISTS "verificationMethod" varchar(32),
  ADD COLUMN IF NOT EXISTS "verificationNotes" text,
  ADD COLUMN IF NOT EXISTS "confirmedAt" timestamp,
  ADD COLUMN IF NOT EXISTS "confirmedByUserId" integer,
  ADD COLUMN IF NOT EXISTS "confirmationEvidenceType" varchar(40),
  ADD COLUMN IF NOT EXISTS "failedAt" timestamp,
  ADD COLUMN IF NOT EXISTS "failedByUserId" integer,
  ADD COLUMN IF NOT EXISTS "failureNotes" text,
  ADD COLUMN IF NOT EXISTS "technicalRevisionOfId" integer,
  ADD COLUMN IF NOT EXISTS "supersededAt" timestamp,
  ADD COLUMN IF NOT EXISTS "supersededByOutcomeId" integer,
  ADD COLUMN IF NOT EXISTS "evidenceQualityScore" integer,
  ADD COLUMN IF NOT EXISTS "evidenceQualityTier" varchar(16),
  ADD COLUMN IF NOT EXISTS "evidenceQualityBreakdownJson" jsonb,
  ADD COLUMN IF NOT EXISTS "evidenceQualityCalculatedAt" timestamp,
  ADD COLUMN IF NOT EXISTS "estimatedDowntimeAvoidedHours" numeric(10, 2),
  ADD COLUMN IF NOT EXISTS "estimatedTowAvoidedCents" integer,
  ADD COLUMN IF NOT EXISTS "estimatedRoadCallAvoidedCents" integer,
  ADD COLUMN IF NOT EXISTS "estimateSource" varchar(24);

-- Existing rows: backfill outcomeState from the pre-existing free-text
-- confirmationState so historical pilot data participates in the new
-- lifecycle immediately instead of sitting at the "unknown" default.
UPDATE "repairOutcomes"
  SET "outcomeState" = 'confirmed'
  WHERE "outcomeState" = 'unknown' AND "confirmationState" IN ('manager_confirmed', 'confirmed');

CREATE INDEX IF NOT EXISTS "repairOutcomes_outcomeState_idx" ON "repairOutcomes" ("outcomeState");
CREATE INDEX IF NOT EXISTS "repairOutcomes_technicalRevisionOfId_idx" ON "repairOutcomes" ("technicalRevisionOfId");

-- ---------------------------------------------------------------------------
-- outcomeRevisions: append-only audit trail for corrections to a
-- verified/confirmed Outcome (§17). Staff-only, mirrors supportRecoveryActions.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "outcomeRevisions" (
  "id" serial PRIMARY KEY,
  "outcomeId" integer NOT NULL,
  "fleetId" integer NOT NULL,
  "changedByUserId" integer NOT NULL,
  "changeType" varchar(32) NOT NULL,
  "reason" text NOT NULL,
  "beforeStateJson" jsonb,
  "afterStateJson" jsonb,
  "requiresReVerification" boolean NOT NULL DEFAULT false,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "outcomeRevisions_outcome_idx" ON "outcomeRevisions" ("outcomeId");
CREATE INDEX IF NOT EXISTS "outcomeRevisions_fleet_idx" ON "outcomeRevisions" ("fleetId");

ALTER TABLE "outcomeRevisions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "outcomeRevisions_service_role_full_access" ON "outcomeRevisions";
CREATE POLICY "outcomeRevisions_service_role_full_access" ON "outcomeRevisions"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- partnerProfiles: repair-shop tenant profile (§3). Fleet-scoped, so owners
-- and managers of that fleet may read/write their own profile; staff go
-- through the admin/service_role path. Mirrors the fleet-scoped SELECT
-- policy pattern used across POST_0012 tables (0031/0041).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "partnerProfiles" (
  "id" serial PRIMARY KEY,
  "fleetId" integer NOT NULL REFERENCES "fleets"("id") ON DELETE CASCADE,
  "tenantType" varchar(32) NOT NULL DEFAULT 'repair_shop',
  "businessName" varchar(255),
  "contributionPolicy" varchar(32) NOT NULL DEFAULT 'private_only',
  "contributionPolicySetByUserId" integer,
  "contributionPolicySetAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "partnerProfiles_fleetId_unique" ON "partnerProfiles" ("fleetId");

ALTER TABLE "partnerProfiles" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regrole('service_role') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "partnerProfiles_service_role_full_access" ON "partnerProfiles"';
    EXECUTE 'CREATE POLICY "partnerProfiles_service_role_full_access" ON "partnerProfiles" FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END
$$;

DROP POLICY IF EXISTS "partnerProfiles_select_policy" ON "partnerProfiles";
CREATE POLICY "partnerProfiles_select_policy" ON "partnerProfiles"
  FOR SELECT TO authenticated
  USING ("user_has_fleet_access"("fleetId", "current_app_user_id"()));

-- Backfill a profile row for every existing partner fleet so the table's
-- privacy-preserving default applies uniformly (idempotent; a normal
-- onboarding flow creates this row going forward for new partners).
-- Deliberately does NOT opt any fleet into deidentified_learning here — an
-- `isPartner = true` filter would silently flip every partner tenant in the
-- environment (not just Mr Diesel) out of the private_only default.
INSERT INTO "partnerProfiles" ("fleetId", "tenantType", "businessName", "contributionPolicy")
SELECT "id", 'repair_shop', "name", 'private_only'
FROM "fleets"
WHERE "isPartner" = true
ON CONFLICT ("fleetId") DO NOTHING;

-- Mr Diesel Inc, and only Mr Diesel Inc, defaults to deidentified_learning
-- per the pipeline spec (§13). Matched by name since no stable identifier
-- exists yet at migration time; a real onboarding flow should instead call
-- partnerProfiles.setContributionPolicy explicitly.
UPDATE "partnerProfiles"
SET "contributionPolicy" = 'deidentified_learning', "updatedAt" = now()
WHERE "fleetId" IN (SELECT "id" FROM "fleets" WHERE "isPartner" = true AND "name" ILIKE 'Mr Diesel%')
  AND "contributionPolicy" = 'private_only';

-- ---------------------------------------------------------------------------
-- tadisLearningRecords: de-identified knowledge-base candidates (§13/§15).
-- Staff/service-role only — never exposed row-by-row to "authenticated"
-- (retrieval and admin analytics go through server-side service procedures).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "tadisLearningRecords" (
  "id" serial PRIMARY KEY,
  "sourceOutcomeId" integer NOT NULL,
  "sourceMaintenanceCaseId" integer,
  "originFleetId" integer NOT NULL,
  "make" varchar(100),
  "model" varchar(100),
  "modelYear" integer,
  "engineMake" varchar(100),
  "engineModel" varchar(100),
  "assetType" varchar(32),
  "symptomsJson" jsonb,
  "faultCodesJson" jsonb,
  "affectedSystem" varchar(64),
  "affectedSubsystem" varchar(64),
  "diagnosticFindings" text,
  "rootCause" text,
  "resolutionCategory" varchar(32),
  "repairAction" text,
  "partsReplacedJson" jsonb,
  "verificationMethod" varchar(32),
  "outcomeState" varchar(16) NOT NULL,
  "evidenceQualityScore" integer NOT NULL,
  "evidenceQualityTier" varchar(16) NOT NULL,
  "caseType" varchar(32),
  "repairCategory" varchar(32),
  "recordOrigin" varchar(24) NOT NULL DEFAULT 'live',
  "eligibilityStatus" varchar(16) NOT NULL DEFAULT 'candidate',
  "excludedReason" text,
  "excludedByUserId" integer,
  "excludedAt" timestamp,
  "promotedByUserId" integer,
  "promotedAt" timestamp,
  "deidentifiedAt" timestamp NOT NULL DEFAULT now(),
  "createdByUserId" integer,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "tadisLearningRecords_sourceOutcome_unique" ON "tadisLearningRecords" ("sourceOutcomeId");
CREATE INDEX IF NOT EXISTS "tadisLearningRecords_eligibility_idx" ON "tadisLearningRecords" ("eligibilityStatus");
CREATE INDEX IF NOT EXISTS "tadisLearningRecords_make_model_idx" ON "tadisLearningRecords" ("make", "model", "modelYear");
CREATE INDEX IF NOT EXISTS "tadisLearningRecords_affectedSystem_idx" ON "tadisLearningRecords" ("affectedSystem");
CREATE INDEX IF NOT EXISTS "tadisLearningRecords_outcomeState_idx" ON "tadisLearningRecords" ("outcomeState");

ALTER TABLE "tadisLearningRecords" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tadisLearningRecords_service_role_full_access" ON "tadisLearningRecords";
CREATE POLICY "tadisLearningRecords_service_role_full_access" ON "tadisLearningRecords"
  FOR ALL TO service_role USING (true) WITH CHECK (true);
