import { describe, it, expect } from "vitest";
import {
  isMarketingEventName,
  normalizeCtaLocation,
  normalizeCtaText,
  normalizeSectionName,
  sanitizeParams,
} from "./events";

describe("event schema + sanitization", () => {
  it("recognizes only allowlisted event names", () => {
    expect(isMarketingEventName("meeting_scheduled")).toBe(true);
    expect(isMarketingEventName("evaluation_cta_click")).toBe(true);
    expect(isMarketingEventName("random_event")).toBe(false);
    expect(isMarketingEventName("demo_video_play")).toBe(false); // no video → not allowed
  });

  it("normalizes CTA text to a safe snake_case token, length-limited", () => {
    expect(normalizeCtaText("Book Your Fleet Review!")).toBe(
      "book_your_fleet_review"
    );
    expect(normalizeCtaText("  See How TruckFixr Works  ")).toBe(
      "see_how_truckfixr_works"
    );
    expect(normalizeCtaText("x".repeat(200)).length).toBeLessThanOrEqual(60);
  });

  it("normalizes unknown CTA locations and sections to 'other'", () => {
    expect(normalizeCtaLocation("hero")).toBe("hero");
    expect(normalizeCtaLocation("weird_place")).toBe("other");
    expect(normalizeSectionName("problem")).toBe("problem");
    expect(normalizeSectionName("company-secrets")).toBe("other");
  });

  it("keeps only allowlisted params and drops everything else", () => {
    const out = sanitizeParams({
      page_path: "/pricing",
      cta_location: "hero",
      cta_text: "book_your_fleet_review",
      // not allowlisted / forbidden:
      email: "a@b.com",
      user_id: "123",
      challenge: "engine keeps failing",
      arbitrary: "nope",
    });
    expect(out).toEqual({
      page_path: "/pricing",
      cta_location: "hero",
      cta_text: "book_your_fleet_review",
    });
    expect(out).not.toHaveProperty("email");
    expect(out).not.toHaveProperty("user_id");
    expect(out).not.toHaveProperty("challenge");
  });

  it("drops allowlisted values that themselves look like PII (email/phone)", () => {
    const out = sanitizeParams({
      utm_campaign: "spring_sale",
      utm_content: "reach me at owner@fleet.com", // PII-looking → dropped
      cta_text: "call 416-555-1234", // phone-like → dropped
    });
    expect(out.utm_campaign).toBe("spring_sale");
    expect(out).not.toHaveProperty("utm_content");
    expect(out).not.toHaveProperty("cta_text");
  });

  it("passes through finite numeric params and drops NaN/Infinity", () => {
    const out = sanitizeParams({
      engaged_seconds: 42,
      qualifier: "engaged_time",
    });
    expect(out.engaged_seconds).toBe(42);
    const bad = sanitizeParams({ engaged_seconds: Number.POSITIVE_INFINITY });
    expect(bad).not.toHaveProperty("engaged_seconds");
  });
});
