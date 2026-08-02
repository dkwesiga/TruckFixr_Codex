import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isOptedOut, setOptedOut, subscribeOptOut } from "./optOut";

describe("visitor analytics opt-out", () => {
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

  it("defaults to not opted out", () => {
    expect(isOptedOut()).toBe(false);
  });

  it("persists and clears the opt-out and notifies subscribers", () => {
    const seen: boolean[] = [];
    const unsub = subscribeOptOut(() => seen.push(isOptedOut()));
    setOptedOut(true);
    expect(isOptedOut()).toBe(true);
    expect(store.get("tfx_analytics_optout")).toBe("1");
    setOptedOut(false);
    expect(isOptedOut()).toBe(false);
    expect(store.has("tfx_analytics_optout")).toBe(false);
    unsub();
    expect(seen).toEqual([true, false]);
  });
});
