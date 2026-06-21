import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration0015 = readFileSync(
  resolve(process.cwd(), "drizzle/0015_harden_rls_and_sessions.sql"),
  "utf8"
);

const migration0016 = readFileSync(
  resolve(process.cwd(), "drizzle/0016_complete_tenant_rls_policies.sql"),
  "utf8"
);

const combinedMigrations = `${migration0015}\n${migration0016}`;

function policyBlock(name: string, source = combinedMigrations) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(
    new RegExp(`CREATE POLICY "${escapedName}"[\\s\\S]*?(?=\\nDROP POLICY|\\nCREATE POLICY|$)`)
  );
  return match?.[0] ?? "";
}

describe("RLS hardening migrations", () => {
  it("maps Supabase UUID auth identities to TruckFixr integer app users", () => {
    expect(migration0015).toContain('CREATE OR REPLACE FUNCTION "current_app_user_id"()');
    expect(combinedMigrations).toContain("u.\"openId\" = ('supabase_' || auth.uid()::text)");
    expect(combinedMigrations).toContain('OR u."openId" = auth.uid()::text');
    expect(combinedMigrations).not.toContain("auth.uid()::integer");
  });

  it("uses active company membership or fleet ownership for fleet access", () => {
    expect(migration0015).toContain('CREATE OR REPLACE FUNCTION "user_has_fleet_access"');
    expect(combinedMigrations).toContain('FROM "companyMemberships" cm');
    expect(combinedMigrations).toContain('cm."status" = \'active\'');
    expect(combinedMigrations).toContain('f."ownerId" = p_user_id');
  });

  it("keeps user fleet discovery scoped to owned fleets and active memberships only", () => {
    expect(migration0015).toContain('CREATE OR REPLACE FUNCTION "get_user_fleet_ids"');
    expect(migration0015).toContain('SELECT f.id AS fleet_id');
    expect(migration0015).toContain('SELECT cm."fleetId" AS fleet_id');
    expect(migration0015).toContain('cm."status" = \'active\'');
    expect(migration0015).not.toContain("managerUserId");
  });

  it("does not leave activity log inserts open across fleets", () => {
    const block = policyBlock("activityLogs_insert_policy", migration0015);

    expect(block).toContain("FOR INSERT WITH CHECK");
    expect(block).toContain('"user_has_fleet_access"("fleetId", "current_app_user_id"())');
    expect(block).toContain('AND "userId" = "current_app_user_id"()');
    expect(block).not.toContain("WITH CHECK (true)");
  });

  it("keeps original fleet-scoped policies tied to authoritative fleet access", () => {
    [
      "fleets_select_policy",
      "vehicles_select_policy",
      "inspections_select_policy",
      "defects_select_policy",
      "maintenanceLogs_select_policy",
      "tadisAlerts_select_policy",
      "inspectionTemplates_select_policy",
    ].forEach((name) => {
      expect(policyBlock(name, migration0015), name).toContain('"user_has_fleet_access"');
    });
  });

  it("only grants driver-specific row access on the driver-owned tables that need it", () => {
    expect(policyBlock("vehicles_select_policy", migration0015)).toContain('OR "assignedDriverId" = "current_app_user_id"()');
    expect(policyBlock("inspections_select_policy", migration0015)).toContain('OR "driverId" = "current_app_user_id"()');
    expect(policyBlock("defects_select_policy", migration0015)).toContain('OR "driverId" = "current_app_user_id"()');
  });

  it("does not allow authenticated users to create or move password reset tokens for other users", () => {
    const insertPolicy = policyBlock("passwordResetTokens_insert_policy", migration0015);
    const updatePolicy = policyBlock("passwordResetTokens_update_policy", migration0015);

    expect(insertPolicy).toContain('FOR INSERT WITH CHECK ("userId" = "current_app_user_id"())');
    expect(insertPolicy).not.toContain("WITH CHECK (true)");
    expect(updatePolicy).toContain('FOR UPDATE USING ("userId" = "current_app_user_id"())');
    expect(updatePolicy).toContain('WITH CHECK ("userId" = "current_app_user_id"())');
  });

  it("uses valid dollar-quoted anonymous blocks (no bare `DO $`)", () => {
    // A bare `DO $ ... END $;` is a Postgres syntax error that aborts the whole
    // migration. Every DO block must use `$$` (or a tagged dollar quote).
    expect(migration0016).not.toMatch(/\bDO \$\s*\r?\n/);
    expect(migration0016).not.toMatch(/\bEND \$;/);
    const doBlocks = migration0016.match(/\bDO \$\$/g) ?? [];
    expect(doBlocks.length).toBeGreaterThanOrEqual(2);
  });

  it("enables RLS (without FORCE) and a service_role escape hatch for its tenant tables", () => {
    expect(migration0016).toContain("ENABLE ROW LEVEL SECURITY");
    // The backend connects as the table owner, so an actual FORCE statement
    // would break it (the explanatory comment may still mention the phrase).
    expect(migration0016).not.toMatch(/ALTER TABLE[^\n]*FORCE ROW LEVEL SECURITY/);
    expect(migration0016).toContain("service_role_full_access");
    expect(migration0016).toContain("FOR ALL TO service_role USING (true) WITH CHECK (true)");
    // The enablement loop must cover the same tables that get SELECT policies.
    [
      "companyMemberships",
      "vehicleAssignments",
      "repairOutcomes",
      "diagnosticReviewQueue",
      "aiUsageLogs",
    ].forEach((table) => {
      expect(migration0016, table).toContain(`'${table}'`);
    });
  });

  it("adds private helper functions for the complete tenant-policy pass", () => {
    expect(migration0016).toContain('CREATE SCHEMA IF NOT EXISTS "truckfixr_private"');
    expect(migration0016).toContain('CREATE OR REPLACE FUNCTION "truckfixr_private"."current_app_user_id"()');
    expect(migration0016).toContain('CREATE OR REPLACE FUNCTION "truckfixr_private"."user_has_fleet_access"');
    expect(migration0016).toContain('CREATE OR REPLACE FUNCTION "truckfixr_private"."user_has_vehicle_access"');
    expect(migration0016).toContain('CREATE OR REPLACE FUNCTION "truckfixr_private"."user_can_manage_fleet"');
    expect(migration0016).toContain('REVOKE ALL ON SCHEMA "truckfixr_private" FROM PUBLIC');
  });

  it("adds tenant policies for fleet-scoped tables introduced after the initial RLS migration", () => {
    [
      "companyMemberships_select_policy",
      "companyInvitations_select_policy",
      "companyJoinRequests_select_policy",
      "vehicleAssignments_select_policy",
      "vehicleAccessRequests_select_policy",
      "subscriptions_select_policy",
      "pilotAccessRedemptions_select_policy",
      "pilotAccessEvents_select_policy",
      "driverInvitations_select_policy",
      "inspectionChecklistResponses_select_policy",
      "inspectionPhotos_select_policy",
      "randomProofRequests_select_policy",
      "inspectionFlags_select_policy",
      "aiTriageRecords_select_policy",
      "aiRequestLogs_select_policy",
      "aiQualityReviews_select_policy",
      "diagnosticModelComparisons_select_policy",
      "diagnosticReviewQueue_select_policy",
      "repairOutcomes_select_policy",
      "inAppAlerts_select_policy",
      "onboardingSteps_select_policy",
      "aiUsageLogs_select_policy",
    ].forEach((name) => {
      const block = policyBlock(name, migration0016);
      expect(block, name).toContain("FOR SELECT USING");
      expect(block, name).toContain('"truckfixr_private".');
    });
  });

  it("keeps assigned-driver access scoped to explicit assignment rows or direct vehicle ownership", () => {
    const helper = migration0016.match(
      /CREATE OR REPLACE FUNCTION "truckfixr_private"\."user_has_vehicle_access"[\s\S]*?\$\$;/
    )?.[0] ?? "";

    expect(helper).toContain('v."assignedDriverId" = p_user_id');
    expect(helper).toContain('FROM public."vehicleAssignments" va');
    expect(helper).toContain('va."driverUserId" = p_user_id');
    expect(helper).toContain('va."status" = \'active\'');
    expect(helper).not.toContain("managerUserId");
  });
});
