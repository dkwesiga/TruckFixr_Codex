-- Public "/try-one-case" guest workflow — standalone, pre-account tables.
-- Additive and idempotent; safe to re-run. Applied in filename order after 0037
-- (the drizzle journal is abandoned at 0012 — do NOT add to it).
--
-- These tables are intentionally TENANT-LESS (no NOT NULL fleetId): a guest has
-- no fleet until reconciliation. They are reached only through signed-token
-- public procedures; the serial "id" is never exposed — "publicToken" is.

-- 1. Guest case (one canonical record per guest submission).
CREATE TABLE IF NOT EXISTS "guestCases" (
  "id" serial PRIMARY KEY NOT NULL,
  "publicToken" varchar(64) NOT NULL,
  "status" varchar(24) DEFAULT 'started' NOT NULL, -- started|preliminary|contacted|decided|reviewing|closed|expired
  "concernCategory" varchar(32),
  "concernText" text NOT NULL,
  "operatingStatus" varchar(32) NOT NULL,
  "faultCodes" jsonb,
  "vehicleIdentifier" jsonb,
  "mileage" integer,
  "engine" varchar(120),
  "location" varchar(255),
  "internalSeverity" varchar(16),      -- stable|attention|critical
  "customerReadiness" varchar(16),     -- ready|monitor|service_soon|stop
  "operatingAction" varchar(40),
  "criticalTriggered" boolean DEFAULT false NOT NULL,
  "criticalTriggerCode" varchar(48),
  "answersJson" jsonb,
  "preliminaryJson" jsonb,
  "decisionJson" jsonb,
  "reviewStatus" varchar(32) DEFAULT 'automated_guidance_only' NOT NULL,
  "intakeSource" varchar(32) DEFAULT 'web' NOT NULL,
  "anonSessionId" varchar(64),
  "ipHash" varchar(64),
  "matchedFleetId" integer REFERENCES "fleets"("id") ON DELETE SET NULL,
  "attachedCaseId" integer REFERENCES "maintenanceCases"("id") ON DELETE SET NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL,
  "expiresAt" timestamp
);
CREATE UNIQUE INDEX IF NOT EXISTS "guestCases_publicToken_unique" ON "guestCases" ("publicToken");
CREATE INDEX IF NOT EXISTS "guestCases_status_idx" ON "guestCases" ("status");
CREATE INDEX IF NOT EXISTS "guestCases_createdAt_idx" ON "guestCases" ("createdAt");
CREATE INDEX IF NOT EXISTS "guestCases_matchedFleet_idx" ON "guestCases" ("matchedFleetId");

-- 2. Guest case audit trail + funnel source of truth.
CREATE TABLE IF NOT EXISTS "guestCaseEvents" (
  "id" serial PRIMARY KEY NOT NULL,
  "guestCaseId" integer NOT NULL REFERENCES "guestCases"("id") ON DELETE CASCADE,
  "type" varchar(48) NOT NULL,
  "payloadJson" jsonb,
  "at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "guestCaseEvents_case_idx" ON "guestCaseEvents" ("guestCaseId");

-- 3. Guest contact + separated consents (email OR phone; none preselected).
CREATE TABLE IF NOT EXISTS "guestCaseContacts" (
  "id" serial PRIMARY KEY NOT NULL,
  "guestCaseId" integer NOT NULL REFERENCES "guestCases"("id") ON DELETE CASCADE,
  "email" varchar(255),
  "phone" varchar(40),
  "role" varchar(32),
  "consentEmail" boolean DEFAULT false NOT NULL,
  "consentSms" boolean DEFAULT false NOT NULL,
  "consentWhatsapp" boolean DEFAULT false NOT NULL,
  "consentMarketing" boolean DEFAULT false NOT NULL,
  "authorityConfirmed" boolean DEFAULT false NOT NULL,
  "capturedAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "guestCaseContacts_case_idx" ON "guestCaseContacts" ("guestCaseId");

-- 4. Free-case eligibility ledger (hashed match keys — no raw PII).
CREATE TABLE IF NOT EXISTS "freeCaseLedger" (
  "id" serial PRIMARY KEY NOT NULL,
  "matchKeyHash" varchar(64) NOT NULL,
  "matchKind" varchar(24) NOT NULL, -- email_domain|phone|vin|unit|device|fleet
  "guestCaseId" integer REFERENCES "guestCases"("id") ON DELETE SET NULL,
  "consumedAt" timestamp DEFAULT now() NOT NULL,
  "duplicateConfidence" numeric(5, 2),
  "duplicateReason" varchar(255),
  "manualOverrideBy" integer,
  "manualOverrideReason" varchar(255),
  "abuseRiskScore" numeric(5, 2)
);
CREATE INDEX IF NOT EXISTS "freeCaseLedger_matchKeyHash_idx" ON "freeCaseLedger" ("matchKeyHash");

-- 5. SLA target config per review category.
CREATE TABLE IF NOT EXISTS "caseSlaConfig" (
  "id" serial PRIMARY KEY NOT NULL,
  "category" varchar(40) NOT NULL,
  "withinServiceHoursMinutes" integer NOT NULL,
  "serviceHoursJson" jsonb,
  "active" boolean DEFAULT true NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "caseSlaConfig_category_unique" ON "caseSlaConfig" ("category");

-- 6. Human-review queue for guest/maintenance cases (mirrors inspectionReviewQueueItems).
CREATE TABLE IF NOT EXISTS "caseReviewQueueItems" (
  "id" serial PRIMARY KEY NOT NULL,
  "guestCaseId" integer REFERENCES "guestCases"("id") ON DELETE CASCADE,
  "maintenanceCaseId" integer REFERENCES "maintenanceCases"("id") ON DELETE CASCADE,
  "category" varchar(40) NOT NULL, -- critical_safety|technical_uncertainty|conflicting_information|high_cost_risk|manual_reviewer_escalation
  "status" varchar(32) DEFAULT 'review_required' NOT NULL,
  "priority" varchar(16) DEFAULT 'normal' NOT NULL,
  "afterHours" boolean DEFAULT false NOT NULL,
  "reviewerUserId" integer,
  "backupReviewerUserId" integer,
  "escalationReason" varchar(255),
  "outcome" varchar(40),
  "reviewerNotes" text,
  "slaDueAt" timestamp,
  "firstSeenAt" timestamp DEFAULT now() NOT NULL,
  "reviewerNotifiedAt" timestamp,
  "reviewStartedAt" timestamp,
  "completedAt" timestamp,
  "slaMet" boolean,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "caseReviewQueueItems_status_idx" ON "caseReviewQueueItems" ("status");
CREATE INDEX IF NOT EXISTS "caseReviewQueueItems_case_idx" ON "caseReviewQueueItems" ("guestCaseId");
CREATE INDEX IF NOT EXISTS "caseReviewQueueItems_slaDue_idx" ON "caseReviewQueueItems" ("slaDueAt");

-- 7. Durable analytics/funnel events (NO PII/free-text/media).
CREATE TABLE IF NOT EXISTS "analyticsEvents" (
  "id" serial PRIMARY KEY NOT NULL,
  "event" varchar(48) NOT NULL,
  "anonSessionId" varchar(64),
  "intakeSource" varchar(32),
  "role" varchar(32),
  "deviceCategory" varchar(16),
  "referralSource" varchar(120),
  "guestCaseId" integer REFERENCES "guestCases"("id") ON DELETE SET NULL,
  "readiness" varchar(16),
  "severity" varchar(16),
  "reviewRequirement" varchar(32),
  "funnelStep" varchar(40),
  "metadataJson" jsonb,
  "at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "analyticsEvents_event_at_idx" ON "analyticsEvents" ("event", "at");
CREATE INDEX IF NOT EXISTS "analyticsEvents_case_idx" ON "analyticsEvents" ("guestCaseId");

-- 8. CAD $99 pilot qualification -> agreement -> activation (payment != activation).
CREATE TABLE IF NOT EXISTS "pilotApplications" (
  "id" serial PRIMARY KEY NOT NULL,
  "fleetName" varchar(255) NOT NULL,
  "vehicleCount" integer,
  "vehicleTypesJson" jsonb,
  "approxAge" varchar(40),
  "coordinatorName" varchar(255),
  "outsourced" boolean,
  "hasMaintenanceManager" boolean,
  "expectedCases30d" integer,
  "primaryContactJson" jsonb,
  "qualificationResult" varchar(24), -- qualified|needs_review|not_a_fit
  "state" varchar(24) DEFAULT 'applied' NOT NULL, -- applied|under_review|qualified|payment_pending|paid|kickoff_pending|active|completed|converted|declined
  "agreementVersion" varchar(32),
  "agreementAcceptedAt" timestamp,
  "acceptedByUserId" integer,
  "paymentRef" varchar(128),
  "agreementSnapshotJson" jsonb,
  "guestCaseId" integer REFERENCES "guestCases"("id") ON DELETE SET NULL,
  "fleetId" integer REFERENCES "fleets"("id") ON DELETE SET NULL,
  "pilotCreditAmountCents" integer,
  "pilotCreditAppliedAt" timestamp,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "pilotApplications_state_idx" ON "pilotApplications" ("state");
CREATE INDEX IF NOT EXISTS "pilotApplications_fleet_idx" ON "pilotApplications" ("fleetId");
