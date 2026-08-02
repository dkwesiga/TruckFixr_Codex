import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// consentStore touches window/localStorage/navigator/document at call time, so
// we stub minimal globals before exercising it. No jsdom needed.

function makeLocalStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    _map: map,
  };
}

let storage: ReturnType<typeof makeLocalStorage>;
let gpc: boolean;

beforeEach(() => {
  vi.resetModules();
  storage = makeLocalStorage();
  gpc = false;
  vi.stubGlobal("window", {
    localStorage: storage,
    location: { hostname: "truckfixr.com" },
  });
  vi.stubGlobal("navigator", {
    get globalPrivacyControl() {
      return gpc;
    },
  });
  vi.stubGlobal("document", { cookie: "" });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function load() {
  return await import("./consentStore");
}

describe("consentStore — browser wiring", () => {
  it("starts with no consent (analytics off) until an explicit choice", async () => {
    const s = await load();
    expect(s.hasAnalyticsConsent()).toBe(false);
    expect(s.getConsentState().shouldShowBanner).toBe(true);
  });

  it("accept persists granted consent and enables analytics", async () => {
    const s = await load();
    s.acceptAnalytics();
    expect(s.hasAnalyticsConsent()).toBe(true);
    expect(storage._map.get("tfx_marketing_consent")).toContain("granted");
  });

  it("reject persists denial and keeps analytics off", async () => {
    const s = await load();
    s.rejectAnalytics();
    expect(s.hasAnalyticsConsent()).toBe(false);
    expect(storage._map.get("tfx_marketing_consent")).toContain("denied");
  });

  it("withdrawal clears first-party attribution keys", async () => {
    const s = await load();
    storage.setItem("tfx_attribution_first", "{}");
    storage.setItem("tfx_attribution_recent", "{}");
    s.acceptAnalytics();
    s.withdrawConsent();
    expect(s.hasAnalyticsConsent()).toBe(false);
    expect(storage.getItem("tfx_attribution_first")).toBeNull();
    expect(storage.getItem("tfx_attribution_recent")).toBeNull();
  });

  it("GPC forces analytics off even after a stored accept", async () => {
    const s = await load();
    s.acceptAnalytics();
    expect(s.hasAnalyticsConsent()).toBe(true);
    gpc = true;
    expect(s.readGpc()).toBe(true);
    expect(s.hasAnalyticsConsent()).toBe(false);
    expect(s.getConsentState().source).toBe("gpc");
  });

  it("notifies subscribers on change", async () => {
    const s = await load();
    const seen: string[] = [];
    const unsub = s.subscribeConsent(state => seen.push(state.status));
    s.acceptAnalytics();
    s.rejectAnalytics();
    unsub();
    s.acceptAnalytics();
    expect(seen).toEqual(["granted", "denied"]);
  });
});
