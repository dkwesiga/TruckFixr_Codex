import { describe, expect, it } from "vitest";

import {
  evaluateAuthorization,
  type AuthorizationInput,
} from "./repairAuthorizationPolicy";

function base(overrides: Partial<AuthorizationInput> = {}): AuthorizationInput {
  return {
    estimateCents: 50_000,
    fleetLimitCents: 100_000,
    managerLimitCents: 500_000,
    delegationEnabled: true,
    delegatedLimitCents: 75_000,
    actorIsMaintenanceUser: true,
    actorIsAssigned: true,
    caseIsCritical: false,
    valuesReviewed: true,
    hasUnresolvedHighVariance: false,
    scopeMatchesAssessment: true,
    ...overrides,
  };
}

describe("evaluateAuthorization", () => {
  it("lets an eligible maintenance user authorize within the delegated limit", () => {
    expect(evaluateAuthorization(base()).decision).toBe("maintenance_can_authorize");
  });

  it("blocks a maintenance user when delegation is disabled", () => {
    const r = evaluateAuthorization(base({ delegationEnabled: false }));
    expect(r.decision).toBe("manager_approval_required");
    expect(r.reasons.join(" ")).toMatch(/delegated authorization is not enabled/i);
  });

  it("blocks a maintenance user on a critical case", () => {
    const r = evaluateAuthorization(base({ caseIsCritical: true }));
    expect(r.decision).toBe("manager_approval_required");
    expect(r.reasons.join(" ")).toMatch(/critical/i);
  });

  it("blocks a maintenance user above the delegated limit", () => {
    const r = evaluateAuthorization(base({ estimateCents: 90_000 }));
    expect(r.decision).toBe("manager_approval_required");
    expect(r.reasons.join(" ")).toMatch(/delegated authorization limit/i);
  });

  it("blocks a maintenance user with unresolved high variance", () => {
    const r = evaluateAuthorization(base({ hasUnresolvedHighVariance: true }));
    expect(r.decision).toBe("manager_approval_required");
  });

  it("blocks a maintenance user when not assigned", () => {
    expect(evaluateAuthorization(base({ actorIsAssigned: false })).decision).toBe(
      "manager_approval_required"
    );
  });

  it("requires external approval above the manager ceiling for anyone", () => {
    const r = evaluateAuthorization(
      base({ actorIsMaintenanceUser: false, estimateCents: 600_000 })
    );
    expect(r.decision).toBe("external_approval_required");
  });

  it("lets an owner/manager authorize but records manager sign-off reasons over the fleet limit", () => {
    const r = evaluateAuthorization(
      base({ actorIsMaintenanceUser: false, estimateCents: 150_000 })
    );
    expect(r.decision).toBe("manager_can_authorize");
    expect(r.reasons.join(" ")).toMatch(/fleet authorization limit/i);
  });
});
