-- Harden RLS policies to use authoritative company membership checks
-- and close activity log write access across fleets.
--
-- TruckFixr app users use integer ids, while Supabase auth.uid() returns a UUID.
-- Email/Supabase auth stores the app openId as "supabase_<uuid>", so RLS must
-- resolve auth.uid() through users.openId before comparing against app user ids.

CREATE OR REPLACE FUNCTION "current_app_user_id"()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id
  FROM "users" u
  WHERE auth.uid() IS NOT NULL
    AND (
      u."openId" = ('supabase_' || auth.uid()::text)
      OR u."openId" = auth.uid()::text
    )
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION "user_has_fleet_access"(p_fleet_id integer, p_user_id integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM "fleets" f
    WHERE f.id = p_fleet_id
      AND (
        f."ownerId" = p_user_id
        OR EXISTS (
          SELECT 1
          FROM "companyMemberships" cm
          WHERE cm."fleetId" = p_fleet_id
            AND cm."userId" = p_user_id
            AND cm."status" = 'active'
        )
      )
  );
END;
$$;

CREATE OR REPLACE FUNCTION "get_user_fleet_ids"(p_user_id integer)
RETURNS TABLE(fleet_id integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT scoped_fleets.fleet_id
  FROM (
    SELECT f.id AS fleet_id
    FROM "fleets" f
    WHERE f."ownerId" = p_user_id

    UNION

    SELECT cm."fleetId" AS fleet_id
    FROM "companyMemberships" cm
    WHERE cm."userId" = p_user_id
      AND cm."status" = 'active'
  ) scoped_fleets;
END;
$$;

DROP POLICY IF EXISTS "users_select_policy" ON "users";
CREATE POLICY "users_select_policy" ON "users"
  FOR SELECT USING ("id" = "current_app_user_id"());

DROP POLICY IF EXISTS "fleets_select_policy" ON "fleets";
CREATE POLICY "fleets_select_policy" ON "fleets"
  FOR SELECT USING ("user_has_fleet_access"("id", "current_app_user_id"()));

DROP POLICY IF EXISTS "vehicles_select_policy" ON "vehicles";
CREATE POLICY "vehicles_select_policy" ON "vehicles"
  FOR SELECT USING (
    "user_has_fleet_access"("fleetId", "current_app_user_id"())
    OR "assignedDriverId" = "current_app_user_id"()
  );

DROP POLICY IF EXISTS "inspections_select_policy" ON "inspections";
CREATE POLICY "inspections_select_policy" ON "inspections"
  FOR SELECT USING (
    "user_has_fleet_access"("fleetId", "current_app_user_id"())
    OR "driverId" = "current_app_user_id"()
  );

DROP POLICY IF EXISTS "defects_select_policy" ON "defects";
CREATE POLICY "defects_select_policy" ON "defects"
  FOR SELECT USING (
    "user_has_fleet_access"("fleetId", "current_app_user_id"())
    OR "driverId" = "current_app_user_id"()
  );

DROP POLICY IF EXISTS "defects_insert_policy" ON "defects";
CREATE POLICY "defects_insert_policy" ON "defects"
  FOR INSERT WITH CHECK (
    "user_has_fleet_access"("fleetId", "current_app_user_id"())
  );

DROP POLICY IF EXISTS "defectActions_select_policy" ON "defectActions";
CREATE POLICY "defectActions_select_policy" ON "defectActions"
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM "defects" d
      WHERE d.id = "defectActions"."defectId"
        AND "user_has_fleet_access"(d."fleetId", "current_app_user_id"())
    )
  );

DROP POLICY IF EXISTS "maintenanceLogs_select_policy" ON "maintenanceLogs";
CREATE POLICY "maintenanceLogs_select_policy" ON "maintenanceLogs"
  FOR SELECT USING (
    "user_has_fleet_access"("fleetId", "current_app_user_id"())
  );

DROP POLICY IF EXISTS "tadisAlerts_select_policy" ON "tadisAlerts";
CREATE POLICY "tadisAlerts_select_policy" ON "tadisAlerts"
  FOR SELECT USING (
    "user_has_fleet_access"("fleetId", "current_app_user_id"())
  );

DROP POLICY IF EXISTS "activityLogs_select_policy" ON "activityLogs";
CREATE POLICY "activityLogs_select_policy" ON "activityLogs"
  FOR SELECT USING (
    "user_has_fleet_access"("fleetId", "current_app_user_id"())
  );

DROP POLICY IF EXISTS "activityLogs_insert_policy" ON "activityLogs";
CREATE POLICY "activityLogs_insert_policy" ON "activityLogs"
  FOR INSERT WITH CHECK (
    "user_has_fleet_access"("fleetId", "current_app_user_id"())
    AND "userId" = "current_app_user_id"()
  );

DROP POLICY IF EXISTS "inspectionTemplates_select_policy" ON "inspectionTemplates";
CREATE POLICY "inspectionTemplates_select_policy" ON "inspectionTemplates"
  FOR SELECT USING (
    "user_has_fleet_access"("fleetId", "current_app_user_id"())
  );

DROP POLICY IF EXISTS "inspectionTemplates_insert_policy" ON "inspectionTemplates";
CREATE POLICY "inspectionTemplates_insert_policy" ON "inspectionTemplates"
  FOR INSERT WITH CHECK (
    "user_has_fleet_access"("fleetId", "current_app_user_id"())
  );

DROP POLICY IF EXISTS "passwordResetTokens_select_policy" ON "passwordResetTokens";
CREATE POLICY "passwordResetTokens_select_policy" ON "passwordResetTokens"
  FOR SELECT USING ("userId" = "current_app_user_id"());

DROP POLICY IF EXISTS "passwordResetTokens_insert_policy" ON "passwordResetTokens";
CREATE POLICY "passwordResetTokens_insert_policy" ON "passwordResetTokens"
  FOR INSERT WITH CHECK ("userId" = "current_app_user_id"());

DROP POLICY IF EXISTS "passwordResetTokens_update_policy" ON "passwordResetTokens";
CREATE POLICY "passwordResetTokens_update_policy" ON "passwordResetTokens"
  FOR UPDATE USING ("userId" = "current_app_user_id"())
  WITH CHECK ("userId" = "current_app_user_id"());
