import { describe, it, expect } from "vitest";
import {
  isDebugMode,
  isProductionEnvironment,
  parseAnalyticsConfig,
} from "./config";

describe("analytics config", () => {
  it("accepts a valid GA4 id and Clarity id", () => {
    const c = parseAnalyticsConfig({
      ga4Id: "G-ABC123XYZ",
      clarityId: "abcd1234",
      isProdBuild: true,
    });
    expect(c.ga4Id).toBe("G-ABC123XYZ");
    expect(c.clarityId).toBe("abcd1234");
    expect(c.warnings).toHaveLength(0);
  });

  it("disables providers with malformed ids and records a diagnostic warning", () => {
    const c = parseAnalyticsConfig({
      ga4Id: "UA-123",
      clarityId: "!!",
      isProdBuild: true,
    });
    expect(c.ga4Id).toBeNull();
    expect(c.clarityId).toBeNull();
    expect(c.warnings.length).toBe(2);
  });

  it("treats absent ids as disabled (no warning)", () => {
    const c = parseAnalyticsConfig({ isProdBuild: true });
    expect(c.ga4Id).toBeNull();
    expect(c.clarityId).toBeNull();
    expect(c.warnings).toHaveLength(0);
  });

  it("runs analytics only on a production build served from a production host", () => {
    const prod = parseAnalyticsConfig({
      ga4Id: "G-ABC123XYZ",
      isProdBuild: true,
    });
    expect(isProductionEnvironment(prod, "truckfixr.com")).toBe(true);
    expect(isProductionEnvironment(prod, "www.truckfixr.com")).toBe(true);
    // preview/staging host, or non-prod build → excluded
    expect(isProductionEnvironment(prod, "staging.truckfixr.com")).toBe(false);
    expect(isProductionEnvironment(prod, "truckfixr.onrender.com")).toBe(false);

    const dev = parseAnalyticsConfig({
      ga4Id: "G-ABC123XYZ",
      isProdBuild: false,
    });
    expect(isProductionEnvironment(dev, "truckfixr.com")).toBe(false);
  });

  it("forceEnable overrides environment for local testing", () => {
    const forced = parseAnalyticsConfig({
      ga4Id: "G-ABC123XYZ",
      isProdBuild: false,
      forceEnable: "true",
    });
    expect(isProductionEnvironment(forced, "localhost")).toBe(true);
  });

  it("debug mode is only active in non-production when requested", () => {
    const dbg = parseAnalyticsConfig({ debug: "true", isProdBuild: false });
    expect(isDebugMode(dbg, "localhost")).toBe(true);
    const prodDbg = parseAnalyticsConfig({ debug: "true", isProdBuild: true });
    expect(isDebugMode(prodDbg, "truckfixr.com")).toBe(false);
  });
});
