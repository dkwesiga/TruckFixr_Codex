import { describe, expect, it } from "vitest";

import {
  calculatePmStatus,
  resolveEffectiveIntervals,
  type PmEffectiveIntervals,
} from "./pmStatus";

const NOW = new Date("2026-07-20T12:00:00Z");

function intervals(
  overrides: Partial<PmEffectiveIntervals> = {}
): PmEffectiveIntervals {
  return {
    intervalKm: null,
    intervalEngineHours: null,
    intervalDays: null,
    warningKm: null,
    warningEngineHours: null,
    warningDays: null,
    whicheverComesFirst: true,
    ...overrides,
  };
}

describe("resolveEffectiveIntervals", () => {
  it("prefers overrides when set, else template", () => {
    const result = resolveEffectiveIntervals(
      {
        intervalKm: 20000,
        intervalEngineHours: null,
        intervalDays: 180,
        warningKm: 1000,
        warningEngineHours: null,
        warningDays: 14,
        whicheverComesFirst: true,
      },
      { overrideIntervalKm: 15000, overrideWarningDays: 7 }
    );
    expect(result.intervalKm).toBe(15000);
    expect(result.intervalDays).toBe(180);
    expect(result.warningDays).toBe(7);
    expect(result.warningKm).toBe(1000);
  });
});

describe("calculatePmStatus", () => {
  it("is inactive when the assignment is inactive", () => {
    const r = calculatePmStatus({
      active: false,
      intervals: intervals({ intervalKm: 20000 }),
      lastCompletedDate: null,
      lastCompletedOdometerKm: null,
      lastCompletedEngineHours: null,
      currentOdometerKm: null,
      currentEngineHours: null,
      now: NOW,
    });
    expect(r.status).toBe("inactive");
  });

  it("returns insufficient_data with no intervals configured", () => {
    const r = calculatePmStatus({
      active: true,
      intervals: intervals(),
      lastCompletedDate: null,
      lastCompletedOdometerKm: null,
      lastCompletedEngineHours: null,
      currentOdometerKm: null,
      currentEngineHours: null,
      now: NOW,
    });
    expect(r.status).toBe("insufficient_data");
  });

  it("does NOT report overdue when odometer data is missing (no false overdue)", () => {
    const r = calculatePmStatus({
      active: true,
      intervals: intervals({ intervalKm: 20000, warningKm: 1000 }),
      lastCompletedDate: null,
      lastCompletedOdometerKm: null, // missing baseline
      lastCompletedEngineHours: null,
      currentOdometerKm: 500000,
      currentEngineHours: null,
      now: NOW,
    });
    expect(r.status).toBe("insufficient_data");
  });

  it("reports not_due when well within the interval", () => {
    const r = calculatePmStatus({
      active: true,
      intervals: intervals({ intervalKm: 20000, warningKm: 1000 }),
      lastCompletedDate: null,
      lastCompletedOdometerKm: 100000,
      lastCompletedEngineHours: null,
      currentOdometerKm: 105000, // used 5000 of 20000
      currentEngineHours: null,
      now: NOW,
    });
    expect(r.status).toBe("not_due");
    expect(r.drivingDimension).toBe("km");
    expect(r.remaining).toBe(15000);
  });

  it("reports due_soon inside the warning window", () => {
    const r = calculatePmStatus({
      active: true,
      intervals: intervals({ intervalKm: 20000, warningKm: 1000 }),
      lastCompletedDate: null,
      lastCompletedOdometerKm: 100000,
      lastCompletedEngineHours: null,
      currentOdometerKm: 119500, // 500 remaining <= 1000 warning
      currentEngineHours: null,
      now: NOW,
    });
    expect(r.status).toBe("due_soon");
  });

  it("reports overdue past the interval", () => {
    const r = calculatePmStatus({
      active: true,
      intervals: intervals({ intervalKm: 20000, warningKm: 1000 }),
      lastCompletedDate: null,
      lastCompletedOdometerKm: 100000,
      lastCompletedEngineHours: null,
      currentOdometerKm: 121000, // used 21000 > 20000
      currentEngineHours: null,
      now: NOW,
    });
    expect(r.status).toBe("overdue");
    expect(r.remaining).toBeLessThan(0);
  });

  it("uses whichever dimension is most severe (days overdue beats km not_due)", () => {
    const r = calculatePmStatus({
      active: true,
      intervals: intervals({ intervalKm: 20000, warningKm: 1000, intervalDays: 180, warningDays: 14 }),
      lastCompletedDate: new Date("2025-01-01T00:00:00Z"), // >180 days before NOW
      lastCompletedOdometerKm: 100000,
      lastCompletedEngineHours: null,
      currentOdometerKm: 101000, // km not due
      currentEngineHours: null,
      now: NOW,
    });
    expect(r.status).toBe("overdue");
    expect(r.drivingDimension).toBe("days");
  });

  it("evaluable overdue wins even when another dimension has missing data", () => {
    const r = calculatePmStatus({
      active: true,
      intervals: intervals({ intervalKm: 20000, intervalEngineHours: 5000 }),
      lastCompletedDate: null,
      lastCompletedOdometerKm: 100000,
      lastCompletedEngineHours: null, // engine hours can't be evaluated
      currentOdometerKm: 130000, // km overdue
      currentEngineHours: null,
      now: NOW,
    });
    expect(r.status).toBe("overdue");
    expect(r.drivingDimension).toBe("km");
  });
});
