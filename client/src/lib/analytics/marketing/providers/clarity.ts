// Microsoft Clarity provider. Loaded lazily and ONLY by the gated orchestrator,
// after consent, on public marketing pages. No-ops without a valid Project ID.
//
// Privacy posture: Clarity is configured (in its dashboard) to mask all text and
// inputs by default — see docs/marketing-analytics. In code we additionally
// stop recording if the SPA ever transitions to a non-public/authenticated
// route, so a recording can never continue into signed-in application content.

declare global {
  interface Window {
    clarity?: ((...args: unknown[]) => void) & { q?: unknown[] };
  }
}

let initialized = false;
let stopped = false;

/** Load the Clarity script for a project. Idempotent. */
export function initClarity(projectId: string | null): boolean {
  if (initialized) return true;
  if (!projectId) return false;
  if (typeof document === "undefined" || typeof window === "undefined")
    return false;

  // Standard Clarity bootstrap shim (queues calls until the script loads).
  (function (c: Window, l: Document, a: string, r: string, i: string) {
    c.clarity =
      c.clarity ||
      function (...args: unknown[]) {
        (c.clarity!.q = c.clarity!.q || []).push(args);
      };
    const t = l.createElement(r) as HTMLScriptElement;
    t.async = true;
    t.src = `https://www.clarity.ms/tag/${i}`;
    t.setAttribute("data-tfx-analytics", "clarity");
    t.onerror = () => {
      /* provider unavailable — never break the page */
    };
    const y = l.getElementsByTagName(r)[0];
    y?.parentNode?.insertBefore(t, y);
    void a;
  })(window, document, "clarity", "script", projectId);

  initialized = true;
  stopped = false;
  return true;
}

export function clarityIsInitialized(): boolean {
  return initialized;
}

/**
 * Stop Clarity recording. Called when the SPA leaves a public route so no
 * session recording continues into the authenticated app. Guarded/no-throw.
 */
export function stopClarity(): void {
  if (!initialized || stopped) return;
  try {
    window.clarity?.("stop");
    stopped = true;
  } catch {
    /* ignore */
  }
}

/** Resume Clarity after a stop (e.g. navigating back to a public route). */
export function resumeClarity(): void {
  if (!initialized || !stopped) return;
  try {
    window.clarity?.("start");
    stopped = false;
  } catch {
    /* ignore */
  }
}

/**
 * Send a custom event NAME to Clarity (no parameters — the name only, so no
 * PII can leak). Used to tag key conversions in Clarity recordings.
 */
export function clarityTrack(eventName: string): void {
  if (!initialized || stopped) return;
  try {
    window.clarity?.("event", eventName);
  } catch {
    /* ignore */
  }
}

/** Test-only reset. */
export function __resetClarityForTests(): void {
  initialized = false;
  stopped = false;
}
