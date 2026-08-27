-- Repair Shop workflow, Phase 1 (docs: repair-shop Phase 1 — adaptive
-- diagnostic triage loop, repair outcome, manual 3-day follow-up, linked
-- return jobs). Additive only: new nullable/defaulted columns on existing
-- tables plus one new table. No existing column, data, or router behavior is
-- changed by this migration. Idempotent; applied in filename order via
-- apply-readiness-migrations.ts.

-- maintenanceCases: return-job linkage (never overwrites the original case;
-- see server/services/repairShopWorkflow.ts createReturnJob) and the 3-day
-- follow-up due date set when a repair outcome is recorded.
ALTER TABLE "maintenanceCases"
  ADD COLUMN IF NOT EXISTS "originalCaseId" integer REFERENCES "maintenanceCases"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "followUpDueAt" timestamp;

CREATE INDEX IF NOT EXISTS "maintenanceCases_originalCaseId_idx" ON "maintenanceCases" ("originalCaseId");

-- maintenanceDecisions: additional adaptive shop-triage fields not covered by
-- the existing confidence/likelyCausesJson/immediateChecksJson/rationale
-- columns (reused as-is for confidence, ranked likely causes, remaining
-- verification, and diagnostic rationale respectively).
ALTER TABLE "maintenanceDecisions"
  ADD COLUMN IF NOT EXISTS "confidenceStatus" varchar(24),
  ADD COLUMN IF NOT EXISTS "nextDiagnosticStepJson" jsonb,
  ADD COLUMN IF NOT EXISTS "safetySummary" text,
  ADD COLUMN IF NOT EXISTS "evidenceSummary" text;

-- repairOutcomes: shop-confidence + explicit (possibly unconfirmed) root
-- cause, distinct from confirmedFault (what was found) — see repair-shop
-- Phase 1 spec §12.
ALTER TABLE "repairOutcomes"
  ADD COLUMN IF NOT EXISTS "shopConfidence" integer,
  ADD COLUMN IF NOT EXISTS "rootCause" text,
  ADD COLUMN IF NOT EXISTS "rootCauseConfirmed" boolean NOT NULL DEFAULT false;

-- Manual 3-day follow-up record (repair-shop Phase 1 §14). One row per
-- follow-up call; a case can in principle be followed up more than once
-- (e.g. a partial-resolution call, then a later resolved call), so this is
-- append-only like maintenanceDecisions rather than a single mutable column.
CREATE TABLE IF NOT EXISTS "repairFollowUps" (
  "id" serial PRIMARY KEY,
  "fleetId" integer NOT NULL REFERENCES "fleets"("id") ON DELETE CASCADE,
  "maintenanceCaseId" integer NOT NULL REFERENCES "maintenanceCases"("id") ON DELETE CASCADE,
  "repairOutcomeId" integer REFERENCES "repairOutcomes"("id") ON DELETE SET NULL,
  -- resolved | partially_resolved | not_resolved | returned
  "result" varchar(24) NOT NULL,
  "note" text,
  "recordedByUserId" integer NOT NULL,
  "recordedAt" timestamp NOT NULL DEFAULT now(),
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "repairFollowUps_case_idx" ON "repairFollowUps" ("maintenanceCaseId");
CREATE INDEX IF NOT EXISTS "repairFollowUps_fleet_idx" ON "repairFollowUps" ("fleetId");
