import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import {
  activityLogs,
  aiTriageRecords,
  defects,
  maintenanceCases,
  maintenanceDecisions,
  outcomeRevisions,
  repairCycles,
  repairOutcomes,
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

  // Original observation + triage snapshot (§11 provenance read model). These
  // are read-only lookups against the ORIGINAL rows — defects and
  // aiTriageRecords are never mutated after creation (aiTriageRecords has no
  // updatedAt column at all), so this always reflects what was actually
  // reported/recommended at the time, not a later edit.
  if (caseRow.sourceDefectId != null) {
    const [defect] = await db
      .select()
      .from(defects)
      .where(and(eq(defects.id, caseRow.sourceDefectId), eq(defects.fleetId, args.fleetId)))
      .limit(1);
    if (defect) {
      entries.push({
        at: new Date(defect.createdAt).toISOString(),
        kind: "original_report",
        summary: `Original report: ${defect.title}`,
        userId: defect.driverId,
        details: {
          defectId: defect.id,
          description: defect.description,
          severity: defect.severity,
          symptoms: defect.symptoms ?? null,
        },
      });

      // ALL triage records for this defect, not just the latest — a defect can
      // be re-triaged (manual "Run AI Triage"), and the ORIGINAL assessment
      // must stay visible even after a later one is added, not be shadowed.
      const triages = await db
        .select()
        .from(aiTriageRecords)
        .where(and(eq(aiTriageRecords.defectId, defect.id), eq(aiTriageRecords.fleetId, args.fleetId)))
        .orderBy(desc(aiTriageRecords.createdAt));
      for (const triage of triages) {
        entries.push({
          at: new Date(triage.createdAt).toISOString(),
          kind: "ai_triage",
          summary: `AI triage: ${triage.mostLikelyCause ?? "no cause identified"} (${triage.severity}, ${triage.confidenceScore}% confidence)`,
          userId: null,
          details: {
            severity: triage.severity,
            confidenceScore: triage.confidenceScore,
            recommendedAction: triage.recommendedAction,
            safetyWarning: triage.safetyWarning,
          },
        });
      }
    }
  }

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

  // Confirmed-outcome lifecycle (§9/§10 — unknown -> reported -> verified ->
  // confirmed/failed). Each stage is an explicit timestamp+actor field on the
  // SAME repairOutcomes row (never a separate mutated copy), so surfacing all
  // four here is a read, not a reconstruction from inference.
  const outcomes = await db
    .select()
    .from(repairOutcomes)
    .where(and(eq(repairOutcomes.fleetId, args.fleetId), eq(repairOutcomes.maintenanceCaseId, args.caseId)));
  for (const o of outcomes) {
    if (o.reportedAt) {
      entries.push({
        at: new Date(o.reportedAt).toISOString(),
        kind: "outcome_reported",
        summary: `Outcome reported: ${o.confirmedFault}`,
        userId: o.reportedByUserId,
        details: { outcomeId: o.id, repairPerformed: o.repairPerformed, evidenceSource: o.evidenceSource },
      });
    }
    if (o.verifiedAt) {
      entries.push({
        at: new Date(o.verifiedAt).toISOString(),
        kind: "outcome_verified",
        summary: `Outcome verified (${o.verificationMethod ?? "method not recorded"})`,
        userId: o.verifiedByUserId,
        details: { outcomeId: o.id, verificationMethod: o.verificationMethod },
      });
    }
    if (o.confirmedAt) {
      entries.push({
        at: new Date(o.confirmedAt).toISOString(),
        kind: "outcome_confirmed",
        summary: `Outcome confirmed (${o.confirmationEvidenceType ?? "evidence not recorded"})`,
        userId: o.confirmedByUserId,
        details: { outcomeId: o.id, confirmationEvidenceType: o.confirmationEvidenceType },
      });
    }
    if (o.failedAt) {
      entries.push({
        at: new Date(o.failedAt).toISOString(),
        kind: "outcome_failed",
        summary: "Outcome marked failed — repair did not resolve the issue",
        userId: o.failedByUserId,
        details: { outcomeId: o.id, failureNotes: o.failureNotes },
      });
    }
  }

  // Revisions to an already-verified/confirmed outcome are append-only
  // (outcomeRevisions) and never overwrite the row they correct — surface the
  // fact and reason of each correction without echoing the full before/after
  // JSON blobs (avoid leaking internal diff payloads into a general-purpose
  // timeline read).
  if (outcomes.length > 0) {
    const revisions = await db
      .select()
      .from(outcomeRevisions)
      .where(
        and(
          eq(outcomeRevisions.fleetId, args.fleetId),
          inArray(
            outcomeRevisions.outcomeId,
            outcomes.map((o) => o.id)
          )
        )
      );
    for (const r of revisions) {
      entries.push({
        at: new Date(r.createdAt).toISOString(),
        kind: "outcome_revised",
        summary: `Outcome revision (${r.changeType}): ${r.reason}`,
        userId: r.changedByUserId,
        details: { outcomeId: r.outcomeId, changeType: r.changeType, requiresReVerification: r.requiresReVerification },
      });
    }
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
