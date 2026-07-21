// Provider-neutral normalization + idempotency utilities for vehicle events.
//
// Pure functions only (no DB, no crypto side effects beyond hashing a string)
// so they are trivially unit-testable and identical on client and server.
//
// Idempotency strategy (see prompt §15):
//   With a source event id:    fleetId + source + sourceEventId
//   Without a source event id: fleetId + vehicleId + source + eventType +
//                              eventTimestamp(UTC) + normalizedPayloadHash
//
// Canonicalization rules: trimmed strings, uppercase DTCs, UTC ISO timestamps,
// fixed numeric precision, stable key ordering, exclusion of volatile fields.

export const VEHICLE_EVENT_TYPES = [
  "odometer",
  "engine_hours",
  "dtc_detected",
  "dtc_cleared",
  "inspection_defect",
  "issue_resolved",
  "maintenance_completed",
  "free_text",
  "unknown",
] as const;

export type VehicleEventType = (typeof VEHICLE_EVENT_TYPES)[number];

export const VEHICLE_EVENT_TRUST_STATUSES = [
  "trusted",
  "review_required",
  "reviewed",
  "rejected",
] as const;

export type VehicleEventTrustStatus =
  (typeof VEHICLE_EVENT_TRUST_STATUSES)[number];

// Structured event types are eligible for "trusted" and may affect scoring.
// Free-text/unknown default to review_required and never enter scoring or
// diagnosis before a human accepts them.
const STRUCTURED_EVENT_TYPES = new Set<VehicleEventType>([
  "odometer",
  "engine_hours",
  "dtc_detected",
  "dtc_cleared",
  "inspection_defect",
  "issue_resolved",
  "maintenance_completed",
]);

export function isKnownVehicleEventType(value: string): value is VehicleEventType {
  return (VEHICLE_EVENT_TYPES as readonly string[]).includes(value);
}

export function defaultTrustStatusFor(
  eventType: VehicleEventType
): VehicleEventTrustStatus {
  return STRUCTURED_EVENT_TYPES.has(eventType) ? "trusted" : "review_required";
}

export function normalizeDtcCode(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim().toUpperCase();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeTimestampToUtcIso(
  value: string | number | Date | null | undefined
): string | null {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

// Round to a fixed precision so 12.100000001 and 12.1 canonicalize identically.
export function normalizeNumeric(
  value: number | string | null | undefined,
  precision = 3
): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const factor = 10 ** precision;
  return Math.round(n * factor) / factor;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}

// Deterministic JSON with stable key ordering. Volatile keys (ingestion
// timestamps, request ids, signed urls, etc.) are excluded so they cannot
// perturb the idempotency hash.
const VOLATILE_PAYLOAD_KEYS = new Set([
  "receivedAt",
  "ingestedAt",
  "requestId",
  "signedUrl",
  "url",
  "raw",
  "rawPayload",
  "_meta",
]);

export function canonicalStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalStringify(v)).join(",")}]`;
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value)
      .filter((k) => !VOLATILE_PAYLOAD_KEYS.has(k))
      .sort();
    return `{${keys
      .map((k) => `${JSON.stringify(k)}:${canonicalStringify(value[k])}`)
      .join(",")}}`;
  }
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }
  return JSON.stringify(value ?? null);
}

// FNV-1a 64-bit (as hex). Deterministic, dependency-free, sufficient for a
// stable payload fingerprint used only within a fleet's idempotency scope.
export function stableHash(input: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}

export function normalizedPayloadHash(payload: unknown): string {
  return stableHash(canonicalStringify(payload ?? {}));
}

export interface IdempotencyKeyInput {
  fleetId: number;
  vehicleId: string;
  source: string;
  sourceEventId?: string | null;
  eventType: string;
  eventTimestamp: string | number | Date | null | undefined;
  normalizedPayload?: unknown;
}

export function buildIdempotencyKey(input: IdempotencyKeyInput): string {
  const source = input.source.trim().toLowerCase();
  const sourceEventId = input.sourceEventId?.trim();

  if (sourceEventId) {
    return stableHash(
      canonicalStringify({
        fleetId: input.fleetId,
        source,
        sourceEventId,
      })
    );
  }

  return stableHash(
    canonicalStringify({
      fleetId: input.fleetId,
      vehicleId: String(input.vehicleId).trim(),
      source,
      eventType: input.eventType.trim().toLowerCase(),
      eventTimestamp: normalizeTimestampToUtcIso(input.eventTimestamp),
      payloadHash: normalizedPayloadHash(input.normalizedPayload),
    })
  );
}
