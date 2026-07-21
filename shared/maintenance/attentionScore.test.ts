import { describe, expect, it } from "vitest";

import {
  ATTENTION_SCORE_RULES,
  calculateAttentionScore,
  classifyAttentionScore,
} from "./attentionScore";

const NOW = new Date("2026-07-20T12:00:00Z");

describe("attention score classification", () => {
  it("maps score bands to classifications", () => {
    expect(classifyAttentionScore(0)).toBe("stable");
    expect(classifyAttentionScore(39)).toBe("stable");
    expect(classifyAttentionScore(40)).toBe("attention");
    expect(classifyAttentionScore(74)).toBe("attention");
    expect(classifyAttentionScore(75)).toBe("critical");
    expect(classifyAttentionScore(100)).toBe("critical");
  });
});

describe("attention score calculation", () => {
  it("scores a stable vehicle at 0", () => {
    const result = calculateAttentionScore({
      hasCurrentOdometer: true,
      hasCurrentEngineHours: true,
      now: NOW,
    });
    expect(result.total).toBe(0);
    expect(result.classification).toBe("stable");
    expect(result.components).toHaveLength(0);
  });

  it("applies each rule's points", () => {
    const result = calculateAttentionScore({
      repeatUnresolvedDtcs: [{ code: "P0420" }],
      pmOverdue: true,
      unresolvedDriverIssuesOlderThan7d: [{ id: "i1" }],
      hasCurrentOdometer: true,
      hasCurrentEngineHours: true,
      now: NOW,
    });
    // 20 + 15 + 10 = 45 -> attention
    expect(result.total).toBe(45);
    expect(result.classification).toBe("attention");
    const keys = result.components.map((c) => c.ruleKey);
    expect(keys).toContain(ATTENTION_SCORE_RULES.repeatUnresolvedDtc.key);
    expect(keys).toContain(ATTENTION_SCORE_RULES.pmOverdue.key);
    expect(keys).toContain(ATTENTION_SCORE_RULES.unresolvedDriverIssue.key);
  });

  it("caps the total at 100", () => {
    const result = calculateAttentionScore({
      activeCriticalDefects: [{ id: "d1", sourceKey: "problem-a" }],
      activeCriticalCases: [{ id: "c1", sourceKey: "problem-b" }],
      repeatUnresolvedDtcs: [{ code: "P0420" }],
      pmOverdue: true,
      unresolvedDriverIssuesOlderThan7d: [{ id: "i1" }],
      repeatRepairSameSystemWithin30d: [{ system: "aftertreatment" }],
      returnToServiceRecurrence: true,
      hasCurrentOdometer: false,
      hasCurrentEngineHours: false,
      now: NOW,
    });
    // Raw = 35+35+20+15+10+10+10+5 = 140 -> capped
    expect(result.total).toBe(100);
    expect(result.classification).toBe("critical");
  });

  it("does not double count a critical defect and case that share a source key", () => {
    const result = calculateAttentionScore({
      activeCriticalDefects: [{ id: "d1", sourceKey: "brake-chamber" }],
      activeCriticalCases: [{ id: "c1", sourceKey: "brake-chamber" }],
      hasCurrentOdometer: true,
      hasCurrentEngineHours: true,
      now: NOW,
    });
    // Only the defect scores; the case shares the source key.
    expect(result.total).toBe(35);
    expect(
      result.components.filter((c) => c.points === 35)
    ).toHaveLength(1);
  });

  it("caps critical cases at a single +35 regardless of count", () => {
    const result = calculateAttentionScore({
      activeCriticalCases: [
        { id: "c1", sourceKey: "a" },
        { id: "c2", sourceKey: "b" },
      ],
      hasCurrentOdometer: true,
      hasCurrentEngineHours: true,
      now: NOW,
    });
    expect(result.total).toBe(35);
  });

  it("does not double count an open defect that is already an active critical defect", () => {
    const result = calculateAttentionScore({
      activeCriticalDefects: [{ id: "d1" }],
      openInspectionDefects: [{ id: "d1" }],
      hasCurrentOdometer: true,
      hasCurrentEngineHours: true,
      now: NOW,
    });
    // Critical defect (+35) only; the same defect is not re-scored as open (+10).
    expect(result.total).toBe(35);
  });

  it("emits a data-quality warning when readings are missing", () => {
    const result = calculateAttentionScore({
      hasCurrentOdometer: false,
      hasCurrentEngineHours: true,
      now: NOW,
    });
    expect(result.total).toBe(ATTENTION_SCORE_RULES.missingReadings.points);
    expect(result.dataQualityWarnings.length).toBeGreaterThan(0);
  });

  it("returns an explanation for every component", () => {
    const result = calculateAttentionScore({
      pmOverdue: true,
      overduePmName: "A-service",
      hasCurrentOdometer: true,
      hasCurrentEngineHours: true,
      now: NOW,
    });
    expect(result.components[0].explanation).toContain("A-service");
    expect(result.calculatedAt).toBe(NOW.toISOString());
  });
});
