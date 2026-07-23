-- Gate 3: guest-case outcome measurement + follow-up automation.
-- Additive and idempotent; applied in filename order after 0038.

-- Outcome + decision-time + repeat-issue fields on the guest case.
ALTER TABLE "guestCases" ADD COLUMN IF NOT EXISTS "initialDecisionAt" timestamp;
ALTER TABLE "guestCases" ADD COLUMN IF NOT EXISTS "humanReviewStartedAt" timestamp;
ALTER TABLE "guestCases" ADD COLUMN IF NOT EXISTS "humanReviewCompletedAt" timestamp;
ALTER TABLE "guestCases" ADD COLUMN IF NOT EXISTS "repairShopEngagedAt" timestamp;
ALTER TABLE "guestCases" ADD COLUMN IF NOT EXISTS "confirmedRepair" boolean;
ALTER TABLE "guestCases" ADD COLUMN IF NOT EXISTS "repairCompletedAt" timestamp;
ALTER TABLE "guestCases" ADD COLUMN IF NOT EXISTS "estimatedDowntimeHours" numeric(6, 1);
ALTER TABLE "guestCases" ADD COLUMN IF NOT EXISTS "actualDowntimeHours" numeric(6, 1);
ALTER TABLE "guestCases" ADD COLUMN IF NOT EXISTS "repairCostCents" integer;
ALTER TABLE "guestCases" ADD COLUMN IF NOT EXISTS "callsMessagesAvoided" integer;
ALTER TABLE "guestCases" ADD COLUMN IF NOT EXISTS "repeatIssueWithin30Days" boolean;
ALTER TABLE "guestCases" ADD COLUMN IF NOT EXISTS "outcomeConfirmedBy" varchar(64);
ALTER TABLE "guestCases" ADD COLUMN IF NOT EXISTS "outcomeConfidence" varchar(24);
ALTER TABLE "guestCases" ADD COLUMN IF NOT EXISTS "evidenceSource" varchar(24); -- measured|customer_reported|truckfixr_estimate|unknown
ALTER TABLE "guestCases" ADD COLUMN IF NOT EXISTS "outcomeConfirmedAt" timestamp;
ALTER TABLE "guestCases" ADD COLUMN IF NOT EXISTS "lastFollowUpStage" varchar(16);
ALTER TABLE "guestCases" ADD COLUMN IF NOT EXISTS "lastFollowUpAt" timestamp;

-- Follow-up automation ledger (records delivery + prevents duplicates per stage).
CREATE TABLE IF NOT EXISTS "guestCaseFollowUps" (
  "id" serial PRIMARY KEY NOT NULL,
  "guestCaseId" integer NOT NULL REFERENCES "guestCases"("id") ON DELETE CASCADE,
  "stage" varchar(16) NOT NULL, -- 24h|3d|7d|30d
  "scheduledFor" timestamp NOT NULL,
  "channel" varchar(16),         -- email|sms|whatsapp
  "status" varchar(16) DEFAULT 'pending' NOT NULL, -- pending|sent|skipped|failed
  "sentAt" timestamp,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "guestCaseFollowUps_case_idx" ON "guestCaseFollowUps" ("guestCaseId");
CREATE INDEX IF NOT EXISTS "guestCaseFollowUps_due_idx" ON "guestCaseFollowUps" ("status", "scheduledFor");
CREATE UNIQUE INDEX IF NOT EXISTS "guestCaseFollowUps_case_stage_unique" ON "guestCaseFollowUps" ("guestCaseId", "stage");
