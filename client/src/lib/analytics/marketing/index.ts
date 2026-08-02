// Central marketing-analytics module — the ONLY thing feature code calls.
//
// COOKIELESS, BANNER-FREE. Feature code never touches gtag or window globals
// directly. It calls the typed trackers here, and this module enforces every
// guard (production, public route, internal opt-out, visitor opt-out, GPC/DNT,
// debug), sanitizes parameters, attaches non-persistent campaign params + page
// context, deduplicates, and fails safe.
//
// Analytics failure must NEVER interrupt navigation, CTA clicks, or booking —
// every public function is wrapped so it cannot throw into caller code.

import { isPublicMarketingRoute } from "@/lib/publicRoutes";
import {
  isDebugMode,
  isProductionEnvironment,
  loadAnalyticsConfig,
  type AnalyticsConfig,
} from "./config";
import {
  canInitializeProviders,
  resolveAnalyticsMode,
  type GateInputs,
} from "./gate";
import {
  isMarketingEventName,
  normalizeCtaLocation,
  normalizeCtaText,
  normalizeSectionName,
  sanitizeParams,
  type CtaLocation,
  type MarketingEventName,
  type SectionName,
} from "./events";
import { resolvePageType, sanitizePagePath, isLandingPath } from "./page";
import { readCampaignParams } from "./campaign";
import {
  firstTimeThisPageView,
  firstTimeThisSession,
  resetPageViewDedupe,
} from "./dedupe";
import {
  applyInternalOptOutFromUrl,
  isInternalTraffic,
} from "./internalOptOut";
import { isOptedOut } from "./optOut";
import { honoursDoNotTrack } from "./privacySignals";
import { ga4Track, initGa4 } from "./providers/ga4";

let config: AnalyticsConfig | null = null;
let currentPath = "/";
let campaignParams: Record<string, string> = {};
let warnedThisSession = false;

function getConfig(): AnalyticsConfig {
  if (!config) config = loadAnalyticsConfig();
  return config;
}

function hostname(): string {
  return typeof window !== "undefined" ? window.location.hostname : "";
}

function currentSearch(): string {
  return typeof window !== "undefined" ? window.location.search : "";
}

function gateInputs(path: string): GateInputs {
  const cfg = getConfig();
  const host = hostname();
  return {
    isProduction: isProductionEnvironment(cfg, host),
    isPublicRoute: isPublicMarketingRoute(path),
    isInternal: isInternalTraffic(),
    isOptedOut: isOptedOut(),
    respectSignal: honoursDoNotTrack(),
    isDebug: isDebugMode(cfg, host),
  };
}

/** Emit dev-only diagnostics without leaking anything sensitive. */
function devWarnOnce(): void {
  const cfg = getConfig();
  if (warnedThisSession || cfg.warnings.length === 0) return;
  if (!isProductionEnvironment(cfg, hostname())) {
    for (const w of cfg.warnings) console.warn(`[marketing-analytics] ${w}`);
  }
  warnedThisSession = true;
}

/**
 * Core event emitter. Applies the gate, sanitizes, attaches attribution + page
 * context, and routes to providers / debug / drop. Never throws.
 */
function emit(
  name: MarketingEventName,
  params: Record<string, unknown> = {},
  dedupe?: { key: string; scope: "page" | "session" }
): void {
  try {
    if (!isMarketingEventName(name)) return;
    const inputs = gateInputs(currentPath);
    const mode = resolveAnalyticsMode(inputs);
    if (mode === "drop") return;

    if (dedupe) {
      const first =
        dedupe.scope === "session"
          ? firstTimeThisSession(dedupe.key)
          : firstTimeThisPageView(dedupe.key);
      if (!first) return;
    }

    const safe = sanitizeParams({
      page_path: sanitizePagePath(currentPath),
      page_type: resolvePageType(currentPath),
      ...campaignParams,
      ...params,
    });

    if (mode === "debug") {
      // Debug mode: log a sanitized event; NEVER contact GA4.
      // eslint-disable-next-line no-console
      console.debug(`[marketing-analytics] ${name}`, safe);
      return;
    }

    // mode === "send" (cookieless GA4)
    ga4Track(name, safe);
  } catch {
    /* analytics must never break the app */
  }
}

/**
 * Initialize/sync analytics for the current route. Call on app mount and on
 * every client navigation. Applies the internal opt-out toggle, initializes GA4
 * (cookieless) per the gate, reads current-page campaign params, and resets
 * per-page dedupe.
 */
export function syncMarketingAnalytics(path: string): void {
  try {
    const previousPath = currentPath;
    currentPath = sanitizePagePath(path);
    devWarnOnce();

    // Honour ?tfx_internal= toggles on any navigation.
    applyInternalOptOutFromUrl(currentSearch());

    const inputs = gateInputs(currentPath);

    // Read current-page UTMs in memory only — never persisted to the device.
    campaignParams = inputs.isPublicRoute
      ? readCampaignParams(currentSearch())
      : {};

    if (canInitializeProviders(inputs)) {
      initGa4(getConfig().ga4Id);
    }

    if (previousPath !== currentPath) {
      resetPageViewDedupe();
    }
  } catch {
    /* never break navigation */
  }
}

/** Re-evaluate after an opt-out change (visitor toggled the footer control). */
export function onOptOutChanged(): void {
  syncMarketingAnalytics(currentPath);
}

// ── Typed trackers (the public surface feature code uses) ────────────────────

/** Fire on every public page view (and landing_page_view on the landing). */
export function trackPageView(path: string): void {
  syncMarketingAnalytics(path);
  const key = `pv_${sanitizePagePath(path)}`;
  emit("public_page_view", {}, { key, scope: "page" });
  if (isLandingPath(path)) {
    emit("landing_page_view", {}, { key: `lpv_${key}`, scope: "page" });
  }
  const type = resolvePageType(path);
  if (type === "pricing" || type === "booking") {
    emit("pricing_or_pilot_view", {}, { key: `pop_${key}`, scope: "page" });
  }
}

/** Fire when a booking/evaluation CTA is clicked. Never blocks navigation. */
export function trackEvaluationCtaClick(args: {
  location: string;
  text: string;
  linkType?: string;
}): void {
  emit("evaluation_cta_click", {
    cta_location: normalizeCtaLocation(args.location) satisfies CtaLocation,
    cta_text: normalizeCtaText(args.text),
    ...(args.linkType ? { link_type: args.linkType } : {}),
  });
  // An evaluation CTA click is high intent → also a qualified visitor.
  trackQualifiedVisitor("cta_click");
}

/** Fire when the Calendly embed is opened/shown. Deduped per session. */
export function trackCalendlyOpened(): void {
  emit("calendly_opened", {}, { key: "calendly_opened", scope: "session" });
}

/** Fire on a confirmed Calendly booking. Deduped per session (once per visit). */
export function trackMeetingScheduled(): void {
  emit("meeting_scheduled", {}, { key: "meeting_scheduled", scope: "session" });
}

/** Fire on a contact interaction (mailto / phone / contact link). */
export function trackContactClick(linkType: string): void {
  emit("contact_click", { link_type: normalizeCtaText(linkType) });
}

/** Fire once per section per page view when it becomes sufficiently visible. */
export function trackSectionView(section: string): void {
  const name = normalizeSectionName(section) satisfies SectionName;
  emit(
    "section_view",
    { section_name: name },
    { key: `section_${name}`, scope: "page" }
  );
}

/** Fire once per visit when the visitor meets a qualified-visitor condition. */
export function trackQualifiedVisitor(
  qualifier: "engaged_time" | "multi_page" | "cta_click"
): void {
  emit(
    "qualified_visitor",
    { qualifier },
    { key: "qualified_visitor", scope: "session" }
  );
}

/** Test/introspection helpers. */
export function __getCurrentPathForTests(): string {
  return currentPath;
}
export function __resetModuleForTests(): void {
  config = null;
  currentPath = "/";
  campaignParams = {};
  warnedThisSession = false;
}
