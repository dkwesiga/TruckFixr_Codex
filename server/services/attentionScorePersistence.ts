import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  attentionScoreOverrides,
  attentionScoreSnapshots,
  defects,
  pmAssignments,
  pmTemplates,
  vehicleEvents,
} from "../../drizzle/schema";
import {
  calculateAttentionScore,
  type AttentionScoreInput,
  type AttentionScoreResult,
} from "@shared/maintenance/attentionScore";
import {
  calculatePmStatus,
  resolveEffectiveIntervals,
} from "@shared/maintenance/pmStatus";
import { logMaintenanceActivity } from "./maintenanceActivityLog";

const DAY = 1000 * 60 * 60 * 24;

// Gather the deterministic inputs for a vehicle's Attention Score from existing
// domain tables. Case-based rules (active critical case, repeat repair, return-
// to-service recurrence) are wired in Phase 3 when Maintenance Cases exist; they
// default to empty here, which is correct and additive.
export async function gatherAttentionScoreInput(args: {
  fleetId: number;
  vehicleId: string;
  now?: Date;
}): Promise<AttentionScoreInput> {
  const now = args.now ?? new Date();
  const db = await getDb();
  if (!db) {
    return { hasCurrentOdometer: false, hasCurrentEngineHours: false, now };
  }

  const openStatuses = ["open", "acknowledged", "assigned", "monitoring", "repair_required"];

  const defectRows = await db
    .select({
      id: defects.id,
      severity: defects.severity,
      status: defects.status,
      createdAt: defects.createdAt,
    })
    .from(defects)
    .where(
      and(
        eq(defects.fleetId, args.fleetId),
        eq(defects.vehicleId, args.vehicleId),
        inArray(defects.status, openStatuses as never)
      )
    );

  const activeCriticalDefects = defectRows
    .filter((d) => d.severity === "critical")
    .map((d) => ({ id: String(d.id), sourceKey: `defect:${d.id}` }));
  const openInspectionDefects = defectRows.map((d) => ({ id: String(d.id) }));
  const unresolvedDriverIssuesOlderThan7d = defectRows
    .filter((d) => d.createdAt != null && now.getTime() - new Date(d.createdAt).getTime() > 7 * DAY)
    .map((d) => ({ id: String(d.id) }));

  // Repeat unresolved DTCs within 14 days: dtc_detected events grouped by code
  // with 2+ occurrences and no later dtc_cleared for that code.
  const since14d = new Date(now.getTime() - 14 * DAY);
  const dtcEvents = await db
    .select({
      dtcCode: vehicleEvents.dtcCode,
      eventType: vehicleEvents.eventType,
      eventTimestamp: vehicleEvents.eventTimestamp,
    })
    .from(vehicleEvents)
    .where(
      and(
        eq(vehicleEvents.fleetId, args.fleetId),
        eq(vehicleEvents.vehicleId, args.vehicleId),
        gte(vehicleEvents.eventTimestamp, since14d)
      )
    );

  const detectedByCode = new Map<string, number>();
  const lastClearedByCode = new Map<string, number>();
  for (const e of dtcEvents) {
    if (!e.dtcCode) continue;
    const ts = e.eventTimestamp ? new Date(e.eventTimestamp).getTime() : 0;
    if (e.eventType === "dtc_detected") {
      detectedByCode.set(e.dtcCode, (detectedByCode.get(e.dtcCode) ?? 0) + 1);
    } else if (e.eventType === "dtc_cleared") {
      lastClearedByCode.set(e.dtcCode, Math.max(lastClearedByCode.get(e.dtcCode) ?? 0, ts));
    }
  }
  const repeatUnresolvedDtcs = Array.from(detectedByCode.entries())
    .filter(([code, count]) => count >= 2 && !lastClearedByCode.has(code))
    .map(([code]) => ({ code }));

  // Latest odometer / engine-hours readings (presence only).
  const [latestOdometer] = await db
    .select({ v: vehicleEvents.odometerKm })
    .from(vehicleEvents)
    .where(
      and(
        eq(vehicleEvents.fleetId, args.fleetId),
        eq(vehicleEvents.vehicleId, args.vehicleId),
        sql`${vehicleEvents.odometerKm} IS NOT NULL`
      )
    )
    .orderBy(desc(vehicleEvents.eventTimestamp))
    .limit(1);
  const [latestEngineHours] = await db
    .select({ v: vehicleEvents.engineHours })
    .from(vehicleEvents)
    .where(
      and(
        eq(vehicleEvents.fleetId, args.fleetId),
        eq(vehicleEvents.vehicleId, args.vehicleId),
        sql`${vehicleEvents.engineHours} IS NOT NULL`
      )
    )
    .orderBy(desc(vehicleEvents.eventTimestamp))
    .limit(1);

  const hasCurrentOdometer = latestOdometer?.v != null;
  const hasCurrentEngineHours = latestEngineHours?.v != null;
  const currentOdometerKm = hasCurrentOdometer ? Number(latestOdometer!.v) : null;
  const currentEngineHours = hasCurrentEngineHours ? Number(latestEngineHours!.v) : null;

  // PM overdue beyond warning across active assignments for this vehicle.
  const assignments = await db
    .select()
    .from(pmAssignments)
    .where(
      and(
        eq(pmAssignments.fleetId, args.fleetId),
        eq(pmAssignments.vehicleId, args.vehicleId),
        eq(pmAssignments.active, true)
      )
    );
  let pmOverdue = false;
  let overduePmName: string | null = null;
  for (const a of assignments) {
    const [template] = await db
      .select()
      .from(pmTemplates)
      .where(eq(pmTemplates.id, a.pmTemplateId))
      .limit(1);
    if (!template || !template.active) continue;
    const intervals = resolveEffectiveIntervals(template, a);
    const status = calculatePmStatus({
      active: a.active,
      intervals,
      lastCompletedDate: a.lastCompletedDate ? new Date(a.lastCompletedDate) : null,
      lastCompletedOdometerKm: a.lastCompletedOdometerKm != null ? Number(a.lastCompletedOdometerKm) : null,
      lastCompletedEngineHours: a.lastCompletedEngineHours != null ? Number(a.lastCompletedEngineHours) : null,
      currentOdometerKm,
      currentEngineHours,
      now,
    });
    if (status.status === "overdue") {
      pmOverdue = true;
      overduePmName = template.name;
      break;
    }
  }

  return {
    activeCriticalDefects,
    openInspectionDefects,
    unresolvedDriverIssuesOlderThan7d,
    repeatUnresolvedDtcs,
    pmOverdue,
    overduePmName,
    hasCurrentOdometer,
    hasCurrentEngineHours,
    now,
  };
}

export async function computeAttentionScore(args: {
  fleetId: number;
  vehicleId: string;
  now?: Date;
}): Promise<AttentionScoreResult> {
  const input = await gatherAttentionScoreInput(args);
  return calculateAttentionScore(input);
}

// Persist a snapshot only when it materially differs from the latest one (score
// delta or classification change), or when explicitly forced (acknowledgement /
// override). Never writes on every read.
export async function persistScoreSnapshotIfChanged(args: {
  fleetId: number;
  vehicleId: string;
  result: AttentionScoreResult;
  reason: "recalculation" | "classification_change" | "acknowledgement" | "override";
  materialDelta?: number;
}): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const [latest] = await db
    .select({
      total: attentionScoreSnapshots.total,
      classification: attentionScoreSnapshots.classification,
    })
    .from(attentionScoreSnapshots)
    .where(
      and(
        eq(attentionScoreSnapshots.fleetId, args.fleetId),
        eq(attentionScoreSnapshots.vehicleId, args.vehicleId)
      )
    )
    .orderBy(desc(attentionScoreSnapshots.createdAt))
    .limit(1);

  const forced = args.reason === "acknowledgement" || args.reason === "override";
  const delta = args.materialDelta ?? 5;
  const changed =
    !latest ||
    latest.classification !== args.result.classification ||
    Math.abs((latest.total ?? 0) - args.result.total) >= delta;

  if (!forced && !changed) return false;

  await db.insert(attentionScoreSnapshots).values({
    fleetId: args.fleetId,
    vehicleId: args.vehicleId,
    total: args.result.total,
    classification: args.result.classification,
    componentsJson: args.result.components as never,
    dataQualityWarningsJson: args.result.dataQualityWarnings as never,
    reason:
      latest && latest.classification !== args.result.classification && !forced
        ? "classification_change"
        : args.reason,
    calculatedAt: new Date(args.result.calculatedAt),
  });
  return true;
}

export async function acknowledgeScore(args: {
  fleetId: number;
  vehicleId: string;
  userId: number;
  note?: string | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const now = new Date();

  const [existing] = await db
    .select({ id: attentionScoreOverrides.id })
    .from(attentionScoreOverrides)
    .where(
      and(
        eq(attentionScoreOverrides.fleetId, args.fleetId),
        eq(attentionScoreOverrides.vehicleId, args.vehicleId)
      )
    )
    .limit(1);

  if (existing) {
    await db
      .update(attentionScoreOverrides)
      .set({
        acknowledgedByUserId: args.userId,
        acknowledgedAt: now,
        acknowledgementNote: args.note ?? null,
        updatedAt: now,
      })
      .where(eq(attentionScoreOverrides.id, existing.id));
  } else {
    await db.insert(attentionScoreOverrides).values({
      fleetId: args.fleetId,
      vehicleId: args.vehicleId,
      acknowledgedByUserId: args.userId,
      acknowledgedAt: now,
      acknowledgementNote: args.note ?? null,
    });
  }

  await logMaintenanceActivity({
    fleetId: args.fleetId,
    userId: args.userId,
    action: "attention_score_acknowledged",
    entityType: "vehicle",
    entityRef: args.vehicleId,
  });
}

// Operational DISPLAY override only. Does not alter score components, diagnosis,
// or case creation (per spec §18).
export async function setScoreOverride(args: {
  fleetId: number;
  vehicleId: string;
  userId: number;
  classification: "critical" | "attention" | "stable" | null;
  reason: string | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const now = new Date();

  const [existing] = await db
    .select({ id: attentionScoreOverrides.id })
    .from(attentionScoreOverrides)
    .where(
      and(
        eq(attentionScoreOverrides.fleetId, args.fleetId),
        eq(attentionScoreOverrides.vehicleId, args.vehicleId)
      )
    )
    .limit(1);

  const values = {
    overrideClassification: args.classification,
    overrideReason: args.reason,
    overrideByUserId: args.userId,
    overrideAt: args.classification ? now : null,
    updatedAt: now,
  };

  if (existing) {
    await db.update(attentionScoreOverrides).set(values).where(eq(attentionScoreOverrides.id, existing.id));
  } else {
    await db.insert(attentionScoreOverrides).values({
      fleetId: args.fleetId,
      vehicleId: args.vehicleId,
      ...values,
    });
  }

  await logMaintenanceActivity({
    fleetId: args.fleetId,
    userId: args.userId,
    action: "attention_score_override_changed",
    entityType: "vehicle",
    entityRef: args.vehicleId,
    details: { classification: args.classification, cleared: args.classification == null },
  });
}
