-- Restore the missing "defectActions" table.
--
-- (Renumbered from a draft 0044 after a parallel session committed 0043-0051.
-- ALREADY APPLIED to production 2026-08-13 and verified; this file records the
-- change for the repo / other environments. Idempotent, so re-running is safe.)
--
-- ROOT CAUSE of "Issue not found" on /defect/:id in production: the
-- "defectActions" table does not exist on this database. It should have been
-- created by the initial drizzle push (its ALTERs live in 0004_init.sql), but on
-- production the table is absent while its siblings exist.
--
-- defects.getById reads defectActions for the decision history, so the whole
-- query throws `relation "defectActions" does not exist` (SQLSTATE 42P01) and the
-- client renders its generic "Issue not found" even though the defect exists.
-- The same missing table also breaks recordDecision / updateStatus / resolve,
-- which INSERT into it.
--
-- This recreates the enum + table (and locks it down with RLS, matching the
-- service-role-only posture of the other post-0012 tables). Idempotent.

-- Enum "defect_action_type" (guarded — CREATE TYPE has no IF NOT EXISTS).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'defect_action_type') THEN
    CREATE TYPE "defect_action_type" AS ENUM ('acknowledge', 'assign', 'resolve', 'comment');
  END IF;
END $$;

-- Table "defectActions" (mirrors drizzle/schema.ts).
CREATE TABLE IF NOT EXISTS "defectActions" (
  "id" serial PRIMARY KEY,
  "defectId" integer,
  "managerId" integer NOT NULL,
  "actionType" "defect_action_type" NOT NULL,
  "notes" text,
  "assignedTo" integer,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

-- Lock it down: RLS on, writes/reads via the service-role connection only
-- (the table carries no fleetId, so there is no authenticated fleet-scoped read).
ALTER TABLE "defectActions" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regrole('service_role') IS NOT NULL THEN
    DROP POLICY IF EXISTS "defectActions_service_role_full_access" ON "defectActions";
    CREATE POLICY "defectActions_service_role_full_access" ON "defectActions"
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
