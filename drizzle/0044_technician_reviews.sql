-- Paid ($99 CAD) technician-reviewed Resolution report (PRD v1.1 §5).
-- Idempotent; applied in filename order via apply-readiness-migrations.ts.

CREATE TABLE IF NOT EXISTS "technicianReviews" (
  "id" serial PRIMARY KEY,
  "caseId" integer REFERENCES "cases"("id") ON DELETE SET NULL,
  "guestCaseId" integer REFERENCES "guestCases"("id") ON DELETE SET NULL,
  "status" varchar(24) NOT NULL DEFAULT 'payment_pending',
  "priceCents" integer NOT NULL DEFAULT 9900,
  "currency" varchar(8) NOT NULL DEFAULT 'CAD',
  "stripeCheckoutSessionId" varchar(255),
  "stripePaymentRef" varchar(255),
  "paidAt" timestamp,
  "missingEvidenceNotes" text,
  "callProposedAt" timestamp,
  "callCompletedAt" timestamp,
  "reviewReadyAt" timestamp,
  "slaDueAt" timestamp,
  "afterHours" boolean NOT NULL DEFAULT false,
  "reviewerUserId" integer,
  "reviewStartedAt" timestamp,
  "slaBreachNotifiedAt" timestamp,
  "slaRemedyChoice" varchar(24),
  "slaRevisedDueAt" timestamp,
  "slaMet" boolean,
  "findingsJson" jsonb,
  "aiOverridesJson" jsonb,
  "limitationsText" text,
  "customerMessage" text,
  "deliveredAt" timestamp,
  "refundedAt" timestamp,
  "refundReason" varchar(64),
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "technicianReviews_caseId_idx" ON "technicianReviews" ("caseId");
CREATE INDEX IF NOT EXISTS "technicianReviews_status_idx" ON "technicianReviews" ("status");
CREATE INDEX IF NOT EXISTS "technicianReviews_slaDue_idx" ON "technicianReviews" ("slaDueAt");

CREATE TABLE IF NOT EXISTS "technicianReviewReminders" (
  "id" serial PRIMARY KEY,
  "technicianReviewId" integer NOT NULL REFERENCES "technicianReviews"("id") ON DELETE CASCADE,
  "stage" varchar(16) NOT NULL,
  "scheduledFor" timestamp NOT NULL,
  "channel" varchar(16),
  "status" varchar(16) NOT NULL DEFAULT 'pending',
  "sentAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "technicianReviewReminders_review_idx" ON "technicianReviewReminders" ("technicianReviewId");
CREATE INDEX IF NOT EXISTS "technicianReviewReminders_due_idx" ON "technicianReviewReminders" ("status", "scheduledFor");
CREATE UNIQUE INDEX IF NOT EXISTS "technicianReviewReminders_review_stage_unique" ON "technicianReviewReminders" ("technicianReviewId", "stage");
