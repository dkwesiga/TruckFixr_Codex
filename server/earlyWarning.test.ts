import { describe, expect, it } from "vitest";
import { computeDesiredWarnings } from "./services/earlyWarning";

type AnyDefect = Record<string, unknown>;

const NOW = new Date("2026-06-23T12:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

let nextId = 1;
function defect(overrides: AnyDefect = {}): any {
  return {
    id: nextId++,
    fleetId: 1,
    vehicleId: "TRUCK-1",
    driverId: 1,
    title: "Issue",
    description: null,
    category: null,
    severity: "medium",
    status: "open",
    faultCodes: null,
    symptoms: null,
    resolvedAt: null,
    closedAt: null,
    createdAt: daysAgo(1),
    updatedAt: daysAgo(1),
    ...overrides,
  };
}

const types = (defects: any[]) =>
  new Set(computeDesiredWarnings(defects, NOW).map((w) => w.warningType));

describe("computeDesiredWarnings", () => {
  it("flags 3+ open issues", () => {
    const defects = [defect(), defect(), defect()];
    expect(types(defects).has("multiple_open_issues")).toBe(true);
  });

  it("does not flag multiple_open_issues with only 2 open", () => {
    expect(types([defect(), defect()]).has("multiple_open_issues")).toBe(false);
  });

  it("flags a repeated symptom reported 2+ times in 30 days", () => {
    const defects = [
      defect({ title: "Air brake hiss" }),
      defect({ title: "Air brake hiss" }),
    ];
    expect(types(defects).has("repeat_symptom")).toBe(true);
  });

  it("does not flag a repeated symptom older than 30 days", () => {
    const defects = [
      defect({ title: "Air brake hiss", createdAt: daysAgo(40) }),
      defect({ title: "Air brake hiss", createdAt: daysAgo(35) }),
    ];
    const result = computeDesiredWarnings(defects, NOW);
    expect(result.find((w) => w.warningType === "repeat_symptom")).toBeUndefined();
  });

  it("flags a repeated fault code", () => {
    const defects = [
      defect({ faultCodes: ["SPN 1234"] }),
      defect({ faultCodes: ["SPN 1234"] }),
    ];
    expect(types(defects).has("repeat_fault_code")).toBe(true);
  });

  it("flags an open high/critical defect", () => {
    expect(types([defect({ severity: "critical" })]).has("high_severity_defect")).toBe(true);
    expect(types([defect({ severity: "high" })]).has("high_severity_defect")).toBe(true);
    expect(types([defect({ severity: "medium" })]).has("high_severity_defect")).toBe(false);
  });

  it("flags safety-critical keywords", () => {
    expect(types([defect({ title: "Brakes grinding" })]).has("safety_keyword")).toBe(true);
    expect(types([defect({ description: "air leak near tank" })]).has("safety_keyword")).toBe(true);
    expect(types([defect({ title: "Radio not working" })]).has("safety_keyword")).toBe(false);
  });

  it("flags an issue open for more than 7 days", () => {
    expect(types([defect({ createdAt: daysAgo(10) })]).has("overdue_open_issue")).toBe(true);
    expect(types([defect({ createdAt: daysAgo(3) })]).has("overdue_open_issue")).toBe(false);
  });

  it("flags recurrence within 30 days of a resolution", () => {
    const defects = [
      defect({ title: "Coolant leak", status: "resolved", resolvedAt: daysAgo(10), createdAt: daysAgo(40) }),
      defect({ title: "Coolant leak", status: "open", createdAt: daysAgo(2) }),
    ];
    expect(types(defects).has("recurring_after_repair")).toBe(true);
  });

  it("does not flag recurrence if the return is beyond 30 days", () => {
    const defects = [
      defect({ title: "Coolant leak", status: "resolved", resolvedAt: daysAgo(60), createdAt: daysAgo(90) }),
      defect({ title: "Coolant leak", status: "open", createdAt: daysAgo(2) }),
    ];
    const result = computeDesiredWarnings(defects, NOW);
    expect(result.find((w) => w.warningType === "recurring_after_repair")).toBeUndefined();
  });

  it("produces no warnings for a single recent low-severity open issue", () => {
    expect(computeDesiredWarnings([defect({ severity: "low" })], NOW)).toHaveLength(0);
  });

  it("clears warnings when issues are closed (resolved issues are not open)", () => {
    const defects = [
      defect({ status: "resolved" }),
      defect({ status: "resolved" }),
      defect({ status: "dismissed" }),
    ];
    expect(types(defects).has("multiple_open_issues")).toBe(false);
  });
});
