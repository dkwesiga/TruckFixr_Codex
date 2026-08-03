// Page path/type helpers. Analytics never receives a full URL or a query
// string (those can carry PII or UTMs); only a clean pathname and a coarse
// page-type bucket.

import { normalizePath } from "@/lib/publicRoutes";
import type { PageType } from "./events";

/** Bare, query/hash-free pathname, length-limited. Safe for `page_path`. */
export function sanitizePagePath(input: string): string {
  return normalizePath(input).slice(0, 128);
}

/** Map a pathname to a coarse, stable page-type bucket. */
export function resolvePageType(input: string): PageType {
  const p = normalizePath(input);
  if (p === "/" || p === "/landing-v3") return "landing";
  if (p === "/pricing") return "pricing";
  if (p === "/fleet-review") return "booking";
  if (p === "/privacy" || p === "/terms") return "legal";
  if (p === "/fleet-downtime-cost-calculator") return "calculator";
  if (p === "/resources" || p.startsWith("/resources/")) return "resources";
  return "other";
}

/** True when the path is the primary landing page (drives landing_page_view). */
export function isLandingPath(input: string): boolean {
  const p = normalizePath(input);
  return p === "/" || p === "/landing-v3";
}
