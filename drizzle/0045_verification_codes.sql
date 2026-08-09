-- OTP verification for the guest Resolution report gate (PRD v1.1 §4.5).
-- Idempotent; applied in filename order via apply-readiness-migrations.ts.

CREATE TABLE IF NOT EXISTS "verificationCodes" (
  "id" serial PRIMARY KEY,
  "guestCaseId" integer NOT NULL REFERENCES "guestCases"("id") ON DELETE CASCADE,
  "purpose" varchar(32) NOT NULL,
  "channel" varchar(16) NOT NULL,
  "destination" varchar(255) NOT NULL,
  "codeHash" varchar(128) NOT NULL,
  "attempts" integer NOT NULL DEFAULT 0,
  "maxAttempts" integer NOT NULL DEFAULT 5,
  "resendCount" integer NOT NULL DEFAULT 0,
  "expiresAt" timestamp NOT NULL,
  "verifiedAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "verificationCodes_case_idx" ON "verificationCodes" ("guestCaseId", "purpose");
CREATE INDEX IF NOT EXISTS "verificationCodes_expiresAt_idx" ON "verificationCodes" ("expiresAt");
