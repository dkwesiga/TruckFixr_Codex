// Browser wrapper around the pure consent logic in `consent.ts`.
//
// Owns the first-party localStorage record, reads the live Global Privacy
// Control signal, exposes a tiny pub/sub so React (and the analytics module)
// can react to consent changes, and clears first-party analytics/attribution
// data on withdrawal. Safe to import in non-browser contexts (all DOM access is
// guarded) so it never breaks SSR-style imports or tests.

import {
  CONSENT_STORAGE_KEY,
  createConsentRecord,
  parseConsentRecord,
  resolveConsent,
  type AnalyticsDecision,
  type ConsentRecord,
  type ResolvedConsent,
} from "./consent";

/** localStorage keys owned by marketing analytics that a withdrawal must clear. */
export const FIRST_PARTY_ANALYTICS_KEYS = [
  "tfx_attribution_first",
  "tfx_attribution_recent",
];

type Listener = (state: ResolvedConsent) => void;

const listeners = new Set<Listener>();

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

/**
 * Read the Global Privacy Control signal. Only the standard
 * `navigator.globalPrivacyControl === true` counts. Legacy Do Not Track
 * (`navigator.doNotTrack`) is intentionally NOT consulted here.
 */
export function readGpc(): boolean {
  if (!hasWindow()) return false;
  try {
    return (
      (navigator as Navigator & { globalPrivacyControl?: boolean })
        .globalPrivacyControl === true
    );
  } catch {
    return false;
  }
}

function readRecord(): ConsentRecord | null {
  if (!hasWindow()) return null;
  try {
    return parseConsentRecord(window.localStorage.getItem(CONSENT_STORAGE_KEY));
  } catch {
    return null;
  }
}

function writeRecord(record: ConsentRecord): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Storage may be unavailable (private mode, quota). Consent then simply
    // defaults to "undecided" on next load — analytics stays off. Never throw.
  }
}

/** Compute the current effective consent state. */
export function getConsentState(now: number = Date.now()): ResolvedConsent {
  return resolveConsent({ record: readRecord(), gpcActive: readGpc(), now });
}

/** True only when optional marketing analytics may currently run. */
export function hasAnalyticsConsent(now: number = Date.now()): boolean {
  return getConsentState(now).analyticsAllowed;
}

function emit(): void {
  const state = getConsentState();
  for (const listener of listeners) {
    try {
      listener(state);
    } catch {
      // A misbehaving subscriber must not break consent propagation.
    }
  }
}

/** Subscribe to consent changes. Returns an unsubscribe function. */
export function subscribeConsent(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Persist an explicit decision and notify subscribers. */
export function setConsent(
  decision: AnalyticsDecision,
  now: number = Date.now()
): ResolvedConsent {
  writeRecord(createConsentRecord(decision, { now, gpc: readGpc() }));
  if (decision === "denied") {
    clearFirstPartyAnalyticsData();
  }
  emit();
  return getConsentState(now);
}

export function acceptAnalytics(now: number = Date.now()): ResolvedConsent {
  return setConsent("granted", now);
}

export function rejectAnalytics(now: number = Date.now()): ResolvedConsent {
  return setConsent("denied", now);
}

/**
 * Withdraw consent: record a denial and clear the first-party analytics and
 * attribution data under our control. This prevents future tracking; it cannot
 * retroactively purge data already received by GA4/Clarity servers.
 */
export function withdrawConsent(now: number = Date.now()): ResolvedConsent {
  return rejectAnalytics(now);
}

/**
 * Best-effort removal of first-party analytics/attribution storage under our
 * control: our attribution keys, and GA/Clarity cookies scoped to this host.
 * Third-party/server-side data is out of scope and documented as such.
 */
export function clearFirstPartyAnalyticsData(): void {
  if (!hasWindow()) return;
  try {
    for (const key of FIRST_PARTY_ANALYTICS_KEYS) {
      window.localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
  try {
    // GA (_ga, _ga_*, _gid) and Clarity (_clck, _clsk) drop first-party cookies.
    // Expire any on the current host so a withdrawal stops re-identification.
    const cookies = document.cookie ? document.cookie.split(";") : [];
    for (const cookie of cookies) {
      const name = cookie.split("=")[0]?.trim();
      if (!name) continue;
      if (
        name.startsWith("_ga") ||
        name === "_gid" ||
        name === "_gat" ||
        name.startsWith("_clck") ||
        name.startsWith("_clsk")
      ) {
        expireCookie(name);
      }
    }
  } catch {
    /* ignore */
  }
}

function expireCookie(name: string): void {
  const host = window.location.hostname;
  // Clear on the exact host and on the registrable-domain (leading-dot) scope
  // GA uses, across the root path.
  const domains = [host, `.${host}`];
  const dotParts = host.split(".");
  if (dotParts.length > 2) {
    domains.push(`.${dotParts.slice(-2).join(".")}`);
  }
  const expiry = "expires=Thu, 01 Jan 1970 00:00:00 GMT";
  for (const domain of domains) {
    document.cookie = `${name}=; ${expiry}; path=/; domain=${domain}`;
  }
  document.cookie = `${name}=; ${expiry}; path=/`;
}
