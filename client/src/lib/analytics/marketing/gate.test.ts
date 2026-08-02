import { describe, it, expect } from "vitest";
import {
  canInitializeProviders,
  resolveAnalyticsMode,
  type GateInputs,
} from "./gate";

const base: GateInputs = {
  hasConsent: true,
  isProduction: true,
  isPublicRoute: true,
  isInternal: false,
  isDebug: false,
};

describe("analytics gate", () => {
  it("sends only when consented, production, public route, non-internal", () => {
    expect(resolveAnalyticsMode(base)).toBe("send");
    expect(canInitializeProviders(base)).toBe(true);
  });

  it("drops without consent (nothing runs before consent)", () => {
    expect(resolveAnalyticsMode({ ...base, hasConsent: false })).toBe("drop");
    expect(canInitializeProviders({ ...base, hasConsent: false })).toBe(false);
  });

  it("drops on non-public (authenticated) routes", () => {
    expect(resolveAnalyticsMode({ ...base, isPublicRoute: false })).toBe(
      "drop"
    );
    expect(canInitializeProviders({ ...base, isPublicRoute: false })).toBe(
      false
    );
  });

  it("drops for internal traffic even if everything else is satisfied", () => {
    expect(resolveAnalyticsMode({ ...base, isInternal: true })).toBe("drop");
    expect(canInitializeProviders({ ...base, isInternal: true })).toBe(false);
  });

  it("drops in non-production without debug (dev/preview/staging)", () => {
    expect(resolveAnalyticsMode({ ...base, isProduction: false })).toBe("drop");
    expect(canInitializeProviders({ ...base, isProduction: false })).toBe(
      false
    );
  });

  it("debug-logs (never sends, never inits providers) in non-prod debug mode", () => {
    const dbg = { ...base, isProduction: false, isDebug: true };
    expect(resolveAnalyticsMode(dbg)).toBe("debug");
    expect(canInitializeProviders(dbg)).toBe(false);
  });

  it("internal opt-out and non-public win over debug", () => {
    expect(
      resolveAnalyticsMode({ ...base, isDebug: true, isInternal: true })
    ).toBe("drop");
    expect(
      resolveAnalyticsMode({ ...base, isDebug: true, isPublicRoute: false })
    ).toBe("drop");
  });
});
