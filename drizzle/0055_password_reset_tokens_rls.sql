-- Harden the "passwordResetTokens" table (RLS lockdown).
--
-- (Renumbered from a draft 0046 after a parallel session committed 0043-0051.
-- ALREADY APPLIED to production 2026-08-13 and verified. Idempotent.)
--
-- History: this table was one of the init-era tables missing from production
-- (0004_init.sql only ALTERs it). It was restored separately via
-- 0006_password_reset.sql (table + indexes), which did NOT enable RLS — leaving
-- a sensitive single-use-token table with row-level security OFF, unlike every
-- other service-role-scoped table.
--
-- This migration is idempotent and safe to run whether or not the table exists:
--   * CREATE TABLE IF NOT EXISTS  -> no-op when already present (mirrors schema.ts).
--   * ENABLE ROW LEVEL SECURITY + service-role policy -> the actual fix.
--
-- Indexes are intentionally NOT (re)created here: the 0006 restore already added
-- unique(token) and userId indexes, so re-adding them would only create
-- redundant duplicates.

CREATE TABLE IF NOT EXISTS "passwordResetTokens" (
  "id" serial PRIMARY KEY,
  "userId" integer NOT NULL,
  "token" varchar(255) NOT NULL,
  "expiresAt" timestamp NOT NULL,
  "usedAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

-- Lock it down: RLS on, access via the service-role connection only. These are
-- sensitive single-use tokens and must never be client-readable.
ALTER TABLE "passwordResetTokens" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regrole('service_role') IS NOT NULL THEN
    DROP POLICY IF EXISTS "passwordResetTokens_service_role_full_access" ON "passwordResetTokens";
    CREATE POLICY "passwordResetTokens_service_role_full_access" ON "passwordResetTokens"
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
