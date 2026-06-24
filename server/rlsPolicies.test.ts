import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), "drizzle/0015_harden_rls_and_sessions.sql"),
  "utf8"
);
const expandedMigration = readFileSync(
  resolve(process.cwd(), "drizzle/0016_expand_fleet_scoped_rls.sql"),
  "utf8"
);
const supportRecoveryMigration = readFileSync(
  resolve(process.cwd(), "drizzle/0017_support_recovery_actions.sql"),
  "utf8"
);
const mvpHardeningMigration = readFileSync(
  resolve(process.cwd(), "drizzle/0019_mvp_readiness_hardening.sql"),
  "utf8"
);
const post0012RlsMigration = readFileSync(
  resolve(process.cwd(), "drizzle/0031_enable_post_0012_table_rls.sql"),
  "utf8"
);
const allRlsMigrations = `${migration}\n${expandedMigration}\n${supportRecoveryMigration}\n${mvpHardeningMigration}\n${post0012RlsMigration}`;

function policyBlock(name: string) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = allRlsMigrations.match(
    new RegExp(`CREATE POLICY "${escapedName}"[\\s\\S]*?(?=\\nDROP POLICY|\\nCREATE POLICY|$)`)
  );
  return match?.[0] ?? "";
}

describe("RLS hardening migration", () => {
  it("enables RLS for every post-0012 customer-data table", () => {
    for (const table of [
      "inspectionReviewQueueItems",
      "inspectionReviewActions",
      "combinedInspectionSessions",
      "adminFleetNotes",
      "lead_submissions",
    ]) {
      expect(post0012RlsMigration).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`);
    }
  });

  it("uses fleet-scoped authenticated reads and keeps leads private", () => {
    expect(policyBlock("inspectionReviewQueueItems_select_policy")).toContain('"user_has_fleet_access"');
    expect(policyBlock("inspectionReviewActions_select_policy")).toContain('"inspectionReviewQueueItems"');
    expect(policyBlock("combinedInspectionSessions_select_policy")).toContain('"user_has_fleet_access"');
    expect(policyBlock("adminFleetNotes_select_policy")).toContain('"user_has_fleet_access"');
    expect(post0012RlsMigration).not.toContain('CREATE POLICY "lead_submissions_select_policy"');
  });

  it("retains service-role access for every remediated table", () => {
    for (const table of [
      "inspectionReviewQueueItems",
      "inspectionReviewActions",
      "combinedInspectionSessions",
      "adminFleetNotes",
      "lead_submissions",
    ]) {
      expect(post0012RlsMigration).toContain(`'${table}'`);
    }
    expect(post0012RlsMigration).toContain('CREATE POLICY "service_role_full_access"');
  });

  it("maps Supabase UUID auth identities to TruckFixr integer app users", () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION "current_app_user_id"()');
    expect(migration).toContain("u.\"openId\" = ('supabase_' || auth.uid()::text)");
    expect(migration).toContain('OR u."openId" = auth.uid()::text');
    expect(migration).not.toContain("auth.uid()::integer");
  });

  it("uses active company membership or fleet ownership for fleet access", () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION "user_has_fleet_access"');
    expect(migration).toContain('FROM "companyMemberships" cm');
    expect(migration).toContain('cm."status" = \'active\'');
    expect(migration).toContain('f."ownerId" = p_user_id');
  });

  it("keeps user fleet discovery scoped to owned fleets and active memberships only", () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION "get_user_fleet_ids"');
    expect(migration).toContain('SELECT f.id AS fleet_id');
    expect(migration).toContain('SELECT cm."fleetId" AS fleet_id');
    expect(migration).toContain('cm."status" = \'active\'');
    expect(migration).not.toContain("managerUserId");
  });

  it("does not leave activity log inserts open across fleets", () => {
    const block = policyBlock("activityLogs_insert_policy");

    expect(block).toContain("FOR INSERT WITH CHECK");
    expect(block).toContain('"user_has_fleet_access"("fleetId", "current_app_user_id"())');
    expect(block).toContain('AND "userId" = "current_app_user_id"()');
    expect(block).not.toContain("WITH CHECK (true)");
  });

  it("keeps fleet-scoped policies tied to authoritative fleet access", () => {
    [
      "fleets_select_policy",
      "vehicles_select_policy",
      "inspections_select_policy",
      "defects_select_policy",
      "maintenanceLogs_select_policy",
      "tadisAlerts_select_policy",
      "inspectionTemplates_select_policy",
    ].forEach((name) => {
      expect(policyBlock(name), name).toContain('"user_has_fleet_access"');
    });
  });

  it("only grants driver-specific row access on the driver-owned tables that need it", () => {
    expect(policyBlock("vehicles_select_policy")).toContain('OR "assignedDriverId" = "current_app_user_id"()');
    expect(policyBlock("inspections_select_policy")).toContain('OR "driverId" = "current_app_user_id"()');
    expect(policyBlock("defects_select_policy")).toContain('OR "driverId" = "current_app_user_id"()');
  });

  it("does not allow authenticated users to create or move password reset tokens for other users", () => {
    const insertPolicy = policyBlock("passwordResetTokens_insert_policy");
    const updatePolicy = policyBlock("passwordResetTokens_update_policy");

    expect(insertPolicy).toContain('FOR INSERT WITH CHECK ("userId" = "current_app_user_id"())');
    expect(insertPolicy).not.toContain("WITH CHECK (true)");
    expect(updatePolicy).toContain('FOR UPDATE USING ("userId" = "current_app_user_id"())');
    expect(updatePolicy).toContain('WITH CHECK ("userId" = "current_app_user_id"())');
  });

  it("adds tenant-scoped read policies for newer operational tables", () => {
    [
      "companyMemberships_select_policy",
      "companyJoinRequests_select_policy",
      "vehicleAssignments_select_policy",
      "vehicleAccessRequests_select_policy",
      "inspectionChecklistResponses_select_policy",
      "inspectionPhotos_select_policy",
      "randomProofRequests_select_policy",
      "inspectionFlags_select_policy",
      "repairOutcomes_select_policy",
      "aiUsageLogs_select_policy",
      "aiRequestLogs_select_policy",
      "aiQualityReviews_select_policy",
      "diagnosticReviewQueue_select_policy",
      "subscriptions_select_policy",
      "pilotAccessRedemptions_select_policy",
      "adminAlerts_select_policy",
    ].forEach((name) => {
      expect(policyBlock(name), name).toContain("current_app_user_id");
    });

    expect(policyBlock("repairOutcomes_select_policy")).toContain('"user_has_fleet_access"');
    expect(policyBlock("vehicleAssignments_select_policy")).toContain('"driverUserId" = "current_app_user_id"()');
    expect(policyBlock("subscriptions_select_policy")).toContain('"userId" = "current_app_user_id"()');
  });

  it("does not reintroduce legacy manager linkage or blanket authenticated access in expanded policies", () => {
    expect(expandedMigration).not.toContain("managerUserId");
    expect(expandedMigration).not.toContain("WITH CHECK (true)");
    expect(expandedMigration).not.toContain("USING (true)");
  });

  it("keeps support recovery audit rows staff-service-only and indexed for pilot troubleshooting", () => {
    expect(supportRecoveryMigration).toContain('ALTER TABLE "supportRecoveryActions" ENABLE ROW LEVEL SECURITY');
    expect(policyBlock("supportRecoveryActions_service_role_full_access")).toContain("FOR ALL TO service_role");
    expect(supportRecoveryMigration).not.toContain("TO authenticated");
    expect(mvpHardeningMigration).toContain('"targetInspectionId"');
    expect(mvpHardeningMigration).toContain('"targetDiagnosticCaseId"');
    expect(mvpHardeningMigration).toContain('"supportRecoveryActions_targetVehicle_created_idx"');
  });

  it("adds lookup indexes for core pilot workflows that need fast support and history checks", () => {
    [
      "inspections_fleet_vehicle_created_idx",
      "activityLogs_fleet_vehicle_action_created_idx",
      "aiQualityReviews_fleet_vehicle_case_idx",
      "aiUsageLogs_fleet_vehicle_created_idx",
    ].forEach((indexName) => {
      expect(mvpHardeningMigration).toContain(`"${indexName}"`);
    });
  });
});
