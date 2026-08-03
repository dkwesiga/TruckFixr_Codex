import { describe, it, expect } from "vitest";
import { buildUtmUrl, normalizePath, normalizeToken, CHANNELS } from "./utm";

describe("UTM builder", () => {
  it("builds a normalized URL for a known channel", () => {
    const r = buildUtmUrl({
      channel: "linkedin_post",
      campaign: "Post Downtime",
    });
    expect(r.ok).toBe(true);
    expect(r.url).toBe(
      "https://truckfixr.com/?utm_source=linkedin&utm_medium=social&utm_campaign=post_downtime"
    );
  });

  it("supports optional content and a same-origin destination path", () => {
    const r = buildUtmUrl({
      channel: "email",
      campaign: "outreach_q3",
      content: "Variant A",
      path: "/fleet-review",
    });
    expect(r.ok).toBe(true);
    expect(r.url).toContain("/fleet-review?");
    expect(r.url).toContain("utm_content=variant_a");
    expect(r.parts?.source).toBe("email");
  });

  it("rejects unknown channels", () => {
    const r = buildUtmUrl({ channel: "tiktok", campaign: "x" });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain("Unknown channel");
  });

  it("requires a campaign", () => {
    const r = buildUtmUrl({ channel: "email", campaign: "  " });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toContain("campaign name is required");
  });

  it("rejects PII in campaign or content (email / phone)", () => {
    expect(
      buildUtmUrl({ channel: "email", campaign: "reach owner@fleet.com" }).ok
    ).toBe(false);
    expect(
      buildUtmUrl({
        channel: "email",
        campaign: "q3",
        content: "call 416-555-1234",
      }).ok
    ).toBe(false);
  });

  it("does NOT block harmless campaign labels", () => {
    for (const label of [
      "post_downtime",
      "dm_fleet_manager",
      "qr_pitch_deck",
    ]) {
      expect(buildUtmUrl({ channel: "partner", campaign: label }).ok).toBe(
        true
      );
    }
  });

  it("normalizes tokens and strips query/hash from the path", () => {
    expect(normalizeToken("Post — Downtime!!")).toBe("post_downtime");
    expect(normalizePath("https://truckfixr.com/pricing?x=1#y")).toBe(
      "/pricing"
    );
    expect(normalizePath(undefined)).toBe("/");
  });

  it("exposes the five required channels", () => {
    expect(Object.keys(CHANNELS).sort()).toEqual(
      ["email", "event", "linkedin_dm", "linkedin_post", "partner"].sort()
    );
  });
});
