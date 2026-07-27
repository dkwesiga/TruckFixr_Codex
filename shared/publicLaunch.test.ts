import { describe, expect, it } from "vitest";
import { isPublicLaunchActive, publicLaunchBlockers } from "./publicLaunch";

const active = {
  approved: true,
  signoff: "legal+310T+commercial 2026-08",
  reviewerConfigured: true,
};

describe("publicLaunch gate", () => {
  it("is active only when all three preconditions are met", () => {
    expect(isPublicLaunchActive(active)).toBe(true);
    expect(publicLaunchBlockers(active)).toEqual([]);
  });

  it("stays closed when not approved", () => {
    expect(isPublicLaunchActive({ ...active, approved: false })).toBe(false);
    expect(publicLaunchBlockers({ ...active, approved: false })).toContain(
      "not_approved"
    );
  });

  it("stays closed when the sign-off is not recorded", () => {
    expect(isPublicLaunchActive({ ...active, signoff: "" })).toBe(false);
    expect(isPublicLaunchActive({ ...active, signoff: "   " })).toBe(false);
    expect(publicLaunchBlockers({ ...active, signoff: "" })).toContain(
      "no_signoff_recorded"
    );
  });

  it("stays closed when no reviewer is configured", () => {
    expect(
      isPublicLaunchActive({ ...active, reviewerConfigured: false })
    ).toBe(false);
    expect(
      publicLaunchBlockers({ ...active, reviewerConfigured: false })
    ).toContain("no_reviewer_configured");
  });

  it("reports every unmet precondition at once (fully unconfigured)", () => {
    expect(
      publicLaunchBlockers({
        approved: false,
        signoff: "",
        reviewerConfigured: false,
      })
    ).toEqual([
      "not_approved",
      "no_signoff_recorded",
      "no_reviewer_configured",
    ]);
  });
});
