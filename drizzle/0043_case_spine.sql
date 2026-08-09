-- Canonical case spine (PRD v1.1 unification). Additive only: new `cases`
-- table plus nullable caseId FK columns on guestCases and maintenanceCases.
-- No existing columns, data, or router behavior are changed by this migration.
-- Idempotent; applied in filename order via apply-readiness-migrations.ts.

CREATE TABLE IF NOT EXISTS "cases" (
  "id" serial PRIMARY KEY,
  "sourceType" varchar(32) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'draft',
  "fleetId" integer REFERENCES "fleets"("id") ON DELETE SET NULL,
  "vehicleId" varchar(64),
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "cases_fleet_idx" ON "cases" ("fleetId");
CREATE INDEX IF NOT EXISTS "cases_status_idx" ON "cases" ("status");
CREATE INDEX IF NOT EXISTS "cases_sourceType_idx" ON "cases" ("sourceType");

ALTER TABLE "maintenanceCases"
  ADD COLUMN IF NOT EXISTS "caseId" integer REFERENCES "cases"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "maintenanceCases_caseId_idx" ON "maintenanceCases" ("caseId");

ALTER TABLE "guestCases"
  ADD COLUMN IF NOT EXISTS "caseId" integer REFERENCES "cases"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "guestCases_caseId_idx" ON "guestCases" ("caseId");
