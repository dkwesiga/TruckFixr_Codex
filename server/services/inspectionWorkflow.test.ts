import { describe, expect, it } from "vitest";
import { buildDailyInspectionChecklist, getVehicleInspectionConfig } from "../../shared/inspection";
import {
  createInspectionReportDelivery,
  prepareInspectionSubmission,
} from "./inspectionWorkflow";

const baseUser = {
  id: 7,
  name: "Driver Example",
  email: "driver@example.com",
};

const baseVehicle = {
  id: 42,
  vin: "1XPWD49X91D487964",
  licensePlate: "ABC-1234",
  make: "Peterbilt",
  model: "579",
  year: 2022,
};

function createPreparedSubmission(overrides?: {
  major?: boolean;
  minor?: boolean;
}) {
  const configuration = getVehicleInspectionConfig(42);
  const checklist = buildDailyInspectionChecklist(configuration);
  const results = checklist.map((item, index) => {
    if (index === 0 && (overrides?.major || overrides?.minor)) {
      return {
        itemId: item.id,
        status: "fail" as const,
        classification: overrides.major ? ("major" as const) : ("minor" as const),
        comment: overrides.major ? "Brake pressure drops" : "Small tire wear noted",
        photoUrls: [],
      };
    }

    return { itemId: item.id, status: "pass" as const };
  });

  return prepareInspectionSubmission({
    input: {
      vehicleId: 42,
      fleetId: 1,
      odometer: 245320,
      location: "Toronto yard",
      attested: true,
      driverPrintedName: "Driver Example",
      driverSignature: "Driver Example",
      driverSignatureMode: "typed",
      results,
    },
    user: baseUser,
    vehicle: baseVehicle,
    configuration,
  });
}

describe("inspection workflow", () => {
  it("marks minor defects yellow and major defects red for compliance", () => {
    const minor = createPreparedSubmission({ minor: true });
    const major = createPreparedSubmission({ major: true });
    const clear = createPreparedSubmission();

    expect(clear.complianceStatus).toBe("green");
    expect(minor.complianceStatus).toBe("yellow");
    expect(major.complianceStatus).toBe("red");
    expect(major.canOperate).toBe(false);
  });

  it("keeps the structured inspection record even when PDF generation fails", async () => {
    const prepared = createPreparedSubmission({ major: true });

    const result = await createInspectionReportDelivery({
      prepared,
      inspectionId: 88,
      recipients: ["manager@example.com"],
      vehicle: baseVehicle,
      input: {
        vehicleId: 42,
        fleetId: 1,
        odometer: 245320,
        location: "Toronto yard",
        attested: true,
        driverPrintedName: "Driver Example",
        driverSignature: "Driver Example",
        driverSignatureMode: "typed",
        results: prepared.baseInspectionResults.checklist.map((item) =>
          item.status === "pass"
            ? { itemId: item.itemId, status: "pass" as const }
            : {
                itemId: item.itemId,
                status: "fail" as const,
                classification: item.classification!,
                comment: item.comment!,
                photoUrls: item.photoUrls ?? [],
              }
        ),
      },
      userEmail: baseUser.email,
      reportBuilder: () => {
        throw new Error("pdf engine offline");
      },
    });

    expect(result.reportGenerated).toBe(false);
    expect(result.reportWarning).toContain("PDF generation failed");
    expect(result.storedInspectionResults.summary.complianceStatus).toBe("red");
    expect(result.storedInspectionResults.report.failedItems).toHaveLength(1);
  });

  it("falls back cleanly when email delivery fails after report generation", async () => {
    const prepared = createPreparedSubmission();

    const result = await createInspectionReportDelivery({
      prepared,
      inspectionId: 89,
      recipients: ["manager@example.com", "driver@example.com"],
      vehicle: baseVehicle,
      input: {
        vehicleId: 42,
        fleetId: 1,
        odometer: 245320,
        location: "Toronto yard",
        attested: true,
        driverPrintedName: "Driver Example",
        driverSignature: "Driver Example",
        driverSignatureMode: "typed",
        results: prepared.baseInspectionResults.checklist.map((item) => ({
          itemId: item.itemId,
          status: "pass" as const,
        })),
      },
      userEmail: baseUser.email,
      emailSender: async () => {
        throw new Error("email provider unavailable");
      },
    });

    expect(result.reportGenerated).toBe(true);
    expect(result.emailDelivery.delivered).toBe(false);
    expect(result.emailDelivery.reason).toContain("email provider unavailable");
    expect(result.storedInspectionResults.report.pdfBase64).toBeTruthy();
  });

  it("sends the completed inspection report to both driver and manager email recipients", async () => {
    const prepared = createPreparedSubmission();
    let deliveredTo: string[] = [];

    const result = await createInspectionReportDelivery({
      prepared,
      inspectionId: 90,
      recipients: ["manager@example.com", "driver@example.com"],
      vehicle: baseVehicle,
      input: {
        vehicleId: 42,
        fleetId: 1,
        odometer: 245320,
        location: "Toronto yard",
        attested: true,
        driverPrintedName: "Driver Example",
        driverSignature: "Driver Example",
        driverSignatureMode: "typed",
        results: prepared.baseInspectionResults.checklist.map((item) => ({
          itemId: item.itemId,
          status: "pass" as const,
        })),
      },
      userEmail: baseUser.email,
      emailSender: async (payload) => {
        deliveredTo = payload.to;
        return { delivered: true, skipped: false as const };
      },
    });

    expect(result.reportGenerated).toBe(true);
    expect(result.emailDelivery.delivered).toBe(true);
    expect(deliveredTo).toEqual(
      expect.arrayContaining(["driver@example.com", "manager@example.com"])
    );
    expect(result.storedInspectionResults.report.recipients).toEqual(
      expect.arrayContaining(["driver@example.com", "manager@example.com"])
    );
  });
});
