import { describe, it, expect } from "vitest";
import {
  getSampleComplianceForVehicle,
  recommendBundlingLabel,
  type DefectLike,
  type SampleCompliance,
} from "./maintenancePlanningSampleData";

const currentCompliance: SampleCompliance = {
  isSample: true,
  dailyInspection: "complete",
  annualInspectionDate: "in 240 days",
  annualDaysRemaining: 240,
  semiAnnualInspectionDate: "in 58 days",
  semiAnnualDaysRemaining: 58,
  state: "current",
};

const dueSoonCompliance: SampleCompliance = {
  ...currentCompliance,
  state: "due_soon",
};

const overdueCompliance: SampleCompliance = {
  ...currentCompliance,
  state: "overdue",
};

describe("getSampleComplianceForVehicle", () => {
  it("is always flagged as sample data", () => {
    expect(getSampleComplianceForVehicle("veh-1", 0).isSample).toBe(true);
  });

  it("is deterministic for a given index", () => {
    const a = getSampleComplianceForVehicle("veh-1", 2);
    const b = getSampleComplianceForVehicle("veh-1", 2);
    expect(a).toEqual(b);
  });
});

describe("recommendBundlingLabel", () => {
  it("returns Do Not Operate when a blocking defect is open", () => {
    const defects: DefectLike[] = [
      { severity: "critical", status: "open", isBlockingOperationally: true },
    ];
    expect(recommendBundlingLabel(defects, currentCompliance).label).toBe(
      "Do Not Operate"
    );
  });

  it("returns Do Not Operate when sample compliance is overdue", () => {
    expect(recommendBundlingLabel([], overdueCompliance).label).toBe(
      "Do Not Operate"
    );
  });

  it("bundles open issues when an inspection is due soon", () => {
    const defects: DefectLike[] = [{ severity: "low", status: "open" }];
    expect(recommendBundlingLabel(defects, dueSoonCompliance).label).toBe(
      "Bundle With Next Service"
    );
  });

  it("recommends Fix Now for a high-severity issue when not due soon", () => {
    const defects: DefectLike[] = [{ severity: "high", status: "open" }];
    expect(recommendBundlingLabel(defects, currentCompliance).label).toBe(
      "Fix Now"
    );
  });

  it("recommends Monitor for low-severity open issues", () => {
    const defects: DefectLike[] = [{ severity: "low", status: "open" }];
    expect(recommendBundlingLabel(defects, currentCompliance).label).toBe(
      "Monitor"
    );
  });

  it("ignores resolved/dismissed defects", () => {
    const defects: DefectLike[] = [
      { severity: "critical", status: "resolved", isBlockingOperationally: true },
      { severity: "high", status: "dismissed" },
    ];
    expect(recommendBundlingLabel(defects, currentCompliance).label).toBe(
      "Monitor"
    );
  });
});
