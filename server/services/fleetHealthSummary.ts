import { and, eq, gte, inArray } from "drizzle-orm";
import { getDb } from "../db";
import {
  attentionScoreOverrides,
  defects,
  pmAssignments,
  pmTemplates,
  vehicleEvents,
  vehicles,
} from "../../drizzle/schema";
import {
  calculateAttentionScore,
  type AttentionClassification,
  type AttentionScoreResult,
} from "@shared/maintenance/attentionScore";
import {
  calculatePmStatus,
  resolveEffectiveIntervals,
} from "@shared/maintenance/pmStatus";

const DAY = 1000 * 60 * 60 * 24;
const OPEN_DEFECT_STATUSES = ["open", "acknowledged", "assigned", "monitoring", "repair_required"];

export interface FleetHealthVehicle {
  vehicleId: string;
  unitNumber: string | null;
  vin: string | null;
  makeModel: string | null;
  score: AttentionScoreResult;
  displayClassification: AttentionClassification;
  overridden: boolean;
  topReason: string | null;
}

export interface FleetHealthSummary {
  vehicles: FleetHealthVehicle[];
  indicators: {
    totalVehicles: number;
    critical: number;
    attention: number;
    stable: number;
    overduePm: number;
    criticalDefects: number;
    reviewRequiredEvents: number;
  };
  calculatedAt: string;
}

const CLASS_RANK: Record<AttentionClassification, number> = {
  critical: 0,
  attention: 1,
  stable: 2,
};

// Batched, per-fleet health computation. Bulk-loads defects, recent DTC events,
// latest readings, PM config, and overrides ONCE, then scores each vehicle in
// memory — no per-vehicle round trips (avoids N+1).
export async function computeFleetHealthSummary(args: {
  fleetId: number;
  now?: Date;
}): Promise<FleetHealthSummary> {
  const now = args.now ?? new Date();
  const db = await getDb();
  const empty: FleetHealthSummary = {
    vehicles: [],
    indicators: {
      totalVehicles: 0,
      critical: 0,
      attention: 0,
      stable: 0,
      overduePm: 0,
      criticalDefects: 0,
      reviewRequiredEvents: 0,
    },
    calculatedAt: now.toISOString(),
  };
  if (!db) return empty;

  const vehicleRows = await db
    .select({
      id: vehicles.id,
      unitNumber: vehicles.unitNumber,
      vin: vehicles.vin,
      make: vehicles.make,
      model: vehicles.model,
    })
    .from(vehicles)
    .where(eq(vehicles.fleetId, args.fleetId));

  if (vehicleRows.length === 0) return empty;
  const vehicleIds = vehicleRows.map((v) => v.id);

  // Bulk: open defects for the fleet.
  const defectRows = await db
    .select({
      id: defects.id,
      vehicleId: defects.vehicleId,
      severity: defects.severity,
      createdAt: defects.createdAt,
    })
    .from(defects)
    .where(
      and(
        eq(defects.fleetId, args.fleetId),
        inArray(defects.status, OPEN_DEFECT_STATUSES as never)
      )
    );

  // Bulk: DTC events in the last 14 days.
  const since14d = new Date(now.getTime() - 14 * DAY);
  const eventRows = await db
    .select({
      vehicleId: vehicleEvents.vehicleId,
      eventType: vehicleEvents.eventType,
      dtcCode: vehicleEvents.dtcCode,
      odometerKm: vehicleEvents.odometerKm,
      engineHours: vehicleEvents.engineHours,
      eventTimestamp: vehicleEvents.eventTimestamp,
      trustStatus: vehicleEvents.trustStatus,
    })
    .from(vehicleEvents)
    .where(
      and(
        eq(vehicleEvents.fleetId, args.fleetId),
        gte(vehicleEvents.eventTimestamp, since14d)
      )
    );

  // Bulk: PM assignments + templates.
  const pmRows = await db
    .select({ assignment: pmAssignments, template: pmTemplates })
    .from(pmAssignments)
    .innerJoin(pmTemplates, eq(pmAssignments.pmTemplateId, pmTemplates.id))
    .where(eq(pmAssignments.fleetId, args.fleetId));

  // Bulk: active display overrides.
  const overrideRows = await db
    .select()
    .from(attentionScoreOverrides)
    .where(
      and(
        eq(attentionScoreOverrides.fleetId, args.fleetId),
        eq(attentionScoreOverrides.active, true)
      )
    );

  // Index everything by vehicle.
  const defectsByVehicle = groupBy(defectRows, (d) => d.vehicleId);
  const eventsByVehicle = groupBy(eventRows, (e) => e.vehicleId);
  const pmByVehicle = groupBy(pmRows, (p) => p.assignment.vehicleId);
  const overrideByVehicle = new Map(overrideRows.map((o) => [o.vehicleId, o]));

  let critical = 0;
  let attention = 0;
  let stable = 0;
  let overduePm = 0;
  let criticalDefectCount = 0;
  let reviewRequiredEvents = 0;

  const outVehicles: FleetHealthVehicle[] = vehicleRows.map((v) => {
    const vDefects = defectsByVehicle.get(v.id) ?? [];
    const vEvents = eventsByVehicle.get(v.id) ?? [];
    const vPm = pmByVehicle.get(v.id) ?? [];

    const activeCriticalDefects = vDefects
      .filter((d) => d.severity === "critical")
      .map((d) => ({ id: String(d.id), sourceKey: `defect:${d.id}` }));
    criticalDefectCount += activeCriticalDefects.length;

    // Repeat unresolved DTCs within 14d.
    const detected = new Map<string, number>();
    const cleared = new Set<string>();
    let latestOdo: number | null = null;
    let latestHours: number | null = null;
    for (const e of vEvents) {
      if (e.trustStatus === "review_required") reviewRequiredEvents++;
      if (e.eventType === "dtc_detected" && e.dtcCode) {
        detected.set(e.dtcCode, (detected.get(e.dtcCode) ?? 0) + 1);
      } else if (e.eventType === "dtc_cleared" && e.dtcCode) {
        cleared.add(e.dtcCode);
      }
      if (e.odometerKm != null && latestOdo == null) latestOdo = Number(e.odometerKm);
      if (e.engineHours != null && latestHours == null) latestHours = Number(e.engineHours);
    }
    const repeatUnresolvedDtcs = Array.from(detected.entries())
      .filter(([code, count]) => count >= 2 && !cleared.has(code))
      .map(([code]) => ({ code }));

    // PM overdue?
    let pmOverdue = false;
    let overduePmName: string | null = null;
    for (const { assignment, template } of vPm) {
      const intervals = resolveEffectiveIntervals(template, assignment);
      const status = calculatePmStatus({
        active: assignment.active && template.active,
        intervals,
        lastCompletedDate: assignment.lastCompletedDate ? new Date(assignment.lastCompletedDate) : null,
        lastCompletedOdometerKm: assignment.lastCompletedOdometerKm != null ? Number(assignment.lastCompletedOdometerKm) : null,
        lastCompletedEngineHours: assignment.lastCompletedEngineHours != null ? Number(assignment.lastCompletedEngineHours) : null,
        currentOdometerKm: latestOdo,
        currentEngineHours: latestHours,
        now,
      });
      if (status.status === "overdue") {
        pmOverdue = true;
        overduePmName = template.name;
        break;
      }
    }
    if (pmOverdue) overduePm++;

    const score = calculateAttentionScore({
      activeCriticalDefects,
      openInspectionDefects: vDefects.map((d) => ({ id: String(d.id) })),
      unresolvedDriverIssuesOlderThan7d: vDefects
        .filter((d) => d.createdAt != null && now.getTime() - new Date(d.createdAt).getTime() > 7 * DAY)
        .map((d) => ({ id: String(d.id) })),
      repeatUnresolvedDtcs,
      pmOverdue,
      overduePmName,
      hasCurrentOdometer: latestOdo != null,
      hasCurrentEngineHours: latestHours != null,
      now,
    });

    const override = overrideByVehicle.get(v.id);
    const displayClassification =
      (override?.overrideClassification as AttentionClassification | undefined) ??
      score.classification;

    if (displayClassification === "critical") critical++;
    else if (displayClassification === "attention") attention++;
    else stable++;

    const makeModel = [v.make, v.model].filter(Boolean).join(" ") || null;

    return {
      vehicleId: v.id,
      unitNumber: v.unitNumber ?? null,
      vin: v.vin ?? null,
      makeModel,
      score,
      displayClassification,
      overridden: override?.overrideClassification != null,
      topReason: score.components[0]?.explanation ?? null,
    };
  });

  // Rank: worst classification first, then higher score first.
  outVehicles.sort((a, b) => {
    const byClass = CLASS_RANK[a.displayClassification] - CLASS_RANK[b.displayClassification];
    if (byClass !== 0) return byClass;
    return b.score.total - a.score.total;
  });

  return {
    vehicles: outVehicles,
    indicators: {
      totalVehicles: vehicleRows.length,
      critical,
      attention,
      stable,
      overduePm,
      criticalDefects: criticalDefectCount,
      reviewRequiredEvents,
    },
    calculatedAt: now.toISOString(),
  };
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k) ?? [];
    list.push(item);
    map.set(k, list);
  }
  return map;
}
