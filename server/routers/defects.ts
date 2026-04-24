import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  analyzeDiagnostic,
  mapDiagnosticRiskToAction,
  mapDiagnosticRiskToUrgency,
} from "../services/tadisCore";
import { eq, and } from "drizzle-orm";
import { getDb } from "../db";
import { defects, tadisAlerts, defectActions, vehicles, maintenanceLogs } from "../../drizzle/schema";
import { canManageVehicleAccess, canViewVehicle } from "../services/vehicleAccess";

async function verifyFleetAccess(fleetId: number, userId: number, userRole: string): Promise<boolean> {
  return canManageVehicleAccess({
    fleetId,
    user: {
      id: userId,
      role: userRole,
    },
  });
}

export const defectsRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        fleetId: z.number(),
        vehicleId: z.number(),
        inspectionId: z.number().optional(),
        title: z.string().min(1, "Defect title is required"),
        description: z.string().optional(),
        category: z.string().optional(),
        photoUrls: z.array(z.string()).optional(),
        symptoms: z.array(z.string()),
        faultCodes: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role === "driver") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Drivers cannot directly create defects",
        });
      }

      const hasAccess = await verifyFleetAccess(input.fleetId, ctx.user.id, ctx.user.role);
      if (!hasAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this fleet",
        });
      }

      try {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Database not available",
          });
        }

        const tadisResult = await analyzeDiagnostic({
          symptoms: input.symptoms,
          faultCodes: input.faultCodes ?? [],
          vehicleId: input.vehicleId,
          driverNotes: input.description,
        });

        const [defect] = await db
          .insert(defects)
          .values({
            fleetId: input.fleetId,
            vehicleId: input.vehicleId,
            inspectionId: input.inspectionId ?? null,
            driverId: ctx.user.id,
            title: input.title,
            description: input.description ?? null,
            category: input.category ?? null,
            photoUrls: input.photoUrls ?? null,
            status: "open",
          })
          .returning();

        const [alert] = await db
          .insert(tadisAlerts)
          .values({
            fleetId: input.fleetId,
            defectId: defect.id,
            urgency: mapDiagnosticRiskToUrgency(tadisResult.risk_level),
            recommendedAction: mapDiagnosticRiskToAction(tadisResult.risk_level),
            likelyCause: tadisResult.possible_causes[0]?.cause ?? input.title,
            reasoning: JSON.stringify(tadisResult),
          })
          .returning();

        console.log('[Analytics] Defect created:', { defectId: defect.id, title: input.title, category: input.category, vehicleId: input.vehicleId, fleetId: input.fleetId, userId: ctx.user.id });

        return {
          defectId: defect.id,
          title: defect.title,
          description: defect.description,
          category: defect.category,
          photoUrls: defect.photoUrls,
          status: defect.status,
          tadisAlert: {
            id: alert.id,
            urgency: alert.urgency,
            recommendedAction: alert.recommendedAction,
            likelyCause: alert.likelyCause,
            reasoning: alert.reasoning,
            confidence: tadisResult.confidence_score / 100,
            nextSteps: tadisResult.recommended_tests,
          },
          createdAt: defect.createdAt,
        };
      } catch (error) {
        console.error("Failed to create defect:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create defect and run analysis",
        });
      }
    }),

  getById: protectedProcedure
    .input(z.object({ defectId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return null;

      const [defect] = await db
        .select()
        .from(defects)
        .where(eq(defects.id, input.defectId))
        .limit(1);

      if (!defect) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Defect not found",
        });
      }

      const hasAccess = await verifyFleetAccess(defect.fleetId, ctx.user.id, ctx.user.role);
      if (!hasAccess && defect.driverId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this defect",
        });
      }

      const [alert] = await db
        .select()
        .from(tadisAlerts)
        .where(eq(tadisAlerts.defectId, input.defectId))
        .limit(1);

      return { defect, tadisAlert: alert ?? null };
    }),

  listByVehicle: protectedProcedure
    .input(z.object({ vehicleId: z.number(), status: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];

      const [vehicle] = await db
        .select()
        .from(vehicles)
        .where(eq(vehicles.id, input.vehicleId))
        .limit(1);

      if (!vehicle) return [];

      const hasAccess = await canViewVehicle({
        user: ctx.user,
        vehicleId: input.vehicleId,
        fleetId: vehicle.fleetId,
      });
      if (!hasAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this vehicle",
        });
      }

      const conditions = [eq(defects.vehicleId, input.vehicleId)];
      if (input.status) {
        conditions.push(eq(defects.status, input.status as any));
      }

      return await db.select().from(defects).where(and(...conditions));
    }),

  listByFleet: protectedProcedure
    .input(z.object({ fleetId: z.number(), urgency: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const hasAccess = await verifyFleetAccess(input.fleetId, ctx.user.id, ctx.user.role);
      if (!hasAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this fleet",
        });
      }

      const db = await getDb();
      if (!db) return [];

      const conditions = [eq(defects.fleetId, input.fleetId)];
      
      return await db.select().from(defects).where(and(...conditions));
    }),

  updateStatus: protectedProcedure
    .input(
      z.object({
        defectId: z.number(),
        status: z.enum(["open", "acknowledged", "assigned", "resolved"]),
        notes: z.string().optional(),
        assignedTo: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "owner" && ctx.user.role !== "manager") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only managers can update defect status",
        });
      }

      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      const [existing] = await db
        .select()
        .from(defects)
        .where(eq(defects.id, input.defectId))
        .limit(1);

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Defect not found",
        });
      }

      const hasAccess = await verifyFleetAccess(existing.fleetId, ctx.user.id, ctx.user.role);
      if (!hasAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this fleet",
        });
      }

      await db
        .update(defects)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(defects.id, input.defectId));

      if (input.notes || input.assignedTo) {
        await db
          .insert(defectActions)
          .values({
            defectId: input.defectId,
            managerId: ctx.user.id,
            actionType: input.assignedTo ? "assign" : (input.notes ? "comment" as const : "acknowledge" as const),
            notes: input.notes ?? null,
            assignedTo: input.assignedTo ?? null,
          });
      }

      console.log('[Analytics] Defect status updated:', { defectId: input.defectId, status: input.status, userId: ctx.user.id });

      return { success: true };
    }),

  resolve: protectedProcedure
    .input(
      z.object({
        defectId: z.number(),
        resolutionNotes: z.string(),
        cost: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "owner" && ctx.user.role !== "manager") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only managers can resolve defects",
        });
      }

      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      const [existing] = await db
        .select()
        .from(defects)
        .where(eq(defects.id, input.defectId))
        .limit(1);

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Defect not found",
        });
      }

      const hasAccess = await verifyFleetAccess(existing.fleetId, ctx.user.id, ctx.user.role);
      if (!hasAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this fleet",
        });
      }

      await db
        .update(defects)
        .set({ status: "resolved", updatedAt: new Date() })
        .where(eq(defects.id, input.defectId));

      await db
        .insert(maintenanceLogs)
        .values({
          fleetId: existing.fleetId,
          vehicleId: existing.vehicleId,
          defectId: input.defectId,
          type: "repair",
          description: input.resolutionNotes,
          cost: input.cost ? String(input.cost) : null,
        });

      await db
        .insert(defectActions)
        .values({
          defectId: input.defectId,
          managerId: ctx.user.id,
          actionType: "resolve",
          notes: input.resolutionNotes,
        });

      console.log('[Analytics] Defect resolved:', { defectId: input.defectId, userId: ctx.user.id });

      return { success: true };
    }),
});
