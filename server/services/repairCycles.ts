import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { maintenanceCases, repairCycles } from "../../drizzle/schema";
import { logMaintenanceActivity } from "./maintenanceActivityLog";

async function getCase(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, fleetId: number, caseId: number) {
  const [row] = await db
    .select({ id: maintenanceCases.id, reference: maintenanceCases.reference })
    .from(maintenanceCases)
    .where(and(eq(maintenanceCases.id, caseId), eq(maintenanceCases.fleetId, fleetId)))
    .limit(1);
  return row ?? null;
}

// Start a new repair cycle. Deactivates any existing active cycle so there is
// only ever one active cycle per case.
export async function startRepairCycle(input: {
  fleetId: number;
  caseId: number;
  actorUserId: number;
}) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });

  const caseRow = await getCase(db, input.fleetId, input.caseId);
  if (!caseRow) throw new TRPCError({ code: "NOT_FOUND", message: "Case not found in this fleet." });

  const [latest] = await db
    .select({ cycleNumber: repairCycles.cycleNumber })
    .from(repairCycles)
    .where(eq(repairCycles.caseId, input.caseId))
    .orderBy(desc(repairCycles.cycleNumber))
    .limit(1);
  const cycleNumber = (latest?.cycleNumber ?? 0) + 1;

  await db
    .update(repairCycles)
    .set({ active: false, updatedAt: new Date() })
    .where(and(eq(repairCycles.caseId, input.caseId), eq(repairCycles.active, true)));

  const [created] = await db
    .insert(repairCycles)
    .values({
      fleetId: input.fleetId,
      caseId: input.caseId,
      cycleNumber,
      active: true,
      createdByUserId: input.actorUserId,
    })
    .returning();

  await logMaintenanceActivity({
    fleetId: input.fleetId,
    userId: input.actorUserId,
    action: "repair_cycle_created",
    entityType: "repairCycle",
    entityId: created?.id ?? null,
    entityRef: caseRow.reference,
    details: { cycleNumber },
  });

  return created;
}

async function getActiveCycle(fleetId: number, caseId: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(repairCycles)
    .where(
      and(
        eq(repairCycles.caseId, caseId),
        eq(repairCycles.fleetId, fleetId),
        eq(repairCycles.active, true)
      )
    )
    .limit(1);
  return row ?? null;
}

export type CycleStage =
  | "out_of_service"
  | "repair_started"
  | "awaiting_parts"
  | "ready_for_return";

export async function markCycleStage(input: {
  fleetId: number;
  caseId: number;
  actorUserId: number;
  stage: CycleStage;
  expectedCompletionAt?: Date | null;
}) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });

  const cycle = await getActiveCycle(input.fleetId, input.caseId);
  if (!cycle) throw new TRPCError({ code: "NOT_FOUND", message: "No active repair cycle for this case." });

  const now = new Date();
  const patch: Record<string, unknown> = { updatedAt: now };
  if (input.expectedCompletionAt !== undefined) patch.expectedCompletionAt = input.expectedCompletionAt;

  switch (input.stage) {
    case "out_of_service":
      patch.outOfServiceAt = cycle.outOfServiceAt ?? now;
      break;
    case "repair_started":
      patch.repairStartedAt = cycle.repairStartedAt ?? now;
      break;
    case "awaiting_parts":
      patch.awaitingPartsSince = now;
      break;
    case "ready_for_return":
      patch.readyForReturnAt = now;
      break;
  }

  await db.update(repairCycles).set(patch).where(eq(repairCycles.id, cycle.id));

  // Mirror expected completion onto the case so the Downtime Board can compute
  // overdue without joining every cycle.
  if (input.expectedCompletionAt !== undefined) {
    await db
      .update(maintenanceCases)
      .set({ expectedCompletionAt: input.expectedCompletionAt, updatedAt: now })
      .where(eq(maintenanceCases.id, input.caseId));
  }

  await logMaintenanceActivity({
    fleetId: input.fleetId,
    userId: input.actorUserId,
    action: input.stage === "out_of_service" ? "vehicle_out_of_service" : "maintenance_case_status_changed",
    entityType: "repairCycle",
    entityId: cycle.id,
    details: { stage: input.stage },
  });

  return { ok: true };
}

// Compute downtime hours from out-of-service to return-to-service.
function computeDowntimeHours(outAt: Date | null, backAt: Date): number | null {
  if (!outAt) return null;
  const ms = backAt.getTime() - outAt.getTime();
  if (ms <= 0) return 0;
  return Math.round((ms / (1000 * 60 * 60)) * 100) / 100;
}

export async function returnToService(input: {
  fleetId: number;
  caseId: number;
  actorUserId: number;
}) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });

  const cycle = await getActiveCycle(input.fleetId, input.caseId);
  if (!cycle) throw new TRPCError({ code: "NOT_FOUND", message: "No active repair cycle for this case." });

  const now = new Date();
  const downtime = computeDowntimeHours(cycle.outOfServiceAt ? new Date(cycle.outOfServiceAt) : null, now);

  await db
    .update(repairCycles)
    .set({
      returnedToServiceAt: now,
      downtimeHours: downtime != null ? String(downtime) : cycle.downtimeHours,
      updatedAt: now,
    })
    .where(eq(repairCycles.id, cycle.id));

  await logMaintenanceActivity({
    fleetId: input.fleetId,
    userId: input.actorUserId,
    action: "vehicle_returned_to_service",
    entityType: "repairCycle",
    entityId: cycle.id,
    details: { downtimeHours: downtime },
  });

  return { downtimeHours: downtime };
}

export async function completeCycle(input: {
  fleetId: number;
  caseId: number;
  actorUserId: number;
  closureResult: "resolved" | "partially_resolved" | "not_resolved";
}) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });

  const cycle = await getActiveCycle(input.fleetId, input.caseId);
  if (!cycle) throw new TRPCError({ code: "NOT_FOUND", message: "No active repair cycle for this case." });

  const now = new Date();
  await db
    .update(repairCycles)
    .set({ completedAt: now, closureResult: input.closureResult, active: false, updatedAt: now })
    .where(eq(repairCycles.id, cycle.id));

  await logMaintenanceActivity({
    fleetId: input.fleetId,
    userId: input.actorUserId,
    action: "maintenance_case_status_changed",
    entityType: "repairCycle",
    entityId: cycle.id,
    details: { completed: true, closureResult: input.closureResult },
  });

  return { ok: true };
}

export async function listCycles(fleetId: number, caseId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(repairCycles)
    .where(and(eq(repairCycles.caseId, caseId), eq(repairCycles.fleetId, fleetId)))
    .orderBy(desc(repairCycles.cycleNumber));
}
