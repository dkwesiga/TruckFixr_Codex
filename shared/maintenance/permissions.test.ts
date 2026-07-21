import { describe, expect, it } from "vitest";

import {
  FORBIDDEN_MAINTENANCE_CAPABILITIES,
  isKnownMaintenanceCapability,
  MAINTENANCE_CAPABILITIES,
  sanitizeMaintenanceCapabilities,
} from "./permissions";

describe("maintenance capability sanitization", () => {
  it("keeps only known capabilities and de-duplicates", () => {
    const result = sanitizeMaintenanceCapabilities([
      MAINTENANCE_CAPABILITIES.uploadDocuments,
      MAINTENANCE_CAPABILITIES.uploadDocuments,
      MAINTENANCE_CAPABILITIES.updateRepairStatus,
    ]);
    expect(result).toHaveLength(2);
    expect(result).toContain("upload_documents");
    expect(result).toContain("update_repair_status");
  });

  it("drops unknown and privileged keys smuggled into a grant", () => {
    const result = sanitizeMaintenanceCapabilities([
      MAINTENANCE_CAPABILITIES.viewAssignedCases,
      ...FORBIDDEN_MAINTENANCE_CAPABILITIES,
      "approve_estimate",
      "finalize_critical_override",
      "manage_features",
      "totally_made_up",
    ]);
    expect(result).toEqual(["view_assigned_cases"]);
  });

  it("never treats forbidden keys as known capabilities", () => {
    for (const forbidden of FORBIDDEN_MAINTENANCE_CAPABILITIES) {
      expect(isKnownMaintenanceCapability(forbidden)).toBe(false);
    }
  });
});
