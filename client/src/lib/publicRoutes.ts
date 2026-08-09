// Single source of truth for which routes are PUBLIC marketing pages.
//
// Marketing analytics (GA4 + Clarity) and the consent banner are allowed ONLY
// on these routes. Everything else — the authenticated app, admin, auth, and
// onboarding — is excluded by default (deny-by-default). Because the public
// site and the signed-in app share one SPA bundle and router, this runtime
// allowlist is the enforcement boundary, so it is deliberately explicit and
// conservative: an unknown route is treated as NON-public.
//
// Pure and DOM-free so it can be unit-tested and reused by both the consent UI
// and the analytics module.

/** Exact public marketing paths. */
const PUBLIC_EXACT = new Set<string>([
  "/", // homepage / landing
  "/landing-v3",
  "/fleet-review", // founder-led review booking (Calendly embed)
  "/pricing",
  "/privacy",
  "/terms",
  "/resources",
  "/fleet-downtime-cost-calculator",
  "/try-one-case",
  "/find-a-part",
  "/pilot-apply",
  "/pilot/accept",
]);

/** Public path prefixes (match the segment boundary, not a bare substring). */
const PUBLIC_PREFIXES = ["/resources/"];

/**
 * Normalize a raw location into a bare pathname: strip query/hash, collapse a
 * trailing slash (except root). Accepts a full URL or a path.
 */
export function normalizePath(input: string): string {
  let path = input ?? "/";
  // Drop origin if a full URL was passed.
  const schemeIdx = path.indexOf("://");
  if (schemeIdx !== -1) {
    const rest = path.slice(schemeIdx + 3);
    const slash = rest.indexOf("/");
    path = slash === -1 ? "/" : rest.slice(slash);
  }
  // Strip query and hash.
  path = path.split("?")[0].split("#")[0];
  if (!path) return "/";
  if (!path.startsWith("/")) path = `/${path}`;
  // Collapse trailing slash except for root.
  if (path.length > 1 && path.endsWith("/")) path = path.replace(/\/+$/, "");
  return path || "/";
}

/**
 * True when `path` is a public marketing route where analytics/consent may run.
 * Deny-by-default: anything not explicitly listed is treated as non-public
 * (e.g. the authenticated app, admin, auth, onboarding).
 */
export function isPublicMarketingRoute(path: string): boolean {
  const p = normalizePath(path);
  if (PUBLIC_EXACT.has(p)) return true;
  return PUBLIC_PREFIXES.some(prefix => p.startsWith(prefix));
}
