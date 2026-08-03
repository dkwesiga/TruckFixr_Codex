// Pure UTM link builder shared by the CLI (scripts/marketing/utm.ts) and its
// tests. No Node/DOM dependencies so it runs anywhere and is unit-tested under
// the repo's vitest include globs (shared/**).
//
// Rules: predefined channels, normalize everything to lowercase snake_case,
// validate required fields, and REJECT values that look like personal
// information (emails, phone numbers). Campaign labels like `post_downtime` or
// `dm_fleet_manager` are fine — we only block genuine PII, not harmless labels.

export const PRODUCTION_ORIGIN = "https://truckfixr.com";

export interface Channel {
  key: string;
  source: string;
  medium: string;
  description: string;
  /** Example campaign labels for --help. */
  examples: string[];
}

/** Predefined outreach channels. */
export const CHANNELS: Record<string, Channel> = {
  linkedin_post: {
    key: "linkedin_post",
    source: "linkedin",
    medium: "social",
    description: "LinkedIn organic posts",
    examples: ["post_downtime", "post_preventive_maintenance"],
  },
  linkedin_dm: {
    key: "linkedin_dm",
    source: "linkedin",
    medium: "dm",
    description: "LinkedIn direct messages",
    examples: ["dm_fleet_manager", "dm_owner_operator"],
  },
  email: {
    key: "email",
    source: "email",
    medium: "outreach",
    description: "Email outreach",
    examples: ["outreach_q3", "followup_pilot"],
  },
  event: {
    key: "event",
    source: "event",
    medium: "event",
    description: "Events and accelerators",
    examples: ["yc_demo_day", "truck_world_2026"],
  },
  partner: {
    key: "partner",
    source: "partner",
    medium: "referral",
    description: "Partner referrals",
    examples: ["mr_diesel", "shop_network"],
  },
};

const MAX_LEN = 60;

const PII_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /[\w.+-]+@[\w-]+\.[\w.-]+/, label: "an email address" },
  { re: /(?:\+?\d[\s().-]?){10,}/, label: "a phone number" },
];

export interface BuildInput {
  channel: string;
  campaign: string;
  content?: string;
  /** Destination path on truckfixr.com (defaults to "/"). */
  path?: string;
}

export interface BuildResult {
  ok: boolean;
  url?: string;
  errors: string[];
  warnings: string[];
  /** The normalized parts, for display/tests. */
  parts?: {
    source: string;
    medium: string;
    campaign: string;
    content?: string;
    path: string;
  };
}

/** Lowercase snake_case normalization for a UTM token. */
export function normalizeToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .trim()
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, MAX_LEN);
}

function detectPii(raw: string): string | null {
  for (const { re, label } of PII_PATTERNS) {
    if (re.test(raw)) return label;
  }
  return null;
}

/** Sanitize a destination path to a same-origin, query/hash-free path. */
export function normalizePath(input: string | undefined): string {
  if (!input) return "/";
  let p = input.trim();
  // Strip an accidental full origin.
  p = p.replace(/^https?:\/\/[^/]+/i, "");
  p = p.split("?")[0].split("#")[0];
  if (!p.startsWith("/")) p = `/${p}`;
  return p.replace(/\s+/g, "");
}

/**
 * Build a validated, campaign-tagged URL for a channel. Never throws; returns a
 * result with errors/warnings so the CLI can print them.
 */
export function buildUtmUrl(input: BuildInput): BuildResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const channel = CHANNELS[input.channel];
  if (!channel) {
    errors.push(
      `Unknown channel "${input.channel}". Valid channels: ${Object.keys(CHANNELS).join(", ")}.`
    );
    return { ok: false, errors, warnings };
  }

  if (!input.campaign || !input.campaign.trim()) {
    errors.push("A campaign name is required (e.g. post_downtime).");
  }

  // Reject genuine PII in campaign/content.
  for (const [field, value] of [
    ["campaign", input.campaign],
    ["content", input.content ?? ""],
  ] as const) {
    if (!value) continue;
    const pii = detectPii(value);
    if (pii)
      errors.push(
        `The ${field} looks like it contains ${pii}; UTMs must not carry personal data.`
      );
  }

  if (errors.length) return { ok: false, errors, warnings };

  const campaign = normalizeToken(input.campaign);
  const content = input.content ? normalizeToken(input.content) : undefined;
  if (campaign !== input.campaign.trim().toLowerCase()) {
    warnings.push(`Campaign normalized to "${campaign}".`);
  }
  if (!campaign) {
    errors.push("Campaign is empty after normalization; use letters/numbers.");
    return { ok: false, errors, warnings };
  }

  const path = normalizePath(input.path);
  const url = new URL(PRODUCTION_ORIGIN + path);
  url.searchParams.set("utm_source", channel.source);
  url.searchParams.set("utm_medium", channel.medium);
  url.searchParams.set("utm_campaign", campaign);
  if (content) url.searchParams.set("utm_content", content);

  return {
    ok: true,
    url: url.toString(),
    errors,
    warnings,
    parts: {
      source: channel.source,
      medium: channel.medium,
      campaign,
      content,
      path,
    },
  };
}
