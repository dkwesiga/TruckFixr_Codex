// Configuration + environment resolution for marketing analytics.
//
// Reads public Vite env vars and decides WHETHER analytics may run at all. All
// the env/host reasoning is centralized here and kept pure where possible so it
// can be unit-tested by injecting an env/host snapshot. This is a cookieless,
// banner-free setup — GA4 is the only provider.

/** Production hostnames where marketing analytics is permitted to run. */
export const PRODUCTION_HOSTS = ["truckfixr.com", "www.truckfixr.com"];

/** GA4 Measurement IDs look like `G-XXXXXXXXXX` (G- then alphanumerics). */
const GA4_ID_RE = /^G-[A-Z0-9]{6,}$/i;

export interface RawAnalyticsEnv {
  ga4Id?: string;
  debug?: string;
  forceEnable?: string;
  /** import.meta.env.PROD */
  isProdBuild?: boolean;
}

export interface AnalyticsConfig {
  /** Validated GA4 id, or null when absent/malformed (provider disabled). */
  ga4Id: string | null;
  /** Debug logging requested (only honoured in non-production). */
  debugRequested: boolean;
  /** Force-enable outside production for local testing. */
  forceEnable: boolean;
  /** Whether this is a production build (import.meta.env.PROD). */
  isProdBuild: boolean;
  /** Diagnostic warnings for absent/malformed configuration (dev only). */
  warnings: string[];
}

function clean(value: string | undefined): string {
  return (value ?? "").trim();
}

/**
 * Parse + validate raw env into a typed config. Never throws. Malformed IDs are
 * dropped to null (provider safely disabled) with a diagnostic warning that the
 * caller surfaces only in development.
 */
export function parseAnalyticsConfig(env: RawAnalyticsEnv): AnalyticsConfig {
  const warnings: string[] = [];

  const rawGa4 = clean(env.ga4Id);
  let ga4Id: string | null = null;
  if (rawGa4) {
    if (GA4_ID_RE.test(rawGa4)) ga4Id = rawGa4;
    else
      warnings.push(
        `Ignoring malformed VITE_GA4_MEASUREMENT_ID (expected G-XXXXXXXXXX).`
      );
  }

  return {
    ga4Id,
    debugRequested: clean(env.debug) === "true",
    forceEnable: clean(env.forceEnable) === "true",
    isProdBuild: env.isProdBuild === true,
    warnings,
  };
}

/**
 * Decide whether the current ENVIRONMENT permits analytics.
 *
 * Analytics runs only on the real production website: a production build served
 * from a production host. `forceEnable` is an explicit local-testing escape
 * hatch. Previews/staging (non-production host) and local dev are excluded.
 */
export function isProductionEnvironment(
  config: AnalyticsConfig,
  hostname: string
): boolean {
  if (config.forceEnable) return true;
  if (!config.isProdBuild) return false;
  return PRODUCTION_HOSTS.includes(hostname);
}

/**
 * Debug mode is only active in NON-production, when explicitly requested. In
 * debug mode events are logged locally and NEVER sent to GA4.
 */
export function isDebugMode(
  config: AnalyticsConfig,
  hostname: string
): boolean {
  return config.debugRequested && !isProductionEnvironment(config, hostname);
}

/** Read the live Vite env + host into a config. Browser-safe. */
export function loadAnalyticsConfig(): AnalyticsConfig {
  const env = import.meta.env as unknown as Record<
    string,
    string | boolean | undefined
  >;
  return parseAnalyticsConfig({
    ga4Id: env.VITE_GA4_MEASUREMENT_ID as string | undefined,
    debug: env.VITE_ANALYTICS_DEBUG as string | undefined,
    forceEnable: env.VITE_ANALYTICS_FORCE_ENABLE as string | undefined,
    isProdBuild: env.PROD === true,
  });
}
