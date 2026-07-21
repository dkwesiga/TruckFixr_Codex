import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { pmAssignments, pmTemplates } from "../../drizzle/schema";
import {
  calculatePmStatus,
  resolveEffectiveIntervals,
  type PmStatusResult,
} from "@shared/maintenance/pmStatus";
import { logMaintenanceActivity } from "./maintenanceActivityLog";

// PM templates require at least one interval.
function assertHasInterval(t: {
  intervalKm?: number | null;
  intervalEngineHours?: number | null;
  intervalDays?: number | null;
}) {
  if (t.intervalKm == null && t.intervalEngineHours == null && t.intervalDays == null) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A PM template must define at least one interval (km, engine hours, or days).",
    });
  }
}

export async function createPmTemplate(input: {
  fleetId: number;
  actorUserId: number;
  name: string;
  description?: string | null;
  intervalKm?: number | null;
  intervalEngineHours?: number | null;
  intervalDays?: number | null;
  warningKm?: number | null;
  warningEngineHours?: number | null;
  warningDays?: number | null;
  whicheverComesFirst?: boolean;
}) {
  assertHasInterval(input);
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });

  const [row] = await db
    .insert(pmTemplates)
    .values({
      fleetId: input.fleetId,
      name: input.name.trim(),
      description: input.description ?? null,
      intervalKm: input.intervalKm ?? null,
      intervalEngineHours: input.intervalEngineHours ?? null,
      intervalDays: input.intervalDays ?? null,
      warningKm: input.warningKm ?? null,
      warningEngineHours: input.warningEngineHours ?? null,
      warningDays: input.warningDays ?? null,
      whicheverComesFirst: input.whicheverComesFirst ?? true,
      createdByUserId: input.actorUserId,
    })
    .returning();

  await logMaintenanceActivity({
    fleetId: input.fleetId,
    userId: input.actorUserId,
    action: "pm_template_changed",
    entityType: "pmTemplate",
    entityId: row?.id ?? null,
    details: { name: input.name, created: true },
  });
  return row;
}

export async function listPmTemplates(fleetId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(pmTemplates).where(eq(pmTemplates.fleetId, fleetId));
}

export async function assignPmTemplate(input: {
  fleetId: number;
  actorUserId: number;
  vehicleId: string;
  pmTemplateId: number;
  overrides?: {
    overrideIntervalKm?: number | null;
    overrideIntervalEngineHours?: number | null;
    overrideIntervalDays?: number | null;
    overrideWarningKm?: number | null;
    overrideWarningEngineHours?: number | null;
    overrideWarningDays?: number | null;
  };
}) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });

  // Template must belong to the same fleet (tenant isolation).
  const [template] = await db
    .select({ id: pmTemplates.id })
    .from(pmTemplates)
    .where(and(eq(pmTemplates.id, input.pmTemplateId), eq(pmTemplates.fleetId, input.fleetId)))
    .limit(1);
  if (!template) throw new TRPCError({ code: "NOT_FOUND", message: "PM template not found in this fleet." });

  const [existing] = await db
    .select({ id: pmAssignments.id })
    .from(pmAssignments)
    .where(
      and(
        eq(pmAssignments.fleetId, input.fleetId),
        eq(pmAssignments.vehicleId, input.vehicleId),
        eq(pmAssignments.pmTemplateId, input.pmTemplateId)
      )
    )
    .limit(1);

  const values = { active: true, updatedAt: new Date(), ...(input.overrides ?? {}) };
  if (existing) {
    await db.update(pmAssignments).set(values).where(eq(pmAssignments.id, existing.id));
  } else {
    await db.insert(pmAssignments).values({
      fleetId: input.fleetId,
      vehicleId: input.vehicleId,
      pmTemplateId: input.pmTemplateId,
      createdByUserId: input.actorUserId,
      ...(input.overrides ?? {}),
    });
  }

  await logMaintenanceActivity({
    fleetId: input.fleetId,
    userId: input.actorUserId,
    action: "pm_assignment_changed",
    entityType: "pmAssignment",
    entityRef: input.vehicleId,
    details: { pmTemplateId: input.pmTemplateId },
  });
}

export async function recordPmCompletion(input: {
  fleetId: number;
  actorUserId: number;
  assignmentId: number;
  completedDate: Date;
  odometerKm?: number | null;
  engineHours?: number | null;
}) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });

  const [assignment] = await db
    .select()
    .from(pmAssignments)
    .where(and(eq(pmAssignments.id, input.assignmentId), eq(pmAssignments.fleetId, input.fleetId)))
    .limit(1);
  if (!assignment) throw new TRPCError({ code: "NOT_FOUND", message: "PM assignment not found in this fleet." });

  await db
    .update(pmAssignments)
    .set({
      lastCompletedDate: input.completedDate,
      lastCompletedOdometerKm: input.odometerKm != null ? String(input.odometerKm) : assignment.lastCompletedOdometerKm,
      lastCompletedEngineHours: input.engineHours != null ? String(input.engineHours) : assignment.lastCompletedEngineHours,
      updatedAt: new Date(),
    })
    .where(eq(pmAssignments.id, assignment.id));

  await logMaintenanceActivity({
    fleetId: input.fleetId,
    userId: input.actorUserId,
    action: "pm_completion_recorded",
    entityType: "pmAssignment",
    entityId: assignment.id,
    entityRef: assignment.vehicleId,
  });
}

export interface PmAssignmentStatus {
  assignmentId: number;
  vehicleId: string;
  templateName: string;
  status: PmStatusResult;
}

export async function getVehiclePmStatuses(args: {
  fleetId: number;
  vehicleId: string;
  currentOdometerKm: number | null;
  currentEngineHours: number | null;
  now?: Date;
}): Promise<PmAssignmentStatus[]> {
  const db = await getDb();
  if (!db) return [];
  const now = args.now ?? new Date();

  const rows = await db
    .select({
      assignment: pmAssignments,
      template: pmTemplates,
    })
    .from(pmAssignments)
    .innerJoin(pmTemplates, eq(pmAssignments.pmTemplateId, pmTemplates.id))
    .where(
      and(eq(pmAssignments.fleetId, args.fleetId), eq(pmAssignments.vehicleId, args.vehicleId))
    );

  return rows.map(({ assignment, template }) => {
    const intervals = resolveEffectiveIntervals(template, assignment);
    const status = calculatePmStatus({
      active: assignment.active && template.active,
      intervals,
      lastCompletedDate: assignment.lastCompletedDate ? new Date(assignment.lastCompletedDate) : null,
      lastCompletedOdometerKm: assignment.lastCompletedOdometerKm != null ? Number(assignment.lastCompletedOdometerKm) : null,
      lastCompletedEngineHours: assignment.lastCompletedEngineHours != null ? Number(assignment.lastCompletedEngineHours) : null,
      currentOdometerKm: args.currentOdometerKm,
      currentEngineHours: args.currentEngineHours,
      now,
    });
    return {
      assignmentId: assignment.id,
      vehicleId: assignment.vehicleId,
      templateName: template.name,
      status,
    };
  });
}
