ALTER TABLE "inspections"
ADD COLUMN IF NOT EXISTS "linkedVehicleId" varchar(64),
ADD COLUMN IF NOT EXISTS "combinedStage" varchar(16),
ADD COLUMN IF NOT EXISTS "reportOutcome" varchar(32) NOT NULL DEFAULT 'clean',
ADD COLUMN IF NOT EXISTS "highestDefectSeverity" varchar(16) NOT NULL DEFAULT 'none',
ADD COLUMN IF NOT EXISTS "managerReviewRequired" boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "provisionalDriverGuidance" text,
ADD COLUMN IF NOT EXISTS "latestManagerDecision" varchar(32),
ADD COLUMN IF NOT EXISTS "latestManagerInstruction" text,
ADD COLUMN IF NOT EXISTS "latestManagerReviewedByUserId" integer,
ADD COLUMN IF NOT EXISTS "latestManagerReviewedAt" timestamp,
ADD COLUMN IF NOT EXISTS "supersededByInspectionId" integer,
ADD COLUMN IF NOT EXISTS "supersededAt" timestamp;

ALTER TABLE "defects"
ADD COLUMN IF NOT EXISTS "isBlockingOperationally" boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "escalatedFromMinor" boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "latestManagerDecision" varchar(32),
ADD COLUMN IF NOT EXISTS "latestDriverInstruction" text,
ADD COLUMN IF NOT EXISTS "latestManagerActionByUserId" integer,
ADD COLUMN IF NOT EXISTS "latestManagerActionAt" timestamp;

ALTER TABLE "vehicles"
ADD COLUMN IF NOT EXISTS "operationalState" varchar(32) NOT NULL DEFAULT 'active',
ADD COLUMN IF NOT EXISTS "operationalDecisionInspectionId" integer,
ADD COLUMN IF NOT EXISTS "operationalDecisionDefectId" integer,
ADD COLUMN IF NOT EXISTS "operationalDecisionByUserId" integer,
ADD COLUMN IF NOT EXISTS "operationalDecisionAt" timestamp,
ADD COLUMN IF NOT EXISTS "operationalInstruction" text,
ADD COLUMN IF NOT EXISTS "lastCleanInspectionId" integer,
ADD COLUMN IF NOT EXISTS "lastCleanInspectionAt" timestamp;

CREATE TABLE IF NOT EXISTS "inspectionReviewQueueItems" (
  "id" serial PRIMARY KEY,
  "fleetId" integer NOT NULL,
  "inspectionId" integer,
  "defectId" integer,
  "vehicleId" varchar(64),
  "inspectionSessionId" varchar(128),
  "parentQueueItemId" integer,
  "queueType" varchar(32) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'new',
  "headlineStatus" varchar(32) NOT NULL DEFAULT 'review_needed',
  "priority" varchar(16) NOT NULL DEFAULT 'normal',
  "highestSeverity" varchar(16) NOT NULL DEFAULT 'none',
  "managerDecisionRequired" boolean NOT NULL DEFAULT false,
  "requiresDriverInstruction" boolean NOT NULL DEFAULT false,
  "provisionalGuidanceSnapshot" text,
  "latestManagerDecision" varchar(32),
  "latestDriverInstruction" text,
  "latestInternalNote" text,
  "agingState" varchar(32) NOT NULL DEFAULT 'new',
  "openedDetailsAt" timestamp,
  "firstSeenAt" timestamp,
  "reviewStartedAt" timestamp,
  "decisionMadeAt" timestamp,
  "reviewedAt" timestamp,
  "reviewedByUserId" integer,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "inspectionReviewActions" (
  "id" serial PRIMARY KEY,
  "queueItemId" integer NOT NULL,
  "inspectionId" integer NOT NULL,
  "defectId" integer,
  "vehicleId" varchar(64) NOT NULL,
  "managerUserId" integer NOT NULL,
  "actionType" varchar(32) NOT NULL,
  "driverInstructionNote" text,
  "internalNote" text,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "combinedInspectionSessions" (
  "id" serial PRIMARY KEY,
  "fleetId" integer NOT NULL,
  "inspectionSessionId" varchar(128) NOT NULL UNIQUE,
  "truckVehicleId" varchar(64),
  "trailerVehicleId" varchar(64),
  "truckInspectionId" integer,
  "trailerInspectionId" integer,
  "groupedQueueItemId" integer,
  "headlineStatus" varchar(32) NOT NULL DEFAULT 'review_needed',
  "completionState" varchar(64) NOT NULL DEFAULT 'truck_pending_trailer_pending',
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "inspections_fleet_vehicle_submitted_idx"
ON "inspections" ("fleetId", "vehicleId", "submittedAt" DESC);

CREATE INDEX IF NOT EXISTS "inspections_session_idx"
ON "inspections" ("inspectionSessionId");

CREATE INDEX IF NOT EXISTS "review_queue_fleet_status_idx"
ON "inspectionReviewQueueItems" ("fleetId", "status", "priority", "agingState", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "review_queue_vehicle_status_idx"
ON "inspectionReviewQueueItems" ("vehicleId", "status");

CREATE INDEX IF NOT EXISTS "review_actions_queue_created_idx"
ON "inspectionReviewActions" ("queueItemId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "vehicles_operational_state_idx"
ON "vehicles" ("operationalState");
