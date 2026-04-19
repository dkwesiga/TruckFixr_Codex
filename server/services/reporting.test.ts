import { describe, expect, it } from "vitest";
import {
  getDiagnosticComplianceStatus,
  getInspectionComplianceStatus,
  mergeComplianceStatus,
} from "../../shared/compliance";
import { buildInspectionReport } from "./reporting";

describe("compliance helpers", () => {
  it("marks inspections with major defects as red", () => {
    expect(
      getInspectionComplianceStatus({
        majorDefectCount: 1,
        minorDefectCount: 0,
      })
    ).toBe("red");
  });

  it("maps diagnostic urgency into the same compliance scale", () => {
    expect(getDiagnosticComplianceStatus("Attention")).toBe("yellow");
    expect(getDiagnosticComplianceStatus("Critical")).toBe("red");
    expect(getDiagnosticComplianceStatus("Monitor")).toBe("green");
  });

  it("keeps the highest compliance severity when merging", () => {
    expect(mergeComplianceStatus("green", "yellow", "red")).toBe("red");
  });
});

describe("buildInspectionReport", () => {
  it("builds a pdf payload and summary for storage/email", () => {
    const report = buildInspectionReport({
      inspectionId: 101,
      submittedAt: new Date("2026-04-11T12:00:00.000Z"),
      validUntil: new Date("2026-04-12T12:00:00.000Z"),
      complianceStatus: "yellow",
      vehicle: {
        id: 42,
        vin: "1XPWD49X91D487964",
        licensePlate: "ABC-1234",
        make: "Peterbilt",
        model: "579",
        year: 2022,
      },
      inspector: {
        printedName: "Jordan Driver",
        signature: "Jordan Driver",
        signatureMode: "typed",
        email: "driver@example.com",
      },
      location: "Toronto Yard",
      odometer: 245320,
      checklist: [
        {
          label: "Service brakes respond evenly and hold pressure",
          category: "brakes",
          status: "pass",
        },
        {
          label: "Steering has normal free play and no binding",
          category: "steering",
          status: "fail",
          classification: "minor",
          comment: "Too much free play before the wheel responds.",
        },
      ],
      majorDefectCount: 0,
      minorDefectCount: 1,
      canOperate: true,
    });

    expect(report.fileName).toBe("inspection-101.pdf");
    expect(report.summary.complianceStatus).toBe("yellow");
    expect(report.failedItems).toHaveLength(1);
    expect(report.pdfBase64.length).toBeGreaterThan(50);
  });
});
