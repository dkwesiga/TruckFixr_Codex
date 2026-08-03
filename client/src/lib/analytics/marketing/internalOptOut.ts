// Reversible internal-traffic opt-out for Dickson and developers.
//
// Intentionally NOT tied to personal identity (no name/email/IP in the repo).
// A durable localStorage flag suppresses ALL marketing analytics on this
// browser. It can be toggled via a URL parameter so it is easy to enable on a
// device without code, and it works alongside GA4's server-side internal-traffic
// filter (belt and suspenders).
//
//   Enable  : visit any page with ?tfx_internal=1
//   Disable : visit any page with ?tfx_internal=0
//
// Pure helpers (no DOM) are exported for testing; the DOM wrappers are guarded.

export const INTERNAL_OPTOUT_KEY = "tfx_internal_optout";
export const INTERNAL_OPTOUT_PARAM = "tfx_internal";

/** Pure: given a query string, does it toggle the opt-out on/off (or neither)? */
export function readOptOutIntent(search: string): "enable" | "disable" | null {
  const params = new URLSearchParams(search || "");
  if (!params.has(INTERNAL_OPTOUT_PARAM)) return null;
  const value = params.get(INTERNAL_OPTOUT_PARAM);
  if (value === "1" || value === "true") return "enable";
  if (value === "0" || value === "false") return "disable";
  return null;
}

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

/** Whether this browser is flagged as internal (analytics suppressed). */
export function isInternalTraffic(): boolean {
  if (!hasWindow()) return false;
  try {
    return window.localStorage.getItem(INTERNAL_OPTOUT_KEY) === "1";
  } catch {
    return false;
  }
}

export function setInternalTraffic(enabled: boolean): void {
  if (!hasWindow()) return;
  try {
    if (enabled) window.localStorage.setItem(INTERNAL_OPTOUT_KEY, "1");
    else window.localStorage.removeItem(INTERNAL_OPTOUT_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Apply any `?tfx_internal=` toggle present in the current URL. Returns the
 * resulting internal state. Called once during analytics init.
 */
export function applyInternalOptOutFromUrl(search: string): boolean {
  const intent = readOptOutIntent(search);
  if (intent === "enable") setInternalTraffic(true);
  else if (intent === "disable") setInternalTraffic(false);
  return isInternalTraffic();
}
