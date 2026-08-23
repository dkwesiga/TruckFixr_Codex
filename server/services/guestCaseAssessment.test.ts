import { describe, expect, it } from "vitest";

import { assessGuestCase } from "./guestCaseAssessment";
import type { GuestCaseInput } from "../../shared/maintenance/guestCaseFlow";

function input(overrides: Partial<GuestCaseInput> = {}): GuestCaseInput {
  return {
    concernText: "amber check engine light, runs fine",
    operatingStatus: "operating_normally",
    concernCategory: "warning_light",
    ...overrides,
  };
}

describe("assessGuestCase — critical safety floor", () => {
  it("maps a critical concern to Stop + immediate safety guidance + review_required", () => {
    const a = assessGuestCase(input({ concernText: "smoke coming from the engine", operatingStatus: "stopped" }));
    expect(a.criticalTriggered).toBe(true);
    expect(a.customerReadiness).toBe("stop");
    expect(a.internalSeverity).toBe("critical");
    expect(a.operatingAction).toBe("pull_from_service");
    expect(a.safetyGuidance).toBeTruthy();
    expect(a.reviewCategory).toBe("critical_safety");
    expect(a.reviewStatus).toBe("review_required");
  });

  it("escalates to critical when the safety-sweep answer reveals danger", () => {
    const a = assessGuestCase(input({ concernText: "odd noise", concernCategory: "symptom" }), {
      safety_sweep: "smoke_fire",
    });
    expect(a.criticalTriggered).toBe(true);
    expect(a.customerReadiness).toBe("stop");
    expect(a.safetyGuidance).toBeTruthy();
  });

  it("treats unsafe_to_move as critical", () => {
    const a = assessGuestCase(input({ concernText: "not sure", operatingStatus: "unsafe_to_move" }));
    expect(a.customerReadiness).toBe("stop");
    expect(a.reviewStatus).toBe("review_required");
  });
});

describe("assessGuestCase — non-critical mapping", () => {
  it("maps a benign, normally-operating report to Ready / continue monitor", () => {
    const a = assessGuestCase(input());
    expect(a.criticalTriggered).toBe(false);
    expect(a.internalSeverity).toBe("stable");
    expect(a.operatingAction).toBe("continue_monitor");
    expect(a.customerReadiness).toBe("ready");
    expect(a.safetyGuidance).toBeNull();
    expect(a.reviewStatus).toBe("automated_guidance_only");
  });

  it("raises to attention + service soon when stopped", () => {
    const a = assessGuestCase(input({ concernText: "engine died", concernCategory: "symptom", operatingStatus: "stopped" }));
    expect(a.internalSeverity).toBe("attention");
    expect(a.operatingAction).toBe("schedule_service");
    expect(a.customerReadiness).toBe("service_soon");
  });

  it("raises to attention when operating_with_symptoms, even at turn 0 with no clarifying answers (regression: this engine never reads concernText, so operatingStatus was the only signal it had that something is actually wrong — 'operating_with_symptoms' was previously treated the same as 'operating_normally')", () => {
    const a = assessGuestCase(
      input({
        concernText: "Engine dies randomly a couple times a week while driving on the highway, then restarts on its own after a minute.",
        concernCategory: "symptom",
        operatingStatus: "operating_with_symptoms",
      }),
      {}
    );
    expect(a.criticalTriggered).toBe(false);
    expect(a.internalSeverity).toBe("attention");
    expect(a.operatingAction).toBe("complete_trip_then_inspect");
    expect(a.customerReadiness).toBe("service_soon");
  });

  it("a red warning light raises attention but stays drivable => monitor/service soon", () => {
    const a = assessGuestCase(input({ operatingStatus: "operating_with_symptoms" }), { warning_light_color: "red" });
    expect(a.internalSeverity).toBe("attention");
    expect(["monitor", "service_soon"]).toContain(a.customerReadiness);
  });

  it("an overdue-service maintenance concern schedules service", () => {
    const a = assessGuestCase(
      input({ concernText: "due for PM", concernCategory: "maintenance_concern", operatingStatus: "operating_normally" }),
      { service_overdue: "overdue" }
    );
    expect(a.internalSeverity).toBe("attention");
    expect(a.operatingAction).toBe("schedule_service");
    expect(a.customerReadiness).toBe("service_soon");
  });

  it("never returns safety guidance for a non-critical case", () => {
    const a = assessGuestCase(input({ operatingStatus: "operating_with_symptoms" }), { warning_light_color: "amber" });
    expect(a.safetyGuidance).toBeNull();
  });
});
