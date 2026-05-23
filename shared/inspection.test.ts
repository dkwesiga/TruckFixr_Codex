import { describe, expect, it } from "vitest";
import {
  buildChecklistByCategory,
  dailyInspectionSubmissionSchema,
  getVehicleInspectionConfig,
} from "./inspection";

describe("inspection rules", () => {
  it("omits coupling when the vehicle has no coupling system", () => {
    const config = getVehicleInspectionConfig(999, {
      couplingSystem: false,
      trailerAttached: false,
    });

    const categories = buildChecklistByCategory(config);

    expect(categories.some((category) => category.category === "coupling")).toBe(false);
  });

  it("requires classification, comment, and photo for failed items", () => {
    expect(() =>
      dailyInspectionSubmissionSchema.parse({
        vehicleId: 42,
        fleetId: 1,
        odometer: 245320,
        location: "Toronto yard",
        attested: true,
        results: [{ itemId: "brakes-service-response", status: "fail" }],
      })
    ).toThrow();
  });

  it("accepts combined inspection linkage metadata on daily submissions", () => {
    const parsed = dailyInspectionSubmissionSchema.parse({
      vehicleId: 42,
      fleetId: 1,
      inspectionSessionId: "driver-session-test-42",
      linkedVehicleId: "TR-9",
      combinedStage: "truck",
      odometer: 245320,
      location: "Toronto yard",
      attested: true,
      driverPrintedName: "Driver Example",
      driverSignature: "Driver Example",
      driverSignatureMode: "typed",
      results: [{ itemId: "brakes-service-response", status: "pass" }],
    });

    expect(parsed.linkedVehicleId).toBe("TR-9");
    expect(parsed.combinedStage).toBe("truck");
  });
});
