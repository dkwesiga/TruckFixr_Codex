import { describe, expect, it } from "vitest";

import { qaReasons, selectWeeklyQa } from "./weeklyQa";

describe("qaReasons", () => {
  it("collects every applicable reason", () => {
    expect(qaReasons({ id: 1, criticalTriggered: true })).toContain("critical");
    expect(qaReasons({ id: 1, reviewSlaMet: false })).toContain("missed_sla");
    expect(qaReasons({ id: 1, repeatIssueWithin30Days: true })).toContain("repeat_issue_within_30d");
    expect(qaReasons({ id: 1, outcomeContradicted: true })).toContain("outcome_contradicted_recommendation");
    // SLA met (true) is not a reason.
    expect(qaReasons({ id: 1, reviewSlaMet: true })).toEqual([]);
    expect(qaReasons({ id: 1 })).toEqual([]);
  });
});

describe("selectWeeklyQa", () => {
  it("flags cases meeting any criterion and never samples them into routine", () => {
    const { flagged, routineSample } = selectWeeklyQa([
      { id: 1, criticalTriggered: true, status: "closed" },
      { id: 2, reviewSlaMet: false, status: "closed" },
      { id: 3, status: "closed" }, // routine
    ]);
    expect(flagged.map((f) => f.id).sort()).toEqual([1, 2]);
    expect(routineSample).not.toContain(1);
    expect(routineSample).not.toContain(2);
  });

  it("takes a deterministic ~10% sample of routine completed cases", () => {
    const cases = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, status: "closed" }));
    const { flagged, routineSample } = selectWeeklyQa(cases);
    expect(flagged).toHaveLength(0);
    // 30 routine cases, every 10th -> 3 sampled.
    expect(routineSample).toHaveLength(3);
    expect(routineSample).toEqual([1, 11, 21]);
  });

  it("only samples closed (completed) routine cases", () => {
    const { routineSample } = selectWeeklyQa([
      { id: 1, status: "decided" }, // not closed -> not sampled
      { id: 2, status: "closed" },
    ]);
    expect(routineSample).toEqual([2]);
  });
});
