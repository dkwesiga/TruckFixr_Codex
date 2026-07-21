import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import {
  maintenanceCases,
  maintenanceDecisions,
  repairCycles,
} from "../../drizzle/schema";
import {
  canTransition,
  type CaseStatus,
  type MaintenanceSeverity,
} from "@shared/maintenance/caseWorkflow";
import { nextCaseReference } from "./maintenanceCaseReference";
import { logMaintenanceActivity } from "./maintenanceActivityLog";

export type CaseOrigin =
  | "diagnosis"
  | "issue"
  | "inspection"
  | "event"
  | "pm"
  | "manual";

interface CreateCaseInput {
  fleetId: number;
  vehicleId: string;
  origin: CaseOrigin;
  title?: string | null;
  summary?: string | null;
  severity?: MaintenanceSeverity | null;
  diagnosticSessionId?: string | null;
  sourceDefectId?: number | null;
  sourceInspectionId?: number | null;
  sourceEventId?: number | null;
  createdByUserId: number | null;
  status?: CaseStatus;
}

async function insertCase(db: Awaited<ReturnType<typeof getDb>>, input: CreateCaseInput) {
  const reference = await nextCaseReference(db as never);
  const [row] = await (db as NonNullable<typeof db>)
    .insert(maintenanceCases)
    .values({
      fleetId: input.fleetId,
      reference,
      vehicleId: input.vehicleId,
      status: input.status ?? "reported",
      title: input.title ?? null,
      summary: input.summary ?? null,
      severity: input.severity ?? null,
      origin: input.origin,
      diagnosticSessionId: input.diagnosticSessionId ?? null,
      sourceDefectId: input.sourceDefectId ?? null,
      sourceInspectionId: input.sourceInspectionId ?? null,
      sourceEventId: input.sourceEventId ?? null,
      createdByUserId: input.createdByUserId,
    })
    .returning();

  await logMaintenanceActivity({
    fleetId: input.fleetId,
    userId: input.createdByUserId ?? 0,
    action: "maintenance_case_created",
    entityType: "maintenanceCase",
    entityId: row?.id ?? null,
    entityRef: reference,
    details: { origin: input.origin, vehicleId: input.vehicleId },
  });

  return row;
}

// Manual creation by an owner/manager. Requires a vehicle and a reason.
export async function createManualCase(input: CreateCaseInput) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
  return insertCase(db, input);
}

// Automatic creation from a completed diagnosis. Idempotent per
// diagnosticSessionId within a fleet: a second call returns the existing case
// rather than creating a duplicate. Diagnosis-neutral: reads only, never mutates.
export async function createAutomaticCaseFromDiagnosis(input: {
  fleetId: number;
  vehicleId: string;
  diagnosticSessionId: string;
  title?: string | null;
  summary?: string | null;
  severity?: MaintenanceSeverity | null;
  createdByUserId: number | null;
}): Promise<{ case: typeof maintenanceCases.$inferSelect; created: boolean } | null> {
  const db = await getDb();
  if (!db) return null;

  const [existing] = await db
    .select()
    .from(maintenanceCases)
    .where(
      and(
        eq(maintenanceCases.fleetId, input.fleetId),
        eq(maintenanceCases.diagnosticSessionId, input.diagnosticSessionId)
      )
    )
    .limit(1);
  if (existing) return { case: existing, created: false };

  const row = await insertCase(db, {
    fleetId: input.fleetId,
    vehicleId: input.vehicleId,
    origin: "diagnosis",
    title: input.title,
    summary: input.summary,
    severity: input.severity,
    diagnosticSessionId: input.diagnosticSessionId,
    createdByUserId: input.createdByUserId,
    status: "decision_pending",
  });
  if (!row) return null;
  return { case: row, created: true };
}

export async function getCaseForFleet(fleetId: number, caseId: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(maintenanceCases)
    .where(and(eq(maintenanceCases.id, caseId), eq(maintenanceCases.fleetId, fleetId)))
    .limit(1);
  return row ?? null;
}

// Validated status transition. Rejects any transition not in the allowed map.
export async function transitionCaseStatus(input: {
  fleetId: number;
  caseId: number;
  toStatus: CaseStatus;
  actorUserId: number;
  note?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });

  const current = await getCaseForFleet(input.fleetId, input.caseId);
  if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Case not found in this fleet." });

  const from = current.status as CaseStatus;
  if (!canTransition(from, input.toStatus)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Cannot move a case from ${from} to ${input.toStatus}.`,
    });
  }

  await db
    .update(maintenanceCases)
    .set({
      status: input.toStatus,
      closedAt: input.toStatus === "closed" ? new Date() : current.closedAt,
      updatedAt: new Date(),
    })
    .where(eq(maintenanceCases.id, current.id));

  await logMaintenanceActivity({
    fleetId: input.fleetId,
    userId: input.actorUserId,
    action: "maintenance_case_status_changed",
    entityType: "maintenanceCase",
    entityId: current.id,
    entityRef: current.reference,
    details: { from, to: input.toStatus, note: input.note ?? null },
  });

  return { from, to: input.toStatus };
}

export async function assignCase(input: {
  fleetId: number;
  caseId: number;
  actorUserId: number;
  managerUserId?: number | null;
  maintenanceUserId?: number | null;
}) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });

  const current = await getCaseForFleet(input.fleetId, input.caseId);
  if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Case not found in this fleet." });

  await db
    .update(maintenanceCases)
    .set({
      assignedManagerUserId:
        input.managerUserId === undefined ? current.assignedManagerUserId : input.managerUserId,
      assignedMaintenanceUserId:
        input.maintenanceUserId === undefined
          ? current.assignedMaintenanceUserId
          : input.maintenanceUserId,
      updatedAt: new Date(),
    })
    .where(eq(maintenanceCases.id, current.id));

  await logMaintenanceActivity({
    fleetId: input.fleetId,
    userId: input.actorUserId,
    action: "maintenance_case_assigned",
    entityType: "maintenanceCase",
    entityId: current.id,
    entityRef: current.reference,
    details: {
      managerUserId: input.managerUserId ?? null,
      maintenanceUserId: input.maintenanceUserId ?? null,
    },
  });
}

// Reopen a closed/cancelled case. Preserves prior decisions, outcomes, and
// repair cycles; opens a NEW repair cycle segment. Never creates a new case.
export async function reopenCase(input: {
  fleetId: number;
  caseId: number;
  actorUserId: number;
  reason: string;
}) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });

  const current = await getCaseForFleet(input.fleetId, input.caseId);
  if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Case not found in this fleet." });
  if (current.status !== "closed" && current.status !== "completed" && current.status !== "cancelled") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Only a closed or completed case can be reopened." });
  }
  if (!input.reason?.trim()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "A reason is required to reopen a case." });
  }

  await db
    .update(maintenanceCases)
    .set({ status: "reopened", closedAt: null, updatedAt: new Date() })
    .where(eq(maintenanceCases.id, current.id));

  // Deactivate any lingering active cycle; a new one is created when work resumes.
  await db
    .update(repairCycles)
    .set({ active: false, updatedAt: new Date() })
    .where(and(eq(repairCycles.caseId, current.id), eq(repairCycles.active, true)));

  await logMaintenanceActivity({
    fleetId: input.fleetId,
    userId: input.actorUserId,
    action: "maintenance_case_reopened",
    entityType: "maintenanceCase",
    entityId: current.id,
    entityRef: current.reference,
    details: { reason: input.reason },
  });
}

export async function listCasesForFleet(input: {
  fleetId: number;
  status?: string;
  vehicleId?: string;
  limit: number;
  offset: number;
}) {
  const db = await getDb();
  if (!db) return { cases: [], nextOffset: null };

  const filters = [eq(maintenanceCases.fleetId, input.fleetId)];
  if (input.status) filters.push(eq(maintenanceCases.status, input.status));
  if (input.vehicleId) filters.push(eq(maintenanceCases.vehicleId, input.vehicleId));

  const rows = await db
    .select()
    .from(maintenanceCases)
    .where(and(...filters))
    .orderBy(desc(maintenanceCases.updatedAt))
    .limit(input.limit + 1)
    .offset(input.offset);

  const hasMore = rows.length > input.limit;
  return {
    cases: hasMore ? rows.slice(0, input.limit) : rows,
    nextOffset: hasMore ? input.offset + input.limit : null,
  };
}

// Current decision for a case (for display / adapters).
export async function getCurrentDecision(caseId: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(maintenanceDecisions)
    .where(and(eq(maintenanceDecisions.caseId, caseId), eq(maintenanceDecisions.isCurrent, true)))
    .limit(1);
  return row ?? null;
}
