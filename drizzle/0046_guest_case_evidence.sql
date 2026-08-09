-- Guest-submitted evidence photos (PRD v1.1 §4.1/§4.2). Image-only for now.
-- Idempotent; applied in filename order via apply-readiness-migrations.ts.

CREATE TABLE IF NOT EXISTS "guestCaseEvidence" (
  "id" serial PRIMARY KEY,
  "guestCaseId" integer NOT NULL REFERENCES "guestCases"("id") ON DELETE CASCADE,
  "kind" varchar(16) NOT NULL DEFAULT 'photo',
  "storageKey" varchar(512) NOT NULL,
  "url" text NOT NULL,
  "mimeType" varchar(64) NOT NULL,
  "sizeBytes" integer NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "guestCaseEvidence_case_idx" ON "guestCaseEvidence" ("guestCaseId");
