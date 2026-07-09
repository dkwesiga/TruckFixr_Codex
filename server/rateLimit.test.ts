import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  enforceIpRateLimit,
  getClientIp,
  resetRateLimitsForTests,
} from "./_core/rateLimit";

function reqWithIp(ip: string) {
  return { ip, headers: {}, socket: { remoteAddress: ip } };
}

describe("getClientIp", () => {
  it("prefers req.ip, then X-Forwarded-For, then socket, then unknown", () => {
    expect(getClientIp(reqWithIp("1.1.1.1"))).toBe("1.1.1.1");
    expect(
      getClientIp({ headers: { "x-forwarded-for": "2.2.2.2, 3.3.3.3" }, socket: {} })
    ).toBe("2.2.2.2");
    expect(getClientIp({ headers: {}, socket: { remoteAddress: "4.4.4.4" } })).toBe("4.4.4.4");
    expect(getClientIp({ headers: {} })).toBe("unknown");
    expect(getClientIp(null)).toBe("unknown");
  });
});

describe("enforceIpRateLimit", () => {
  beforeEach(() => resetRateLimitsForTests());
  afterEach(() => vi.useRealTimers());

  const opts = (ip: string, bucket = "test") => ({
    req: reqWithIp(ip),
    bucket,
    limit: 3,
    windowMs: 60_000,
  });

  it("allows requests up to the limit, then blocks", () => {
    for (let i = 0; i < 3; i += 1) {
      expect(() => enforceIpRateLimit(opts("10.0.0.1"))).not.toThrow();
    }
    expect(() => enforceIpRateLimit(opts("10.0.0.1"))).toThrowError(TRPCError);
    try {
      enforceIpRateLimit(opts("10.0.0.1"));
    } catch (error) {
      expect((error as TRPCError).code).toBe("TOO_MANY_REQUESTS");
    }
  });

  it("resets after the window elapses", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    for (let i = 0; i < 3; i += 1) enforceIpRateLimit(opts("10.0.0.2"));
    expect(() => enforceIpRateLimit(opts("10.0.0.2"))).toThrow();

    vi.setSystemTime(new Date("2026-01-01T00:01:00.001Z")); // past the 60s window
    expect(() => enforceIpRateLimit(opts("10.0.0.2"))).not.toThrow();
  });

  it("tracks each IP independently", () => {
    for (let i = 0; i < 3; i += 1) enforceIpRateLimit(opts("10.0.0.3"));
    expect(() => enforceIpRateLimit(opts("10.0.0.3"))).toThrow();
    // A different IP is unaffected.
    expect(() => enforceIpRateLimit(opts("10.0.0.4"))).not.toThrow();
  });

  it("tracks each bucket independently", () => {
    for (let i = 0; i < 3; i += 1) enforceIpRateLimit(opts("10.0.0.5", "bucket_a"));
    expect(() => enforceIpRateLimit(opts("10.0.0.5", "bucket_a"))).toThrow();
    // Same IP, different bucket -> separate budget.
    expect(() => enforceIpRateLimit(opts("10.0.0.5", "bucket_b"))).not.toThrow();
  });
});
