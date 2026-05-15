import { describe, expect, it } from "vitest";
import {
  getInspectionOdometerRevisionMessage,
  validateInspectionOdometer,
} from "../../shared/inspectionOdometer";

describe("inspection odometer validation", () => {
  it("allows trailer inspections without odometer input", () => {
    expect(
      validateInspectionOdometer({
        isTrailer: true,
        enteredOdometer: null,
        currentMileage: 245320,
      })
    ).toEqual({ normalizedOdometer: null });
  });

  it("returns the entered odometer for powered vehicles when it moves mileage forward", () => {
    expect(
      validateInspectionOdometer({
        isTrailer: false,
        enteredOdometer: 245500,
        currentMileage: 245320,
      })
    ).toEqual({ normalizedOdometer: 245500 });
  });

  it("explains why the driver must revise a lower odometer reading", () => {
    expect(() =>
      validateInspectionOdometer({
        isTrailer: false,
        enteredOdometer: 245000,
        currentMileage: 245320,
      })
    ).toThrow(
      getInspectionOdometerRevisionMessage({
        enteredOdometer: 245000,
        currentMileage: 245320,
      })
    );
  });
});
