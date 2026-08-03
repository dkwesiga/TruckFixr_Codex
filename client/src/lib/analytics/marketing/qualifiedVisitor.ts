// Qualified-visitor bookkeeping (behavioural label, not identity).
//
// A qualified visitor is a consented, non-internal visitor who satisfies at
// least one of:
//   - accumulates >= 30s of engaged time while the page is visible, OR
//   - views >= 2 public pages, OR
//   - clicks a key CTA (handled at the CTA call site).
//
// Geography (Canada/Ontario) is intentionally NOT evaluated client-side — it is
// unreliable in the browser — and is applied as a GA4/Looker reporting filter
// instead. This module tracks only the behavioural signals. Counting is
// per-visit (session-scoped); the emit layer dedupes to once per visit.
//
// Pure counters (DOM-free) so the thresholds are unit-testable.

/** Engaged-time threshold: 30 seconds of visible, active time. */
export const ENGAGED_TIME_THRESHOLD_MS = 30_000;
/** Distinct public page views that qualify a visitor. */
export const MULTI_PAGE_THRESHOLD = 2;

const SESSION_PAGES_KEY = "tfx_qv_pages";

function hasSession(): boolean {
  try {
    return typeof window !== "undefined" && !!window.sessionStorage;
  } catch {
    return false;
  }
}

/**
 * Record a distinct public page view and return the running count for the
 * visit. De-duplicates identical consecutive paths so a re-render doesn't
 * inflate the count.
 */
export function recordPublicPageView(path: string): number {
  if (!hasSession()) return 1;
  try {
    const raw = window.sessionStorage.getItem(SESSION_PAGES_KEY);
    const seen: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    if (!seen.includes(path)) {
      seen.push(path);
      window.sessionStorage.setItem(
        SESSION_PAGES_KEY,
        JSON.stringify(seen.slice(0, 50))
      );
    }
    return seen.length;
  } catch {
    return 1;
  }
}

/** Pure: does this many distinct public pages qualify the visit? */
export function qualifiesByPages(count: number): boolean {
  return count >= MULTI_PAGE_THRESHOLD;
}

/** Pure: does this much accumulated engaged time qualify the visit? */
export function qualifiesByEngagedTime(engagedMs: number): boolean {
  return engagedMs >= ENGAGED_TIME_THRESHOLD_MS;
}
