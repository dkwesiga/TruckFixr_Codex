import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  adminProcedure,
  protectedProcedure,
  router,
  staffProcedure,
} from "../_core/trpc";
import { getDb } from "../db";
import { vehicleEvents } from "../../drizzle/schema";
import {
  ALL_FLEET_MAINTENANCE_FEATURE_KEYS,
  FLEET_MAINTENANCE_CAPABILITY_FLAGS as CAP,
} from "@shared/maintenance/featureKeys";
import {
  getFleetMaintenanceCapabilities,
  requireFleetFeature,
  setFleetFeature,
} from "../services/fleetFeatures";
import {
  resolveActiveFleetId,
  assertManagesFleet,
  assertVehicleInFleet,
} from "../services/maintenanceTenantScope";
import { ingestVehicleEvents } from "../services/vehicleEventIngestion";
import {
  acknowledgeScore,
  computeAttentionScore,
  persistScoreSnapshotIfChanged,
  setScoreOverride,
} from "../services/attentionScorePersistence";
import {
  assignPmTemplate,
  createPmTemplate,
  getVehiclePmStatuses,
  listPmTemplates,
  recordPmCompletion,
} from "../services/pmService";
import { logMaintenanceActivity } from "../services/maintenanceActivityLog";

const PAGE_DEFAULT = 25;
const PAGE_MAX = 100;

// Internal admins that are read-only must not mutate.
function assertInternalCanWrite(user: { internalAdminRole?: string | null }) {
  if (user.internalAdminRole === "read_only_viewer") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Read-only internal administrators cannot modify pilot configuration.",
    });
  }
}

const manualEventSchema = z.object({
  vehicleId: z.string().min(1).max(64),
  eventType: z.string().min(1).max(48),
  eventTimestamp: z.string().min(1),
  source: z.string().max(64).optional(),
  odometerKm: z.number().optional().nullable(),
  engineHours: z.number().optional().nullable(),
  dtcCode: z.string().max(64).optional().nullable(),
  dtcStatus: z.string().max(32).optional().nullable(),
  severity: z.string().max(32).optional().nullable(),
});

export const fleetMaintenanceRouter = router({
  // ---- Capabilities (any authenticated fleet member) --------------------
  capabilities: protectedProcedure
    .input(z.object({ fleetId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const fleetId = await resolveActiveFleetId({
        user: ctx.user,
        requestedFleetId: input?.fleetId ?? null,
      });
      const capabilities = await getFleetMaintenanceCapabilities(fleetId);
      return { fleetId, capabilities };
    }),

  // ---- Internal-admin feature management --------------------------------
  setFleetFeature: staffProcedure
    .input(
      z.object({
        fleetId: z.number(),
        featureKey: z.enum(
          ALL_FLEET_MAINTENANCE_FEATURE_KEYS as unknown as [string, ...string[]]
        ),
        enabled: z.boolean(),
        valueJson: z.unknown().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertInternalCanWrite(ctx.user);
      const record = await setFleetFeature({
        fleetId: input.fleetId,
        featureKey: input.featureKey,
        enabled: input.enabled,
        valueJson: input.valueJson,
        actorUserId: ctx.user.id,
      });
      return record;
    }),

  // ---- Vehicle events ----------------------------------------------------
  listEvents: protectedProcedure
    .input(
      z.object({
        fleetId: z.number().optional(),
        vehicleId: z.string().optional(),
        trustStatus: z.string().optional(),
        limit: z.number().min(1).max(PAGE_MAX).default(PAGE_DEFAULT),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const fleetId = await resolveActiveFleetId({
        user: ctx.user,
        requestedFleetId: input.fleetId ?? null,
      });
      await requireFleetFeature(fleetId, CAP.normalizedVehicleEvents);
      const db = await getDb();
      if (!db) return { events: [], nextOffset: null };

      const filters = [eq(vehicleEvents.fleetId, fleetId)];
      if (input.vehicleId) filters.push(eq(vehicleEvents.vehicleId, input.vehicleId));
      if (input.trustStatus) filters.push(eq(vehicleEvents.trustStatus, input.trustStatus));

      // Note: raw payloads are intentionally excluded from list queries.
      const rows = await db
        .select({
          id: vehicleEvents.id,
          vehicleId: vehicleEvents.vehicleId,
          source: vehicleEvents.source,
          eventType: vehicleEvents.eventType,
          eventTimestamp: vehicleEvents.eventTimestamp,
          odometerKm: vehicleEvents.odometerKm,
          engineHours: vehicleEvents.engineHours,
          dtcCode: vehicleEvents.dtcCode,
          severity: vehicleEvents.severity,
          trustStatus: vehicleEvents.trustStatus,
          reviewedAt: vehicleEvents.reviewedAt,
          createdAt: vehicleEvents.createdAt,
        })
        .from(vehicleEvents)
        .where(and(...filters))
        .orderBy(desc(vehicleEvents.eventTimestamp))
        .limit(input.limit + 1)
        .offset(input.offset);

      const hasMore = rows.length > input.limit;
      return {
        events: hasMore ? rows.slice(0, input.limit) : rows,
        nextOffset: hasMore ? input.offset + input.limit : null,
      };
    }),

  createManualEvent: adminProcedure
    .input(z.object({ fleetId: z.number().optional(), event: manualEventSchema }))
    .mutation(async ({ ctx, input }) => {
      const fleetId = await resolveActiveFleetId({
        user: ctx.user,
        requestedFleetId: input.fleetId ?? null,
      });
      await assertManagesFleet({ user: ctx.user, fleetId });
      await requireFleetFeature(fleetId, CAP.normalizedVehicleEvents);
      const summary = await ingestVehicleEvents({
        fleetId,
        actorUserId: ctx.user.id,
        channel: "manual",
        events: [{ ...input.event, source: input.event.source ?? "manual" }],
      });
      return summary;
    }),

  importEventsCsv: adminProcedure
    .input(
      z.object({
        fleetId: z.number().optional(),
        // Pre-mapped rows from the client preview step (already confirmed).
        events: z.array(z.record(z.string(), z.unknown())).max(1000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const fleetId = await resolveActiveFleetId({
        user: ctx.user,
        requestedFleetId: input.fleetId ?? null,
      });
      await assertManagesFleet({ user: ctx.user, fleetId });
      await requireFleetFeature(fleetId, CAP.integrationIngestion);
      return ingestVehicleEvents({
        fleetId,
        actorUserId: ctx.user.id,
        channel: "csv",
        events: input.events,
      });
    }),

  reviewEvent: adminProcedure
    .input(
      z.object({
        fleetId: z.number().optional(),
        eventId: z.number(),
        decision: z.enum(["reviewed", "rejected"]),
        notes: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const fleetId = await resolveActiveFleetId({
        user: ctx.user,
        requestedFleetId: input.fleetId ?? null,
      });
      await assertManagesFleet({ user: ctx.user, fleetId });
      await requireFleetFeature(fleetId, CAP.normalizedVehicleEvents);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });

      const [event] = await db
        .select({ id: vehicleEvents.id, vehicleId: vehicleEvents.vehicleId })
        .from(vehicleEvents)
        .where(and(eq(vehicleEvents.id, input.eventId), eq(vehicleEvents.fleetId, fleetId)))
        .limit(1);
      if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Event not found in this fleet." });

      await db
        .update(vehicleEvents)
        .set({
          trustStatus: input.decision,
          reviewedByUserId: ctx.user.id,
          reviewedAt: new Date(),
          reviewNotes: input.notes ?? null,
          updatedAt: new Date(),
        })
        .where(eq(vehicleEvents.id, event.id));

      await logMaintenanceActivity({
        fleetId,
        userId: ctx.user.id,
        action: "vehicle_event_reviewed",
        entityType: "vehicleEvent",
        entityId: event.id,
        entityRef: event.vehicleId,
        details: { decision: input.decision },
      });
      return { ok: true };
    }),

  // Internal-admin test ingestion (never a public API).
  internalTestIngest: staffProcedure
    .input(
      z.object({
        fleetId: z.number(),
        events: z.array(z.record(z.string(), z.unknown())).min(1).max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertInternalCanWrite(ctx.user);
      await requireFleetFeature(input.fleetId, CAP.integrationIngestion);
      return ingestVehicleEvents({
        fleetId: input.fleetId,
        actorUserId: ctx.user.id,
        channel: "internal_test",
        events: input.events,
      });
    }),

  // ---- Preventive maintenance -------------------------------------------
  listPmTemplates: protectedProcedure
    .input(z.object({ fleetId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const fleetId = await resolveActiveFleetId({
        user: ctx.user,
        requestedFleetId: input?.fleetId ?? null,
      });
      await requireFleetFeature(fleetId, CAP.pmSchedules);
      return listPmTemplates(fleetId);
    }),

  createPmTemplate: adminProcedure
    .input(
      z.object({
        fleetId: z.number().optional(),
        name: z.string().min(1).max(150),
        description: z.string().max(2000).optional(),
        intervalKm: z.number().int().positive().optional().nullable(),
        intervalEngineHours: z.number().int().positive().optional().nullable(),
        intervalDays: z.number().int().positive().optional().nullable(),
        warningKm: z.number().int().positive().optional().nullable(),
        warningEngineHours: z.number().int().positive().optional().nullable(),
        warningDays: z.number().int().positive().optional().nullable(),
        whicheverComesFirst: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const fleetId = await resolveActiveFleetId({
        user: ctx.user,
        requestedFleetId: input.fleetId ?? null,
      });
      await assertManagesFleet({ user: ctx.user, fleetId });
      await requireFleetFeature(fleetId, CAP.pmSchedules);
      return createPmTemplate({ fleetId, actorUserId: ctx.user.id, ...input });
    }),

  assignPmTemplate: adminProcedure
    .input(
      z.object({
        fleetId: z.number().optional(),
        vehicleId: z.string().min(1),
        pmTemplateId: z.number(),
        overrideIntervalKm: z.number().int().positive().optional().nullable(),
        overrideIntervalEngineHours: z.number().int().positive().optional().nullable(),
        overrideIntervalDays: z.number().int().positive().optional().nullable(),
        overrideWarningKm: z.number().int().positive().optional().nullable(),
        overrideWarningEngineHours: z.number().int().positive().optional().nullable(),
        overrideWarningDays: z.number().int().positive().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const fleetId = await resolveActiveFleetId({
        user: ctx.user,
        requestedFleetId: input.fleetId ?? null,
      });
      await assertManagesFleet({ user: ctx.user, fleetId });
      await requireFleetFeature(fleetId, CAP.pmSchedules);
      await assertVehicleInFleet({ fleetId, vehicleId: input.vehicleId });
      await assignPmTemplate({
        fleetId,
        actorUserId: ctx.user.id,
        vehicleId: input.vehicleId,
        pmTemplateId: input.pmTemplateId,
        overrides: {
          overrideIntervalKm: input.overrideIntervalKm,
          overrideIntervalEngineHours: input.overrideIntervalEngineHours,
          overrideIntervalDays: input.overrideIntervalDays,
          overrideWarningKm: input.overrideWarningKm,
          overrideWarningEngineHours: input.overrideWarningEngineHours,
          overrideWarningDays: input.overrideWarningDays,
        },
      });
      return { ok: true };
    }),

  recordPmCompletion: adminProcedure
    .input(
      z.object({
        fleetId: z.number().optional(),
        assignmentId: z.number(),
        completedDate: z.string(),
        odometerKm: z.number().optional().nullable(),
        engineHours: z.number().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const fleetId = await resolveActiveFleetId({
        user: ctx.user,
        requestedFleetId: input.fleetId ?? null,
      });
      await assertManagesFleet({ user: ctx.user, fleetId });
      await requireFleetFeature(fleetId, CAP.pmSchedules);
      const date = new Date(input.completedDate);
      if (Number.isNaN(date.getTime())) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid completion date." });
      }
      await recordPmCompletion({
        fleetId,
        actorUserId: ctx.user.id,
        assignmentId: input.assignmentId,
        completedDate: date,
        odometerKm: input.odometerKm,
        engineHours: input.engineHours,
      });
      return { ok: true };
    }),

  vehiclePmStatus: protectedProcedure
    .input(
      z.object({
        fleetId: z.number().optional(),
        vehicleId: z.string().min(1),
        currentOdometerKm: z.number().optional().nullable(),
        currentEngineHours: z.number().optional().nullable(),
      })
    )
    .query(async ({ ctx, input }) => {
      const fleetId = await resolveActiveFleetId({
        user: ctx.user,
        requestedFleetId: input.fleetId ?? null,
      });
      await requireFleetFeature(fleetId, CAP.pmSchedules);
      await assertVehicleInFleet({ fleetId, vehicleId: input.vehicleId });
      return getVehiclePmStatuses({
        fleetId,
        vehicleId: input.vehicleId,
        currentOdometerKm: input.currentOdometerKm ?? null,
        currentEngineHours: input.currentEngineHours ?? null,
      });
    }),

  // ---- Vehicle Attention Score ------------------------------------------
  vehicleScore: protectedProcedure
    .input(z.object({ fleetId: z.number().optional(), vehicleId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const fleetId = await resolveActiveFleetId({
        user: ctx.user,
        requestedFleetId: input.fleetId ?? null,
      });
      await requireFleetFeature(fleetId, CAP.vehicleAttentionScore);
      await assertVehicleInFleet({ fleetId, vehicleId: input.vehicleId });
      const result = await computeAttentionScore({ fleetId, vehicleId: input.vehicleId });
      // Persist a snapshot only if it materially changed since last time.
      await persistScoreSnapshotIfChanged({
        fleetId,
        vehicleId: input.vehicleId,
        result,
        reason: "recalculation",
      });
      return result;
    }),

  acknowledgeScore: adminProcedure
    .input(
      z.object({
        fleetId: z.number().optional(),
        vehicleId: z.string().min(1),
        note: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const fleetId = await resolveActiveFleetId({
        user: ctx.user,
        requestedFleetId: input.fleetId ?? null,
      });
      await assertManagesFleet({ user: ctx.user, fleetId });
      await requireFleetFeature(fleetId, CAP.vehicleAttentionScore);
      await assertVehicleInFleet({ fleetId, vehicleId: input.vehicleId });
      await acknowledgeScore({ fleetId, vehicleId: input.vehicleId, userId: ctx.user.id, note: input.note });
      return { ok: true };
    }),

  setScoreOverride: adminProcedure
    .input(
      z.object({
        fleetId: z.number().optional(),
        vehicleId: z.string().min(1),
        classification: z.enum(["critical", "attention", "stable"]).nullable(),
        reason: z.string().max(2000).nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const fleetId = await resolveActiveFleetId({
        user: ctx.user,
        requestedFleetId: input.fleetId ?? null,
      });
      await assertManagesFleet({ user: ctx.user, fleetId });
      await requireFleetFeature(fleetId, CAP.vehicleAttentionScore);
      await assertVehicleInFleet({ fleetId, vehicleId: input.vehicleId });
      if (input.classification && !input.reason) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "An override reason is required." });
      }
      await setScoreOverride({
        fleetId,
        vehicleId: input.vehicleId,
        userId: ctx.user.id,
        classification: input.classification,
        reason: input.reason,
      });
      return { ok: true };
    }),
});
