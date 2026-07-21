import { describe, expect, it } from "vitest";

import {
  buildIdempotencyKey,
  canonicalStringify,
  defaultTrustStatusFor,
  normalizeDtcCode,
  normalizeNumeric,
  normalizeTimestampToUtcIso,
  normalizedPayloadHash,
} from "./normalization";

describe("vehicle event normalization", () => {
  it("uppercases and trims DTC codes", () => {
    expect(normalizeDtcCode(" p0420 ")).toBe("P0420");
    expect(normalizeDtcCode("")).toBeNull();
    expect(normalizeDtcCode(null)).toBeNull();
  });

  it("normalizes timestamps to UTC ISO and rejects garbage", () => {
    expect(normalizeTimestampToUtcIso("2026-07-20T12:00:00-04:00")).toBe(
      "2026-07-20T16:00:00.000Z"
    );
    expect(normalizeTimestampToUtcIso("not-a-date")).toBeNull();
    expect(normalizeTimestampToUtcIso(null)).toBeNull();
  });

  it("rounds numerics to fixed precision", () => {
    expect(normalizeNumeric(12.1000000001)).toBe(12.1);
    expect(normalizeNumeric("3.14159", 2)).toBe(3.14);
    expect(normalizeNumeric(null)).toBeNull();
    expect(normalizeNumeric("nope")).toBeNull();
  });

  it("free-text and unknown default to review_required; structured to trusted", () => {
    expect(defaultTrustStatusFor("odometer")).toBe("trusted");
    expect(defaultTrustStatusFor("dtc_detected")).toBe("trusted");
    expect(defaultTrustStatusFor("free_text")).toBe("review_required");
    expect(defaultTrustStatusFor("unknown")).toBe("review_required");
  });

  it("canonical stringify is stable regardless of key order", () => {
    const a = canonicalStringify({ b: 1, a: 2, c: { y: 1, x: 2 } });
    const b = canonicalStringify({ c: { x: 2, y: 1 }, a: 2, b: 1 });
    expect(a).toBe(b);
  });

  it("payload hash ignores volatile keys", () => {
    const h1 = normalizedPayloadHash({ odometerKm: 1000, receivedAt: "t1" });
    const h2 = normalizedPayloadHash({ odometerKm: 1000, receivedAt: "t2" });
    expect(h1).toBe(h2);
  });
});

describe("idempotency keys", () => {
  it("uses source event id when present (identical -> identical key)", () => {
    const base = {
      fleetId: 1,
      vehicleId: "veh-1",
      source: "geotab",
      sourceEventId: "evt-99",
      eventType: "dtc_detected",
      eventTimestamp: "2026-07-20T12:00:00Z",
    };
    const k1 = buildIdempotencyKey(base);
    const k2 = buildIdempotencyKey({ ...base, normalizedPayload: { changed: true } });
    // With a source id, payload changes must not change the key.
    expect(k1).toBe(k2);
  });

  it("different source event ids produce different keys", () => {
    const k1 = buildIdempotencyKey({
      fleetId: 1,
      vehicleId: "veh-1",
      source: "geotab",
      sourceEventId: "evt-1",
      eventType: "dtc_detected",
      eventTimestamp: "2026-07-20T12:00:00Z",
    });
    const k2 = buildIdempotencyKey({
      fleetId: 1,
      vehicleId: "veh-1",
      source: "geotab",
      sourceEventId: "evt-2",
      eventType: "dtc_detected",
      eventTimestamp: "2026-07-20T12:00:00Z",
    });
    expect(k1).not.toBe(k2);
  });

  it("without source id, same normalized content -> same key across TZ representations", () => {
    const k1 = buildIdempotencyKey({
      fleetId: 1,
      vehicleId: "veh-1",
      source: "Manual",
      eventType: "odometer",
      eventTimestamp: "2026-07-20T12:00:00Z",
      normalizedPayload: { odometerKm: 1000 },
    });
    const k2 = buildIdempotencyKey({
      fleetId: 1,
      vehicleId: "veh-1",
      source: "manual",
      eventType: "odometer",
      eventTimestamp: "2026-07-20T08:00:00-04:00",
      normalizedPayload: { odometerKm: 1000 },
    });
    expect(k1).toBe(k2);
  });

  it("different fleets never collide on the same content", () => {
    const common = {
      vehicleId: "veh-1",
      source: "manual",
      eventType: "odometer",
      eventTimestamp: "2026-07-20T12:00:00Z",
      normalizedPayload: { odometerKm: 1000 },
    };
    expect(buildIdempotencyKey({ fleetId: 1, ...common })).not.toBe(
      buildIdempotencyKey({ fleetId: 2, ...common })
    );
  });
});
