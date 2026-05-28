import { protectedProcedure, router } from "../_core/trpc";
import { randomUUID } from "crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, gt, inArray, or, sql } from "drizzle-orm";
import { driverInvitations, users, vehicleAssignments, vehicles } from "../../drizzle/schema";
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
import {
  assignDriver,
  assignOwnerOperatorToSelf,
  releaseOwnerOperatorSelfAssignment,
} from "../../vehicle.controller";
import { VEHICLE_TYPE_VALUES, type VehicleTypeValue } from "../../shared/vehicleTypes";
import { parseOwnerOperatorSelfAssignmentNote } from "../services/ownerOperator";

function normalizeAssetType(
  assetType: "tractor" | "straight_truck" | "trailer" | "truck" | "bus" | "van" | "reefer_trailer" | "flatbed_trailer" | "dry_van_trailer" | "other" | undefined
) {
  switch (assetType) {
    case "truck":
    case "bus":
    case "van":
      return "straight_truck" as const;
    case "reefer_trailer":
    case "flatbed_trailer":
    case "dry_van_trailer":
      return "trailer" as const;
    case "tractor":
    case "straight_truck":
    case "trailer":
    case "other":
      return assetType;
    default:
      return "tractor" as const;
  }
}

type VehicleClassificationInput = VehicleTypeValue | "truck" | undefined;

function classifyVehicle(vehicleType: VehicleClassificationInput, assetType: VehicleClassificationInput) {
  const effectiveVehicleType = vehicleType ?? assetType;

  switch (effectiveVehicleType) {
    case "truck":
    case "tractor":
      return {
        assetType: "tractor" as const,
        vehicleType: effectiveVehicleType === "truck" ? "tractor" as const : "tractor" as const,
        assetCategory: "powered_vehicle",
        isPoweredVehicle: true,
        isTrailer: false,
      };
    case "straight_truck":
      return {
        assetType: "straight_truck" as const,
        vehicleType: "straight_truck" as const,
        assetCategory: "powered_vehicle",
        isPoweredVehicle: true,
        isTrailer: false,
      };
    case "bus":
      return {
        assetType: "straight_truck" as const,
        vehicleType: "bus" as const,
        assetCategory: "powered_vehicle",
        isPoweredVehicle: true,
        isTrailer: false,
      };
    case "van":
      return {
        assetType: "straight_truck" as const,
        vehicleType: "van" as const,
        assetCategory: "powered_vehicle",
        isPoweredVehicle: true,
        isTrailer: false,
      };
    case "reefer_trailer":
      return {
        assetType: "trailer" as const,
        vehicleType: "reefer_trailer" as const,
        assetCategory: "trailer",
        isPoweredVehicle: false,
        isTrailer: true,
      };
    case "flatbed_trailer":
      return {
        assetType: "trailer" as const,
        vehicleType: "flatbed_trailer" as const,
        assetCategory: "trailer",
        isPoweredVehicle: false,
        isTrailer: true,
      };
    case "dry_van_trailer":
      return {
        assetType: "trailer" as const,
        vehicleType: "dry_van_trailer" as const,
        assetCategory: "trailer",
        isPoweredVehicle: false,
        isTrailer: true,
      };
    case "trailer":
      return {
        assetType: "trailer" as const,
        vehicleType: "trailer" as const,
        assetCategory: "trailer",
        isPoweredVehicle: false,
        isTrailer: true,
      };
    case "other":
      return {
        assetType: normalizeAssetType(assetType),
        vehicleType: "other" as const,
        assetCategory: "powered_vehicle",
        isPoweredVehicle: true,
        isTrailer: false,
      };
    default:
      return {
        assetType: normalizeAssetType(assetType),
        vehicleType: undefined,
        assetCategory: "powered_vehicle",
        isPoweredVehicle: true,
        isTrailer: false,
      };
  }
}

function getVehicleRelationshipLabel(vehicle: any, fleetVehicles: any[]) {
  const formatVehicleLabel = (candidate: any) =>
    candidate?.unitNumber?.trim() || candidate?.licensePlate?.trim() || candidate?.vin || String(candidate?.id ?? "");

  const linkedPoweredVehicle =
    vehicle.linkedPoweredVehicleId != null
      ? fleetVehicles.find((candidate) => String(candidate.id) === String(vehicle.linkedPoweredVehicleId))
      : null;
  if (linkedPoweredVehicle) {
    return `Linked to ${formatVehicleLabel(linkedPoweredVehicle)}`;
  }

  const linkedTrailers = fleetVehicles.filter(
    (candidate) =>
      candidate.linkedPoweredVehicleId != null &&
      String(candidate.linkedPoweredVehicleId) === String(vehicle.id)
  );
  if (linkedTrailers.length === 0) {
    return null;
  }

  const trailerLabels = linkedTrailers.map(formatVehicleLabel).filter(Boolean);
  if (trailerLabels.length === 0) {
    return null;
  }

  return trailerLabels.length === 1
    ? `Linked trailer ${trailerLabels[0]}`
    : `Linked trailers ${trailerLabels.join(", ")}`;
}

function decorateVehiclesWithRelationshipSummary(
  fleetVehicles: Array<Record<string, any>>
) : any[] {
  return fleetVehicles.map((vehicle) => ({
    ...vehicle,
    linkedVehicleSummary: getVehicleRelationshipLabel(vehicle, fleetVehicles),
  }));
}

async function decorateFleetVehiclesForDashboard(
  db: Exclude<Awaited<ReturnType<typeof getDb>>, null>,
  fleetVehicles: Array<Record<string, any>>
): Promise<any[]> {
  const vehiclesWithRelationships = decorateVehiclesWithRelationshipSummary(
    fleetVehicles
  );
  if (vehiclesWithRelationships.length === 0) {
    return vehiclesWithRelationships;
  }

  const assignedDriverIds = Array.from(
    new Set(
      vehiclesWithRelationships
        .map((vehicle) => vehicle.assignedDriverId)
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    )
  );

  const vehicleIds = vehiclesWithRelationships.map((vehicle) => String(vehicle.id));
  const activeAssignments = await db
    .select({
      id: vehicleAssignments.id,
      vehicleId: vehicleAssignments.vehicleId,
      driverUserId: vehicleAssignments.driverUserId,
      notes: vehicleAssignments.notes,
      updatedAt: vehicleAssignments.updatedAt,
    })
    .from(vehicleAssignments)
    .where(
      and(
        eq(
          vehicleAssignments.fleetId,
          Number(vehiclesWithRelationships[0]?.fleetId ?? 0)
        ),
        eq(vehicleAssignments.status, "active"),
        inArray(vehicleAssignments.vehicleId, vehicleIds)
      )
    );

  const ownerOperatorAssignments = new Map<
    string,
    {
      ownerOperatorUserId: number;
      ownerOperatorName: string | null;
      previousDriverUserId: number | null;
      previousDriverName: string | null;
      assignedAt: string;
    }
  >();

  for (const row of activeAssignments) {
    const metadata = parseOwnerOperatorSelfAssignmentNote(row.notes);
    if (!metadata) continue;
    const vehicleId = String(row.vehicleId);
    if (!ownerOperatorAssignments.has(vehicleId)) {
      ownerOperatorAssignments.set(vehicleId, metadata);
    }
    if (typeof row.driverUserId === "number" && Number.isFinite(row.driverUserId)) {
      assignedDriverIds.push(row.driverUserId);
    }
    if (metadata.previousDriverUserId != null) {
      assignedDriverIds.push(metadata.previousDriverUserId);
    }
    if (metadata.ownerOperatorUserId != null) {
      assignedDriverIds.push(metadata.ownerOperatorUserId);
    }
  }

  const uniqueAssignedDriverIds = Array.from(
    new Set(
      assignedDriverIds.filter(
        (value): value is number => typeof value === "number" && Number.isFinite(value)
      )
    )
  );

  const assignedDriverRows =
    uniqueAssignedDriverIds.length > 0
      ? await db
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(inArray(users.id, uniqueAssignedDriverIds))
      : [];
  const assignedDriverMap = new Map(
    assignedDriverRows.map((row) => [row.id, row.name?.trim() || row.email || null])
  );

  return vehiclesWithRelationships.map((vehicle) => {
    const ownerOperatorSelfAssignment = ownerOperatorAssignments.get(String(vehicle.id)) ?? null;
    const assignedDriverDisplayName =
      (typeof vehicle.assignedDriverId === "number"
        ? assignedDriverMap.get(vehicle.assignedDriverId) ?? null
        : null) ??
      (ownerOperatorSelfAssignment?.ownerOperatorUserId === vehicle.assignedDriverId
        ? ownerOperatorSelfAssignment?.ownerOperatorName ?? null
        : null);

    return {
      ...vehicle,
      assignedDriverDisplayName,
      ownerOperatorSelfAssignment,
    } as any;
  });
}

const vehicleCreateReturnShape = {
  id: vehicles.id,
  fleetId: vehicles.fleetId,
  assignedDriverId: vehicles.assignedDriverId,
  unitNumber: vehicles.unitNumber,
  vin: vehicles.vin,
  licensePlate: vehicles.licensePlate,
  make: vehicles.make,
  engineMake: vehicles.engineMake,
  model: vehicles.model,
  year: vehicles.year,
};

const vehicleCreateModernReturnShape = {
  ...vehicleCreateReturnShape,
  assetRecordStatus: vehicles.assetRecordStatus,
};

function getVehicleCreateErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? "Vehicle creation failed");
}

function isLegacyVehicleSchemaError(message: string) {
  const normalized = message.toLowerCase();
  if (!normalized.includes("vehicles")) return false;

  return [
    "assettype",
    "assetcategory",
    "vehicletype",
    "ispoweredvehicle",
    "istrailer",
    "assetrecordstatus",
    "createdbyuserid",
    "linkedpoweredvehicleid",
    "trailerlinkstatus",
    "operationaldecision",
    "lastcleaninspection",
  ].some((fragment) => normalized.includes(fragment));
}

function isVehicleIdTypeMismatch(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("invalid input syntax for type integer") ||
    (normalized.includes("\"id\"") &&
      normalized.includes("integer") &&
      (normalized.includes("character varying") || normalized.includes("text")))
  );
}

function isDuplicateVinError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("vin") &&
    (normalized.includes("duplicate key") ||
      normalized.includes("already exists") ||
      normalized.includes("ix_vehicles_vin") ||
      normalized.includes("unique"))
  );
}

export const vehiclesRouter = router({
  /**
   * Create a new vehicle (truck)
   */
  create: protectedProcedure
    .input(
      z.object({
        fleetId: z.number().int().positive("A valid fleet is required to create a vehicle"),
        assignedDriverId: z.number().nullable().optional(),
        assetType: z.enum([
          "tractor", "straight_truck", "trailer", "truck", "bus", 
          "van", "reefer_trailer", "flatbed_trailer", "dry_van_trailer", "other"
        ]).optional(),
        vehicleType: z.enum(VEHICLE_TYPE_VALUES).optional(),
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

      const resolvedFleetId = input.fleetId;

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
      const classification = classifyVehicle(input.vehicleType, input.assetType);

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
      const generatedVehicleId = `veh_${randomUUID()}`;
      const baseInsertValues = {
        fleetId: resolvedFleetId,
        assignedDriverId: null,
        unitNumber: input.unitNumber?.trim() || null,
        vin: input.vin,
        licensePlate: input.licensePlate?.trim() || "UNKNOWN",
        make: input.make,
        engineMake: input.engineMake?.trim() || null,
        model: input.model,
        year: input.year,
        configuration: input.configuration,
        status: (assetRecordStatus === "active" ? "active" : "maintenance") as "active" | "maintenance",
      };
      try {
        [vehicle] = await db
          .insert(vehicles)
          .values({
            id: generatedVehicleId,
            ...baseInsertValues,
            assetType: classification.assetType,
            assetCategory: classification.assetCategory,
            vehicleType: classification.vehicleType,
            isPoweredVehicle: classification.isPoweredVehicle,
            isTrailer: classification.isTrailer,
            assetRecordStatus,
            createdByUserId: ctx.user.id,
          })
          .returning(vehicleCreateModernReturnShape);
      } catch (error) {
        const message = getVehicleCreateErrorMessage(error);
        if (isDuplicateVinError(message)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "This VIN is already on file. Search your fleet before adding it again. If you believe it was added incorrectly, contact support.",
          });
        }
        const shouldRetryWithLegacyPayload =
          isLegacyVehicleSchemaError(message) || isVehicleIdTypeMismatch(message);

        if (!shouldRetryWithLegacyPayload) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Unable to save this vehicle record. ${message}`,
          });
        }

        try {
          console.warn("[Vehicles] Falling back to legacy-compatible vehicle insert.", {
            fleetId: resolvedFleetId,
            reason: message,
          });

          const legacyValues = {
            ...baseInsertValues,
            ...(isVehicleIdTypeMismatch(message) ? {} : { id: generatedVehicleId }),
          };

          [vehicle] = await db
            .insert(vehicles)
            .values(legacyValues as any)
            .returning(vehicleCreateReturnShape);

          vehicle = {
            ...vehicle,
            assetRecordStatus,
          };
        } catch (legacyError) {
          const legacyMessage = getVehicleCreateErrorMessage(legacyError);
          if (isDuplicateVinError(legacyMessage)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "This VIN is already on file. Search your fleet before adding it again. If you believe it was added incorrectly, contact support.",
            });
          }
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Unable to save this vehicle record. ${legacyMessage}`,
          });
        }
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
    .input(z.object({ vehicleId: z.union([z.number(), z.string().trim().min(1)]) }))
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
        .where(sql`CAST(${vehicles.id} AS text) = ${String(input.vehicleId)}`)
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

        const fleetVehicles = await db
          .select()
          .from(vehicles)
          .where(eq(vehicles.fleetId, input.fleetId));
        return decorateFleetVehiclesForDashboard(db, fleetVehicles);
      }

      const scopedVehicles = await listDriverAccessibleVehicles({
        fleetId: input.fleetId,
        driverUserId: ctx.user.id,
      });

      if (scopedVehicles.length > 0) {
        return decorateVehiclesWithRelationshipSummary(scopedVehicles);
      }

      return [];
    }),

  listMine: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    if (ctx.user.role === "owner" || ctx.user.role === "manager") {
      const fleetId = await getUserPrimaryFleetId(ctx.user.id);
      if (!fleetId || fleetId <= 0) {
        return [];
      }

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

      const fleetVehicles = await db
        .select()
        .from(vehicles)
        .where(eq(vehicles.fleetId, fleetId));
      return decorateFleetVehiclesForDashboard(db, fleetVehicles);
    }

    const vehiclesAcrossFleets = await listDriverAccessibleVehiclesAcrossFleets({
      driverUserId: ctx.user.id,
    });
    return decorateVehiclesWithRelationshipSummary(vehiclesAcrossFleets);
    }),

  /**
   * Update vehicle details
   */
  update: protectedProcedure
    .input(
      z.object({
          vehicleId: z.union([z.number(), z.string().trim().min(1)]),
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
        .where(sql`CAST(${vehicles.id} AS text) = ${String(input.vehicleId)}`)
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
        .where(sql`CAST(${vehicles.id} AS text) = ${String(input.vehicleId)}`)
        .limit(1);

      const [vehicle] = await db
        .update(vehicles)
        .set(updates)
        .where(sql`CAST(${vehicles.id} AS text) = ${String(input.vehicleId)}`)
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

  assignOwnerOperatorToSelf: protectedProcedure
    .input(
      z.object({
        fleetId: z.number(),
        vehicleId: z.union([z.coerce.number(), z.string().trim().min(1)]),
        confirmTakeover: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return await assignOwnerOperatorToSelf({ input, ctx });
    }),

  releaseOwnerOperatorSelfAssignment: protectedProcedure
    .input(
      z.object({
        fleetId: z.number(),
        vehicleId: z.union([z.coerce.number(), z.string().trim().min(1)]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return await releaseOwnerOperatorSelfAssignment({ input, ctx });
    }),
});
