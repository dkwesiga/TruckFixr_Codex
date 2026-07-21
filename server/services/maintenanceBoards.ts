import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import {
  activityLogs,
  maintenanceCases,
  maintenanceDecisions,
  repairCycles,
} from "../../drizzle/schema";
import { ACTIVE_CASE_STATUSES, type CaseStatus } from "@shared/maintenance/caseWorkflow";

export interface DowntimeBoardRow {
  caseId: number;
  reference: string;
  vehicleId: string;
  status: CaseStatus;
  severity: string | null;
  assignedManagerUserId: number | null;
  assignedMaintenanceUserId: number | null;
  expectedCompletionAt: string | null;
  overdue: boolean;
  activeCycleNumber: number | null;
  downSince: string | null;
}

// Downtime Board: operationally-active cases with computed overdue. Overdue is
// derived at read time (no cron): expectedCompletionAt < now AND status not
// terminal.
export async function getDowntimeBoard(args: {
  fleetId: number;
  now?: Date;
}): Promise<DowntimeBoardRow[]> {
  const now = args.now ?? new Date();
  const db = await getDb();
  if (!db) return [];

  const cases = await db
    .select()
    .from(maintenanceCases)
    .where(
      and(
        eq(maintenanceCases.fleetId, args.fleetId),
        inArray(maintenanceCases.status, ACTIVE_CASE_STATUSES as unknown as string[])
      )
    )
    .orderBy(desc(maintenanceCases.updatedAt));

  if (cases.length === 0) return [];

  const caseIds = cases.map((c) => c.id);
  const activeCycles = await db
    .select({
      caseId: repairCycles.caseId,
      cycleNumber: repairCycles.cycleNumber,
      outOfServiceAt: repairCycles.outOfServiceAt,
    })
    .from(repairCycles)
    .where(and(inArray(repairCycles.caseId, caseIds), eq(repairCycles.active, true)));
  const cycleByCase = new Map(activeCycles.map((c) => [c.caseId, c]));

  return cases.map((c) => {
    const cycle = cycleByCase.get(c.id);
    const expected = c.expectedCompletionAt ? new Date(c.expectedCompletionAt) : null;
    const overdue =
      expected != null &&
      expected.getTime() < now.getTime() &&
      c.status !== "completed" &&
      c.status !== "closed" &&
      c.status !== "cancelled";
    return {
      caseId: c.id,
      reference: c.reference,
      vehicleId: c.vehicleId,
      status: c.status as CaseStatus,
      severity: c.severity,
      assignedManagerUserId: c.assignedManagerUserId,
      assignedMaintenanceUserId: c.assignedMaintenanceUserId,
      expectedCompletionAt: expected ? expected.toISOString() : null,
      overdue,
      activeCycleNumber: cycle?.cycleNumber ?? null,
      downSince: cycle?.outOfServiceAt ? new Date(cycle.outOfServiceAt).toISOString() : null,
    };
  });
}

export interface TimelineEntry {
  at: string;
  kind: string;
  summary: string;
  userId: number | null;
  details: unknown;
}

// Consolidated, chronological Case Activity timeline built from domain records
// (decisions, repair cycles) plus the case's audit-log entries. Domain records
// are the source of truth.
export async function getCaseTimeline(args: {
  fleetId: number;
  caseId: number;
}): Promise<TimelineEntry[]> {
  const db = await getDb();
  if (!db) return [];

  const [caseRow] = await db
    .select()
    .from(maintenanceCases)
    .where(and(eq(maintenanceCases.id, args.caseId), eq(maintenanceCases.fleetId, args.fleetId)))
    .limit(1);
  if (!caseRow) return [];

  const entries: TimelineEntry[] = [];
  entries.push({
    at: new Date(caseRow.openedAt).toISOString(),
    kind: "case_opened",
    summary: `Case ${caseRow.reference} opened (${caseRow.origin})`,
    userId: caseRow.createdByUserId,
    details: { reference: caseRow.reference, origin: caseRow.origin },
  });

  const decisions = await db
    .select()
    .from(maintenanceDecisions)
    .where(eq(maintenanceDecisions.caseId, args.caseId));
  for (const d of decisions) {
    entries.push({
      at: new Date(d.createdAt).toISOString(),
      kind: d.overrideState === "overridden" ? "critical_override" : "decision",
      summary:
        d.overrideState === "overridden"
          ? `Critical override recorded (v${d.version})`
          : `Decision v${d.version} — ${d.severity} (${d.approvalState})`,
      userId: d.createdByUserId,
      details: { version: d.version, severity: d.severity, finalAction: d.finalAction },
    });
    if (d.approvedAt) {
      entries.push({
        at: new Date(d.approvedAt).toISOString(),
        kind: "approval",
        summary: `Decision v${d.version} approved`,
        userId: d.approvedByUserId,
        details: { version: d.version },
      });
    }
  }

  const cycles = await db
    .select()
    .from(repairCycles)
    .where(eq(repairCycles.caseId, args.caseId));
  for (const c of cycles) {
    entries.push({
      at: new Date(c.startedAt).toISOString(),
      kind: "repair_cycle_started",
      summary: `Repair cycle ${c.cycleNumber} started`,
      userId: c.createdByUserId,
      details: { cycleNumber: c.cycleNumber },
    });
    if (c.outOfServiceAt)
      entries.push({ at: new Date(c.outOfServiceAt).toISOString(), kind: "out_of_service", summary: `Cycle ${c.cycleNumber}: out of service`, userId: null, details: {} });
    if (c.returnedToServiceAt)
      entries.push({ at: new Date(c.returnedToServiceAt).toISOString(), kind: "return_to_service", summary: `Cycle ${c.cycleNumber}: returned to service`, userId: null, details: { downtimeHours: c.downtimeHours } });
    if (c.completedAt)
      entries.push({ at: new Date(c.completedAt).toISOString(), kind: "cycle_completed", summary: `Cycle ${c.cycleNumber}: ${c.closureResult ?? "completed"}`, userId: null, details: { closureResult: c.closureResult } });
  }

  // Merge in document/authorization/outcome audit entries recorded against this
  // case reference (domain tables for those arrive in Phase 4).
  const logs = await db
    .select()
    .from(activityLogs)
    .where(and(eq(activityLogs.fleetId, args.fleetId), eq(activityLogs.entityType, "maintenanceCase")))
    .orderBy(desc(activityLogs.createdAt))
    .limit(200);
  for (const log of logs) {
    const details = (log.details ?? {}) as Record<string, unknown>;
    if (details.entityRef === caseRow.reference && log.action === "maintenance_case_reopened") {
      entries.push({
        at: new Date(log.createdAt).toISOString(),
        kind: "reopened",
        summary: "Case reopened",
        userId: log.userId,
        details,
      });
    }
  }

  entries.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return entries;
}
