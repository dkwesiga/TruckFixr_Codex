// The single, pure decision function for what happens to an analytics event.
//
// This is a COOKIELESS, BANNER-FREE setup: GA4 runs without cookies or on-device
// storage, so no consent prompt is required. Instead we combine environment,
// route, an internal (staff) opt-out, a visitor opt-out, and the browser's
// GPC/DNT signals into one verdict, so behaviour is testable and identical
// across every call site.

export type AnalyticsMode =
  /** Send to GA4 (cookieless). */
  | "send"
  /** Log a sanitized event locally; never contact GA4. */
  | "debug"
  /** Do nothing. */
  | "drop";

export interface GateInputs {
  /** Real production website (prod build + production host, or forceEnable). */
  isProduction: boolean;
  /** Current route is a public marketing page. */
  isPublicRoute: boolean;
  /** This browser is flagged as internal (staff) traffic. */
  isInternal: boolean;
  /** This visitor has opted out via the footer control. */
  isOptedOut: boolean;
  /** Browser sends Global Privacy Control or Do Not Track. */
  respectSignal: boolean;
  /** Debug logging is active (non-production only). */
  isDebug: boolean;
}

/**
 * Resolve the effective analytics mode.
 *
 * Order of precedence:
 *  1. Non-public route, internal opt-out, visitor opt-out, or a GPC/DNT signal
 *     → always drop (never even debug-log these).
 *  2. Debug mode (non-prod) → debug-log only, never send.
 *  3. Production → send (cookieless).
 *  4. Otherwise (dev/preview/staging without debug) → drop.
 */
export function resolveAnalyticsMode(inputs: GateInputs): AnalyticsMode {
  if (!inputs.isPublicRoute) return "drop";
  if (inputs.isInternal) return "drop";
  if (inputs.isOptedOut) return "drop";
  if (inputs.respectSignal) return "drop";
  if (inputs.isDebug) return "debug";
  if (inputs.isProduction) return "send";
  return "drop";
}

/**
 * Whether the GA4 provider may be INITIALIZED. Stricter than event sending:
 * only in production, on a public route, for non-internal, non-opted-out traffic
 * with no GPC/DNT signal. Debug mode never loads the real provider.
 */
export function canInitializeProviders(inputs: GateInputs): boolean {
  return (
    inputs.isPublicRoute &&
    !inputs.isInternal &&
    !inputs.isOptedOut &&
    !inputs.respectSignal &&
    inputs.isProduction &&
    !inputs.isDebug
  );
}
