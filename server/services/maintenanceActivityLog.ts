import { getDb } from "../db";
import { activityLogs } from "../../drizzle/schema";

// Central, append-only activity logging for the Fleet Health & Maintenance
// workflow. Reuses the existing `activityLogs` table (no competing audit
// table). Domain tables remain the source of truth; these rows are an audit
// trail. Logging never blocks the caller: a logging failure is swallowed so a
// business operation is never lost because its audit write failed.

// Keys that must NEVER be persisted in activity details, even if a caller
// passes them by mistake. Guards against leaking secrets / unbounded payloads
// (see prompt §11).
const FORBIDDEN_DETAIL_KEYS = new Set([
  "cookie",
  "cookies",
  "jwt",
  "token",
  "sessionToken",
  "session_token",
  "authorization",
  "password",
  "passwordResetToken",
  "credential",
  "credentials",
  "secret",
  "apiKey",
  "api_key",
  "signedUrl",
  "signed_url",
  "storageKey",
  "storage_key",
  "rawPayload",
  "rawPayloadJson",
  "rawText",
  "csvContent",
  "csvRaw",
]);

const MAX_DETAIL_STRING_LENGTH = 2000;

function redactDetails(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (typeof value === "string") {
    return value.length > MAX_DETAIL_STRING_LENGTH
      ? `${value.slice(0, MAX_DETAIL_STRING_LENGTH)}…[truncated]`
      : value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 200).map((v) => redactDetails(v, depth + 1));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_DETAIL_KEYS.has(key)) {
        out[key] = "[redacted]";
        continue;
      }
      out[key] = redactDetails(v, depth + 1);
    }
    return out;
  }
  return value;
}

export type MaintenanceActivityAction =
  // feature / permission / pilot / consent
  | "fleet_feature_changed"
  | "maintenance_permission_changed"
  | "pilot_settings_changed"
  | "ai_consent_changed"
  // events
  | "vehicle_event_created"
  | "vehicle_event_reviewed"
  | "vehicle_event_import_summary"
  // PM
  | "pm_template_changed"
  | "pm_assignment_changed"
  | "pm_completion_recorded"
  // score
  | "attention_score_acknowledged"
  | "attention_score_override_changed"
  // cases / decisions
  | "maintenance_case_created"
  | "maintenance_case_status_changed"
  | "maintenance_case_assigned"
  | "maintenance_decision_created"
  | "maintenance_decision_approved"
  | "maintenance_critical_override"
  | "maintenance_case_reopened"
  // repair cycles / downtime
  | "repair_cycle_created"
  | "vehicle_out_of_service"
  | "vehicle_returned_to_service"
  | "repair_outcome_recorded"
  // documents
  | "repair_document_uploaded"
  | "repair_document_processing_changed"
  | "repair_document_corrected"
  | "document_comparison_finding"
  | "repair_authorized"
  // pilot ops
  | "readiness_degraded"
  | "maintenance_export";

export interface MaintenanceActivityInput {
  fleetId: number;
  userId: number;
  action: MaintenanceActivityAction | string;
  entityType?: string | null;
  entityId?: number | null;
  // A string business reference (e.g. vehicleId varchar, case reference) that
  // does not fit the integer entityId column. Stored in details.
  entityRef?: string | null;
  details?: Record<string, unknown> | null;
}

export async function logMaintenanceActivity(
  input: MaintenanceActivityInput
): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    const details = {
      ...(input.entityRef ? { entityRef: input.entityRef } : {}),
      ...(input.details ?? {}),
    };

    await db.insert(activityLogs).values({
      fleetId: input.fleetId,
      userId: input.userId,
      action: input.action,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      details: redactDetails(details) as never,
    });
  } catch (error) {
    // Never let an audit-log failure break the underlying operation.
    console.warn("[maintenanceActivityLog] failed to write activity log", error);
  }
}
