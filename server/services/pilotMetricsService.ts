import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import {
  maintenanceCases,
  maintenanceDecisions,
  repairCycles,
  repairOutcomes,
} from "../../drizzle/schema";
import {
  computePilotMetrics,
  type CaseMetricRecord,
  type PilotMetrics,
} from "@shared/maintenance/pilotMetrics";
import { buildCsv, buildExportPreamble } from "@shared/maintenance/csvExport";
import { logMaintenanceActivity } from "./maintenanceActivityLog";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

async function gatherCaseRecords(fleetId: number, now: Date): Promise<{
  records: CaseMetricRecord[];
  cases: Array<typeof maintenanceCases.$inferSelect>;
}> {
  const db = await getDb();
  if (!db) return { records: [], cases: [] };

  const cases = await db.select().from(maintenanceCases).where(eq(maintenanceCases.fleetId, fleetId));
  if (cases.length === 0) return { records: [], cases: [] };
  const caseIds = cases.map((c) => c.id);

  const decisions = await db
    .select()
    .from(maintenanceDecisions)
    .where(and(eq(maintenanceDecisions.fleetId, fleetId), inArray(maintenanceDecisions.caseId, caseIds)));
  const cycles = await db
    .select()
    .from(repairCycles)
    .where(and(eq(repairCycles.fleetId, fleetId), inArray(repairCycles.caseId, caseIds)));
  const outcomes = await db
    .select()
    .from(repairOutcomes)
    .where(and(eq(repairOutcomes.fleetId, fleetId), inArray(repairOutcomes.maintenanceCaseId, caseIds)));

  const decByCase = new Map<number, typeof decisions>();
  for (const d of decisions) {
    const list = decByCase.get(d.caseId) ?? ([] as typeof decisions);
    list.push(d);
    decByCase.set(d.caseId, list);
  }
  const cyclesByCase = new Map<number, typeof cycles>();
  for (const c of cycles) {
    const list = cyclesByCase.get(c.caseId) ?? ([] as typeof cycles);
    list.push(c);
    cyclesByCase.set(c.caseId, list);
  }
  const outcomeByCase = new Map<number, typeof outcomes[number]>();
  for (const o of outcomes) {
    if (o.maintenanceCaseId != null) outcomeByCase.set(o.maintenanceCaseId, o);
  }

  const records: CaseMetricRecord[] = cases.map((c) => {
    const ds = decByCase.get(c.id) ?? [];
    const cs = cyclesByCase.get(c.id) ?? [];
    const outcome = outcomeByCase.get(c.id);

    const firstDecisionAtMs =
      ds.length > 0 ? Math.min(...ds.map((d) => new Date(d.createdAt).getTime())) : null;
    const approvals = ds.filter((d) => d.approvedAt != null).map((d) => new Date(d.approvedAt!).getTime());
    const firstApprovalAtMs = approvals.length > 0 ? Math.min(...approvals) : null;
    const criticalOverride = ds.some((d) => d.overrideState === "overridden");

    const completedCycle = cs.find((x) => x.completedAt != null);
    const completed = c.status === "closed" || c.status === "completed" || completedCycle != null;
    const completedAtMs = completedCycle?.completedAt
      ? new Date(completedCycle.completedAt).getTime()
      : c.closedAt
        ? new Date(c.closedAt).getTime()
        : null;
    const observationWindowElapsed = completedAtMs != null && now.getTime() - completedAtMs >= THIRTY_DAYS_MS;
    const totalDowntimeHours = cs.reduce((sum, x) => sum + (x.downtimeHours != null ? Number(x.downtimeHours) : 0), 0);

    const agreementRaw = outcome?.agreementClassification ?? null;
    const agreement: CaseMetricRecord["agreement"] =
      agreementRaw === "agree" || agreementRaw === "partial" || agreementRaw === "disagree"
        ? agreementRaw
        : null;

    return {
      caseId: c.id,
      severity: (c.severity as CaseMetricRecord["severity"]) ?? null,
      finalAction: ds.find((d) => d.isCurrent)?.finalAction ?? null,
      createdAtMs: new Date(c.openedAt).getTime(),
      firstDecisionAtMs,
      firstApprovalAtMs,
      repairCycleCount: cs.length,
      completed,
      reopenedWithin30Days: c.status === "reopened",
      observationWindowElapsed,
      totalDowntimeHours: cs.length > 0 ? totalDowntimeHours : null,
      criticalOverride,
      agreement,
      documentHighVariance: false, // recorded at comparison time; not recomputed here
      outcomeSubmitted: outcome != null,
    };
  });

  return { records, cases };
}

export async function getPilotMetrics(fleetId: number, now = new Date()): Promise<PilotMetrics> {
  const { records } = await gatherCaseRecords(fleetId, now);
  return computePilotMetrics(records);
}

// Tenant-scoped case export CSV. Excludes prompts, signed URLs, storage keys,
// and raw payloads by construction; every field is formula-injection-safe.
export async function buildCaseExportCsv(input: {
  fleetId: number;
  actorUserId: number;
  timezone?: string;
  pilotStart?: string | null;
  pilotEnd?: string | null;
  now?: Date;
}): Promise<string> {
  const now = input.now ?? new Date();
  const { records, cases } = await gatherCaseRecords(input.fleetId, now);
  const caseById = new Map(cases.map((c) => [c.id, c]));

  const headers = [
    "reference", "vehicleId", "severity", "status", "finalAction",
    "timeToDecisionHours", "cycleCount", "downtimeHours", "reopened",
    "criticalOverride", "agreement", "outcomeSubmitted",
  ];
  const preciseRows = records.map((r) => {
    const c = caseById.get(r.caseId);
    const ttd = r.firstDecisionAtMs != null ? Math.round(((r.firstDecisionAtMs - r.createdAtMs) / 3_600_000) * 10) / 10 : "";
    return [
      c?.reference ?? "",
      c?.vehicleId ?? "",
      r.severity ?? "",
      c?.status ?? "",
      r.finalAction ?? "",
      ttd,
      r.repairCycleCount,
      r.totalDowntimeHours ?? "",
      r.reopenedWithin30Days ? "yes" : "no",
      r.criticalOverride ? "yes" : "no",
      r.agreement ?? "",
      r.outcomeSubmitted ? "yes" : "no",
    ];
  });

  const preamble = buildExportPreamble({
    generatedAt: now.toISOString(),
    timezone: input.timezone ?? "UTC",
    pilotStart: input.pilotStart,
    pilotEnd: input.pilotEnd,
    filters: "all cases",
    units: "kilometres, hours",
    currencies: "CAD",
  });

  await logMaintenanceActivity({
    fleetId: input.fleetId,
    userId: input.actorUserId,
    action: "maintenance_export",
    entityType: "pilotExport",
    details: { kind: "cases", rowCount: preciseRows.length },
  });

  return `${preamble}\r\n${buildCsv(headers, preciseRows)}`;
}
