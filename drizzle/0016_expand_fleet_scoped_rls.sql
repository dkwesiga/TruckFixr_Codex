-- Expand app-user RLS coverage to newer fleet-scoped operational tables.
--
-- Migration 0012 enables RLS globally and leaves service_role as the only
-- blanket data path. This migration adds explicit authenticated read policies
-- for newer tables so direct Supabase access is still scoped by app user,
-- active company membership, fleet ownership, or driver-owned records.

DROP POLICY IF EXISTS "companyMemberships_select_policy" ON "companyMemberships";
CREATE POLICY "companyMemberships_select_policy" ON "companyMemberships"
  FOR SELECT USING (
    "userId" = "current_app_user_id"()
    OR "user_has_fleet_access"("fleetId", "current_app_user_id"())
  );

DROP POLICY IF EXISTS "companyJoinRequests_select_policy" ON "companyJoinRequests";
CREATE POLICY "companyJoinRequests_select_policy" ON "companyJoinRequests"
  FOR SELECT USING (
    "userId" = "current_app_user_id"()
    OR "user_has_fleet_access"("fleetId", "current_app_user_id"())
  );

DROP POLICY IF EXISTS "companyInvitations_select_policy" ON "companyInvitations";
CREATE POLICY "companyInvitations_select_policy" ON "companyInvitations"
  FOR SELECT USING (
    "user_has_fleet_access"("fleetId", "current_app_user_id"())
  );

DROP POLICY IF EXISTS "vehicleAssignments_select_policy" ON "vehicleAssignments";
CREATE POLICY "vehicleAssignments_select_policy" ON "vehicleAssignments"
  FOR SELECT USING (
    "driverUserId" = "current_app_user_id"()
    OR "user_has_fleet_access"("fleetId", "current_app_user_id"())
  );

DROP POLICY IF EXISTS "vehicleAccessRequests_select_policy" ON "vehicleAccessRequests";
CREATE POLICY "vehicleAccessRequests_select_policy" ON "vehicleAccessRequests"
  FOR SELECT USING (
    "requestedByDriverId" = "current_app_user_id"()
    OR "user_has_fleet_access"("fleetId", "current_app_user_id"())
  );

DROP POLICY IF EXISTS "inspectionChecklistResponses_select_policy" ON "inspectionChecklistResponses";
CREATE POLICY "inspectionChecklistResponses_select_policy" ON "inspectionChecklistResponses"
  FOR SELECT USING (
    "driverId" = "current_app_user_id"()
    OR "user_has_fleet_access"("fleetId", "current_app_user_id"())
  );

DROP POLICY IF EXISTS "inspectionPhotos_select_policy" ON "inspectionPhotos";
CREATE POLICY "inspectionPhotos_select_policy" ON "inspectionPhotos"
  FOR SELECT USING (
    "driverId" = "current_app_user_id"()
    OR "user_has_fleet_access"("fleetId", "current_app_user_id"())
  );

DROP POLICY IF EXISTS "randomProofRequests_select_policy" ON "randomProofRequests";
CREATE POLICY "randomProofRequests_select_policy" ON "randomProofRequests"
  FOR SELECT USING (
    "driverId" = "current_app_user_id"()
    OR "user_has_fleet_access"("fleetId", "current_app_user_id"())
  );

DROP POLICY IF EXISTS "inspectionFlags_select_policy" ON "inspectionFlags";
CREATE POLICY "inspectionFlags_select_policy" ON "inspectionFlags"
  FOR SELECT USING (
    "driverId" = "current_app_user_id"()
    OR "user_has_fleet_access"("fleetId", "current_app_user_id"())
  );

DROP POLICY IF EXISTS "aiTriageRecords_select_policy" ON "aiTriageRecords";
CREATE POLICY "aiTriageRecords_select_policy" ON "aiTriageRecords"
  FOR SELECT USING (
    "user_has_fleet_access"("fleetId", "current_app_user_id"())
  );

DROP POLICY IF EXISTS "repairOutcomes_select_policy" ON "repairOutcomes";
CREATE POLICY "repairOutcomes_select_policy" ON "repairOutcomes"
  FOR SELECT USING (
    "user_has_fleet_access"("fleetId", "current_app_user_id"())
  );

DROP POLICY IF EXISTS "inAppAlerts_select_policy" ON "inAppAlerts";
CREATE POLICY "inAppAlerts_select_policy" ON "inAppAlerts"
  FOR SELECT USING (
    "userId" = "current_app_user_id"()
    OR "user_has_fleet_access"("fleetId", "current_app_user_id"())
  );

DROP POLICY IF EXISTS "aiUsageLogs_select_policy" ON "aiUsageLogs";
CREATE POLICY "aiUsageLogs_select_policy" ON "aiUsageLogs"
  FOR SELECT USING (
    "userId" = "current_app_user_id"()
    OR ("fleetId" IS NOT NULL AND "user_has_fleet_access"("fleetId", "current_app_user_id"()))
  );

DROP POLICY IF EXISTS "aiRequestLogs_select_policy" ON "aiRequestLogs";
CREATE POLICY "aiRequestLogs_select_policy" ON "aiRequestLogs"
  FOR SELECT USING (
    "user_has_fleet_access"("companyId", "current_app_user_id"())
  );

DROP POLICY IF EXISTS "aiQualityReviews_select_policy" ON "aiQualityReviews";
CREATE POLICY "aiQualityReviews_select_policy" ON "aiQualityReviews"
  FOR SELECT USING (
    "userId" = "current_app_user_id"()
    OR ("fleetId" IS NOT NULL AND "user_has_fleet_access"("fleetId", "current_app_user_id"()))
  );

DROP POLICY IF EXISTS "diagnosticModelComparisons_select_policy" ON "diagnosticModelComparisons";
CREATE POLICY "diagnosticModelComparisons_select_policy" ON "diagnosticModelComparisons"
  FOR SELECT USING (
    "requestedByUserId" = "current_app_user_id"()
    OR ("fleetId" IS NOT NULL AND "user_has_fleet_access"("fleetId", "current_app_user_id"()))
  );

DROP POLICY IF EXISTS "diagnosticReviewQueue_select_policy" ON "diagnosticReviewQueue";
CREATE POLICY "diagnosticReviewQueue_select_policy" ON "diagnosticReviewQueue"
  FOR SELECT USING (
    "fleetId" IS NOT NULL AND "user_has_fleet_access"("fleetId", "current_app_user_id"())
  );

DROP POLICY IF EXISTS "subscriptions_select_policy" ON "subscriptions";
CREATE POLICY "subscriptions_select_policy" ON "subscriptions"
  FOR SELECT USING (
    "userId" = "current_app_user_id"()
    OR ("fleetId" IS NOT NULL AND "user_has_fleet_access"("fleetId", "current_app_user_id"()))
  );

DROP POLICY IF EXISTS "pilotAccessRedemptions_select_policy" ON "pilotAccessRedemptions";
CREATE POLICY "pilotAccessRedemptions_select_policy" ON "pilotAccessRedemptions"
  FOR SELECT USING (
    "userId" = "current_app_user_id"()
    OR "user_has_fleet_access"("fleetId", "current_app_user_id"())
  );

DROP POLICY IF EXISTS "pilotAccessEvents_select_policy" ON "pilotAccessEvents";
CREATE POLICY "pilotAccessEvents_select_policy" ON "pilotAccessEvents"
  FOR SELECT USING (
    "userId" = "current_app_user_id"()
    OR ("fleetId" IS NOT NULL AND "user_has_fleet_access"("fleetId", "current_app_user_id"()))
  );

DROP POLICY IF EXISTS "adminAlerts_select_policy" ON "adminAlerts";
CREATE POLICY "adminAlerts_select_policy" ON "adminAlerts"
  FOR SELECT USING (
    "userId" = "current_app_user_id"()
    OR ("fleetId" IS NOT NULL AND "user_has_fleet_access"("fleetId", "current_app_user_id"()))
  );
