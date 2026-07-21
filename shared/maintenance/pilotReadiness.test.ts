import { describe, expect, it } from "vitest";

import { evaluatePilotReadiness, type ReadinessInput } from "./pilotReadiness";

function ready(overrides: Partial<ReadinessInput> = {}): ReadinessInput {
  return {
    hasValidDates: true,
    hasPrimaryAuthorizedManager: true,
    hasEnrolledVehicle: true,
    diagnosisAvailable: true,
    requiredFeaturesEnabled: true,
    documentsEnabled: false,
    storageOperational: true,
    externalProcessingEnabled: false,
    consentDecisionMade: false,
    hasBackupManager: true,
    baselineComplete: true,
    hasAuthorizationLimit: true,
    ...overrides,
  };
}

describe("evaluatePilotReadiness", () => {
  it("is ready when all prerequisites hold", () => {
    const r = evaluatePilotReadiness(ready());
    expect(r.state).toBe("ready");
    expect(r.blocking).toHaveLength(0);
  });

  it("needs_attention when a blocking prerequisite is missing", () => {
    const r = evaluatePilotReadiness(ready({ hasPrimaryAuthorizedManager: false }));
    expect(r.state).toBe("needs_attention");
    expect(r.blocking.join(" ")).toMatch(/primary authorized manager/i);
    expect(r.degradation.blockApprovals).toBe(true);
    expect(r.degradation.blockAiCaseCreation).toBe(true);
  });

  it("optional when only warnings exist", () => {
    const r = evaluatePilotReadiness(ready({ hasBackupManager: false, hasAuthorizationLimit: false }));
    expect(r.state).toBe("optional");
    expect(r.warnings.length).toBe(2);
    expect(r.blocking).toHaveLength(0);
  });

  it("blocks uploads when documents are on but storage is down", () => {
    const r = evaluatePilotReadiness(ready({ documentsEnabled: true, storageOperational: false }));
    expect(r.degradation.blockUploads).toBe(true);
    expect(r.blocking.join(" ")).toMatch(/storage/i);
  });

  it("switches to manual document mode when consent is undecided", () => {
    const r = evaluatePilotReadiness(ready({ externalProcessingEnabled: true, consentDecisionMade: false }));
    expect(r.degradation.manualDocumentMode).toBe(true);
  });

  it("stops metric counting on invalid dates but does not disable the whole pilot", () => {
    const r = evaluatePilotReadiness(ready({ hasValidDates: false }));
    expect(r.degradation.stopMetricCounting).toBe(true);
    // Other capabilities remain enabled.
    expect(r.degradation.blockUploads).toBe(false);
  });
});
