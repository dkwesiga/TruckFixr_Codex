import { getApiUrl } from "./api";

/**
 * Client runtime observability (TFX-CR-0017).
 *
 * Captures uncaught browser errors, unhandled promise rejections, and slow
 * initial loads, then forwards a small REDACTED beacon to the backend ingest
 * endpoint (`/api/observability/client`). This is deliberately dependency-free
 * — no third-party telemetry SDK — to keep the bundle lean and avoid loading
 * external trackers, matching the existing analytics no-op decision.
 *
 * Privacy: messages and URLs are redacted client-side before they ever leave
 * the browser, and the server redacts again on ingest.
 */

const SLOW_LOAD_THRESHOLD_MS = 6_000;
const MAX_MESSAGE_LENGTH = 600;
const DEDUPE_WINDOW_MS = 10_000;
const MAX_DEDUPE_ENTRIES = 100;

let initialized = false;
const recentlySent = new Map<string, number>();

function redact(value: string): string {
  let out = value;
  // Emails.
  out = out.replace(
    /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g,
    "$1***@$2"
  );
  // VINs (17 chars, excludes I/O/Q).
  out = out.replace(
    /\b([A-HJ-NPR-Z0-9]{17})\b/gi,
    (match) => `${match.slice(0, 3)}***${match.slice(-2)}`
  );
  // Bearer / JWT-ish tokens.
  out = out.replace(/\b(Bearer)\s+[A-Za-z0-9._-]+/gi, "$1 [redacted]");
  out = out.replace(
    /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g,
    "[redacted]"
  );
  if (out.length > MAX_MESSAGE_LENGTH) {
    out = `${out.slice(0, MAX_MESSAGE_LENGTH)}…`;
  }
  return out;
}

/** Strip query string and hash from a URL so we never leak tokens in links. */
function redactUrl(rawUrl: string | undefined): string | undefined {
  if (!rawUrl) return undefined;
  try {
    const url = new URL(rawUrl, window.location.origin);
    return redact(`${url.origin}${url.pathname}`);
  } catch {
    return redact(rawUrl.split(/[?#]/)[0] ?? rawUrl);
  }
}

type ClientObservabilityEvent = {
  event: string;
  severity?: "info" | "warning" | "error" | "critical";
  message?: string;
  source?: string;
  stack?: string;
  durationMs?: number;
};

export function reportClientObservability(event: ClientObservabilityEvent) {
  try {
    const message = event.message ? redact(event.message) : undefined;
    const dedupeKey = `${event.event}:${message ?? ""}`;
    const now = Date.now();
    const lastSent = recentlySent.get(dedupeKey);
    if (lastSent && now - lastSent < DEDUPE_WINDOW_MS) {
      return;
    }
    recentlySent.set(dedupeKey, now);
    // Bound the dedupe map so a long-lived session with many distinct events
    // cannot grow it without limit. Map preserves insertion order, so the first
    // key is the oldest.
    if (recentlySent.size > MAX_DEDUPE_ENTRIES) {
      const oldestKey = recentlySent.keys().next().value;
      if (oldestKey !== undefined) {
        recentlySent.delete(oldestKey);
      }
    }

    const payload = {
      event: event.event,
      severity: event.severity ?? "error",
      message,
      route: redactUrl(window.location.href),
      source: event.source ? redactUrl(event.source) : undefined,
      stack: event.stack ? redact(event.stack) : undefined,
      durationMs: event.durationMs,
    };

    const url = getApiUrl("/api/observability/client");
    const body = JSON.stringify(payload);

    // sendBeacon survives page unload and never blocks; fall back to fetch.
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      const queued = navigator.sendBeacon(url, blob);
      if (queued) return;
    }

    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      credentials: "include",
      keepalive: true,
    }).catch(() => {
      /* best-effort: monitoring must never disrupt the user */
    });
  } catch {
    /* never let monitoring throw into the app */
  }
}

function reportSlowLoadOnce() {
  try {
    const [navigation] = performance.getEntriesByType(
      "navigation"
    ) as PerformanceNavigationTiming[];
    if (!navigation) return;

    const loadMs = navigation.loadEventEnd - navigation.startTime;
    if (Number.isFinite(loadMs) && loadMs >= SLOW_LOAD_THRESHOLD_MS) {
      reportClientObservability({
        event: "slow_page_load",
        severity: "warning",
        message: `Initial load took ${Math.round(loadMs)}ms`,
        durationMs: Math.round(loadMs),
      });
    }
  } catch {
    /* performance timing unavailable */
  }
}

export function initializeClientObservability() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  window.addEventListener("error", (event) => {
    // Resource load errors fire with no `error` object; skip those to stay
    // focused on real script failures.
    if (!event.error && !event.message) return;
    reportClientObservability({
      event: "window_error",
      severity: "error",
      message: event.message || (event.error instanceof Error ? event.error.message : "Unknown error"),
      source: event.filename,
      stack: event.error instanceof Error ? event.error.stack : undefined,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    reportClientObservability({
      event: "unhandled_rejection",
      severity: "error",
      message: reason instanceof Error ? reason.message : String(reason ?? "Unhandled rejection"),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });

  if (document.readyState === "complete") {
    reportSlowLoadOnce();
  } else {
    window.addEventListener("load", () => {
      // Defer so loadEventEnd is populated.
      window.setTimeout(reportSlowLoadOnce, 0);
    });
  }
}
