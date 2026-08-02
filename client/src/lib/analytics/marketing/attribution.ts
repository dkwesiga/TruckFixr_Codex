// Campaign attribution: first-touch + most-recent-touch UTM capture.
//
// Privacy rules (enforced here):
//  - Persisted ONLY after analytics consent. Before consent, UTMs may be read
//    transiently for the current page but never written to any browser store.
//  - Strict allowlist (source/medium/campaign/content), lowercased + length
//    limited. Never carries personal information.
//  - First-touch is immutable for 90 days; recent-touch updates on each new
//    valid campaign. Both expire after 90 days.
//
// The pure functions (parse/normalize/merge/expiry) are DOM-free and tested;
// the read/write wrappers guard localStorage access.

export const ATTRIBUTION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const FIRST_TOUCH_KEY = "tfx_attribution_first";
export const RECENT_TOUCH_KEY = "tfx_attribution_recent";

const UTM_MAX_LEN = 60;

export interface Touch {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  /** Epoch ms this touch was captured. */
  ts: number;
}

function normalizeUtm(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const v = value
    .toLowerCase()
    .replace(/[^\w.\- ]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, UTM_MAX_LEN);
  return v || undefined;
}

/**
 * Extract a normalized touch from a query string, or null when no campaign
 * parameters are present. `utm_source` OR `utm_medium` OR `utm_campaign` must be
 * present for a touch to count (bare `utm_content` alone is ignored).
 */
export function parseTouch(search: string, now: number): Touch | null {
  const params = new URLSearchParams(search || "");
  const source = normalizeUtm(params.get("utm_source"));
  const medium = normalizeUtm(params.get("utm_medium"));
  const campaign = normalizeUtm(params.get("utm_campaign"));
  const content = normalizeUtm(params.get("utm_content"));
  if (!source && !medium && !campaign) return null;
  return { source, medium, campaign, content, ts: now };
}

export function isTouchFresh(touch: Touch | null, now: number): touch is Touch {
  if (!touch) return false;
  if (typeof touch.ts !== "number") return false;
  return now - touch.ts < ATTRIBUTION_TTL_MS && now >= touch.ts;
}

export function parseStoredTouch(raw: string | null): Touch | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed.ts !== "number") return null;
    return {
      source: typeof parsed.source === "string" ? parsed.source : undefined,
      medium: typeof parsed.medium === "string" ? parsed.medium : undefined,
      campaign:
        typeof parsed.campaign === "string" ? parsed.campaign : undefined,
      content: typeof parsed.content === "string" ? parsed.content : undefined,
      ts: parsed.ts,
    };
  } catch {
    return null;
  }
}

/** Flatten touches into allowlisted analytics params (first + recent). */
export function touchesToParams(
  first: Touch | null,
  recent: Touch | null
): Record<string, string> {
  const out: Record<string, string> = {};
  if (first) {
    if (first.source) out.first_touch_source = first.source;
    if (first.medium) out.first_touch_medium = first.medium;
    if (first.campaign) out.first_touch_campaign = first.campaign;
  }
  if (recent) {
    if (recent.source) out.recent_touch_source = recent.source;
    if (recent.medium) out.recent_touch_medium = recent.medium;
    if (recent.campaign) out.recent_touch_campaign = recent.campaign;
    if (recent.source) out.utm_source = recent.source;
    if (recent.medium) out.utm_medium = recent.medium;
    if (recent.campaign) out.utm_campaign = recent.campaign;
    if (recent.content) out.utm_content = recent.content;
  }
  return out;
}

// ── Browser storage wrappers (consent-gated) ─────────────────────────────────

function hasStorage(): boolean {
  try {
    return typeof window !== "undefined" && !!window.localStorage;
  } catch {
    return false;
  }
}

function readTouch(key: string, now: number): Touch | null {
  if (!hasStorage()) return null;
  try {
    const touch = parseStoredTouch(window.localStorage.getItem(key));
    return isTouchFresh(touch, now) ? touch : null;
  } catch {
    return null;
  }
}

function writeTouch(key: string, touch: Touch): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(touch));
  } catch {
    /* ignore */
  }
}

/**
 * Record the current page's campaign, honouring consent:
 *  - hasConsent=false → do NOT persist anything. Return the transient touch (if
 *    any) flattened, for current-page use only.
 *  - hasConsent=true  → persist first-touch (only if none fresh) and update
 *    recent-touch when a new valid campaign is present.
 * Returns the attribution params to attach to events.
 */
export function captureAttribution(args: {
  search: string;
  hasConsent: boolean;
  now: number;
}): Record<string, string> {
  const { search, hasConsent, now } = args;
  const incoming = parseTouch(search, now);

  if (!hasConsent) {
    // Transient: reflect the current campaign for this page only; never store.
    return incoming ? touchesToParams(incoming, incoming) : {};
  }

  let first = readTouch(FIRST_TOUCH_KEY, now);
  let recent = readTouch(RECENT_TOUCH_KEY, now);

  if (incoming) {
    if (!first) {
      first = incoming;
      writeTouch(FIRST_TOUCH_KEY, first); // immutable within the 90-day window
    }
    recent = incoming;
    writeTouch(RECENT_TOUCH_KEY, recent); // recent-touch always updates
  }

  return touchesToParams(first, recent);
}
