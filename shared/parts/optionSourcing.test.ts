import { describe, expect, it } from "vitest";
import { manualEntrySource, mockPartOptionSource } from "./optionSourcing";

describe("manualEntrySource", () => {
  it("returns exactly what was given, without adding or inventing fields", async () => {
    const source = manualEntrySource([
      { supplierName: "ABC Truck Parts", priceCents: 5000, currency: "CAD" },
    ]);
    const result = await source.sourcePartOptions({ partRequirementId: 1 });
    expect(result).toEqual([{ supplierName: "ABC Truck Parts", priceCents: 5000, currency: "CAD" }]);
    expect(source.name).toBe("manual_entry");
  });
});

describe("mockPartOptionSource", () => {
  it("returns its fixed options regardless of the requested context (deterministic for tests)", async () => {
    const fixed = [{ supplierName: "Mock Supplier", priceCents: 1234, currency: "CAD" }];
    const source = mockPartOptionSource(fixed);
    const resultA = await source.sourcePartOptions({ partRequirementId: 1 });
    const resultB = await source.sourcePartOptions({ partRequirementId: 999, vehicleId: "veh-1" });
    expect(resultA).toEqual(fixed);
    expect(resultB).toEqual(fixed);
    expect(source.name).toBe("mock");
  });
});
