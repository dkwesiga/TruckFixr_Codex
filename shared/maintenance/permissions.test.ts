import { describe, expect, it } from "vitest";

import {
  FORBIDDEN_MAINTENANCE_CAPABILITIES,
  isKnownMaintenanceCapability,
  MAINTENANCE_CAPABILITIES,
  sanitizeMaintenanceCapabilities,
  SERVICE_ADVISOR_CAPABILITIES,
  TECHNICIAN_CAPABILITIES,
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

describe("Service Advisor / Technician capability presets", () => {
  it("never grants a Service Advisor the ability to verify or confirm an Outcome", () => {
    expect(SERVICE_ADVISOR_CAPABILITIES).not.toContain(MAINTENANCE_CAPABILITIES.verifyOutcome);
    expect(SERVICE_ADVISOR_CAPABILITIES).not.toContain(MAINTENANCE_CAPABILITIES.confirmOutcome);
  });

  it("grants a Technician the ability to verify and confirm an Outcome", () => {
    expect(TECHNICIAN_CAPABILITIES).toContain(MAINTENANCE_CAPABILITIES.verifyOutcome);
    expect(TECHNICIAN_CAPABILITIES).toContain(MAINTENANCE_CAPABILITIES.confirmOutcome);
  });

  it("makes Technician a strict superset of Service Advisor", () => {
    for (const capability of SERVICE_ADVISOR_CAPABILITIES) {
      expect(TECHNICIAN_CAPABILITIES).toContain(capability);
    }
  });

  it("sanitizes both presets to only known, non-forbidden capabilities", () => {
    expect(sanitizeMaintenanceCapabilities(SERVICE_ADVISOR_CAPABILITIES)).toHaveLength(
      SERVICE_ADVISOR_CAPABILITIES.length
    );
    expect(sanitizeMaintenanceCapabilities(TECHNICIAN_CAPABILITIES)).toHaveLength(
      TECHNICIAN_CAPABILITIES.length
    );
  });
});
