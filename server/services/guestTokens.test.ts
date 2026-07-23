import { beforeAll, describe, expect, it } from "vitest";

import {
  GUEST_TOKEN_PURPOSES,
  generateOpaqueToken,
  hashIdentifier,
  signGuestToken,
  verifyGuestToken,
} from "./guestTokens";

beforeAll(() => {
  process.env.GUEST_TOKEN_SECRET = "test-guest-secret-abc123";
});

describe("generateOpaqueToken", () => {
  it("produces URL-safe, unique, sufficiently long handles", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const t = generateOpaqueToken();
      expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(t.length).toBeGreaterThanOrEqual(24);
      expect(seen.has(t)).toBe(false);
      seen.add(t);
    }
  });
});

describe("hashIdentifier", () => {
  it("is deterministic, case/space-insensitive, and hex", () => {
    expect(hashIdentifier("Fleet@Example.com ")).toBe(hashIdentifier("fleet@example.com"));
    expect(hashIdentifier("abc")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashIdentifier("abc")).not.toBe(hashIdentifier("abd"));
  });
});

describe("signGuestToken / verifyGuestToken", () => {
  const caseToken = "opaque-case-token-xyz";

  it("round-trips a valid signed token", () => {
    const token = signGuestToken({ caseToken, purpose: "case_access", ttlMs: 60_000 });
    const result = verifyGuestToken(token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.caseToken).toBe(caseToken);
      expect(result.purpose).toBe("case_access");
    }
  });

  it("supports every purpose and enforces purpose scoping", () => {
    for (const purpose of GUEST_TOKEN_PURPOSES) {
      const token = signGuestToken({ caseToken, purpose, ttlMs: 60_000 });
      expect(verifyGuestToken(token, { purpose }).ok).toBe(true);
    }
    const shopToken = signGuestToken({ caseToken, purpose: "repair_shop_link", ttlMs: 60_000 });
    const mismatch = verifyGuestToken(shopToken, { purpose: "driver_link" });
    expect(mismatch).toEqual({ ok: false, reason: "purpose_mismatch" });
  });

  it("rejects an expired token", () => {
    const now = Date.now();
    const token = signGuestToken({ caseToken, purpose: "case_access", ttlMs: 1000, now: now - 5000 });
    expect(verifyGuestToken(token, { now })).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects a tampered payload", () => {
    const token = signGuestToken({ caseToken, purpose: "case_access", ttlMs: 60_000 });
    const [v, , sig] = token.split(".");
    const forgedBody = Buffer.from(JSON.stringify({ t: "attacker", p: "case_access", e: Date.now() + 60_000 })).toString("base64url");
    expect(verifyGuestToken(`${v}.${forgedBody}.${sig}`)).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a tampered signature and bad version and malformed input", () => {
    const token = signGuestToken({ caseToken, purpose: "case_access", ttlMs: 60_000 });
    const [v, body] = token.split(".");
    expect(verifyGuestToken(`${v}.${body}.deadbeef`)).toEqual({ ok: false, reason: "bad_signature" });
    expect(verifyGuestToken(`v2.${body}.whatever`)).toEqual({ ok: false, reason: "bad_version" });
    expect(verifyGuestToken("not-a-token")).toEqual({ ok: false, reason: "malformed" });
    expect(verifyGuestToken("")).toEqual({ ok: false, reason: "malformed" });
  });
});
