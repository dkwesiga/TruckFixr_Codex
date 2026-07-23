import { describe, expect, it } from "vitest";

import {
  MAINTENANCE_ACTIONS,
  MAINTENANCE_SEVERITIES,
  isCriticalAction,
  type MaintenanceAction,
  type MaintenanceSeverity,
} from "./caseWorkflow";
import {
  CUSTOMER_READINESS,
  CUSTOMER_READINESS_META,
  SERVICE_SOON_ATTENTION_THRESHOLD,
  customerReadinessMeta,
  readinessFromAttentionScore,
  readinessFromClassification,
  readinessFromDecision,
} from "./customerReadiness";

describe("readinessFromDecision — safety floor", () => {
  it("maps critical severity to Stop for every action", () => {
    for (const action of MAINTENANCE_ACTIONS) {
      expect(readinessFromDecision("critical", action)).toBe("stop");
    }
  });

  it("maps every critical action to Stop for every severity", () => {
    const criticalActions = MAINTENANCE_ACTIONS.filter(isCriticalAction);
    expect(criticalActions).toEqual([
      "pull_from_service",
      "roadside_assistance",
      "tow",
    ]);
    for (const severity of MAINTENANCE_SEVERITIES) {
      for (const action of criticalActions) {
        expect(readinessFromDecision(severity, action)).toBe("stop");
      }
    }
  });
});

describe("readinessFromDecision — non-critical mapping", () => {
  const cases: Array<[MaintenanceSeverity, MaintenanceAction, string]> = [
    ["stable", "continue_monitor", "ready"],
    ["attention", "continue_monitor", "monitor"],
    ["stable", "complete_trip_then_inspect", "monitor"],
    ["attention", "complete_trip_then_inspect", "service_soon"],
    ["stable", "schedule_service", "service_soon"],
    ["attention", "schedule_service", "service_soon"],
  ];

  it.each(cases)("(%s, %s) => %s", (severity, action, expected) => {
    expect(readinessFromDecision(severity, action)).toBe(expected);
  });

  it("only ever returns a known readiness value", () => {
    for (const severity of MAINTENANCE_SEVERITIES) {
      for (const action of MAINTENANCE_ACTIONS) {
        expect(CUSTOMER_READINESS).toContain(
          readinessFromDecision(severity, action)
        );
      }
    }
  });
});

describe("readinessFromClassification / attention score", () => {
  it("maps stable => ready and critical => stop", () => {
    expect(readinessFromClassification("stable")).toBe("ready");
    expect(readinessFromClassification("critical")).toBe("stop");
  });

  it("splits attention by the service-soon threshold", () => {
    expect(readinessFromClassification("attention", SERVICE_SOON_ATTENTION_THRESHOLD - 1)).toBe(
      "monitor"
    );
    expect(readinessFromClassification("attention", SERVICE_SOON_ATTENTION_THRESHOLD)).toBe(
      "service_soon"
    );
    // No total supplied => conservative Monitor (never over-soften, never over-alarm).
    expect(readinessFromClassification("attention")).toBe("monitor");
  });

  it("maps attention-score totals across the full band", () => {
    expect(readinessFromAttentionScore(0)).toBe("ready"); // stable
    expect(readinessFromAttentionScore(39)).toBe("ready"); // stable
    expect(readinessFromAttentionScore(40)).toBe("monitor"); // attention, below split
    expect(readinessFromAttentionScore(59)).toBe("monitor");
    expect(readinessFromAttentionScore(60)).toBe("service_soon"); // attention, at split
    expect(readinessFromAttentionScore(74)).toBe("service_soon");
    expect(readinessFromAttentionScore(75)).toBe("stop"); // critical
    expect(readinessFromAttentionScore(100)).toBe("stop");
  });
});

describe("customer readiness metadata", () => {
  it("has consistent, ascending-severity metadata for every state", () => {
    const orders = CUSTOMER_READINESS.map((r) => CUSTOMER_READINESS_META[r].order);
    expect(orders).toEqual([0, 1, 2, 3]);
    for (const r of CUSTOMER_READINESS) {
      const meta = customerReadinessMeta(r);
      expect(meta.tone).toBe(r);
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.operatingRecommendation.length).toBeGreaterThan(0);
    }
  });
});
