// Event schema + parameter sanitization for marketing analytics.
//
// This is the safety boundary between feature code and the analytics providers.
// Only allowlisted event names and allowlisted, sanitized parameters can ever
// reach GA4/Clarity. Anything else is dropped. There is deliberately no way to
// pass free-form user text through as a value.

/** Stable snake_case marketing event names. */
export type MarketingEventName =
  | "landing_page_view"
  | "public_page_view"
  | "qualified_visitor"
  | "evaluation_cta_click"
  | "calendly_opened"
  | "meeting_scheduled"
  | "contact_click"
  | "section_view"
  | "pricing_or_pilot_view";
// NOTE: `demo_video_play` is intentionally omitted — the landing has no demo
// video. Add it here only if/when a real <video> ships.

export const MARKETING_EVENT_NAMES: readonly MarketingEventName[] = [
  "landing_page_view",
  "public_page_view",
  "qualified_visitor",
  "evaluation_cta_click",
  "calendly_opened",
  "meeting_scheduled",
  "contact_click",
  "section_view",
  "pricing_or_pilot_view",
];

/** Stable CTA locations. Unknown locations normalize to `other`. */
export const CTA_LOCATIONS = [
  "navigation",
  "hero",
  "mid_page",
  "final_cta",
  "footer",
  "sticky_mobile",
  "other",
] as const;
export type CtaLocation = (typeof CTA_LOCATIONS)[number];

/** Stable landing section names. Unknown sections normalize to `other`. */
export const SECTION_NAMES = [
  "problem",
  "workflow",
  "validation",
  "demo",
  "final_cta",
  "other",
] as const;
export type SectionName = (typeof SECTION_NAMES)[number];

/** Page type buckets (never a raw path with query/PII). */
export const PAGE_TYPES = [
  "landing",
  "pricing",
  "resources",
  "booking",
  "legal",
  "calculator",
  "other",
] as const;
export type PageType = (typeof PAGE_TYPES)[number];

/**
 * The ONLY parameter keys allowed to reach a provider. Any other key on an
 * event payload is dropped during sanitization.
 */
export const ALLOWED_PARAM_KEYS = [
  "page_path",
  "page_type",
  "cta_location",
  "cta_text",
  "section_name",
  "link_type",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "first_touch_source",
  "first_touch_medium",
  "first_touch_campaign",
  "recent_touch_source",
  "recent_touch_medium",
  "recent_touch_campaign",
  "qualifier",
  "engaged_seconds",
] as const;
export type AllowedParamKey = (typeof ALLOWED_PARAM_KEYS)[number];

export type MarketingEventParams = Partial<
  Record<AllowedParamKey, string | number>
>;

/** Max length for any free-ish string value (e.g. normalized CTA text). */
const MAX_VALUE_LENGTH = 60;

/**
 * Keys that must NEVER appear — even if someone allowlisted them by mistake.
 * A defensive second layer over the allowlist.
 */
const FORBIDDEN_KEY_RE =
  /(email|phone|name|company|vin|plate|password|token|secret|user[-_ ]?id|address|challenge|answer|message|note)/i;

/** Patterns that indicate a value itself may carry PII. Such values are dropped. */
const PII_VALUE_RE = [
  /[\w.+-]+@[\w-]+\.[\w.-]+/, // email
  /(?:\+?\d[\s().-]?){10,}/, // phone-like
];

export function isMarketingEventName(name: string): name is MarketingEventName {
  return (MARKETING_EVENT_NAMES as readonly string[]).includes(name);
}

export function normalizeCtaLocation(value: string | undefined): CtaLocation {
  const v = (value ?? "").trim().toLowerCase();
  return (CTA_LOCATIONS as readonly string[]).includes(v)
    ? (v as CtaLocation)
    : "other";
}

export function normalizeSectionName(value: string | undefined): SectionName {
  const v = (value ?? "").trim().toLowerCase();
  return (SECTION_NAMES as readonly string[]).includes(v)
    ? (v as SectionName)
    : "other";
}

/**
 * Normalize CTA/display text into a safe, stable token: lowercased, collapsed
 * whitespace, snake_cased, stripped of punctuation, length-limited. Never used
 * to carry user-generated text (call sites pass fixed CTA labels only).
 */
export function normalizeCtaText(value: string | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .trim()
    .replace(/[\s-]+/g, "_")
    .slice(0, MAX_VALUE_LENGTH);
}

function sanitizeValue(value: string | number): string | number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  for (const re of PII_VALUE_RE) {
    if (re.test(trimmed)) return null; // looks like PII — drop entirely
  }
  return trimmed.slice(0, MAX_VALUE_LENGTH);
}

/**
 * Reduce an arbitrary params object to the allowlisted, sanitized, non-PII set
 * that may be sent. Unknown keys, forbidden keys, and PII-looking values are
 * dropped. Returns a fresh object; never mutates the input.
 */
export function sanitizeParams(
  params: Record<string, unknown> | undefined
): MarketingEventParams {
  if (!params) return {};
  const out: Record<string, string | number> = {};
  for (const key of ALLOWED_PARAM_KEYS) {
    if (!(key in params)) continue;
    if (FORBIDDEN_KEY_RE.test(key)) continue; // paranoia: allowlist ∩ forbidden = ∅
    const raw = params[key];
    if (typeof raw !== "string" && typeof raw !== "number") continue;
    const safe = sanitizeValue(raw);
    if (safe === null) continue;
    out[key] = safe;
  }
  return out;
}
