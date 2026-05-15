import { describe, expect, it } from "vitest";
import {
  STARTER_FAULT_CODE_SEED_VERSION,
  flattenStarterFaultCodeReferenceSeed,
} from "./faultCodeReferenceSeed";

describe("starter fault-code reference seed", () => {
  it("covers the intended high-value diagnosis categories", () => {
    const entries = flattenStarterFaultCodeReferenceSeed();
    const categories = Array.from(new Set(entries.map((entry) => entry.category))).sort();

    expect(categories).toEqual([
      "aftertreatment/emissions",
      "brake/air pressure",
      "coolant/overheating",
      "derate/shutdown",
      "oil pressure",
    ]);
    expect(entries.length).toBeGreaterThanOrEqual(8);
    expect(STARTER_FAULT_CODE_SEED_VERSION).toBe("2026-05-10");
  });

  it("uses stable normalized codes without duplicates", () => {
    const entries = flattenStarterFaultCodeReferenceSeed();
    const compoundKeys = entries.map(
      (entry) => `${entry.codeSystem}:${entry.normalizedCode}:${entry.sourceKey}`
    );

    expect(new Set(compoundKeys).size).toBe(compoundKeys.length);
    expect(entries.every((entry) => entry.normalizedCode.length > 0)).toBe(true);
  });
});
