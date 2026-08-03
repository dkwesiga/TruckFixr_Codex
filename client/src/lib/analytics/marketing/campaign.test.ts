import { describe, it, expect } from "vitest";
import { normalizeUtm, readCampaignParams } from "./campaign";

describe("campaign UTM reader (transient, no storage)", () => {
  it("normalizes UTM values to lowercase snake_case", () => {
    expect(normalizeUtm("LinkedIn")).toBe("linkedin");
    expect(normalizeUtm("Post Downtime")).toBe("post_downtime");
    expect(normalizeUtm("")).toBeUndefined();
    expect(normalizeUtm(null)).toBeUndefined();
  });

  it("reads allowlisted UTM params from a query string", () => {
    const out = readCampaignParams(
      "?utm_source=LinkedIn&utm_medium=Social&utm_campaign=Post Downtime&utm_content=A"
    );
    expect(out).toEqual({
      utm_source: "linkedin",
      utm_medium: "social",
      utm_campaign: "post_downtime",
      utm_content: "a",
    });
  });

  it("returns nothing when no real campaign is present (content alone ignored)", () => {
    expect(readCampaignParams("?utm_content=abc")).toEqual({});
    expect(readCampaignParams("")).toEqual({});
    expect(readCampaignParams("?foo=bar")).toEqual({});
  });

  it("ignores unknown params and never returns personal data keys", () => {
    const out = readCampaignParams("?utm_source=email&name=bob&email=a@b.com");
    expect(out).toEqual({ utm_source: "email" });
  });
});
