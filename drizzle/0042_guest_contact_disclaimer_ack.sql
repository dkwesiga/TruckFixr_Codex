-- Guest contact: record the results-disclaimer acknowledgment (liability record).
-- Idempotent; applied in filename order via apply-readiness-migrations.ts.

ALTER TABLE "guestCaseContacts"
  ADD COLUMN IF NOT EXISTS "disclaimerAcknowledged" boolean NOT NULL DEFAULT false;

ALTER TABLE "guestCaseContacts"
  ADD COLUMN IF NOT EXISTS "disclaimerVersion" varchar(32);

ALTER TABLE "guestCaseContacts"
  ADD COLUMN IF NOT EXISTS "disclaimerAcknowledgedAt" timestamp;
