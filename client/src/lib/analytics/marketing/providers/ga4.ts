// Google Analytics 4 provider (gtag). Loaded lazily and ONLY by the gated
// orchestrator — never imported for its side effects. No-ops entirely without a
// valid Measurement ID. Uses Google Consent Mode with advertising signals off.

type GtagArgs = [string, ...unknown[]];

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let initialized = false;
let activeId: string | null = null;

function pushGtag(...args: GtagArgs): void {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(args);
}

/**
 * Load the gtag library and configure GA4 for privacy-conscious, consented
 * analytics. Idempotent. Safe to call only after consent + production checks.
 */
export function initGa4(measurementId: string | null): boolean {
  if (initialized) return true;
  if (!measurementId) return false;
  if (typeof document === "undefined" || typeof window === "undefined")
    return false;

  window.dataLayer = window.dataLayer || [];
  // Real gtag shim so calls before/after script load are queued.
  window.gtag =
    window.gtag ||
    function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };

  // Consent Mode: analytics granted (we only reach here with consent), all
  // advertising signals denied. No Google Signals, no ad personalization.
  pushGtag("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "granted",
  });

  pushGtag("js", new Date());
  pushGtag("config", measurementId, {
    anonymize_ip: true,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    // We drive page_view ourselves on SPA navigations.
    send_page_view: false,
  });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  script.setAttribute("data-tfx-analytics", "ga4");
  // A blocked/failed load must never break the page.
  script.onerror = () => {
    /* provider unavailable — events simply queue in dataLayer harmlessly */
  };
  document.head.appendChild(script);

  initialized = true;
  activeId = measurementId;
  return true;
}

export function ga4IsInitialized(): boolean {
  return initialized;
}

/** Send an event to GA4. No-op if not initialized. */
export function ga4Track(
  eventName: string,
  params: Record<string, string | number>
): void {
  if (!initialized || !activeId) return;
  try {
    pushGtag("event", eventName, params);
  } catch {
    /* never throw from analytics */
  }
}

/** Test-only reset. */
export function __resetGa4ForTests(): void {
  initialized = false;
  activeId = null;
}
