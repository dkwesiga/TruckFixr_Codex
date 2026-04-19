import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { vehicles } from "../../drizzle/schema";
import { getDb } from "../db";
import { vehicleInspectionConfigSchema } from "../../shared/inspection";
import { assertVehicleWithinPlan } from "../services/subscriptions";
import { recordPilotMilestone } from "../services/pilotAccess";

export const vehiclesRouter = router({
  /**
   * Create a new vehicle (truck)
   */
  create: protectedProcedure
    .input(
      z.object({
        fleetId: z.number(),
        assignedDriverId: z.number().nullable().optional(),
        unitNumber: z.string().trim().min(1).max(50).optional(),
        vin: z.string().length(17, "VIN must be 17 characters"),
        licensePlate: z.string().trim().min(1).max(20).optional(),
        make: z.string().optional(),
        engineMake: z.string().trim().max(100).optional(),
        model: z.string().optional(),
        year: z.number().optional(),
        configuration: vehicleInspectionConfigSchema.partial().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "owner" && ctx.user.role !== "manager" && ctx.user.role !== "driver") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to create vehicles",
        });
      }

      await assertVehicleWithinPlan({
        userId: ctx.user.id,
        fleetId: input.fleetId,
      });

      const db = await getDb();

      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      const [vehicle] = await db
        .insert(vehicles)
        .values({
          fleetId: input.fleetId,
          assignedDriverId: ctx.user.role === "driver" ? ctx.user.id : input.assignedDriverId ?? null,
          unitNumber: input.unitNumber?.trim() || null,
          vin: input.vin,
          licensePlate: input.licensePlate?.trim() || "UNKNOWN",
          make: input.make,
          engineMake: input.engineMake?.trim() || null,
          model: input.model,
          year: input.year,
          configuration: input.configuration,
          status: "active",
        })
        .returning();
      
      // Track vehicle creation event
      console.log('[Analytics] Vehicle added:', { vehicleId: vehicle.id, fleetId: vehicle.fleetId, vin: vehicle.vin, licensePlate: vehicle.licensePlate, userId: ctx.user.id });
      await recordPilotMilestone({
        userId: ctx.user.id,
        fleetId: vehicle.fleetId,
        eventType: "first_vehicle_added",
        eventMetadata: {
          vehicleId: vehicle.id,
          vin: vehicle.vin,
        },
      });
      
      return vehicle;
    }),

  /**
   * Get vehicle by ID
   */
  getById: protectedProcedure
    .input(z.object({ vehicleId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const [vehicle] = await db
        .select()
        .from(vehicles)
        .where(eq(vehicles.id, input.vehicleId))
        .limit(1);

      return vehicle ?? null;
    }),

  /**
   * List vehicles for a fleet
   */
  listByFleet: protectedProcedure
    .input(z.object({ fleetId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      return db.select().from(vehicles).where(eq(vehicles.fleetId, input.fleetId));
    }),

  /**
   * Update vehicle details
   */
  update: protectedProcedure
    .input(
      z.object({
          vehicleId: z.number(),
          assignedDriverId: z.number().nullable().optional(),
          unitNumber: z.string().trim().min(1).max(50).nullable().optional(),
          engineMake: z.string().trim().max(100).nullable().optional(),
          mileage: z.number().optional(),
        engineHours: z.number().optional(),
        status: z.enum(["active", "maintenance", "retired"]).optional(),
        configuration: vehicleInspectionConfigSchema.partial().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "owner" && ctx.user.role !== "manager") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only owners and managers can update vehicles",
        });
      }

      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      const updates = {
          ...(input.assignedDriverId !== undefined ? { assignedDriverId: input.assignedDriverId } : {}),
          ...(input.unitNumber !== undefined ? { unitNumber: input.unitNumber?.trim() || null } : {}),
          ...(input.engineMake !== undefined ? { engineMake: input.engineMake?.trim() || null } : {}),
          ...(input.mileage !== undefined ? { mileage: input.mileage } : {}),
        ...(input.engineHours !== undefined ? { engineHours: input.engineHours } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.configuration !== undefined ? { configuration: input.configuration } : {}),
        updatedAt: new Date(),
      };

      const [vehicle] = await db
        .update(vehicles)
        .set(updates)
        .where(eq(vehicles.id, input.vehicleId))
        .returning();

      return vehicle ?? null;
    }),
});
