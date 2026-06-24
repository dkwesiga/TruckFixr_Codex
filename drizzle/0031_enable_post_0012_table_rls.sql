-- Enable RLS on public tables created after the global 0012 backfill.
-- Application writes remain server/service-role only. Authenticated reads are
-- restricted to the current user's fleet wherever the table carries fleet data.

ALTER TABLE "inspectionReviewQueueItems" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inspectionReviewActions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "combinedInspectionSessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "adminFleetNotes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lead_submissions" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  target_table text;
BEGIN
  IF to_regrole('service_role') IS NOT NULL THEN
    FOREACH target_table IN ARRAY ARRAY[
      'inspectionReviewQueueItems',
      'inspectionReviewActions',
      'combinedInspectionSessions',
      'adminFleetNotes',
      'lead_submissions'
    ]
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS "service_role_full_access" ON %I', target_table);
      EXECUTE format(
        'CREATE POLICY "service_role_full_access" ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        target_table
      );
    END LOOP;
  END IF;
END
$$;

DROP POLICY IF EXISTS "inspectionReviewQueueItems_select_policy" ON "inspectionReviewQueueItems";
CREATE POLICY "inspectionReviewQueueItems_select_policy" ON "inspectionReviewQueueItems"
  FOR SELECT TO authenticated
  USING ("user_has_fleet_access"("fleetId", "current_app_user_id"()));

DROP POLICY IF EXISTS "inspectionReviewActions_select_policy" ON "inspectionReviewActions";
CREATE POLICY "inspectionReviewActions_select_policy" ON "inspectionReviewActions"
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM "inspectionReviewQueueItems" queue_item
      WHERE queue_item."id" = "inspectionReviewActions"."queueItemId"
        AND "user_has_fleet_access"(queue_item."fleetId", "current_app_user_id"())
    )
  );

DROP POLICY IF EXISTS "combinedInspectionSessions_select_policy" ON "combinedInspectionSessions";
CREATE POLICY "combinedInspectionSessions_select_policy" ON "combinedInspectionSessions"
  FOR SELECT TO authenticated
  USING ("user_has_fleet_access"("fleetId", "current_app_user_id"()));

DROP POLICY IF EXISTS "adminFleetNotes_select_policy" ON "adminFleetNotes";
CREATE POLICY "adminFleetNotes_select_policy" ON "adminFleetNotes"
  FOR SELECT TO authenticated
  USING ("user_has_fleet_access"("fleetId", "current_app_user_id"()));

-- Lead records contain contact information and are written by the trusted
-- backend public-request route. Deliberately create no anon/authenticated policy.
DROP POLICY IF EXISTS "lead_submissions_select_policy" ON "lead_submissions";

