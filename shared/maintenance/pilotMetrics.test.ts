import { describe, expect, it } from "vitest";

import { computePilotMetrics, type CaseMetricRecord } from "./pilotMetrics";

const HOUR = 1000 * 60 * 60;

function rec(overrides: Partial<CaseMetricRecord> = {}): CaseMetricRecord {
  return {
    caseId: 1,
    severity: "attention",
    finalAction: "schedule_service",
    createdAtMs: 0,
    firstDecisionAtMs: 2 * HOUR,
    firstApprovalAtMs: 3 * HOUR,
    repairCycleCount: 1,
    completed: true,
    reopenedWithin30Days: false,
    observationWindowElapsed: true,
    totalDowntimeHours: 10,
    criticalOverride: false,
    agreement: "agree",
    documentHighVariance: false,
    outcomeSubmitted: true,
    ...overrides,
  };
}

describe("computePilotMetrics", () => {
  it("counts volume and severity/action breakdowns", () => {
    const m = computePilotMetrics([rec(), rec({ severity: "critical", finalAction: "pull_from_service" })]);
    expect(m.caseVolume).toBe(2);
    expect(m.bySeverity.attention).toBe(1);
    expect(m.bySeverity.critical).toBe(1);
    expect(m.byAction.schedule_service).toBe(1);
  });

  it("computes median time to decision and average approval time", () => {
    const m = computePilotMetrics([
      rec({ firstDecisionAtMs: 2 * HOUR, firstApprovalAtMs: 3 * HOUR }),
      rec({ firstDecisionAtMs: 4 * HOUR, firstApprovalAtMs: 5 * HOUR }),
    ]);
    expect(m.medianTimeToDecisionHours).toBe(3); // (2 + 4) / 2
    expect(m.averageTimeToApprovalHours).toBe(1); // approval - decision = 1h each
  });

  it("computes first-time-fix over eligible elapsed-window cases only", () => {
    const m = computePilotMetrics([
      rec({ repairCycleCount: 1, reopenedWithin30Days: false }), // hit
      rec({ repairCycleCount: 2, reopenedWithin30Days: false }), // miss (2 cycles)
      rec({ repairCycleCount: 1, reopenedWithin30Days: true }),  // miss (reopened)
      rec({ observationWindowElapsed: false }),                  // pending, excluded
    ]);
    // eligible = 3, hits = 1 => 33.3%
    expect(m.firstTimeFixRatePct).toBe(33.3);
    expect(m.pendingObservationWindow).toBe(1);
  });

  it("computes repeat-repair over cases with a completed cycle", () => {
    const m = computePilotMetrics([
      rec({ repairCycleCount: 1 }),
      rec({ repairCycleCount: 2 }),
      rec({ repairCycleCount: 3 }),
    ]);
    // eligible = 3, hits (>=2 cycles) = 2 => 66.7%
    expect(m.repeatRepairRatePct).toBe(66.7);
  });

  it("computes downtime aggregates", () => {
    const m = computePilotMetrics([
      rec({ totalDowntimeHours: 10 }),
      rec({ totalDowntimeHours: 20 }),
      rec({ totalDowntimeHours: 30 }),
    ]);
    expect(m.totalDowntimeHours).toBe(60);
    expect(m.averageDowntimeHours).toBe(20);
    expect(m.medianDowntimeHours).toBe(20);
  });

  it("computes critical override and agreement rates", () => {
    const m = computePilotMetrics([
      rec({ severity: "critical", criticalOverride: true, agreement: "agree" }),
      rec({ severity: "critical", criticalOverride: false, agreement: "disagree" }),
    ]);
    expect(m.criticalOverrideRatePct).toBe(50); // 1 of 2 critical
    expect(m.agreementRatePct).toBe(50); // 1 of 2 known
  });

  it("returns null rates when denominators are zero", () => {
    const m = computePilotMetrics([]);
    expect(m.firstTimeFixRatePct).toBeNull();
    expect(m.criticalOverrideRatePct).toBeNull();
    expect(m.caseVolume).toBe(0);
  });
});
