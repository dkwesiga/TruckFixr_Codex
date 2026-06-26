import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const storagePrivacyMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260527113000_storage_privacy_policies.sql"),
  "utf8"
);

function policyBlock(name: string) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = storagePrivacyMigration.match(
    new RegExp(`CREATE POLICY "${escapedName}"[\\s\\S]*?(?=\\nDROP POLICY|\\nCREATE POLICY|$)`)
  );
  return match?.[0] ?? "";
}

describe("Supabase Storage privacy policies", () => {
  it("keeps TruckFixr evidence buckets private with upload limits", () => {
    ["inspection-evidence", "diagnostic-evidence", "fleet-documents"].forEach((bucket) => {
      expect(storagePrivacyMigration).toContain(`'${bucket}'`);
    });

    expect(storagePrivacyMigration).toContain("public = false");
    expect(storagePrivacyMigration).toContain("5242880");
    expect(storagePrivacyMigration).toContain("10485760");
    expect(storagePrivacyMigration).toContain("image/jpeg");
    expect(storagePrivacyMigration).toContain("application/pdf");
    expect(storagePrivacyMigration).not.toContain("public = true");
  });

  it("scopes object access by company folder and TruckFixr fleet membership", () => {
    expect(storagePrivacyMigration).toContain('CREATE OR REPLACE FUNCTION "truckfixr_storage_fleet_id"');
    expect(storagePrivacyMigration).toContain("^company-[0-9]+$");

    [
      "truckfixr_private_evidence_select",
      "truckfixr_private_evidence_insert",
      "truckfixr_private_evidence_update_own_object",
      "truckfixr_private_evidence_delete_own_object",
    ].forEach((name) => {
      const block = policyBlock(name);
      expect(block, name).toContain('"truckfixr_storage_fleet_id"(name) IS NOT NULL');
      expect(block, name).toContain('"user_has_fleet_access"');
      expect(block, name).toContain('"current_app_user_id"()');
      expect(block, name).toContain("bucket_id IN ('inspection-evidence', 'diagnostic-evidence', 'fleet-documents')");
    });
  });

  it("uses operation-aware SELECT policies and avoids public or blanket access", () => {
    const selectPolicy = policyBlock("truckfixr_private_evidence_select");

    expect(selectPolicy).toContain("storage.allow_any_operation");
    expect(selectPolicy).toContain("'object.list'");
    expect(selectPolicy).toContain("'storage.object.get_authenticated'");
    expect(storagePrivacyMigration).not.toContain("TO public");
    expect(storagePrivacyMigration).not.toContain("TO anon");
    expect(storagePrivacyMigration).not.toContain("WITH CHECK (true)");
    expect(storagePrivacyMigration).not.toContain("USING (true)");
  });

  it("limits replacement and deletion to the uploading owner inside an allowed fleet", () => {
    const updatePolicy = policyBlock("truckfixr_private_evidence_update_own_object");
    const deletePolicy = policyBlock("truckfixr_private_evidence_delete_own_object");

    expect(updatePolicy).toContain("owner_id = (select auth.uid()::text)");
    expect(deletePolicy).toContain("owner_id = (select auth.uid()::text)");
    expect(updatePolicy).toContain("WITH CHECK");
    expect(deletePolicy).not.toContain("WITH CHECK (true)");
  });
});
