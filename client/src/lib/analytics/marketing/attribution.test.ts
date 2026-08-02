import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  ATTRIBUTION_TTL_MS,
  captureAttribution,
  parseTouch,
  touchesToParams,
  FIRST_TOUCH_KEY,
  RECENT_TOUCH_KEY,
} from "./attribution";

const NOW = 1_700_000_000_000;

describe("attribution — pure", () => {
  it("parses + normalizes a touch, ignoring bare utm_content", () => {
    const t = parseTouch(
      "?utm_source=LinkedIn&utm_medium=Social&utm_campaign=Post Downtime",
      NOW
    );
    expect(t).toMatchObject({
      source: "linkedin",
      medium: "social",
      campaign: "post_downtime",
    });
    expect(parseTouch("?utm_content=abc", NOW)).toBeNull(); // content alone doesn't count
    expect(parseTouch("", NOW)).toBeNull();
  });

  it("flattens first + recent touches to allowlisted params", () => {
    const first = { source: "google", medium: "organic", ts: NOW };
    const recent = {
      source: "linkedin",
      medium: "social",
      campaign: "dm_fleet_manager",
      ts: NOW,
    };
    const params = touchesToParams(first, recent);
    expect(params.first_touch_source).toBe("google");
    expect(params.recent_touch_campaign).toBe("dm_fleet_manager");
    expect(params.utm_source).toBe("linkedin");
  });
});

describe("attribution — storage + consent", () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("does NOT persist anything before consent (transient read only)", () => {
    const params = captureAttribution({
      search: "?utm_source=linkedin&utm_campaign=post_downtime",
      hasConsent: false,
      now: NOW,
    });
    expect(params.utm_source).toBe("linkedin");
    expect(store.size).toBe(0); // nothing written
  });

  it("persists first + recent touch after consent", () => {
    captureAttribution({
      search: "?utm_source=linkedin&utm_campaign=a",
      hasConsent: true,
      now: NOW,
    });
    expect(store.has(FIRST_TOUCH_KEY)).toBe(true);
    expect(store.has(RECENT_TOUCH_KEY)).toBe(true);
  });

  it("keeps first-touch immutable but updates recent-touch on a new campaign", () => {
    captureAttribution({
      search: "?utm_source=google&utm_medium=organic",
      hasConsent: true,
      now: NOW,
    });
    const params = captureAttribution({
      search: "?utm_source=linkedin&utm_medium=social",
      hasConsent: true,
      now: NOW + 1000,
    });
    expect(params.first_touch_source).toBe("google"); // unchanged
    expect(params.recent_touch_source).toBe("linkedin"); // updated
  });

  it("expires stored touches after 90 days", () => {
    captureAttribution({
      search: "?utm_source=google",
      hasConsent: true,
      now: NOW,
    });
    const later = captureAttribution({
      search: "",
      hasConsent: true,
      now: NOW + ATTRIBUTION_TTL_MS,
    });
    expect(later.first_touch_source).toBeUndefined(); // expired, and no new campaign
  });
});
