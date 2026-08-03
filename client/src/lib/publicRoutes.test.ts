import { describe, it, expect } from "vitest";
import { isPublicMarketingRoute, normalizePath } from "./publicRoutes";

describe("publicRoutes — analytics/consent boundary", () => {
  it("treats public marketing pages as public", () => {
    for (const p of [
      "/",
      "/landing-v3",
      "/fleet-review",
      "/pricing",
      "/privacy",
      "/terms",
      "/resources",
      "/resources/ontario-daily-inspection-guide",
      "/fleet-downtime-cost-calculator",
      "/try-one-case",
    ]) {
      expect(isPublicMarketingRoute(p), p).toBe(true);
    }
  });

  it("EXCLUDES every authenticated / app / admin / auth route (deny-by-default)", () => {
    for (const p of [
      "/app",
      "/app/fleet-health",
      "/app/case/123",
      "/manager",
      "/driver",
      "/diagnosis",
      "/inspection",
      "/inspection-report/42",
      "/defect/42",
      "/truck/7",
      "/onboarding",
      "/onboarding/driver",
      "/profile",
      "/dashboard",
      "/login",
      "/signup",
      "/auth/email",
      "/access",
      "/access/pilot-code",
      "/admin",
      "/admin/metrics",
      "/partner/knowledge",
      "/some-unknown-route",
    ]) {
      expect(isPublicMarketingRoute(p), p).toBe(false);
    }
  });

  it("ignores query strings and hashes when matching", () => {
    expect(isPublicMarketingRoute("/pricing?utm_source=linkedin")).toBe(true);
    expect(isPublicMarketingRoute("/fleet-review#book")).toBe(true);
    expect(isPublicMarketingRoute("/manager?tab=open")).toBe(false);
  });

  it("normalizes trailing slashes and full URLs", () => {
    expect(normalizePath("/pricing/")).toBe("/pricing");
    expect(normalizePath("https://truckfixr.com/resources?x=1#y")).toBe(
      "/resources"
    );
    expect(normalizePath("/")).toBe("/");
    expect(isPublicMarketingRoute("/pricing/")).toBe(true);
  });

  it("does not let a prefix leak (e.g. /resources-internal is not public via /resources/)", () => {
    expect(isPublicMarketingRoute("/resources-internal")).toBe(false);
  });
});
