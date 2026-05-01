import { describe, expect, it } from "vitest";
import { validateTruckFixrPassword } from "../shared/passwordPolicy";

describe("validateTruckFixrPassword", () => {
  it("rejects passwords shorter than 8 characters", () => {
    expect(validateTruckFixrPassword({ password: "Aa1!" }).checks.minLength).toBe(false);
  });

  it("rejects passwords missing uppercase, lowercase, number, or special character", () => {
    expect(validateTruckFixrPassword({ password: "lowercase1!" }).checks.uppercase).toBe(false);
    expect(validateTruckFixrPassword({ password: "UPPERCASE1!" }).checks.lowercase).toBe(false);
    expect(validateTruckFixrPassword({ password: "NoNumbers!" }).checks.number).toBe(false);
    expect(validateTruckFixrPassword({ password: "NoSpecial1" }).checks.special).toBe(false);
  });

  it("rejects confirm password mismatch", () => {
    expect(
      validateTruckFixrPassword({
        password: "ValidPass1!",
        confirmPassword: "Different1!",
      }).checks.passwordsMatch
    ).toBe(false);
  });

  it("rejects common and brand-related passwords", () => {
    expect(validateTruckFixrPassword({ password: "Password123!" }).checks.notCommon).toBe(false);
    expect(validateTruckFixrPassword({ password: "Truckfixr123!" }).checks.notCommon).toBe(false);
    expect(validateTruckFixrPassword({ password: "MrDiesel123!" }).checks.notCommon).toBe(false);
  });

  it("rejects email-derived passwords", () => {
    expect(
      validateTruckFixrPassword({
        password: "Dkwesiga123!",
        email: "dkwesiga@example.com",
      }).checks.notProfileDerived
    ).toBe(false);
  });

  it("accepts a valid non-obvious password", () => {
    const result = validateTruckFixrPassword({
      password: "FleetSafe84!",
      confirmPassword: "FleetSafe84!",
      email: "driver@example.com",
      firstName: "Dixon",
      companyName: "TruckFixr",
    });

    expect(result.isValid).toBe(true);
  });
});
