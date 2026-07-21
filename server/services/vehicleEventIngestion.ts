import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { vehicleEvents, vehicles } from "../../drizzle/schema";
import {
  buildIdempotencyKey,
  defaultTrustStatusFor,
  isKnownVehicleEventType,
  normalizeDtcCode,
  normalizeNumeric,
  normalizeTimestampToUtcIso,
  type VehicleEventType,
} from "@shared/maintenance/normalization";
import { VEHICLE_EVENT_IMPORT_LIMITS } from "@shared/maintenance/csv";
import { logMaintenanceActivity } from "./maintenanceActivityLog";

// Single ingestion path for manual entry, internal test ingestion, and CSV
// import. Idempotent within a fleet. A bad row never fails the whole batch: it
// is categorized (invalid / duplicate / skipped / failed) with a safe,
// item-level error and the rest proceed.

export const RawVehicleEventSchema = z.object({
  vehicleId: z.string().min(1).max(64),
  source: z.string().min(1).max(64),
  sourceEventId: z.string().max(128).optional().nullable(),
  eventType: z.string().min(1).max(48),
  eventTimestamp: z.union([z.string(), z.number(), z.date()]),
  odometerKm: z.union([z.number(), z.string()]).optional().nullable(),
  engineHours: z.union([z.number(), z.string()]).optional().nullable(),
  dtcCode: z.string().max(64).optional().nullable(),
  dtcStatus: z.string().max(32).optional().nullable(),
  severity: z.string().max(32).optional().nullable(),
  latitude: z.union([z.number(), z.string()]).optional().nullable(),
  longitude: z.union([z.number(), z.string()]).optional().nullable(),
  normalizedPayload: z.record(z.string(), z.unknown()).optional().nullable(),
  rawPayload: z.record(z.string(), z.unknown()).optional().nullable(),
});

export type RawVehicleEvent = z.infer<typeof RawVehicleEventSchema>;

export type IngestErrorCode =
  | "invalid"
  | "unknown_event_type"
  | "invalid_timestamp"
  | "unknown_vehicle"
  | "duplicate"
  | "failed";

export interface IngestItemError {
  index: number;
  code: IngestErrorCode;
  message: string;
}

export interface IngestSummary {
  imported: number;
  duplicate: number;
  invalid: number;
  skipped: number;
  failed: number;
  total: number;
  errors: IngestItemError[];
}

interface PreparedRow {
  index: number;
  fleetId: number;
  vehicleId: string;
  source: string;
  sourceEventId: string | null;
  eventType: VehicleEventType;
  eventTimestamp: Date;
  odometerKm: string | null;
  engineHours: string | null;
  dtcCode: string | null;
  dtcStatus: string | null;
  severity: string | null;
  latitude: string | null;
  longitude: string | null;
  trustStatus: string;
  idempotencyKey: string;
  normalizedPayloadJson: unknown;
  rawPayloadJson: unknown;
}

function toNumericString(
  value: number | string | null | undefined,
  precision: number
): string | null {
  const n = normalizeNumeric(value ?? null, precision);
  return n == null ? null : String(n);
}

export interface IngestOptions {
  fleetId: number;
  actorUserId: number | null;
  events: unknown[];
  // Where the batch came from, for the activity summary.
  channel: "manual" | "internal_test" | "csv";
}

export async function ingestVehicleEvents(
  opts: IngestOptions
): Promise<IngestSummary> {
  const summary: IngestSummary = {
    imported: 0,
    duplicate: 0,
    invalid: 0,
    skipped: 0,
    failed: 0,
    total: opts.events.length,
    errors: [],
  };

  if (opts.events.length > VEHICLE_EVENT_IMPORT_LIMITS.maxRows) {
    throw new Error(
      `Too many rows: ${opts.events.length} exceeds the ${VEHICLE_EVENT_IMPORT_LIMITS.maxRows} limit.`
    );
  }

  const db = await getDb();
  if (!db) {
    // Fail the whole batch cleanly; nothing is partially written.
    summary.failed = opts.events.length;
    summary.errors.push({ index: -1, code: "failed", message: "Database unavailable." });
    return summary;
  }

  // Fetch the fleet's vehicle ids once so per-row ownership checks are O(1).
  const fleetVehicles = await db
    .select({ id: vehicles.id })
    .from(vehicles)
    .where(eq(vehicles.fleetId, opts.fleetId));
  const validVehicleIds = new Set(fleetVehicles.map((v) => v.id));

  const prepared: PreparedRow[] = [];
  const seenKeysInBatch = new Set<string>();

  opts.events.forEach((raw, index) => {
    const parsed = RawVehicleEventSchema.safeParse(raw);
    if (!parsed.success) {
      summary.invalid++;
      summary.errors.push({
        index,
        code: "invalid",
        message: parsed.error.issues[0]?.message ?? "Invalid event.",
      });
      return;
    }
    const ev = parsed.data;

    if (!isKnownVehicleEventType(ev.eventType)) {
      summary.invalid++;
      summary.errors.push({ index, code: "unknown_event_type", message: `Unknown event type: ${ev.eventType}` });
      return;
    }

    const iso = normalizeTimestampToUtcIso(ev.eventTimestamp);
    if (!iso) {
      summary.invalid++;
      summary.errors.push({ index, code: "invalid_timestamp", message: "Invalid event timestamp." });
      return;
    }

    // Never trust a client-supplied vehicleId that isn't in this fleet.
    if (!validVehicleIds.has(ev.vehicleId)) {
      summary.invalid++;
      summary.errors.push({ index, code: "unknown_vehicle", message: "Vehicle not found in this fleet." });
      return;
    }

    const eventType = ev.eventType as VehicleEventType;
    const normalizedPayload = ev.normalizedPayload ?? {
      odometerKm: normalizeNumeric(ev.odometerKm ?? null),
      engineHours: normalizeNumeric(ev.engineHours ?? null),
      dtcCode: normalizeDtcCode(ev.dtcCode),
    };

    const idempotencyKey = buildIdempotencyKey({
      fleetId: opts.fleetId,
      vehicleId: ev.vehicleId,
      source: ev.source,
      sourceEventId: ev.sourceEventId ?? null,
      eventType,
      eventTimestamp: iso,
      normalizedPayload,
    });

    if (seenKeysInBatch.has(idempotencyKey)) {
      summary.duplicate++;
      summary.errors.push({ index, code: "duplicate", message: "Duplicate of an earlier row in this batch." });
      return;
    }
    seenKeysInBatch.add(idempotencyKey);

    prepared.push({
      index,
      fleetId: opts.fleetId,
      vehicleId: ev.vehicleId,
      source: ev.source.trim(),
      sourceEventId: ev.sourceEventId?.trim() || null,
      eventType,
      eventTimestamp: new Date(iso),
      odometerKm: toNumericString(ev.odometerKm, 3),
      engineHours: toNumericString(ev.engineHours, 2),
      dtcCode: normalizeDtcCode(ev.dtcCode),
      dtcStatus: ev.dtcStatus?.trim() || null,
      severity: ev.severity?.trim() || null,
      latitude: toNumericString(ev.latitude, 6),
      longitude: toNumericString(ev.longitude, 6),
      trustStatus: defaultTrustStatusFor(eventType),
      idempotencyKey,
      normalizedPayloadJson: normalizedPayload,
      rawPayloadJson: ev.rawPayload ?? null,
    });
  });

  if (prepared.length === 0) {
    await logImportSummary(opts, summary);
    return summary;
  }

  // Filter out events whose idempotency key already exists in the fleet.
  const candidateKeys = prepared.map((p) => p.idempotencyKey);
  const existing = await db
    .select({ idempotencyKey: vehicleEvents.idempotencyKey })
    .from(vehicleEvents)
    .where(
      and(
        eq(vehicleEvents.fleetId, opts.fleetId),
        inArray(vehicleEvents.idempotencyKey, candidateKeys)
      )
    );
  const existingKeys = new Set(existing.map((e) => e.idempotencyKey));

  const toInsert = prepared.filter((p) => {
    if (existingKeys.has(p.idempotencyKey)) {
      summary.duplicate++;
      return false;
    }
    return true;
  });

  // Insert in bounded batches. A failed batch is retried row-by-row so one bad
  // row does not sink the rest.
  for (let i = 0; i < toInsert.length; i += VEHICLE_EVENT_IMPORT_LIMITS.batchSize) {
    const batch = toInsert.slice(i, i + VEHICLE_EVENT_IMPORT_LIMITS.batchSize);
    try {
      await db.insert(vehicleEvents).values(batch.map(toInsertValues));
      summary.imported += batch.length;
    } catch {
      for (const row of batch) {
        try {
          await db.insert(vehicleEvents).values(toInsertValues(row));
          summary.imported++;
        } catch (rowError) {
          // Unique-violation here means a concurrent insert already stored it.
          const message = String((rowError as Error)?.message ?? "");
          if (/duplicate key|unique/i.test(message)) {
            summary.duplicate++;
          } else {
            summary.failed++;
            summary.errors.push({ index: row.index, code: "failed", message: "Failed to store event." });
          }
        }
      }
    }
  }

  await logImportSummary(opts, summary);
  return summary;
}

function toInsertValues(row: PreparedRow) {
  return {
    fleetId: row.fleetId,
    vehicleId: row.vehicleId,
    source: row.source,
    sourceEventId: row.sourceEventId,
    eventType: row.eventType,
    eventTimestamp: row.eventTimestamp,
    odometerKm: row.odometerKm,
    engineHours: row.engineHours,
    dtcCode: row.dtcCode,
    dtcStatus: row.dtcStatus,
    severity: row.severity,
    latitude: row.latitude,
    longitude: row.longitude,
    trustStatus: row.trustStatus,
    idempotencyKey: row.idempotencyKey,
    normalizedPayloadJson: row.normalizedPayloadJson as never,
    rawPayloadJson: row.rawPayloadJson as never,
    createdByUserId: null,
  };
}

async function logImportSummary(opts: IngestOptions, summary: IngestSummary) {
  await logMaintenanceActivity({
    fleetId: opts.fleetId,
    userId: opts.actorUserId ?? 0,
    action: "vehicle_event_import_summary",
    entityType: "vehicleEvent",
    // Never log raw CSV/event contents — only aggregate counts.
    details: {
      channel: opts.channel,
      imported: summary.imported,
      duplicate: summary.duplicate,
      invalid: summary.invalid,
      failed: summary.failed,
      total: summary.total,
    },
  });
}
