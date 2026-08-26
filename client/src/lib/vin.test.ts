import { describe, expect, it } from "vitest";
import {
  computeVinCheckDigit,
  isValidVinCheckDigit,
  normalizeVinInput,
  validateVinFormat,
} from "./vin";

// A widely used check-digit-valid North American VIN (manually verified against 49 CFR 565 below).
const VALID_VIN = "1M8GDM9AXKP042788";

describe("normalizeVinInput", () => {
  it("uppercases, strips punctuation, and corrects O/Q/I", () => {
    expect(normalizeVinInput("1m8gdm9a-xkp 042788")).toBe("1M8GDM9AXKP042788");
    expect(normalizeVinInput("1O8IDM9AQKP042788")).toBe("1081DM9A0KP042788");
  });
});

describe("computeVinCheckDigit / isValidVinCheckDigit", () => {
  it("computes the correct check digit for a known-valid VIN", () => {
    expect(computeVinCheckDigit(VALID_VIN)).toBe("X");
    expect(isValidVinCheckDigit(VALID_VIN)).toBe(true);
  });

  it("detects a corrupted check digit", () => {
    const corrupted = "1M8GDM9A0KP042788"; // check digit changed from X to 0
    expect(isValidVinCheckDigit(corrupted)).toBe(false);
  });

  it("detects a single transposed character elsewhere in the VIN", () => {
    const transposed = "1M8GDM9AXKP042878"; // last two digits swapped
    expect(isValidVinCheckDigit(transposed)).toBe(false);
  });

  it("returns null for the wrong length", () => {
    expect(computeVinCheckDigit("SHORTVIN")).toBeNull();
  });
});

describe("validateVinFormat", () => {
  it("accepts a valid VIN", () => {
    expect(validateVinFormat(VALID_VIN)).toEqual({ ok: true });
  });

  it("rejects the wrong length", () => {
    const result = validateVinFormat("1M8GDM9AXKP04278");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("VIN_INVALID_LENGTH");
  });

  it("rejects I/O/Q characters", () => {
    const result = validateVinFormat("1M8GDM9AXKP04278I");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("VIN_INVALID_CHARACTERS");
  });

  it("rejects a bad check digit", () => {
    const result = validateVinFormat("1M8GDM9A0KP042788");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("VIN_CHECK_DIGIT_FAILED");
  });
});
