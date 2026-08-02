// The single, pure decision function for what happens to an analytics event.
//
// Combines every guard — consent, production environment, public route,
// internal opt-out, and debug mode — into one verdict so the behaviour is
// testable in isolation and identical across every call site.

export type AnalyticsMode =
  /** Send to configured providers (GA4/Clarity). */
  | "send"
  /** Log a sanitized event locally; never contact providers. */
  | "debug"
  /** Do nothing. */
  | "drop";

export interface GateInputs {
  /** Visitor has granted analytics consent (and GPC is not forcing off). */
  hasConsent: boolean;
  /** Real production website (prod build + production host, or forceEnable). */
  isProduction: boolean;
  /** Current route is a public marketing page. */
  isPublicRoute: boolean;
  /** This browser is flagged as internal traffic. */
  isInternal: boolean;
  /** Debug logging is active (non-production only). */
  isDebug: boolean;
}

/**
 * Resolve the effective analytics mode.
 *
 * Order of precedence:
 *  1. Internal opt-out or non-public route → always drop (never even debug-log
 *     app/authenticated activity or internal traffic).
 *  2. No consent → drop (nothing runs before consent).
 *  3. Debug mode (non-prod) → debug-log only, never send.
 *  4. Production → send.
 *  5. Otherwise (dev/preview/staging without debug) → drop.
 */
export function resolveAnalyticsMode(inputs: GateInputs): AnalyticsMode {
  if (inputs.isInternal) return "drop";
  if (!inputs.isPublicRoute) return "drop";
  if (!inputs.hasConsent) return "drop";
  if (inputs.isDebug) return "debug";
  if (inputs.isProduction) return "send";
  return "drop";
}

/**
 * Whether providers may be INITIALIZED. Stricter than event sending: providers
 * only ever load in production, with consent, on a public route, for non-internal
 * traffic. Debug mode never loads real providers.
 */
export function canInitializeProviders(inputs: GateInputs): boolean {
  return (
    !inputs.isInternal &&
    inputs.isPublicRoute &&
    inputs.hasConsent &&
    inputs.isProduction &&
    !inputs.isDebug
  );
}
