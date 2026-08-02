// Pure, DOM-free consent logic for TruckFixr marketing analytics.
//
// This module deliberately has NO browser dependencies (no window, localStorage,
// or navigator) so it is fully unit-testable under the repo's node Vitest env.
// The browser wiring (localStorage + Global Privacy Control + pub/sub) lives in
// `consentStore.ts`, which is a thin wrapper over these functions.
//
// Scope: this consent record governs ONLY optional marketing analytics (GA4 +
// Microsoft Clarity) on public marketing pages. It never gates necessary site
// functionality, and it is entirely separate from the authenticated product
// analytics in `client/src/lib/analytics.ts`.

/**
 * Version of the consent policy / tracking disclosures. Bump this whenever the
 * categories of data collected, the providers used, or the privacy disclosures
 * materially change. A stored record from an older version is treated as
 * expired, so the banner is shown again to re-collect informed consent.
 */
export const CONSENT_POLICY_VERSION = 1;

/** Consent lifetime: 12 months. */
export const CONSENT_TTL_MS = 365 * 24 * 60 * 60 * 1000;

/** localStorage key for the persisted consent record (first-party only). */
export const CONSENT_STORAGE_KEY = "tfx_marketing_consent";

/** The visitor's decision about optional analytics. */
export type AnalyticsDecision = "granted" | "denied";

/**
 * How the current effective decision was reached. `gpc` means the browser's
 * Global Privacy Control signal forced a denial regardless of any stored choice.
 */
export type ConsentSource = "stored" | "gpc" | "default";

/** The persisted, versioned consent record. */
export interface ConsentRecord {
  /** Schema/policy version this record was captured under. */
  v: number;
  /** The visitor's explicit decision for optional analytics. */
  analytics: AnalyticsDecision;
  /** Epoch milliseconds when the decision was recorded. */
  ts: number;
  /** Whether GPC was active at capture time (informational/audit only). */
  gpc: boolean;
}

/** The effective, resolved consent state the rest of the app consumes. */
export interface ResolvedConsent {
  /** Effective decision status. `undecided` means we must show the banner. */
  status: "granted" | "denied" | "undecided";
  /** Convenience: true only when optional analytics may run. */
  analyticsAllowed: boolean;
  /** Whether GPC is currently forcing analytics off. */
  gpcActive: boolean;
  /** How `status` was determined. */
  source: ConsentSource;
  /** Whether the consent UI (banner) should be presented. */
  shouldShowBanner: boolean;
}

/**
 * Parse a raw stored string into a ConsentRecord, or null if absent/invalid.
 * Never throws — malformed storage is treated as "no record".
 */
export function parseConsentRecord(
  raw: string | null | undefined
): ConsentRecord | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const r = parsed as Record<string, unknown>;
  if (typeof r.v !== "number") return null;
  if (r.analytics !== "granted" && r.analytics !== "denied") return null;
  if (typeof r.ts !== "number" || !Number.isFinite(r.ts)) return null;
  return {
    v: r.v,
    analytics: r.analytics,
    ts: r.ts,
    gpc: r.gpc === true,
  };
}

/**
 * A stored record is valid only when it matches the current policy version and
 * has not exceeded the 12-month TTL. Version bumps and expiry both invalidate.
 */
export function isRecordValid(
  record: ConsentRecord | null,
  now: number,
  policyVersion: number = CONSENT_POLICY_VERSION
): record is ConsentRecord {
  if (!record) return false;
  if (record.v !== policyVersion) return false;
  if (now - record.ts >= CONSENT_TTL_MS) return false;
  if (now < record.ts) return false; // clock skew / tampering guard
  return true;
}

/** Build a fresh consent record for persisting. */
export function createConsentRecord(
  decision: AnalyticsDecision,
  opts: { now: number; gpc?: boolean; policyVersion?: number }
): ConsentRecord {
  return {
    v: opts.policyVersion ?? CONSENT_POLICY_VERSION,
    analytics: decision,
    ts: opts.now,
    gpc: opts.gpc === true,
  };
}

/**
 * Resolve the effective consent state from the stored record and the live GPC
 * signal. This is the single source of truth for "may analytics run?".
 *
 * Rules (in priority order):
 *  1. GPC active  → analytics DENIED and kept disabled while GPC persists,
 *     overriding any stored "granted". The banner is suppressed because asking
 *     to accept would contradict the browser signal we are honouring.
 *  2. Valid stored record → use its decision.
 *  3. Otherwise    → undecided; show the banner; analytics stays off until then.
 *
 * Note: legacy Do Not Track is intentionally NOT treated as GPC and is ignored
 * here — callers must not pass DNT in as `gpcActive`.
 */
export function resolveConsent(args: {
  record: ConsentRecord | null;
  gpcActive: boolean;
  now: number;
  policyVersion?: number;
}): ResolvedConsent {
  const { record, gpcActive, now, policyVersion } = args;

  if (gpcActive) {
    return {
      status: "denied",
      analyticsAllowed: false,
      gpcActive: true,
      source: "gpc",
      shouldShowBanner: false,
    };
  }

  if (isRecordValid(record, now, policyVersion)) {
    const granted = record.analytics === "granted";
    return {
      status: granted ? "granted" : "denied",
      analyticsAllowed: granted,
      gpcActive: false,
      source: "stored",
      shouldShowBanner: false,
    };
  }

  return {
    status: "undecided",
    analyticsAllowed: false,
    gpcActive: false,
    source: "default",
    shouldShowBanner: true,
  };
}
