-- Complete tenant-scoped RLS coverage for public tables added after the first
-- RLS pass. Public Supabase clients should only see rows tied to their app user
-- or active fleet membership; service_role keeps backend-only full access.

CREATE SCHEMA IF NOT EXISTS "truckfixr_private";

CREATE OR REPLACE FUNCTION "truckfixr_private"."current_app_user_id"()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.id
  FROM public."users" u
  WHERE auth.uid() IS NOT NULL
    AND (
      u."openId" = ('supabase_' || auth.uid()::text)
      OR u."openId" = auth.uid()::text
    )
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION "truckfixr_private"."user_has_fleet_access"(p_fleet_id integer, p_user_id integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_user_id IS NOT NULL
    AND p_fleet_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public."fleets" f
      WHERE f.id = p_fleet_id
        AND (
          f."ownerId" = p_user_id
          OR EXISTS (
            SELECT 1
            FROM public."companyMemberships" cm
            WHERE cm."fleetId" = p_fleet_id
              AND cm."userId" = p_user_id
              AND cm."status" = 'active'
          )
        )
    )
$$;

CREATE OR REPLACE FUNCTION "truckfixr_private"."user_has_vehicle_access"(p_vehicle_id varchar, p_user_id integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_user_id IS NOT NULL
    AND p_vehicle_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public."vehicles" v
      WHERE v.id = p_vehicle_id
        AND (
          "truckfixr_private"."user_has_fleet_access"(v."fleetId", p_user_id)
          OR v."assignedDriverId" = p_user_id
          OR EXISTS (
            SELECT 1
            FROM public."vehicleAssignments" va
            WHERE va."vehicleId" = p_vehicle_id
              AND va."driverUserId" = p_user_id
              AND va."status" = 'active'
              AND (
                va."accessType" = 'permanent'
                OR va."expiresAt" IS NULL
                OR va."expiresAt" >= now()
              )
          )
        )
    )
$$;

CREATE OR REPLACE FUNCTION "truckfixr_private"."user_can_manage_fleet"(p_fleet_id integer, p_user_id integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_user_id IS NOT NULL
    AND p_fleet_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public."fleets" f
      WHERE f.id = p_fleet_id
        AND (
          f."ownerId" = p_user_id
          OR EXISTS (
            SELECT 1
            FROM public."companyMemberships" cm
            WHERE cm."fleetId" = p_fleet_id
              AND cm."userId" = p_user_id
              AND cm."status" = 'active'
              AND cm."role" IN ('owner', 'manager')
          )
        )
    )
$$;

REVOKE ALL ON SCHEMA "truckfixr_private" FROM PUBLIC;

DO $$
BEGIN
  IF to_regrole('authenticated') IS NOT NULL THEN
    GRANT USAGE ON SCHEMA "truckfixr_private" TO authenticated;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA "truckfixr_private" TO authenticated;
  END IF;
END
$$;

-- Enable Row-Level Security on every table this migration adds tenant policies
-- to. Without this, the SELECT policies below do NOT protect tables created
-- after the one-time loop in 0012_enable_public_table_rls.sql, because a policy
-- has no effect until RLS is enabled on its table. Also (re)create the
-- service_role backend escape hatch, matching the 0012 convention.
--
-- We intentionally do NOT use FORCE ROW LEVEL SECURITY: the application backend
-- connects as the table-owner `postgres` role and must retain full access. A
-- non-forced policy is bypassed by the table owner while anon/authenticated
-- Supabase clients remain restricted to the tenant-scoped policies below.
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'companyMemberships', 'companyInvitations', 'companyJoinRequests',
    'vehicleAssignments', 'vehicleAccessRequests', 'subscriptions',
    'pilotAccessRedemptions', 'pilotAccessEvents', 'driverInvitations',
    'inspectionChecklistResponses', 'inspectionPhotos', 'randomProofRequests',
    'inspectionFlags', 'aiTriageRecords', 'aiRequestLogs', 'aiQualityReviews',
    'diagnosticModelComparisons', 'diagnosticReviewQueue', 'repairOutcomes',
    'inAppAlerts', 'onboardingSteps', 'aiUsageLogs'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    IF to_regrole('service_role') IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'service_role_full_access', t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        'service_role_full_access',
        t
      );
    END IF;
  END LOOP;
END
$$;

DROP POLICY IF EXISTS "companyMemberships_select_policy" ON "companyMemberships";
CREATE POLICY "companyMemberships_select_policy" ON "companyMemberships"
  FOR SELECT USING (
    "userId" = "truckfixr_private"."current_app_user_id"()
    OR "truckfixr_private"."user_can_manage_fleet"("fleetId", "truckfixr_private"."current_app_user_id"())
  );

DROP POLICY IF EXISTS "companyInvitations_select_policy" ON "companyInvitations";
CREATE POLICY "companyInvitations_select_policy" ON "companyInvitations"
  FOR SELECT USING (
    "truckfixr_private"."user_can_manage_fleet"("fleetId", "truckfixr_private"."current_app_user_id"())
  );

DROP POLICY IF EXISTS "companyJoinRequests_select_policy" ON "companyJoinRequests";
CREATE POLICY "companyJoinRequests_select_policy" ON "companyJoinRequests"
  FOR SELECT USING (
    "userId" = "truckfixr_private"."current_app_user_id"()
    OR "truckfixr_private"."user_can_manage_fleet"("fleetId", "truckfixr_private"."current_app_user_id"())
  );

DROP POLICY IF EXISTS "vehicleAssignments_select_policy" ON "vehicleAssignments";
CREATE POLICY "vehicleAssignments_select_policy" ON "vehicleAssignments"
  FOR SELECT USING (
    "driverUserId" = "truckfixr_private"."current_app_user_id"()
    OR "truckfixr_private"."user_can_manage_fleet"("fleetId", "truckfixr_private"."current_app_user_id"())
  );

DROP POLICY IF EXISTS "vehicleAccessRequests_select_policy" ON "vehicleAccessRequests";
CREATE POLICY "vehicleAccessRequests_select_policy" ON "vehicleAccessRequests"
  FOR SELECT USING (
    "requestedByDriverId" = "truckfixr_private"."current_app_user_id"()
    OR "truckfixr_private"."user_can_manage_fleet"("fleetId", "truckfixr_private"."current_app_user_id"())
  );

DROP POLICY IF EXISTS "subscriptions_select_policy" ON "subscriptions";
CREATE POLICY "subscriptions_select_policy" ON "subscriptions"
  FOR SELECT USING (
    "userId" = "truckfixr_private"."current_app_user_id"()
    OR (
      "fleetId" IS NOT NULL
      AND "truckfixr_private"."user_can_manage_fleet"("fleetId", "truckfixr_private"."current_app_user_id"())
    )
  );

DROP POLICY IF EXISTS "pilotAccessRedemptions_select_policy" ON "pilotAccessRedemptions";
CREATE POLICY "pilotAccessRedemptions_select_policy" ON "pilotAccessRedemptions"
  FOR SELECT USING (
    "userId" = "truckfixr_private"."current_app_user_id"()
    OR "truckfixr_private"."user_can_manage_fleet"("fleetId", "truckfixr_private"."current_app_user_id"())
  );

DROP POLICY IF EXISTS "pilotAccessEvents_select_policy" ON "pilotAccessEvents";
CREATE POLICY "pilotAccessEvents_select_policy" ON "pilotAccessEvents"
  FOR SELECT USING (
    "userId" = "truckfixr_private"."current_app_user_id"()
    OR (
      "fleetId" IS NOT NULL
      AND "truckfixr_private"."user_can_manage_fleet"("fleetId", "truckfixr_private"."current_app_user_id"())
    )
  );

DROP POLICY IF EXISTS "driverInvitations_select_policy" ON "driverInvitations";
CREATE POLICY "driverInvitations_select_policy" ON "driverInvitations"
  FOR SELECT USING (
    "truckfixr_private"."user_can_manage_fleet"("fleetId", "truckfixr_private"."current_app_user_id"())
  );

DROP POLICY IF EXISTS "inspectionChecklistResponses_select_policy" ON "inspectionChecklistResponses";
CREATE POLICY "inspectionChecklistResponses_select_policy" ON "inspectionChecklistResponses"
  FOR SELECT USING (
    "driverId" = "truckfixr_private"."current_app_user_id"()
    OR "truckfixr_private"."user_has_fleet_access"("fleetId", "truckfixr_private"."current_app_user_id"())
  );

DROP POLICY IF EXISTS "inspectionPhotos_select_policy" ON "inspectionPhotos";
CREATE POLICY "inspectionPhotos_select_policy" ON "inspectionPhotos"
  FOR SELECT USING (
    "driverId" = "truckfixr_private"."current_app_user_id"()
    OR "truckfixr_private"."user_has_fleet_access"("fleetId", "truckfixr_private"."current_app_user_id"())
  );

DROP POLICY IF EXISTS "randomProofRequests_select_policy" ON "randomProofRequests";
CREATE POLICY "randomProofRequests_select_policy" ON "randomProofRequests"
  FOR SELECT USING (
    "driverId" = "truckfixr_private"."current_app_user_id"()
    OR "truckfixr_private"."user_has_fleet_access"("fleetId", "truckfixr_private"."current_app_user_id"())
  );

DROP POLICY IF EXISTS "inspectionFlags_select_policy" ON "inspectionFlags";
CREATE POLICY "inspectionFlags_select_policy" ON "inspectionFlags"
  FOR SELECT USING (
    "driverId" = "truckfixr_private"."current_app_user_id"()
    OR "truckfixr_private"."user_has_fleet_access"("fleetId", "truckfixr_private"."current_app_user_id"())
  );

DROP POLICY IF EXISTS "aiTriageRecords_select_policy" ON "aiTriageRecords";
CREATE POLICY "aiTriageRecords_select_policy" ON "aiTriageRecords"
  FOR SELECT USING (
    "truckfixr_private"."user_has_fleet_access"("fleetId", "truckfixr_private"."current_app_user_id"())
  );

DROP POLICY IF EXISTS "aiRequestLogs_select_policy" ON "aiRequestLogs";
CREATE POLICY "aiRequestLogs_select_policy" ON "aiRequestLogs"
  FOR SELECT USING (
    "truckfixr_private"."user_can_manage_fleet"("companyId", "truckfixr_private"."current_app_user_id"())
  );

DROP POLICY IF EXISTS "aiQualityReviews_select_policy" ON "aiQualityReviews";
CREATE POLICY "aiQualityReviews_select_policy" ON "aiQualityReviews"
  FOR SELECT USING (
    "userId" = "truckfixr_private"."current_app_user_id"()
    OR (
      "fleetId" IS NOT NULL
      AND "truckfixr_private"."user_has_fleet_access"("fleetId", "truckfixr_private"."current_app_user_id"())
    )
  );

DROP POLICY IF EXISTS "diagnosticModelComparisons_select_policy" ON "diagnosticModelComparisons";
CREATE POLICY "diagnosticModelComparisons_select_policy" ON "diagnosticModelComparisons"
  FOR SELECT USING (
    "requestedByUserId" = "truckfixr_private"."current_app_user_id"()
    OR (
      "fleetId" IS NOT NULL
      AND "truckfixr_private"."user_has_fleet_access"("fleetId", "truckfixr_private"."current_app_user_id"())
    )
  );

DROP POLICY IF EXISTS "diagnosticReviewQueue_select_policy" ON "diagnosticReviewQueue";
CREATE POLICY "diagnosticReviewQueue_select_policy" ON "diagnosticReviewQueue"
  FOR SELECT USING (
    (
      "fleetId" IS NOT NULL
      AND "truckfixr_private"."user_has_fleet_access"("fleetId", "truckfixr_private"."current_app_user_id"())
    )
    OR "truckfixr_private"."user_has_vehicle_access"("vehicleId", "truckfixr_private"."current_app_user_id"())
  );

DROP POLICY IF EXISTS "repairOutcomes_select_policy" ON "repairOutcomes";
CREATE POLICY "repairOutcomes_select_policy" ON "repairOutcomes"
  FOR SELECT USING (
    "truckfixr_private"."user_has_fleet_access"("fleetId", "truckfixr_private"."current_app_user_id"())
  );

DROP POLICY IF EXISTS "inAppAlerts_select_policy" ON "inAppAlerts";
CREATE POLICY "inAppAlerts_select_policy" ON "inAppAlerts"
  FOR SELECT USING (
    "userId" = "truckfixr_private"."current_app_user_id"()
    OR "truckfixr_private"."user_can_manage_fleet"("fleetId", "truckfixr_private"."current_app_user_id"())
  );

DROP POLICY IF EXISTS "onboardingSteps_select_policy" ON "onboardingSteps";
CREATE POLICY "onboardingSteps_select_policy" ON "onboardingSteps"
  FOR SELECT USING (
    "truckfixr_private"."user_can_manage_fleet"("fleetId", "truckfixr_private"."current_app_user_id"())
  );

DROP POLICY IF EXISTS "aiUsageLogs_select_policy" ON "aiUsageLogs";
CREATE POLICY "aiUsageLogs_select_policy" ON "aiUsageLogs"
  FOR SELECT USING (
    "userId" = "truckfixr_private"."current_app_user_id"()
    OR (
      "fleetId" IS NOT NULL
      AND "truckfixr_private"."user_can_manage_fleet"("fleetId", "truckfixr_private"."current_app_user_id"())
    )
  );
