// Transient campaign (UTM) reader — no device storage.
//
// In the cookieless, banner-free setup we do NOT persist attribution on the
// visitor's device. We simply read the current URL's UTM parameters in memory
// and attach them (normalized, allowlisted, non-PII) to events for the current
// page. Cross-session first/recent-touch attribution is left to GA4's own
// server-side modelling. Pure and DOM-free.

const UTM_MAX_LEN = 60;

export function normalizeUtm(
  value: string | null | undefined
): string | undefined {
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
 * Read normalized UTM params from a query string. Returns only allowlisted keys,
 * and only when a real campaign is present (`utm_source|medium|campaign`). Never
 * stored anywhere.
 */
export function readCampaignParams(search: string): Record<string, string> {
  const params = new URLSearchParams(search || "");
  const source = normalizeUtm(params.get("utm_source"));
  const medium = normalizeUtm(params.get("utm_medium"));
  const campaign = normalizeUtm(params.get("utm_campaign"));
  const content = normalizeUtm(params.get("utm_content"));
  if (!source && !medium && !campaign) return {};

  const out: Record<string, string> = {};
  if (source) out.utm_source = source;
  if (medium) out.utm_medium = medium;
  if (campaign) out.utm_campaign = campaign;
  if (content) out.utm_content = content;
  return out;
}
