import { describe, expect, it } from "vitest";
import { normalizePartNumber, partNumbersMatch } from "./partNumberNormalization";

describe("normalizePartNumber", () => {
  it("uppercases and strips spaces/hyphens/dots", () => {
    expect(normalizePartNumber(" re-12345.a ")).toBe("RE12345A");
  });

  it("returns null for empty/missing input rather than an empty string", () => {
    expect(normalizePartNumber("")).toBeNull();
    expect(normalizePartNumber("   ")).toBeNull();
    expect(normalizePartNumber(null)).toBeNull();
    expect(normalizePartNumber(undefined)).toBeNull();
  });
});

describe("partNumbersMatch", () => {
  it("matches equivalent representations of the same number", () => {
    expect(partNumbersMatch("RE-12345", "re12345")).toBe(true);
  });

  it("does not match when either side is missing", () => {
    expect(partNumbersMatch(null, "RE12345")).toBe(false);
    expect(partNumbersMatch("RE12345", undefined)).toBe(false);
  });

  it("does not match genuinely different numbers", () => {
    expect(partNumbersMatch("RE12345", "RE12346")).toBe(false);
  });
});
