import { describe, expect, it } from "vitest";

import { isInviteValid, parseInviteCodes } from "./guestInvite";

describe("parseInviteCodes", () => {
  it("splits, trims, lowercases, and drops empties", () => {
    expect(parseInviteCodes("Alpha, beta ,, GAMMA")).toEqual(["alpha", "beta", "gamma"]);
    expect(parseInviteCodes("")).toEqual([]);
    expect(parseInviteCodes(null)).toEqual([]);
    expect(parseInviteCodes(undefined)).toEqual([]);
  });
});

describe("isInviteValid — fail-closed", () => {
  const configured = parseInviteCodes("MrDiesel-2026, TruckFixr-Pilot");

  it("accepts a configured code case-insensitively", () => {
    expect(isInviteValid("mrdiesel-2026", configured)).toBe(true);
    expect(isInviteValid("  TruckFixr-Pilot ", configured)).toBe(true);
  });

  it("rejects an unknown or missing code", () => {
    expect(isInviteValid("nope", configured)).toBe(false);
    expect(isInviteValid("", configured)).toBe(false);
    expect(isInviteValid(null, configured)).toBe(false);
  });

  it("rejects EVERYTHING when no codes are configured (fail-closed)", () => {
    expect(isInviteValid("anything", [])).toBe(false);
    expect(isInviteValid("", [])).toBe(false);
  });
});
