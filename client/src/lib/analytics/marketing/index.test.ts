import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Integration test for the orchestrator. Consent, config, and providers are
// mocked so we can exercise the gate + sanitization + dedupe end-to-end without
// a browser or real network.

let consent = true;
let production = true;
let debug = false;

const ga4Track = vi.fn();
const clarityTrack = vi.fn();

vi.mock("@/lib/consent/consentStore", () => ({
  hasAnalyticsConsent: () => consent,
}));

vi.mock("./config", () => ({
  loadAnalyticsConfig: () => ({
    ga4Id: "G-TEST123",
    clarityId: "clarity123",
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
vi.mock("./providers/clarity", () => ({
  clarityTrack: (...a: unknown[]) => clarityTrack(...a),
  initClarity: () => true,
  resumeClarity: () => {},
  stopClarity: () => {},
}));

function stubWindow(pathSearch = "") {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    location: { hostname: "truckfixr.com", search: pathSearch },
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
    sessionStorage: {
      getItem: (k: string) => store.get(`s:${k}`) ?? null,
      setItem: (k: string, v: string) => void store.set(`s:${k}`, v),
      removeItem: (k: string) => void store.delete(`s:${k}`),
    },
  });
}

async function load() {
  const mod = await import("./index");
  mod.__resetModuleForTests();
  return mod;
}

beforeEach(() => {
  consent = true;
  production = true;
  debug = false;
  ga4Track.mockClear();
  clarityTrack.mockClear();
  vi.resetModules();
  stubWindow();
});
afterEach(() => vi.unstubAllGlobals());

describe("marketing analytics orchestrator", () => {
  it("sends nothing before consent", async () => {
    consent = false;
    const a = await load();
    a.trackPageView("/");
    a.trackEvaluationCtaClick({
      location: "hero",
      text: "Book Your Fleet Review",
    });
    expect(ga4Track).not.toHaveBeenCalled();
  });

  it("sends a page view with sanitized page context in production with consent", async () => {
    const a = await load();
    a.trackPageView("/pricing?utm_source=linkedin");
    const call = ga4Track.mock.calls.find(c => c[0] === "public_page_view");
    expect(call).toBeTruthy();
    const params = call![1] as Record<string, unknown>;
    expect(params.page_path).toBe("/pricing"); // query stripped
    expect(params.page_type).toBe("pricing");
  });

  it("tracks an evaluation CTA click with safe location + normalized text, and marks qualified", async () => {
    const a = await load();
    a.syncMarketingAnalytics("/");
    a.trackEvaluationCtaClick({
      location: "hero",
      text: "Book Your Fleet Review!",
    });
    const cta = ga4Track.mock.calls.find(c => c[0] === "evaluation_cta_click");
    expect(cta).toBeTruthy();
    expect((cta![1] as Record<string, unknown>).cta_location).toBe("hero");
    expect((cta![1] as Record<string, unknown>).cta_text).toBe(
      "book_your_fleet_review"
    );
    // high-intent → qualified_visitor also emitted
    expect(ga4Track.mock.calls.some(c => c[0] === "qualified_visitor")).toBe(
      true
    );
    // conversions mirrored to Clarity as name-only events
    expect(clarityTrack).toHaveBeenCalledWith("evaluation_cta_click");
  });

  it("deduplicates meeting_scheduled to once per visit", async () => {
    const a = await load();
    a.syncMarketingAnalytics("/fleet-review");
    a.trackMeetingScheduled();
    a.trackMeetingScheduled();
    a.trackMeetingScheduled();
    const scheduled = ga4Track.mock.calls.filter(
      c => c[0] === "meeting_scheduled"
    );
    expect(scheduled).toHaveLength(1);
  });

  it("debug mode logs and never contacts providers", async () => {
    production = false;
    debug = true;
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const a = await load();
    a.trackPageView("/");
    expect(ga4Track).not.toHaveBeenCalled();
    expect(clarityTrack).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("never sends on an authenticated route", async () => {
    const a = await load();
    a.trackPageView("/manager");
    expect(ga4Track).not.toHaveBeenCalled();
  });

  it("does not throw if a provider throws (booking/navigation stay safe)", async () => {
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
