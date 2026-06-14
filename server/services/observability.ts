import { ENV } from "../_core/env";

/**
 * Redacted production observability.
 *
 * This module is the single backend entry point for structured, privacy-first
 * monitoring events (backend/API errors, AI provider failures, Supabase/DB
 * errors, Stripe webhook failures, slow routes, failed workflows, and browser
 * runtime errors forwarded from the client).
 *
 * Design goals:
 *   - Self-contained: no third-party telemetry SDK or extra client bundle, in
 *     line with the existing MVP decision to keep analytics a no-op.
 *   - Privacy-first: every message and context value is redacted for emails,
 *     VINs, phone numbers, secrets/tokens, JWTs, and base64 data URLs before it
 *     is emitted anywhere.
 *   - Safe by construction: recording an event NEVER throws and never blocks the
 *     request path. Sinks are best-effort.
 *   - Groundable: keeps a bounded in-memory ring buffer plus counters so the
 *     weekly review (and a staff-only endpoint) can read real failure rates
 *     without standing up external infrastructure first.
 */

export type ObservabilitySeverity =
  | "debug"
  | "info"
  | "warning"
  | "error"
  | "critical";

export type ObservabilityCategory =
  | "backend"
  | "ai_provider"
  | "supabase"
  | "stripe"
  | "browser"
  | "performance"
  | "workflow"
  | "startup";

export type ObservabilityContext = Record<string, unknown>;

export type ObservabilityEvent = {
  category: ObservabilityCategory;
  /** Stable machine-readable name, e.g. "trpc_error" or "ai_call_fallback". */
  event: string;
  severity?: ObservabilitySeverity;
  message?: string;
  context?: ObservabilityContext;
  durationMs?: number;
  statusCode?: number;
  route?: string;
};

export type RecordedObservabilityEvent = {
  ts: string;
  category: ObservabilityCategory;
  event: string;
  severity: ObservabilitySeverity;
  message?: string;
  context?: ObservabilityContext;
  durationMs?: number;
  statusCode?: number;
  route?: string;
};

export type ObservabilitySummary = {
  enabled: boolean;
  total: number;
  firstEventAt: string | null;
  lastEventAt: string | null;
  byCategory: Record<string, number>;
  bySeverity: Record<string, number>;
  topEvents: Array<{ event: string; count: number }>;
  recent: RecordedObservabilityEvent[];
};

type ObservabilityRuntimeConfig = {
  enabled: boolean;
  minSeverity: ObservabilitySeverity;
  console: boolean;
  webhookUrl: string;
};

const SEVERITY_RANK: Record<ObservabilitySeverity, number> = {
  debug: 10,
  info: 20,
  warning: 30,
  error: 40,
  critical: 50,
};

const MAX_BUFFER = 200;
const MAX_STRING_LENGTH = 600;
const MAX_CONTEXT_DEPTH = 4;
const MAX_ARRAY_ITEMS = 20;
const MAX_OBJECT_KEYS = 40;
const REDACTED = "[redacted]";

// Context keys whose entire value should be dropped regardless of content.
const SENSITIVE_KEY_RE =
  /(pass(word|phrase)?|secret|token|authorization|auth|api[-_ ]?key|cookie|session|bearer|signature|stripe[-_ ]?signature|ssn|vin|email|phone|client[-_ ]?reference)/i;

function defaultConfig(): ObservabilityRuntimeConfig {
  return {
    enabled: ENV.observabilityEnabled,
    minSeverity: normalizeSeverity(ENV.observabilityMinSeverity, "info"),
    console: true,
    webhookUrl: ENV.observabilityWebhookUrl,
  };
}

let runtimeConfig: ObservabilityRuntimeConfig = defaultConfig();
const buffer: RecordedObservabilityEvent[] = [];
const counters = {
  total: 0,
  firstEventAt: null as string | null,
  lastEventAt: null as string | null,
  byCategory: {} as Record<string, number>,
  bySeverity: {} as Record<string, number>,
  byEvent: {} as Record<string, number>,
};

export function normalizeSeverity(
  value: unknown,
  fallback: ObservabilitySeverity = "info"
): ObservabilitySeverity {
  const text = String(value ?? "").trim().toLowerCase();
  if (text in SEVERITY_RANK) {
    return text as ObservabilitySeverity;
  }
  // Friendly aliases from client runtimes.
  if (text === "warn") return "warning";
  if (text === "err" || text === "fatal") return text === "fatal" ? "critical" : "error";
  return fallback;
}

/**
 * Redact a free-text string. Conservative: it masks rather than deletes so log
 * lines stay readable while never leaking the underlying identifier.
 */
export function redactString(input: string): string {
  let value = input;

  // Base64 data URLs (e.g. inline evidence photos) — keep the prefix only.
  value = value.replace(
    /data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,[A-Za-z0-9+/=]+/gi,
    "data:$1;base64,[redacted]"
  );

  // JWT-shaped tokens.
  value = value.replace(
    /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g,
    REDACTED
  );

  // Bearer tokens.
  value = value.replace(/\b(Bearer)\s+[A-Za-z0-9._\-]+/gi, "$1 [redacted]");

  // Provider-style secret keys (sk-..., sk_live_..., pk_test_..., whsec_...).
  value = value.replace(
    /\b(sk|pk|rk|whsec)[-_][A-Za-z0-9_-]{6,}\b/gi,
    "$1_[redacted]"
  );

  // Emails — keep first char + domain for debuggability.
  value = value.replace(
    /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g,
    "$1***@$2"
  );

  // VIN (17 chars, excludes I/O/Q). Mask the middle.
  value = value.replace(
    /\b([A-HJ-NPR-Z0-9]{17})\b/gi,
    (match) => `${match.slice(0, 3)}***${match.slice(-2)}`
  );

  // Phone numbers (NA-style, 10+ digits with optional separators).
  value = value.replace(
    /(?<![\d])(\+?\d[\d\s().-]{8,}\d)(?![\d])/g,
    (match) => {
      const digits = match.replace(/\D/g, "");
      if (digits.length < 10) return match;
      return `***${digits.slice(-2)}`;
    }
  );

  if (value.length > MAX_STRING_LENGTH) {
    value = `${value.slice(0, MAX_STRING_LENGTH)}…`;
  }

  return value;
}

function redactValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value == null) return value;

  if (typeof value === "string") {
    return redactString(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
    };
  }

  if (depth >= MAX_CONTEXT_DEPTH) {
    return "[truncated]";
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) return "[circular]";
    seen.add(value);
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => redactValue(item, depth + 1, seen));
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (seen.has(obj)) return "[circular]";
    seen.add(obj);
    const out: Record<string, unknown> = {};
    const keys = Object.keys(obj).slice(0, MAX_OBJECT_KEYS);
    for (const key of keys) {
      if (SENSITIVE_KEY_RE.test(key)) {
        out[key] = REDACTED;
        continue;
      }
      out[key] = redactValue(obj[key], depth + 1, seen);
    }
    return out;
  }

  return "[unserializable]";
}

export function redactContext(
  context: ObservabilityContext | undefined
): ObservabilityContext | undefined {
  if (!context) return undefined;
  const redacted = redactValue(context, 0, new WeakSet()) as ObservabilityContext;
  return redacted && Object.keys(redacted).length > 0 ? redacted : undefined;
}

function meetsMinSeverity(severity: ObservabilitySeverity) {
  return SEVERITY_RANK[severity] >= SEVERITY_RANK[runtimeConfig.minSeverity];
}

function emitToConsole(record: RecordedObservabilityEvent) {
  if (!runtimeConfig.console) return;

  const line = `[Observability] ${record.category}.${record.event}`;
  // Keep the structured payload as a second argument so host log drains can
  // parse it, while the message stays grep-friendly.
  if (record.severity === "error" || record.severity === "critical") {
    console.error(line, record);
  } else if (record.severity === "warning") {
    console.warn(line, record);
  } else {
    console.info(line, record);
  }
}

function emitToWebhook(record: RecordedObservabilityEvent) {
  if (!runtimeConfig.webhookUrl) return;

  // Best-effort, fire-and-forget. Never block or throw on the request path.
  try {
    void fetch(runtimeConfig.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
      signal: AbortSignal.timeout(4_000),
    }).catch(() => {
      /* swallow: a down log drain must never affect the app */
    });
  } catch {
    /* swallow synchronous failures (e.g. invalid URL) */
  }
}

function track(record: RecordedObservabilityEvent) {
  counters.total += 1;
  counters.lastEventAt = record.ts;
  if (!counters.firstEventAt) counters.firstEventAt = record.ts;
  counters.byCategory[record.category] = (counters.byCategory[record.category] ?? 0) + 1;
  counters.bySeverity[record.severity] = (counters.bySeverity[record.severity] ?? 0) + 1;
  counters.byEvent[record.event] = (counters.byEvent[record.event] ?? 0) + 1;

  buffer.push(record);
  if (buffer.length > MAX_BUFFER) {
    buffer.splice(0, buffer.length - MAX_BUFFER);
  }
}

/**
 * Record one observability event. Returns the redacted record that was stored,
 * or null when it was filtered out (disabled or below the min severity).
 * This function is guaranteed not to throw.
 */
export function recordObservabilityEvent(
  event: ObservabilityEvent
): RecordedObservabilityEvent | null {
  try {
    if (!runtimeConfig.enabled) return null;

    const severity = normalizeSeverity(event.severity, "info");
    if (!meetsMinSeverity(severity)) return null;

    const record: RecordedObservabilityEvent = {
      ts: new Date().toISOString(),
      category: event.category,
      event: String(event.event || "unknown").slice(0, 80),
      severity,
      message: event.message ? redactString(String(event.message)) : undefined,
      context: redactContext(event.context),
      durationMs:
        typeof event.durationMs === "number" && Number.isFinite(event.durationMs)
          ? Math.round(event.durationMs)
          : undefined,
      statusCode:
        typeof event.statusCode === "number" && Number.isFinite(event.statusCode)
          ? event.statusCode
          : undefined,
      route: event.route ? redactString(String(event.route)).slice(0, 200) : undefined,
    };

    track(record);
    emitToConsole(record);
    emitToWebhook(record);
    return record;
  } catch {
    // Observability must never break the caller.
    return null;
  }
}

/**
 * Categorize an arbitrary error message into the most specific observability
 * category. Used so a single error sink (e.g. tRPC onError) can still split
 * Supabase/DB and Stripe failures out from generic backend failures.
 */
export function categorizeErrorSource(
  message: string | null | undefined
): ObservabilityCategory {
  const normalized = String(message ?? "").toLowerCase();
  if (
    /(supabase|postgres|pg_|relation .* does not exist|econnrefused|database|drizzle|sslmode|too many connections|column .* does not exist)/.test(
      normalized
    )
  ) {
    return "supabase";
  }
  if (/stripe|webhook signature|no signatures found/.test(normalized)) {
    return "stripe";
  }
  return "backend";
}

export function getObservabilitySummary(limit = 50): ObservabilitySummary {
  const safeLimit = Math.max(1, Math.min(limit, MAX_BUFFER));
  const topEvents = Object.entries(counters.byEvent)
    .map(([event, count]) => ({ event, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  return {
    enabled: runtimeConfig.enabled,
    total: counters.total,
    firstEventAt: counters.firstEventAt,
    lastEventAt: counters.lastEventAt,
    byCategory: { ...counters.byCategory },
    bySeverity: { ...counters.bySeverity },
    topEvents,
    recent: buffer.slice(-safeLimit).reverse(),
  };
}

/** Test-only: override runtime config (e.g. silence console, force enable). */
export function configureObservabilityForTests(
  partial: Partial<ObservabilityRuntimeConfig>
) {
  runtimeConfig = { ...runtimeConfig, ...partial };
}

/** Test-only: clear buffer, counters, and restore env-derived config. */
export function resetObservabilityForTests() {
  buffer.length = 0;
  counters.total = 0;
  counters.firstEventAt = null;
  counters.lastEventAt = null;
  counters.byCategory = {};
  counters.bySeverity = {};
  counters.byEvent = {};
  runtimeConfig = defaultConfig();
}
