import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, gt, or } from "drizzle-orm";
import { driverInvitations, vehicleAssignments, vehicles } from "../../drizzle/schema";
import { getDb } from "../db";
import { vehicleInspectionConfigSchema } from "../../shared/inspection";
import {
  getEntitlementState,
  syncStripeQuantityForActiveVehicles,
} from "../services/subscriptions";
import { recordPilotMilestone } from "../services/pilotAccess";
import {
  canManageVehicleAccess,
  canViewVehicle,
  listDriverAccessibleVehicles,
  listDriverAccessibleVehiclesAcrossFleets,
  verifyDriverBelongsToFleet,
} from "../services/vehicleAccess";
import { getUserPrimaryFleetId } from "../services/companyAccess";
import { assignDriver } from "../../vehicle.controller";

export const vehiclesRouter = router({
  /**
   * Create a new vehicle (truck)
   */
  create: protectedProcedure
    .input(
      z.object({
        fleetId: z.number(),
        assignedDriverId: z.number().nullable().optional(),
        assetType: z.enum([
          "tractor", "straight_truck", "trailer", "truck", "bus", 
          "van", "reefer_trailer", "flatbed_trailer", "dry_van_trailer", "other"
        ]).optional(),
        unitNumber: z.string().trim().min(1).max(50).optional(),
        vin: z.string().length(17, "VIN must be 17 characters"),
        licensePlate: z.string().trim().min(1).max(20).optional(),
        make: z.string().optional(),
        engineMake: z.string().trim().max(100).optional(),
        model: z.string().optional(),
        year: z.number().optional(),
        assetRecordStatus: z.enum(["active", "inactive", "draft", "archived"]).optional(),
        configuration: vehicleInspectionConfigSchema.partial().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "owner" && ctx.user.role !== "manager") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only fleet owners and managers can create vehicles",
        });
      }

      const resolvedFleetId =
        typeof input.fleetId === "number" && input.fleetId > 0
          ? input.fleetId
          : await getUserPrimaryFleetId(ctx.user.id);

      if (input.fleetId !== resolvedFleetId) {
        console.warn("[Vehicles] Recovered invalid create fleetId from user primary fleet.", {
          requestedFleetId: input.fleetId,
          resolvedFleetId,
          userId: ctx.user.id,
        });
      }

      if (!resolvedFleetId || resolvedFleetId <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "TruckFixr could not determine which fleet should own this vehicle.",
        });
      }

      const canManage = await canManageVehicleAccess({
        fleetId: resolvedFleetId,
        user: ctx.user,
      });

      if (!canManage) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to manage vehicles in this fleet",
        });
      }

      const entitlement = await getEntitlementState({
        userId: ctx.user.id,
        fleetId: resolvedFleetId,
      });

      const db = await getDb();

      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      const requestedAssetRecordStatus = input.assetRecordStatus ?? "active";
      const assetRecordStatus =
        requestedAssetRecordStatus === "active" && !entitlement.canAddVehicle
          ? "draft"
          : requestedAssetRecordStatus;

      if (input.assignedDriverId != null) {
        if (assetRecordStatus !== "active") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Only active company assets can be assigned to drivers",
          });
        }

        const driverBelongsToFleet = await verifyDriverBelongsToFleet({
          fleetId: resolvedFleetId,
          driverUserId: input.assignedDriverId,
        });

        if (!driverBelongsToFleet) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "The selected driver is not linked to this fleet yet",
          });
        }
      }
      let vehicle;
      try {
        [vehicle] = await db
          .insert(vehicles)
          .values({
            fleetId: resolvedFleetId,
            assignedDriverId: null,
            assetType: input.assetType ?? "tractor",
            unitNumber: input.unitNumber?.trim() || null,
            vin: input.vin,
            licensePlate: input.licensePlate?.trim() || "UNKNOWN",
            make: input.make,
            engineMake: input.engineMake?.trim() || null,
            model: input.model,
            year: input.year,
            configuration: input.configuration,
            status: assetRecordStatus === "active" ? "active" : "maintenance",
            assetRecordStatus,
            createdByUserId: ctx.user.id,
          })
          .returning();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Vehicle creation failed";
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unable to save this vehicle record. ${message}`,
        });
      }

      if (input.assignedDriverId != null) {
        await db
          .insert(vehicleAssignments)
          .values({
            fleetId: resolvedFleetId,
            vehicleId: vehicle.id,
            driverUserId: input.assignedDriverId,
            assignedByUserId: ctx.user.id,
            accessType: "permanent",
            startsAt: new Date(),
            status: "active",
            notes: "Assigned during vehicle creation",
          });

        try {
          await db
            .update(vehicles)
            .set({
              assignedDriverId: input.assignedDriverId,
              updatedAt: new Date(),
            })
            .where(eq(vehicles.id, vehicle.id));
        } catch (error) {
          console.warn("[Vehicles] Vehicle created and assignment saved, but assignedDriverId legacy column could not be updated.", {
            vehicleId: vehicle.id,
            driverUserId: input.assignedDriverId,
            error: error instanceof Error ? error.message : error,
          });
        }
      }
      
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

      if (vehicle.assetRecordStatus === "active") {
        await syncStripeQuantityForActiveVehicles({
          userId: ctx.user.id,
          fleetId: vehicle.fleetId,
          prorationBehavior: "create_prorations",
        });
      }
      
      return vehicle;
    }),

  /**
   * Get vehicle by ID
   */
  getById: protectedProcedure
    .input(z.object({ vehicleId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return null;

      const allowed = await canViewVehicle({
        user: ctx.user,
        vehicleId: input.vehicleId,
      });

      if (!allowed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this vehicle",
        });
      }

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
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];

      if (ctx.user.role === "owner" || ctx.user.role === "manager") {
        const allowed = await canManageVehicleAccess({
          fleetId: input.fleetId,
          user: ctx.user,
        });

        if (!allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You do not have access to this fleet",
          });
        }

        return db.select().from(vehicles).where(eq(vehicles.fleetId, input.fleetId));
      }

      const scopedVehicles = await listDriverAccessibleVehicles({
        fleetId: input.fleetId,
        driverUserId: ctx.user.id,
      });

      if (scopedVehicles.length > 0) {
        return scopedVehicles;
      }

      return [];
    }),

  listMine: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    if (ctx.user.role === "owner" || ctx.user.role === "manager") {
      const fleetId = await getUserPrimaryFleetId(ctx.user.id);
      const allowed = await canManageVehicleAccess({
        fleetId,
        user: ctx.user,
      });

      if (!allowed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this fleet",
        });
      }

      return db.select().from(vehicles).where(eq(vehicles.fleetId, fleetId));
    }

    return listDriverAccessibleVehiclesAcrossFleets({
      driverUserId: ctx.user.id,
    });
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
        assetRecordStatus: z.enum(["active", "inactive", "draft", "archived"]).optional(),
        configuration: vehicleInspectionConfigSchema.partial().optional(),
        assetType: z.enum([
          "tractor", "straight_truck", "trailer", "truck", "bus", 
          "van", "reefer_trailer", "flatbed_trailer", "dry_van_trailer", "other"
        ]).optional(),
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

      const [targetVehicle] = await db
        .select({ fleetId: vehicles.fleetId })
        .from(vehicles)
        .where(eq(vehicles.id, input.vehicleId))
        .limit(1);

      if (!targetVehicle) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Vehicle not found",
        });
      }

      const canManage = await canManageVehicleAccess({
        fleetId: targetVehicle.fleetId,
        user: ctx.user,
      });

      if (!canManage) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to manage vehicles in this fleet",
        });
      }

      const updates = {
          ...(input.assignedDriverId !== undefined ? { assignedDriverId: input.assignedDriverId } : {}),
          ...(input.unitNumber !== undefined ? { unitNumber: input.unitNumber?.trim() || null } : {}),
          ...(input.engineMake !== undefined ? { engineMake: input.engineMake?.trim() || null } : {}),
          ...(input.mileage !== undefined ? { mileage: input.mileage } : {}),
        ...(input.engineHours !== undefined ? { engineHours: input.engineHours } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.assetRecordStatus !== undefined ? { assetRecordStatus: input.assetRecordStatus } : {}),
        ...(input.configuration !== undefined ? { configuration: input.configuration } : {}),
        ...(input.assetType !== undefined ? { assetType: input.assetType } : {}),
        updatedAt: new Date(),
      };

      const [existingVehicle] = await db
        .select({
          id: vehicles.id,
          fleetId: vehicles.fleetId,
          status: vehicles.status,
        })
        .from(vehicles)
        .where(eq(vehicles.id, input.vehicleId))
        .limit(1);

      const [vehicle] = await db
        .update(vehicles)
        .set(updates)
        .where(eq(vehicles.id, input.vehicleId))
        .returning();

      if (
        vehicle &&
        existingVehicle &&
        existingVehicle.status !== vehicle.status &&
        (existingVehicle.status === "active" || vehicle.status === "active")
      ) {
        await syncStripeQuantityForActiveVehicles({
          userId: ctx.user.id,
          fleetId: vehicle.fleetId,
          prorationBehavior: vehicle.status === "active" ? "create_prorations" : "none",
        });
      }

      return vehicle ?? null;
    }),

  assignDriver: protectedProcedure
    .input(z.object({
      fleetId: z.number(),
      vehicleId: z.union([z.coerce.number(), z.string().trim().min(1)]),
      driverUserId: z.union([z.coerce.number(), z.string().trim().min(1)]).nullable().optional(),
      accessType: z.enum(['permanent', 'temporary']),
      expiresAt: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
      driverMode: z.enum(['existing', 'invite']),
      inviteFirstName: z.string().optional(),
      inviteLastName: z.string().optional(),
      inviteEmail: z.string().optional(),
      confirmReassign: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      return await assignDriver({ input, ctx });
    }),
});
