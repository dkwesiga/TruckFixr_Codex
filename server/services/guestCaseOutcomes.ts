// Gate 3: guest-case outcome capture, decision-time measurement, repeat-issue
// detection. Outcome fields are all optional and "unknown" is an allowed value —
// users are never forced to invent costs or downtime (§25).

import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { analyticsEvents, guestCaseFollowUps, guestCases } from "../../drizzle/schema";

export const EVIDENCE_SOURCES = [
  "measured",
  "customer_reported",
  "truckfixr_estimate",
  "unknown",
] as const;
export type EvidenceSource = (typeof EVIDENCE_SOURCES)[number];

const REPEAT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function requireDb(db: unknown): asserts db {
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
}

// ---- Pure helpers (unit-tested without a DB) ----------------------------------

/** Minutes between two instants, or null if either is missing. */
export function decisionTimeMinutes(
  from: Date | string | null | undefined,
  to: Date | string | null | undefined
): number | null {
  if (!from || !to) return null;
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 60000);
}

interface VehicleIdentifierLike {
  vin?: string | null;
  unitNumber?: string | null;
}

/** Normalized vehicle key (VIN preferred, else unit number), or null. */
export function vehicleKey(id: VehicleIdentifierLike | null | undefined): string | null {
  const vin = id?.vin?.trim().toUpperCase();
  if (vin) return `vin:${vin}`;
  const unit = id?.unitNumber?.trim().toUpperCase();
  if (unit) return `unit:${unit}`;
  return null;
}

interface RepeatCandidate {
  id: number;
  confirmedRepair?: boolean | null;
  repairCompletedAt?: Date | string | null;
  vehicleIdentifier?: VehicleIdentifierLike | null;
}

/**
 * True if any PRIOR case (excluding `currentId`) for the same vehicle had a
 * confirmed repair completed within 30 days before `referenceAt`.
 */
export function isRepeatWithin30Days(params: {
  currentId: number;
  currentVehicle: VehicleIdentifierLike | null | undefined;
  referenceAt: Date | string;
  priorCases: RepeatCandidate[];
}): boolean {
  const ck = vehicleKey(params.currentVehicle);
  if (!ck) return false;
  const ref = new Date(params.referenceAt).getTime();
  return params.priorCases.some((p) => {
    if (p.id === params.currentId) return false;
    if (!p.confirmedRepair || !p.repairCompletedAt) return false;
    const completed = new Date(p.repairCompletedAt).getTime();
    const delta = ref - completed;
    if (delta < 0 || delta > REPEAT_WINDOW_MS) return false;
    return vehicleKey(p.vehicleIdentifier) === ck;
  });
}

// ---- DB service ---------------------------------------------------------------

export interface RecordOutcomeParams {
  publicToken: string;
  confirmedRepair?: boolean;
  repairShopEngagedAt?: Date | null;
  repairCompletedAt?: Date | null;
  estimatedDowntimeHours?: number | null;
  actualDowntimeHours?: number | null;
  repairCostCents?: number | null;
  callsMessagesAvoided?: number | null;
  evidenceSource?: EvidenceSource;
  outcomeConfidence?: string | null;
  outcomeConfirmedBy?: string | null;
}

export async function recordOutcome(params: RecordOutcomeParams) {
  const db = await getDb();
  requireDb(db);

  const [row] = await db
    .select()
    .from(guestCases)
    .where(eq(guestCases.publicToken, params.publicToken))
    .limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Case not found." });

  // Detect repeat-within-30-days against prior confirmed cases (exclude self).
  const priorConfirmed = await db
    .select()
    .from(guestCases)
    .where(eq(guestCases.confirmedRepair, true));
  const repeat = isRepeatWithin30Days({
    currentId: row.id,
    currentVehicle: row.vehicleIdentifier as VehicleIdentifierLike | null,
    referenceAt: row.createdAt ?? new Date(),
    priorCases: priorConfirmed as RepeatCandidate[],
  });

  const now = new Date();
  await db
    .update(guestCases)
    .set({
      confirmedRepair: params.confirmedRepair ?? row.confirmedRepair ?? null,
      repairShopEngagedAt: params.repairShopEngagedAt ?? row.repairShopEngagedAt ?? null,
      repairCompletedAt: params.repairCompletedAt ?? row.repairCompletedAt ?? null,
      estimatedDowntimeHours:
        params.estimatedDowntimeHours != null ? String(params.estimatedDowntimeHours) : row.estimatedDowntimeHours ?? null,
      actualDowntimeHours:
        params.actualDowntimeHours != null ? String(params.actualDowntimeHours) : row.actualDowntimeHours ?? null,
      repairCostCents: params.repairCostCents ?? row.repairCostCents ?? null,
      callsMessagesAvoided: params.callsMessagesAvoided ?? row.callsMessagesAvoided ?? null,
      evidenceSource: params.evidenceSource ?? row.evidenceSource ?? "unknown",
      outcomeConfidence: params.outcomeConfidence ?? row.outcomeConfidence ?? null,
      outcomeConfirmedBy: params.outcomeConfirmedBy ?? row.outcomeConfirmedBy ?? null,
      outcomeConfirmedAt: now,
      repeatIssueWithin30Days: repeat,
      status: "closed",
      updatedAt: now,
    })
    .where(eq(guestCases.id, row.id));

  // Stop any pending follow-ups now that the outcome is confirmed.
  await db
    .update(guestCaseFollowUps)
    .set({ status: "skipped" })
    .where(and(eq(guestCaseFollowUps.guestCaseId, row.id), eq(guestCaseFollowUps.status, "pending")));

  await db.insert(analyticsEvents).values({
    event: "outcome_confirmed",
    guestCaseId: row.id,
    readiness: row.customerReadiness,
    severity: row.internalSeverity,
    funnelStep: "outcome",
    at: now,
  });

  return {
    confirmedRepair: params.confirmedRepair ?? row.confirmedRepair ?? null,
    repeatIssueWithin30Days: repeat,
    decisionTimeMinutes: decisionTimeMinutes(row.createdAt, row.initialDecisionAt),
    evidenceSource: params.evidenceSource ?? "unknown",
  };
}
