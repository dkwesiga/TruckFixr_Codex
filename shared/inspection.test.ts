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
});
