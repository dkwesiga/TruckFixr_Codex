import { describe, expect, it } from "vitest";

import {
  PILOT_CONVERSION_WINDOW_DAYS,
  PILOT_PRICE_CAD_CENTS,
  activationBlockers,
  allowedPilotTransitions,
  canActivatePilot,
  canTransitionPilot,
  isWithinConversionWindow,
  qualifyPilot,
  type PilotActivationState,
} from "./pilotStateMachine";

describe("pilot transitions", () => {
  it("follows the applied -> ... -> active -> completed -> converted path", () => {
    expect(canTransitionPilot("applied", "qualified")).toBe(true);
    expect(canTransitionPilot("qualified", "payment_pending")).toBe(true);
    expect(canTransitionPilot("payment_pending", "paid")).toBe(true);
    expect(canTransitionPilot("paid", "kickoff_pending")).toBe(true);
    expect(canTransitionPilot("kickoff_pending", "active")).toBe(true);
    expect(canTransitionPilot("active", "completed")).toBe(true);
    expect(canTransitionPilot("completed", "converted")).toBe(true);
  });

  it("rejects skips and no-op transitions", () => {
    expect(canTransitionPilot("qualified", "active")).toBe(false); // can't skip payment
    expect(canTransitionPilot("paid", "active")).toBe(false); // must pass kickoff
    expect(canTransitionPilot("applied", "applied")).toBe(false);
    expect(canTransitionPilot("converted", "active")).toBe(false); // terminal
    expect(allowedPilotTransitions("declined")).toEqual([]);
  });

  it("allows declining from any active phase", () => {
    for (const from of ["applied", "under_review", "qualified", "payment_pending", "paid", "kickoff_pending", "active", "completed"] as const) {
      expect(allowedPilotTransitions(from)).toContain("declined");
    }
  });
});

describe("qualifyPilot", () => {
  it("qualifies a small fleet expecting cases", () => {
    expect(qualifyPilot({ vehicleCount: 4, expectedCases30d: 3 })).toBe("qualified");
  });
  it("routes zero-vehicle fleets to not_a_fit", () => {
    expect(qualifyPilot({ vehicleCount: 0 })).toBe("not_a_fit");
  });
  it("routes large fleets or no-expected-cases to needs_review", () => {
    expect(qualifyPilot({ vehicleCount: 40, expectedCases30d: 10 })).toBe("needs_review");
    expect(qualifyPilot({ vehicleCount: 5, expectedCases30d: 0 })).toBe("needs_review");
  });
});

describe("activation requirements (payment != activation)", () => {
  const ready: PilotActivationState = {
    paid: true,
    agreementAccepted: true,
    hasAccountableOwner: true,
    baselineRecorded: true,
    vehiclesAdded: 3,
  };

  it("activates only when every requirement is met", () => {
    expect(canActivatePilot(ready)).toBe(true);
    expect(activationBlockers(ready)).toEqual([]);
  });

  it("payment alone does not activate", () => {
    const paidOnly: PilotActivationState = {
      paid: true,
      agreementAccepted: false,
      hasAccountableOwner: false,
      baselineRecorded: false,
      vehiclesAdded: 0,
    };
    expect(canActivatePilot(paidOnly)).toBe(false);
    expect(activationBlockers(paidOnly)).toEqual([
      "agreement_not_accepted",
      "no_accountable_owner",
      "no_baseline",
      "no_vehicles_added",
    ]);
  });

  it("reports the single missing requirement", () => {
    expect(activationBlockers({ ...ready, vehiclesAdded: 0 })).toEqual(["no_vehicles_added"]);
    expect(activationBlockers({ ...ready, paid: false })).toEqual(["payment_incomplete"]);
  });
});

describe("conversion window", () => {
  it("credits when converting within the window", () => {
    const completedAt = new Date("2026-07-01T00:00:00Z");
    expect(isWithinConversionWindow(completedAt, new Date("2026-07-10T00:00:00Z"))).toBe(true);
    expect(isWithinConversionWindow(completedAt, new Date("2026-07-20T00:00:00Z"))).toBe(false);
  });
  it("exposes the pilot price and window constants", () => {
    expect(PILOT_PRICE_CAD_CENTS).toBe(9900);
    expect(PILOT_CONVERSION_WINDOW_DAYS).toBe(14);
  });
});
