import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Integration test for the cookieless, banner-free orchestrator. Config,
// providers, opt-out, and signals are mocked so we can exercise the gate +
// sanitization + dedupe end-to-end without a browser or network.

let production = true;
let debug = false;
let optedOut = false;
let internal = false;
let dnt = false;

const ga4Track = vi.fn();

vi.mock("./config", () => ({
  loadAnalyticsConfig: () => ({
    ga4Id: "G-TEST123",
    debugRequested: debug,
    forceEnable: false,
    isProdBuild: production,
    warnings: [],
  }),
  isProductionEnvironment: () => production,
  isDebugMode: () => debug,
}));

vi.mock("./providers/ga4", () => ({
  ga4Track: (...a: unknown[]) => ga4Track(...a),
  initGa4: () => true,
}));
vi.mock("./optOut", () => ({ isOptedOut: () => optedOut }));
vi.mock("./privacySignals", () => ({ honoursDoNotTrack: () => dnt }));
vi.mock("./internalOptOut", () => ({
  isInternalTraffic: () => internal,
  applyInternalOptOutFromUrl: () => internal,
}));

function stubWindow(search = "") {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    location: { hostname: "truckfixr.com", search },
    sessionStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  });
}

async function load() {
  const mod = await import("./index");
  mod.__resetModuleForTests();
  return mod;
}

beforeEach(() => {
  production = true;
  debug = false;
  optedOut = false;
  internal = false;
  dnt = false;
  ga4Track.mockClear();
  vi.resetModules();
  stubWindow();
});
afterEach(() => vi.unstubAllGlobals());

describe("cookieless analytics orchestrator", () => {
  it("sends a page view with sanitized page context + transient campaign params", async () => {
    stubWindow("?utm_source=linkedin"); // query lives on window.location.search
    const a = await load();
    a.trackPageView("/pricing");
    const call = ga4Track.mock.calls.find(c => c[0] === "public_page_view");
    expect(call).toBeTruthy();
    const params = call![1] as Record<string, unknown>;
    expect(params.page_path).toBe("/pricing");
    expect(params.page_type).toBe("pricing");
    expect(params.utm_source).toBe("linkedin"); // transient campaign param attached
  });

  it("tracks an evaluation CTA click and marks qualified", async () => {
    const a = await load();
    a.syncMarketingAnalytics("/");
    a.trackEvaluationCtaClick({
      location: "hero",
      text: "Book Your Fleet Review!",
    });
    const cta = ga4Track.mock.calls.find(c => c[0] === "evaluation_cta_click");
    expect(cta).toBeTruthy();
    expect((cta![1] as Record<string, unknown>).cta_text).toBe(
      "book_your_fleet_review"
    );
    expect(ga4Track.mock.calls.some(c => c[0] === "qualified_visitor")).toBe(
      true
    );
  });

  it("deduplicates meeting_scheduled to once per visit", async () => {
    const a = await load();
    a.syncMarketingAnalytics("/fleet-review");
    a.trackMeetingScheduled();
    a.trackMeetingScheduled();
    expect(
      ga4Track.mock.calls.filter(c => c[0] === "meeting_scheduled")
    ).toHaveLength(1);
  });

  it("sends nothing when the visitor has opted out", async () => {
    optedOut = true;
    const a = await load();
    a.trackPageView("/");
    a.trackEvaluationCtaClick({ location: "hero", text: "Book" });
    expect(ga4Track).not.toHaveBeenCalled();
  });

  it("sends nothing when GPC/DNT is present", async () => {
    dnt = true;
    const a = await load();
    a.trackPageView("/");
    expect(ga4Track).not.toHaveBeenCalled();
  });

  it("sends nothing for internal traffic", async () => {
    internal = true;
    const a = await load();
    a.trackPageView("/");
    expect(ga4Track).not.toHaveBeenCalled();
  });

  it("never sends on an authenticated route", async () => {
    const a = await load();
    a.trackPageView("/manager");
    expect(ga4Track).not.toHaveBeenCalled();
  });

  it("debug mode logs and never contacts GA4", async () => {
    production = false;
    debug = true;
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const a = await load();
    a.trackPageView("/");
    expect(ga4Track).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("does not throw if GA4 throws (booking/navigation stay safe)", async () => {
    ga4Track.mockImplementation(() => {
      throw new Error("blocked by adblock");
    });
    const a = await load();
    a.syncMarketingAnalytics("/");
    expect(() =>
      a.trackEvaluationCtaClick({ location: "hero", text: "Book" })
    ).not.toThrow();
  });
});
