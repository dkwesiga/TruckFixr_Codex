import { describe, expect, it } from "vitest";

import {
  calculateFleetMrr,
  canViewAdminPii,
  getInternalAdminRole,
  redactEmailAddress,
  redactVin,
  toCsv,
} from "./adminMetrics";

function fleet(overrides: Record<string, unknown>) {
  return {
    accountType: "production",
    billingStatus: "active",
    billingInterval: "monthly",
    planName: "small_fleet",
    paidExtraTrailerQuantity: 0,
    ...overrides,
  } as any;
}

describe("admin metrics helpers", () => {
  it("normalizes monthly and annual fleet subscription revenue into MRR", () => {
    expect(calculateFleetMrr(fleet({ planName: "small_fleet", billingInterval: "monthly" }))).toBe(49);
    expect(calculateFleetMrr(fleet({ planName: "small_fleet", billingInterval: "annual" }))).toBe(40.83);
  });

  it("adds recurring trailer add-ons and excludes inactive accounts from active MRR", () => {
    expect(
      calculateFleetMrr(
        fleet({
          planName: "fleet_growth",
          billingInterval: "monthly",
          paidExtraTrailerQuantity: 3,
        })
      )
    ).toBe(114);
    expect(calculateFleetMrr(fleet({ accountType: "archived" }))).toBe(0);
    expect(calculateFleetMrr(fleet({ billingStatus: "canceled" }))).toBe(0);
  });

  it("respects explicit internal admin roles", () => {
    expect(getInternalAdminRole({ id: 1, email: "viewer@example.com", internalAdminRole: "read_only_viewer" })).toBe(
      "read_only_viewer"
    );
    expect(getInternalAdminRole({ id: 2, email: "admin@example.com", internalAdminRole: "admin" })).toBe("admin");
    expect(getInternalAdminRole({ id: 3, email: "super@example.com", internalAdminRole: "super_admin" })).toBe(
      "super_admin"
    );
  });

  it("limits PII access for read-only viewers", () => {
    expect(canViewAdminPii("super_admin")).toBe(true);
    expect(canViewAdminPii("admin")).toBe(true);
    expect(canViewAdminPii("read_only_viewer")).toBe(false);
    expect(redactEmailAddress("ops@truckfixr.com")).toBe("op*@truckfixr.com");
    expect(redactVin("1HGBH41JXMN109186")).toBe("1HG***9186");
  });

  it("escapes CSV exports for commas, quotes, dates, and nulls", () => {
    const csv = toCsv([
      {
        Fleet: 'Acme "North", Inc.',
        Count: 4,
        Renewal: new Date("2026-05-22T12:34:00.000Z"),
        Notes: null,
      },
    ]);

    expect(csv).toContain("Fleet,Count,Renewal,Notes");
    expect(csv).toContain('"Acme ""North"", Inc.",4,2026-05-22T12:34:00.000Z,');
  });
});
