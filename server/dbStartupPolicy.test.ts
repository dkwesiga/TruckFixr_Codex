import { describe, expect, it } from "vitest";
import { shouldRunRuntimeSchemaRepair } from "./db";

describe("database startup policy", () => {
  it("allows runtime schema repair outside production for local development", () => {
    expect(
      shouldRunRuntimeSchemaRepair({
        isProduction: false,
        allowRuntimeSchemaRepair: false,
      })
    ).toBe(true);
  });

  it("blocks runtime schema repair in production by default", () => {
    expect(
      shouldRunRuntimeSchemaRepair({
        isProduction: true,
        allowRuntimeSchemaRepair: false,
      })
    ).toBe(false);
  });

  it("allows an explicit production emergency override", () => {
    expect(
      shouldRunRuntimeSchemaRepair({
        isProduction: true,
        allowRuntimeSchemaRepair: true,
      })
    ).toBe(true);
  });
});
