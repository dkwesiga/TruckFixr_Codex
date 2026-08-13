-- Harden inAppAlerts -> defects referential integrity.
--
-- (Renumbered from a draft 0043 after a parallel session committed 0043-0051;
-- content unchanged. NOT yet applied to any database — pending FK hardening.)
--
-- inAppAlerts.defectId was a loose integer with no foreign key. When a defect
-- was hard-deleted (e.g. a demo re-seed drops and re-inserts every defect with
-- new serial ids), its notification survived pointing at an id that no longer
-- existed. Clicking that notification dead-ended on the defect page with
-- "Issue not found".
--
-- This migration:
--   1. Nulls out any already-orphaned defectId references (required before the
--      constraint can be validated).
--   2. Adds a FK with ON DELETE SET NULL so future defect deletions
--      automatically clear the reference instead of orphaning it. A null
--      defectId makes the notification fall back to the vehicle page.
--
-- Idempotent: safe to re-run (constraint add is guarded; the UPDATE is a no-op
-- once there are no orphans).

-- 1. Clear existing orphaned references.
UPDATE "inAppAlerts" AS a
SET "defectId" = NULL
WHERE a."defectId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "defects" d WHERE d."id" = a."defectId"
  );

-- 2. Add the ON DELETE SET NULL foreign key if it is not already present.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'inAppAlerts_defectId_defects_id_fk'
  ) THEN
    ALTER TABLE "inAppAlerts"
      ADD CONSTRAINT "inAppAlerts_defectId_defects_id_fk"
      FOREIGN KEY ("defectId")
      REFERENCES "defects" ("id")
      ON DELETE SET NULL;
  END IF;
END $$;
