// Visitor-facing analytics opt-out.
//
// With no consent banner, we still give every visitor a permanent, one-click way
// to turn analytics off (the footer "Do not track me" control). Persisting a
// user's OPT-OUT preference does not itself require consent — honouring a stated
// choice is a strictly-necessary function — so a small localStorage flag is fine.
//
// Distinct from the staff internal opt-out (internalOptOut.ts). Either one being
// set suppresses all analytics on this browser.

export const ANALYTICS_OPTOUT_KEY = "tfx_analytics_optout";

type Listener = () => void;
const listeners = new Set<Listener>();

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

/** Whether this visitor has opted out of analytics on this browser. */
export function isOptedOut(): boolean {
  if (!hasWindow()) return false;
  try {
    return window.localStorage.getItem(ANALYTICS_OPTOUT_KEY) === "1";
  } catch {
    return false;
  }
}

/** Set or clear the opt-out and notify subscribers. */
export function setOptedOut(optedOut: boolean): void {
  if (hasWindow()) {
    try {
      if (optedOut) window.localStorage.setItem(ANALYTICS_OPTOUT_KEY, "1");
      else window.localStorage.removeItem(ANALYTICS_OPTOUT_KEY);
    } catch {
      /* ignore */
    }
  }
  for (const l of listeners) {
    try {
      l();
    } catch {
      /* ignore */
    }
  }
}

export function subscribeOptOut(listener: Listener): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
