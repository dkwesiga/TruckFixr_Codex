-- Extend defect referential integrity to the remaining loose defectId columns.
--
-- (Renumbered from a draft 0045 after a parallel session committed 0043-0051.
-- NOT yet applied to any database — pending FK hardening. Depends on 0053 having
-- created "defectActions".)
--
-- Follows 0052 (which handled inAppAlerts.defectId). Every other table that
-- references a defect by a bare integer is covered here so a deleted defect can
-- never again leave a child row pointing at a missing id.
--
-- Strategy per column:
--   * Nullable defectId  -> ON DELETE SET NULL. Non-destructive: the row is kept
--     (maintenance/repair/warning history stays attached to its vehicle), only
--     the dead defect link is cleared.
--   * tadisAlerts.defectId is NOT NULL -> ON DELETE CASCADE. A TADIS alert has no
--     meaning without its defect, and it cannot be nulled.
--
-- Existing orphans must be resolved before the constraints will validate:
--   * SET NULL tables: null the orphaned references.
--   * CASCADE table (tadisAlerts): delete the orphaned rows (they can't be nulled).
--
-- Idempotent: constraint adds are guarded; the cleanup statements are no-ops once
-- there are no orphans.

-- 1. Clear orphaned references on the nullable columns.
UPDATE "defectActions" a SET "defectId" = NULL
WHERE a."defectId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "defects" d WHERE d."id" = a."defectId");

UPDATE "inspectionReviewQueueItems" a SET "defectId" = NULL
WHERE a."defectId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "defects" d WHERE d."id" = a."defectId");

UPDATE "inspectionReviewActions" a SET "defectId" = NULL
WHERE a."defectId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "defects" d WHERE d."id" = a."defectId");

UPDATE "aiTriageRecords" a SET "defectId" = NULL
WHERE a."defectId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "defects" d WHERE d."id" = a."defectId");

UPDATE "repairOutcomes" a SET "defectId" = NULL
WHERE a."defectId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "defects" d WHERE d."id" = a."defectId");

UPDATE "maintenanceLogs" a SET "defectId" = NULL
WHERE a."defectId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "defects" d WHERE d."id" = a."defectId");

UPDATE "earlyWarningFlags" a SET "defectId" = NULL
WHERE a."defectId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "defects" d WHERE d."id" = a."defectId");

-- 2. Delete orphaned tadisAlerts (NOT NULL defectId cannot be set null).
DELETE FROM "tadisAlerts" a
WHERE a."defectId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "defects" d WHERE d."id" = a."defectId");

-- 3. Add the foreign keys (guarded so re-runs are safe).
DO $$
DECLARE
  rec RECORD;
  constraint_name text;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('defectActions', 'SET NULL'),
      ('inspectionReviewQueueItems', 'SET NULL'),
      ('inspectionReviewActions', 'SET NULL'),
      ('aiTriageRecords', 'SET NULL'),
      ('repairOutcomes', 'SET NULL'),
      ('maintenanceLogs', 'SET NULL'),
      ('earlyWarningFlags', 'SET NULL'),
      ('tadisAlerts', 'CASCADE')
    ) AS t(tbl, act)
  LOOP
    constraint_name := rec.tbl || '_defectId_defects_id_fk';
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = constraint_name
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("defectId") REFERENCES "defects" ("id") ON DELETE %s',
        rec.tbl,
        constraint_name,
        rec.act
      );
    END IF;
  END LOOP;
END $$;
