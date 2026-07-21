-- Fleet Health & Maintenance — Phase 3: Maintenance Cases, append-only
-- Decisions, and Repair Cycles. Additive; safe to re-run.

-- Global sequence for human-readable case references (MC-{YEAR}-{seq}). We use
-- a sequence (never row counts) so references are unique and gap-tolerant.
CREATE SEQUENCE IF NOT EXISTS "maintenance_case_seq" START WITH 1 INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS "maintenanceCases" (
  "id" serial PRIMARY KEY NOT NULL,
  "fleetId" integer NOT NULL REFERENCES "fleets"("id") ON DELETE CASCADE,
  "reference" varchar(32) NOT NULL,
  "vehicleId" varchar(64) NOT NULL,
  "status" varchar(32) DEFAULT 'reported' NOT NULL,
  "title" varchar(255),
  "summary" text,
  "severity" varchar(16),
  "origin" varchar(32) NOT NULL,
  "diagnosticSessionId" varchar(128),
  "sourceDefectId" integer,
  "sourceInspectionId" integer,
  "sourceEventId" integer,
  "currentDecisionId" integer,
  "assignedManagerUserId" integer,
  "assignedMaintenanceUserId" integer,
  "expectedCompletionAt" timestamp,
  "openedAt" timestamp DEFAULT now() NOT NULL,
  "closedAt" timestamp,
  "createdByUserId" integer,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "maintenanceCases_reference_unique"
  ON "maintenanceCases" ("reference");
CREATE INDEX IF NOT EXISTS "maintenanceCases_fleet_status_idx"
  ON "maintenanceCases" ("fleetId", "status");
CREATE INDEX IF NOT EXISTS "maintenanceCases_fleet_vehicle_idx"
  ON "maintenanceCases" ("fleetId", "vehicleId");
CREATE INDEX IF NOT EXISTS "maintenanceCases_assigned_manager_idx"
  ON "maintenanceCases" ("assignedManagerUserId");

CREATE TABLE IF NOT EXISTS "maintenanceDecisions" (
  "id" serial PRIMARY KEY NOT NULL,
  "fleetId" integer NOT NULL REFERENCES "fleets"("id") ON DELETE CASCADE,
  "caseId" integer NOT NULL REFERENCES "maintenanceCases"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "source" varchar(32) NOT NULL,
  "originalRecommendationJson" jsonb,
  "proposedAction" varchar(48),
  "finalAction" varchar(48),
  "severity" varchar(16) NOT NULL,
  "confidence" integer,
  "rationale" text,
  "likelyCausesJson" jsonb,
  "immediateChecksJson" jsonb,
  "evidenceJson" jsonb,
  "approvalRequirement" varchar(32) NOT NULL,
  "approvalState" varchar(24) DEFAULT 'pending' NOT NULL,
  "approvedByUserId" integer,
  "approvedAt" timestamp,
  "overrideState" varchar(24),
  "overrideReason" text,
  "supersededDecisionId" integer,
  "diagnosticSessionId" varchar(128),
  "model" varchar(150),
  "promptVersion" varchar(64),
  "isCurrent" boolean DEFAULT true NOT NULL,
  "createdByUserId" integer,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "maintenanceDecisions_case_version_unique"
  ON "maintenanceDecisions" ("caseId", "version");
CREATE INDEX IF NOT EXISTS "maintenanceDecisions_case_idx"
  ON "maintenanceDecisions" ("caseId");
CREATE INDEX IF NOT EXISTS "maintenanceDecisions_current_idx"
  ON "maintenanceDecisions" ("caseId", "isCurrent");

CREATE TABLE IF NOT EXISTS "repairCycles" (
  "id" serial PRIMARY KEY NOT NULL,
  "fleetId" integer NOT NULL REFERENCES "fleets"("id") ON DELETE CASCADE,
  "caseId" integer NOT NULL REFERENCES "maintenanceCases"("id") ON DELETE CASCADE,
  "cycleNumber" integer NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "startedAt" timestamp DEFAULT now() NOT NULL,
  "outOfServiceAt" timestamp,
  "repairStartedAt" timestamp,
  "expectedCompletionAt" timestamp,
  "awaitingPartsSince" timestamp,
  "readyForReturnAt" timestamp,
  "returnedToServiceAt" timestamp,
  "completedAt" timestamp,
  "closureResult" varchar(24),
  "outcomeId" integer,
  "approvedEstimateCents" integer,
  "finalInvoiceCents" integer,
  "downtimeHours" numeric(10, 2),
  "createdByUserId" integer,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "repairCycles_case_cycle_unique"
  ON "repairCycles" ("caseId", "cycleNumber");
CREATE INDEX IF NOT EXISTS "repairCycles_case_idx" ON "repairCycles" ("caseId");
CREATE INDEX IF NOT EXISTS "repairCycles_fleet_active_idx"
  ON "repairCycles" ("fleetId", "active");
