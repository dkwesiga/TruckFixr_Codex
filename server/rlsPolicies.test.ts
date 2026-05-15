import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), "drizzle/0015_harden_rls_and_sessions.sql"),
  "utf8"
);

function policyBlock(name: string) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = migration.match(
    new RegExp(`CREATE POLICY "${escapedName}"[\\s\\S]*?(?=\\nDROP POLICY|\\nCREATE POLICY|$)`)
  );
  return match?.[0] ?? "";
}

describe("RLS hardening migration", () => {
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
});
