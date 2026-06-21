import { getDb } from "../db";
import { analyticsEvents } from "../../drizzle/schema";

// Allowlist of funnel/product events we are willing to store. Anything not on
// this list is silently ignored — this bounds abuse of the public endpoint and
// keeps the table to a known, reviewable set of names.
export const ANALYTICS_EVENT_NAMES = new Set<string>([
  // Downtime calculator funnel
  "downtime_calculator_opened",
  "downtime_calculator_started",
  "downtime_calculator_completed",
  "downtime_calculator_lead_submitted",
  "downtime_calculator_workflow_review_clicked",
  "downtime_calculator_pilot_clicked",
  "downtime_calculator_cta_clicked",
  // Demo / lead funnel
  "book_demo_cta_clicked",
  "beta_waitlist_cta_clicked",
  "demo_form_started",
  "demo_form_submitted",
  "lead_form_submission_failed",
]);

// Property keys that must never be stored, even if a caller sends them.
const PII_KEY_PATTERN =
  /(email|mail|name|phone|vin|plate|licen[cs]e|token|secret|password|address|ssn|dob)/i;
const EMAIL_VALUE_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/;

const MAX_PROPERTY_KEYS = 20;
const MAX_STRING_LENGTH = 200;

export type RecordAnalyticsEventInput = {
  name: unknown;
  sessionId?: unknown;
  path?: unknown;
  role?: unknown;
  fleetId?: unknown;
  properties?: unknown;
};

function clampString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

// Strip the query string — it can carry PII — and keep only the path.
function sanitizePath(value: unknown): string | null {
  const raw = clampString(value, 512);
  if (!raw) return null;
  const path = raw.split("?")[0].split("#")[0];
  return path.slice(0, 255);
}

// Redact a free-form properties bag: scalars only, no PII keys, no email-looking
// values, bounded count and length.
export function redactProperties(
  value: unknown
): Record<string, string | number | boolean> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const out: Record<string, string | number | boolean> = {};
  let kept = 0;

  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (kept >= MAX_PROPERTY_KEYS) break;
    if (PII_KEY_PATTERN.test(key)) continue;

    if (typeof raw === "number" && Number.isFinite(raw)) {
      out[key] = raw;
      kept += 1;
    } else if (typeof raw === "boolean") {
      out[key] = raw;
      kept += 1;
    } else if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (!trimmed || EMAIL_VALUE_PATTERN.test(trimmed)) continue;
      out[key] = trimmed.slice(0, MAX_STRING_LENGTH);
      kept += 1;
    }
    // Objects/arrays/null/undefined are dropped.
  }

  return kept > 0 ? out : null;
}

export type RecordResult = { stored: boolean; reason?: string };

/**
 * Validates, redacts, and stores a single funnel event. Never throws — analytics
 * must not break the calling request. Returns whether a row was written.
 */
export async function recordAnalyticsEvent(
  input: RecordAnalyticsEventInput
): Promise<RecordResult> {
  const name = clampString(input.name, 120);
  if (!name || !ANALYTICS_EVENT_NAMES.has(name)) {
    return { stored: false, reason: "unknown_event" };
  }

  let fleetId: number | null = null;
  if (
    typeof input.fleetId === "number" &&
    Number.isInteger(input.fleetId) &&
    input.fleetId > 0
  ) {
    fleetId = input.fleetId;
  }

  const role = clampString(input.role, 32);
  const allowedRoles = new Set(["owner", "manager", "driver"]);

  try {
    const db = await getDb();
    if (!db) return { stored: false, reason: "no_db" };

    await db.insert(analyticsEvents).values({
      name,
      sessionId: clampString(input.sessionId, 64),
      path: sanitizePath(input.path),
      role: role && allowedRoles.has(role) ? role : null,
      fleetId,
      properties: redactProperties(input.properties),
      createdAt: new Date(),
    });

    return { stored: true };
  } catch (error) {
    console.warn("[Analytics] Failed to record event:", error);
    return { stored: false, reason: "insert_failed" };
  }
}
