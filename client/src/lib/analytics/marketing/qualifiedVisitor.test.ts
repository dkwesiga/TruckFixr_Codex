import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  ENGAGED_TIME_THRESHOLD_MS,
  MULTI_PAGE_THRESHOLD,
  qualifiesByEngagedTime,
  qualifiesByPages,
  recordPublicPageView,
} from "./qualifiedVisitor";

describe("qualified visitor — thresholds", () => {
  it("qualifies at >= 2 distinct public pages", () => {
    expect(qualifiesByPages(1)).toBe(false);
    expect(qualifiesByPages(MULTI_PAGE_THRESHOLD)).toBe(true);
  });

  it("qualifies at >= 30s engaged time", () => {
    expect(qualifiesByEngagedTime(ENGAGED_TIME_THRESHOLD_MS - 1)).toBe(false);
    expect(qualifiesByEngagedTime(ENGAGED_TIME_THRESHOLD_MS)).toBe(true);
  });
});

describe("qualified visitor — distinct page counting", () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("counts distinct paths and de-dupes repeats", () => {
    expect(recordPublicPageView("/")).toBe(1);
    expect(recordPublicPageView("/")).toBe(1); // repeat, no inflation
    expect(recordPublicPageView("/pricing")).toBe(2);
  });
});
