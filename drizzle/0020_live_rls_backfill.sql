-- Targeted RLS backfill for live MVP verification environments that predate
-- the branch's full 0015/0016 migration set.

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

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fleets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vehicles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "activityLogs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "companyMemberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "supportRecoveryActions" ENABLE ROW LEVEL SECURITY;

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

DROP POLICY IF EXISTS "companyMemberships_select_policy" ON "companyMemberships";
CREATE POLICY "companyMemberships_select_policy" ON "companyMemberships"
  FOR SELECT USING (
    "userId" = "current_app_user_id"()
    OR "user_has_fleet_access"("fleetId", "current_app_user_id"())
  );

DROP POLICY IF EXISTS "subscriptions_select_policy" ON "subscriptions";
CREATE POLICY "subscriptions_select_policy" ON "subscriptions"
  FOR SELECT USING (
    "userId" = "current_app_user_id"()
    OR ("fleetId" IS NOT NULL AND "user_has_fleet_access"("fleetId", "current_app_user_id"()))
  );

DROP POLICY IF EXISTS "supportRecoveryActions_service_role_full_access" ON "supportRecoveryActions";
CREATE POLICY "supportRecoveryActions_service_role_full_access" ON "supportRecoveryActions"
  FOR ALL TO service_role USING (true) WITH CHECK (true);
