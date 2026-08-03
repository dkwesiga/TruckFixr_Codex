import { describe, it, expect } from "vitest";
import {
  canInitializeProviders,
  resolveAnalyticsMode,
  type GateInputs,
} from "./gate";

const base: GateInputs = {
  isProduction: true,
  isPublicRoute: true,
  isInternal: false,
  isOptedOut: false,
  respectSignal: false,
  isDebug: false,
};

describe("analytics gate (cookieless, banner-free)", () => {
  it("sends in production on a public route with no opt-out/signal", () => {
    expect(resolveAnalyticsMode(base)).toBe("send");
    expect(canInitializeProviders(base)).toBe(true);
  });

  it("drops on non-public (authenticated) routes", () => {
    expect(resolveAnalyticsMode({ ...base, isPublicRoute: false })).toBe(
      "drop"
    );
    expect(canInitializeProviders({ ...base, isPublicRoute: false })).toBe(
      false
    );
  });

  it("drops for internal (staff) traffic", () => {
    expect(resolveAnalyticsMode({ ...base, isInternal: true })).toBe("drop");
    expect(canInitializeProviders({ ...base, isInternal: true })).toBe(false);
  });

  it("drops when the visitor has opted out", () => {
    expect(resolveAnalyticsMode({ ...base, isOptedOut: true })).toBe("drop");
    expect(canInitializeProviders({ ...base, isOptedOut: true })).toBe(false);
  });

  it("drops when GPC/DNT asks us not to track", () => {
    expect(resolveAnalyticsMode({ ...base, respectSignal: true })).toBe("drop");
    expect(canInitializeProviders({ ...base, respectSignal: true })).toBe(
      false
    );
  });

  it("drops in non-production without debug (dev/preview/staging)", () => {
    expect(resolveAnalyticsMode({ ...base, isProduction: false })).toBe("drop");
    expect(canInitializeProviders({ ...base, isProduction: false })).toBe(
      false
    );
  });

  it("debug-logs (never sends, never inits) in non-prod debug mode", () => {
    const dbg = { ...base, isProduction: false, isDebug: true };
    expect(resolveAnalyticsMode(dbg)).toBe("debug");
    expect(canInitializeProviders(dbg)).toBe(false);
  });

  it("opt-out / signal / non-public win over debug", () => {
    expect(
      resolveAnalyticsMode({ ...base, isDebug: true, isOptedOut: true })
    ).toBe("drop");
    expect(
      resolveAnalyticsMode({ ...base, isDebug: true, respectSignal: true })
    ).toBe("drop");
    expect(
      resolveAnalyticsMode({ ...base, isDebug: true, isPublicRoute: false })
    ).toBe("drop");
  });
});
