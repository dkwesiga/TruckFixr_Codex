import { beforeEach, describe, expect, it } from "vitest";

import {
  categorizeErrorSource,
  configureObservabilityForTests,
  getObservabilitySummary,
  recordObservabilityEvent,
  redactContext,
  redactString,
  resetObservabilityForTests,
} from "./observability";

beforeEach(() => {
  resetObservabilityForTests();
  // Keep tests quiet and deterministic: silence console, force enabled, allow
  // debug through so severity filtering can be asserted explicitly.
  configureObservabilityForTests({
    enabled: true,
    console: false,
    minSeverity: "debug",
    webhookUrl: "",
  });
});

describe("redactString", () => {
  it("masks email addresses but keeps a debuggable shape", () => {
    expect(redactString("contact john.smith@example.com now")).toBe(
      "contact j***@example.com now"
    );
  });

  it("masks 17-character VINs", () => {
    const out = redactString("VIN 1HGCM82633A004352 failed");
    expect(out).not.toContain("1HGCM82633A004352");
    expect(out).toContain("1HG***52");
  });

  it("redacts bearer tokens, JWTs, and provider secret keys", () => {
    expect(redactString("Authorization: Bearer abc.def-123")).toContain("Bearer [redacted]");
    expect(
      redactString("token eyJhbGciOiJI.eyJzdWIiOiIx.SflKxwRJSMeKKF2")
    ).toContain("[redacted]");
    expect(redactString("key sk_live_abcdef123456")).toContain("sk_[redacted]");
  });

  it("strips base64 data URLs but keeps the mime prefix", () => {
    const out = redactString("photo data:image/png;base64,AAAABBBBCCCCDDDD==");
    expect(out).toBe("photo data:image/png;base64,[redacted]");
  });

  it("masks phone numbers", () => {
    const out = redactString("call 416-555-0199 today");
    expect(out).not.toContain("416-555-0199");
  });
});

describe("redactContext", () => {
  it("drops sensitive keys entirely and redacts nested values", () => {
    const redacted = redactContext({
      email: "owner@fleet.ca",
      apiKey: "sk_live_secret",
      note: "VIN 1HGCM82633A004352",
      nested: { authorization: "Bearer xyz", ok: true },
    });

    expect(redacted?.email).toBe("[redacted]");
    expect(redacted?.apiKey).toBe("[redacted]");
    expect(String(redacted?.note)).not.toContain("1HGCM82633A004352");
    expect((redacted?.nested as Record<string, unknown>).authorization).toBe("[redacted]");
    expect((redacted?.nested as Record<string, unknown>).ok).toBe(true);
  });

  it("handles circular references without throwing", () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    expect(() => redactContext(obj)).not.toThrow();
  });
});

describe("recordObservabilityEvent", () => {
  it("records and redacts an event, updating counters", () => {
    const record = recordObservabilityEvent({
      category: "stripe",
      event: "stripe_webhook_failed",
      severity: "error",
      message: "failed for owner@fleet.ca",
    });

    expect(record).not.toBeNull();
    expect(record?.message).toBe("failed for o***@fleet.ca");

    const summary = getObservabilitySummary();
    expect(summary.total).toBe(1);
    expect(summary.byCategory.stripe).toBe(1);
    expect(summary.bySeverity.error).toBe(1);
    expect(summary.topEvents[0]).toEqual({ event: "stripe_webhook_failed", count: 1 });
  });

  it("filters out events below the configured minimum severity", () => {
    configureObservabilityForTests({ minSeverity: "error" });
    expect(
      recordObservabilityEvent({ category: "backend", event: "noise", severity: "info" })
    ).toBeNull();
    expect(
      recordObservabilityEvent({ category: "backend", event: "real", severity: "error" })
    ).not.toBeNull();
    expect(getObservabilitySummary().total).toBe(1);
  });

  it("records nothing when disabled", () => {
    configureObservabilityForTests({ enabled: false });
    expect(
      recordObservabilityEvent({ category: "backend", event: "x", severity: "critical" })
    ).toBeNull();
    expect(getObservabilitySummary().total).toBe(0);
  });

  it("caps the recent buffer while keeping cumulative counters", () => {
    for (let i = 0; i < 250; i += 1) {
      recordObservabilityEvent({ category: "browser", event: "window_error", severity: "error" });
    }
    const summary = getObservabilitySummary(200);
    expect(summary.total).toBe(250);
    expect(summary.recent.length).toBe(200);
    expect(summary.topEvents[0]).toEqual({ event: "window_error", count: 250 });
  });

  it("never throws on malformed input", () => {
    expect(() =>
      recordObservabilityEvent({
        category: "backend",
        event: "weird",
        // @ts-expect-error intentionally invalid for robustness check
        context: { fn: () => 1, sym: Symbol("x") },
      })
    ).not.toThrow();
  });
});

describe("categorizeErrorSource", () => {
  it("identifies supabase/database failures", () => {
    expect(categorizeErrorSource("ECONNREFUSED connecting to postgres")).toBe("supabase");
    expect(categorizeErrorSource('relation "vehicles" does not exist')).toBe("supabase");
  });

  it("identifies stripe failures", () => {
    expect(categorizeErrorSource("No signatures found matching the webhook")).toBe("stripe");
  });

  it("falls back to backend for everything else", () => {
    expect(categorizeErrorSource("something unexpected")).toBe("backend");
  });
});
