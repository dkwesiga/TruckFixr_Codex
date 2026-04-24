import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  companyMemberships,
  inAppAlerts,
  users,
  vehicleAccessRequests,
  vehicleAssignments,
  vehicles,
} from "../../drizzle/schema";
import {
  canManageVehicleAccess,
  canViewVehicle,
  getActiveVehicleAssignment,
  getVehicleById,
  listFleetGrantContacts,
  getPrimaryFleetGrantContact,
  verifyDriverBelongsToFleet,
} from "../services/vehicleAccess";

const accessTypeSchema = z.enum(["permanent", "temporary"]);
const requestReasonSchema = z.enum([
  "assigned_to_this_unit_today",
  "need_to_complete_inspection",
  "need_to_report_defect",
  "need_to_run_diagnosis",
  "trailer_swap",
  "emergency_roadside_issue",
  "other",
]);

function normalizeDate(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid date provided",
    });
  }
  return parsed;
}

function isUrgentReason(reason: z.infer<typeof requestReasonSchema>) {
  return reason === "emergency_roadside_issue";
}

async function notifyUsers(input: {
  fleetId: number;
  vehicleId?: number | null;
  actorUserId: number;
  recipientUserIds: number[];
  alertType: string;
  severity?: string;
  title: string;
  message: string;
}) {
  const db = await getDb();
  if (!db || input.recipientUserIds.length === 0) return;

  const uniqueRecipientIds = Array.from(new Set(input.recipientUserIds.filter(Boolean)));
  await db.insert(inAppAlerts).values(
    uniqueRecipientIds.map((userId) => ({
      fleetId: input.fleetId,
      userId,
      vehicleId: input.vehicleId ?? null,
      alertType: input.alertType,
      severity: input.severity ?? "info",
      title: input.title,
      message: input.message,
      createdAt: new Date(),
      updatedAt: new Date(),
    }))
  );
}

export const vehicleAccessRouter = router({
  getGrantContacts: protectedProcedure
    .input(z.object({ fleetId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const contacts = await listFleetGrantContacts(input.fleetId);
      return {
        grantors: contacts,
        primaryGrantor: contacts[0] ?? null,
      };
    }),

  listFleetDrivers: protectedProcedure
    .input(z.object({ fleetId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];

      const canManage = await canManageVehicleAccess({
        fleetId: input.fleetId,
        user: ctx.user,
      });
      if (!canManage) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to view drivers for this fleet",
        });
      }

      const grantors = await listFleetGrantContacts(input.fleetId);
      const membershipRows = await db
        .select({
          userId: companyMemberships.userId,
          role: companyMemberships.role,
          status: companyMemberships.status,
        })
        .from(companyMemberships)
        .where(eq(companyMemberships.fleetId, input.fleetId));

      const activeDriverIds = membershipRows
        .filter((row) => row.role === "driver" && row.status === "active")
        .map((row) => row.userId);

      const legacyDriverRows = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          managerUserId: users.managerUserId,
          managerEmail: users.managerEmail,
        })
        .from(users)
        .where(eq(users.role, "driver"));

      const grantorIds = grantors.map((grantor) => grantor.id);
      const grantorEmails = grantors
        .map((grantor) => grantor.email?.trim().toLowerCase())
        .filter((value): value is string => Boolean(value));

      return legacyDriverRows
        .filter((driver) => {
          if (activeDriverIds.includes(driver.id)) {
            return true;
          }

          return (
            (driver.managerUserId != null && grantorIds.includes(driver.managerUserId)) ||
            (driver.managerEmail != null &&
              grantorEmails.includes(driver.managerEmail.trim().toLowerCase()))
          );
        })
        .sort((left, right) =>
          (left.name || left.email || "").localeCompare(right.name || right.email || "")
        );
    }),

  listVehicleAccess: protectedProcedure
    .input(
      z.object({
        fleetId: z.number().int().positive(),
        vehicleId: z.number().int().positive(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { assignments: [], pendingRequests: [], vehicle: null };

      const canManage = await canManageVehicleAccess({
        fleetId: input.fleetId,
        user: ctx.user,
      });
      if (!canManage) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to manage vehicle access in this fleet",
        });
      }

      const [vehicle] = await db
        .select()
        .from(vehicles)
        .where(and(eq(vehicles.id, input.vehicleId), eq(vehicles.fleetId, input.fleetId)))
        .limit(1);

      if (!vehicle) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Vehicle not found",
        });
      }

      if (vehicle.assetRecordStatus !== "active") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only active company assets can be assigned to drivers",
        });
      }

      const assignmentRows = await db
        .select({
          id: vehicleAssignments.id,
          driverUserId: vehicleAssignments.driverUserId,
          assignedByUserId: vehicleAssignments.assignedByUserId,
          accessType: vehicleAssignments.accessType,
          startsAt: vehicleAssignments.startsAt,
          expiresAt: vehicleAssignments.expiresAt,
          status: vehicleAssignments.status,
          notes: vehicleAssignments.notes,
          createdAt: vehicleAssignments.createdAt,
          updatedAt: vehicleAssignments.updatedAt,
        })
        .from(vehicleAssignments)
        .where(
          and(
            eq(vehicleAssignments.fleetId, input.fleetId),
            eq(vehicleAssignments.vehicleId, input.vehicleId)
          )
        )
        .orderBy(desc(vehicleAssignments.updatedAt));
      const effectiveAssignmentRows =
        assignmentRows.length === 0 && vehicle.assignedDriverId
          ? [
              {
                id: 0,
                driverUserId: vehicle.assignedDriverId,
                assignedByUserId: ctx.user.id,
                accessType: "permanent",
                startsAt: vehicle.createdAt,
                expiresAt: null,
                status: "active",
                notes: "Legacy vehicle assignment",
                createdAt: vehicle.createdAt,
                updatedAt: vehicle.updatedAt,
              },
            ]
          : assignmentRows;

      const pendingRequests = await db
        .select()
        .from(vehicleAccessRequests)
        .where(
          and(
            eq(vehicleAccessRequests.fleetId, input.fleetId),
            eq(vehicleAccessRequests.vehicleId, input.vehicleId),
            eq(vehicleAccessRequests.status, "pending")
          )
        )
        .orderBy(desc(vehicleAccessRequests.createdAt));

      const driverIds = Array.from(
        new Set([
          ...effectiveAssignmentRows.map((row) => row.driverUserId),
          ...pendingRequests.map((row) => row.requestedByDriverId),
        ])
      );

      const driverRows =
        driverIds.length > 0
          ? await db
              .select({ id: users.id, name: users.name, email: users.email })
              .from(users)
              .where(inArray(users.id, driverIds))
          : [];
      const driverMap = new Map(driverRows.map((row) => [row.id, row]));

      return {
        vehicle,
        assignments: effectiveAssignmentRows.map((row) => ({
          ...row,
          driver:
            driverMap.get(row.driverUserId) ?? {
              id: row.driverUserId,
              name: null,
              email: null,
            },
        })),
        pendingRequests: pendingRequests.map((row) => ({
          ...row,
          driver:
            driverMap.get(row.requestedByDriverId) ?? {
              id: row.requestedByDriverId,
              name: null,
              email: null,
            },
          urgent: isUrgentReason(row.reason as z.infer<typeof requestReasonSchema>),
        })),
      };
    }),

  listPendingRequests: protectedProcedure
    .input(z.object({ fleetId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];

      const canManage = await canManageVehicleAccess({
        fleetId: input.fleetId,
        user: ctx.user,
      });
      if (!canManage) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to manage vehicle access in this fleet",
        });
      }

      const requests = await db
        .select()
        .from(vehicleAccessRequests)
        .where(
          and(
            eq(vehicleAccessRequests.fleetId, input.fleetId),
            eq(vehicleAccessRequests.status, "pending")
          )
        )
        .orderBy(desc(vehicleAccessRequests.createdAt));

      const vehicleIds = Array.from(
        new Set(requests.map((row) => row.vehicleId).filter((value): value is number => typeof value === "number"))
      );
      const driverIds = Array.from(new Set(requests.map((row) => row.requestedByDriverId)));

      const [vehicleRows, driverRows] = await Promise.all([
        vehicleIds.length > 0
          ? db
              .select({
                id: vehicles.id,
                unitNumber: vehicles.unitNumber,
                vin: vehicles.vin,
                licensePlate: vehicles.licensePlate,
                make: vehicles.make,
                model: vehicles.model,
                assetType: vehicles.assetType,
              })
              .from(vehicles)
              .where(inArray(vehicles.id, vehicleIds))
          : Promise.resolve([]),
        driverIds.length > 0
          ? db
              .select({ id: users.id, name: users.name, email: users.email })
              .from(users)
              .where(inArray(users.id, driverIds))
          : Promise.resolve([]),
      ]);

      const vehicleMap = new Map(vehicleRows.map((row) => [row.id, row]));
      const driverMap = new Map(driverRows.map((row) => [row.id, row]));

      return requests
        .map((row) => ({
          ...row,
          urgent: isUrgentReason(row.reason as z.infer<typeof requestReasonSchema>),
          vehicle: row.vehicleId ? vehicleMap.get(row.vehicleId) ?? null : null,
          driver: driverMap.get(row.requestedByDriverId) ?? null,
        }))
        .sort((left, right) => Number(right.urgent) - Number(left.urgent));
    }),

  listMyRequests: protectedProcedure
    .input(z.object({ fleetId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== "driver") {
        return [];
      }

      const db = await getDb();
      if (!db) return [];

      const requests = await db
        .select()
        .from(vehicleAccessRequests)
        .where(
          and(
            eq(vehicleAccessRequests.fleetId, input.fleetId),
            eq(vehicleAccessRequests.requestedByDriverId, ctx.user.id)
          )
        )
        .orderBy(desc(vehicleAccessRequests.createdAt));

      const vehicleIds = Array.from(
        new Set(requests.map((row) => row.vehicleId).filter((value): value is number => typeof value === "number"))
      );
      const vehicleRows =
        vehicleIds.length > 0
          ? await db
              .select({
                id: vehicles.id,
                unitNumber: vehicles.unitNumber,
                vin: vehicles.vin,
                licensePlate: vehicles.licensePlate,
                make: vehicles.make,
                model: vehicles.model,
                assetType: vehicles.assetType,
              })
              .from(vehicles)
              .where(inArray(vehicles.id, vehicleIds))
          : [];
      const vehicleMap = new Map(vehicleRows.map((row) => [row.id, row]));

      return requests.map((row) => ({
        ...row,
        urgent: isUrgentReason(row.reason as z.infer<typeof requestReasonSchema>),
        vehicle: row.vehicleId ? vehicleMap.get(row.vehicleId) ?? null : null,
      }));
    }),

  listRequestableVehicles: protectedProcedure
    .input(
      z.object({
        fleetId: z.number().int().positive(),
        query: z.string().trim().min(1),
      })
    )
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== "driver") {
        return [];
      }

      const db = await getDb();
      if (!db) return [];

      const query = input.query.trim().toLowerCase();
      const fleetVehicles = await db
        .select({
          id: vehicles.id,
          fleetId: vehicles.fleetId,
          unitNumber: vehicles.unitNumber,
          vin: vehicles.vin,
          licensePlate: vehicles.licensePlate,
          make: vehicles.make,
          model: vehicles.model,
          year: vehicles.year,
          assetType: vehicles.assetType,
        })
        .from(vehicles)
        .where(eq(vehicles.fleetId, input.fleetId));

      const visibleVehicles: typeof fleetVehicles = [];
      for (const vehicle of fleetVehicles) {
        const alreadyAccessible = await canViewVehicle({
          user: ctx.user,
          vehicleId: vehicle.id,
          fleetId: input.fleetId,
        });
        if (alreadyAccessible) continue;

        const haystack = [
          vehicle.unitNumber,
          vehicle.vin,
          vehicle.licensePlate,
          vehicle.make,
          vehicle.model,
          vehicle.assetType,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (haystack.includes(query)) {
          visibleVehicles.push(vehicle);
        }
      }

      return visibleVehicles.slice(0, 10);
    }),

  assignDriverAccess: protectedProcedure
    .input(
      z.object({
        fleetId: z.number().int().positive(),
        vehicleId: z.number().int().positive(),
        driverUserId: z.number().int().positive(),
        accessType: accessTypeSchema.default("permanent"),
        startsAt: z.string().optional(),
        expiresAt: z.string().optional(),
        notes: z.string().trim().max(500).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const canManage = await canManageVehicleAccess({
        fleetId: input.fleetId,
        user: ctx.user,
      });
      if (!canManage) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to manage vehicle access in this fleet",
        });
      }

      const [vehicle] = await db
        .select()
        .from(vehicles)
        .where(and(eq(vehicles.id, input.vehicleId), eq(vehicles.fleetId, input.fleetId)))
        .limit(1);
      if (!vehicle) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Vehicle not found" });
      }

      const driverBelongsToFleet = await verifyDriverBelongsToFleet({
        fleetId: input.fleetId,
        driverUserId: input.driverUserId,
      });
      if (!driverBelongsToFleet) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That driver is not linked to this fleet",
        });
      }

      const startsAt = normalizeDate(input.startsAt) ?? new Date();
      const expiresAt = normalizeDate(input.expiresAt);
      if (input.accessType === "temporary" && !expiresAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Temporary access requires an expiry date",
        });
      }
      if (expiresAt && expiresAt <= startsAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Expiry date must be after the start date",
        });
      }

      const existing = await getActiveVehicleAssignment({
        vehicleId: input.vehicleId,
        driverUserId: input.driverUserId,
      });

      let assignment;
      if (existing) {
        [assignment] = await db
          .update(vehicleAssignments)
          .set({
            accessType: input.accessType,
            startsAt,
            expiresAt,
            status: "active",
            notes: input.notes?.trim() || null,
            assignedByUserId: ctx.user.id,
            updatedAt: new Date(),
          })
          .where(eq(vehicleAssignments.id, existing.id))
          .returning();
      } else {
        try {
          [assignment] = await db
            .insert(vehicleAssignments)
            .values({
              fleetId: input.fleetId,
              vehicleId: input.vehicleId,
              driverUserId: input.driverUserId,
              assignedByUserId: ctx.user.id,
              accessType: input.accessType,
              startsAt,
              expiresAt,
              status: "active",
              notes: input.notes?.trim() || null,
            })
            .returning();
        } catch (error) {
          console.warn("[VehicleAccess] Falling back to legacy vehicle assignment storage.", {
            vehicleId: input.vehicleId,
            driverUserId: input.driverUserId,
            error: error instanceof Error ? error.message : error,
          });
          assignment = null;
        }
      }

      await db
        .update(vehicles)
        .set({ assignedDriverId: input.driverUserId, updatedAt: new Date() })
        .where(eq(vehicles.id, input.vehicleId));

      await notifyUsers({
        fleetId: input.fleetId,
        vehicleId: input.vehicleId,
        actorUserId: ctx.user.id,
        recipientUserIds: [input.driverUserId],
        alertType: "vehicle_access_granted",
        severity: "info",
        title: "Vehicle access granted",
        message:
          input.accessType === "temporary" && expiresAt
            ? `You now have temporary access to this vehicle until ${expiresAt.toLocaleString()}.`
            : "You now have vehicle access assigned by your fleet manager.",
      });

      return (
        assignment ?? {
          id: 0,
          fleetId: input.fleetId,
          vehicleId: input.vehicleId,
          driverUserId: input.driverUserId,
          assignedByUserId: ctx.user.id,
          accessType: input.accessType,
          startsAt,
          expiresAt,
          status: "active",
          notes: input.notes?.trim() || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      );
    }),

  revokeDriverAccess: protectedProcedure
    .input(
      z.object({
        assignmentId: z.number().int().positive(),
        managerNote: z.string().trim().max(500).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [assignment] = await db
        .select()
        .from(vehicleAssignments)
        .where(eq(vehicleAssignments.id, input.assignmentId))
        .limit(1);
      if (!assignment) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Assignment not found" });
      }

      const canManage = await canManageVehicleAccess({
        fleetId: assignment.fleetId,
        user: ctx.user,
      });
      if (!canManage) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to revoke access in this fleet",
        });
      }

      const [updated] = await db
        .update(vehicleAssignments)
        .set({
          status: "revoked",
          notes: input.managerNote?.trim() || assignment.notes,
          updatedAt: new Date(),
        })
        .where(eq(vehicleAssignments.id, input.assignmentId))
        .returning();

      await notifyUsers({
        fleetId: assignment.fleetId,
        vehicleId: assignment.vehicleId,
        actorUserId: ctx.user.id,
        recipientUserIds: [assignment.driverUserId],
        alertType: "vehicle_access_revoked",
        severity: "warning",
        title: "Vehicle access removed",
        message: input.managerNote?.trim() || "Your vehicle access was removed by a fleet manager.",
      });

      return updated;
    }),

  createAccessRequest: protectedProcedure
    .input(
      z.object({
        fleetId: z.number().int().positive(),
        vehicleId: z.number().int().positive().optional(),
        requestedVehicleIdentifier: z.string().trim().max(255).optional(),
        requestedFromUserId: z.number().int().positive().optional(),
        reason: requestReasonSchema,
        note: z.string().trim().max(500).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "driver") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only drivers can request vehicle access",
        });
      }

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      if (!input.vehicleId && !input.requestedVehicleIdentifier?.trim()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Select a vehicle or enter a vehicle identifier",
        });
      }

      if (input.vehicleId) {
        const vehicle = await getVehicleById(input.vehicleId);
        if (!vehicle || vehicle.fleetId !== input.fleetId) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Vehicle not found in this fleet",
          });
        }

        const alreadyAccessible = await canViewVehicle({
          user: ctx.user,
          vehicleId: input.vehicleId,
          fleetId: input.fleetId,
        });
        if (alreadyAccessible) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "You already have access to this vehicle",
          });
        }
      }

      const pendingExisting = await db
        .select({ id: vehicleAccessRequests.id })
        .from(vehicleAccessRequests)
        .where(
          and(
            eq(vehicleAccessRequests.fleetId, input.fleetId),
            eq(vehicleAccessRequests.requestedByDriverId, ctx.user.id),
            eq(vehicleAccessRequests.status, "pending"),
            input.vehicleId
              ? eq(vehicleAccessRequests.vehicleId, input.vehicleId)
              : eq(
                  vehicleAccessRequests.requestedVehicleIdentifier,
                  input.requestedVehicleIdentifier?.trim() || ""
                )
          )
        )
        .limit(1);

      if (pendingExisting.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A request for this vehicle is already pending",
        });
      }

      const [request] = await db
        .insert(vehicleAccessRequests)
        .values({
          fleetId: input.fleetId,
          vehicleId: input.vehicleId ?? null,
          requestedVehicleIdentifier: input.requestedVehicleIdentifier?.trim() || null,
          requestedByDriverId: ctx.user.id,
          reason: input.reason,
          note: input.note?.trim() || null,
          status: "pending",
        })
        .returning();

      const grantContacts = await listFleetGrantContacts(input.fleetId);
      const primaryGrantor = await getPrimaryFleetGrantContact(input.fleetId);

      const [vehicle] = input.vehicleId
        ? await db
            .select({ unitNumber: vehicles.unitNumber, vin: vehicles.vin, licensePlate: vehicles.licensePlate })
            .from(vehicles)
            .where(eq(vehicles.id, input.vehicleId))
            .limit(1)
        : [null];

      const targetedRecipientIds =
        input.requestedFromUserId &&
        grantContacts.some((contact) => contact.id === input.requestedFromUserId)
          ? [input.requestedFromUserId]
          : grantContacts.map((contact) => contact.id);
      await notifyUsers({
        fleetId: input.fleetId,
        vehicleId: input.vehicleId ?? null,
        actorUserId: ctx.user.id,
        recipientUserIds: targetedRecipientIds,
        alertType: isUrgentReason(input.reason) ? "urgent_vehicle_access_request" : "vehicle_access_request",
        severity: isUrgentReason(input.reason) ? "critical" : "info",
        title: isUrgentReason(input.reason) ? "Urgent vehicle access request" : "Vehicle access request",
        message:
          vehicle?.unitNumber || vehicle?.licensePlate || vehicle?.vin
            ? `${ctx.user.name || "Driver"} requested access to ${vehicle.unitNumber || vehicle.licensePlate || vehicle.vin}${primaryGrantor ? ` from ${primaryGrantor.name || primaryGrantor.email || "the fleet approver"}` : ""}.`
            : `${ctx.user.name || "Driver"} requested access to ${input.requestedVehicleIdentifier?.trim() || "an unlisted vehicle"}${primaryGrantor ? ` from ${primaryGrantor.name || primaryGrantor.email || "the fleet approver"}` : ""}.`,
      });

      return {
        ...request,
        urgent: isUrgentReason(input.reason),
      };
    }),

  approveAccessRequest: protectedProcedure
    .input(
      z.object({
        requestId: z.number().int().positive(),
        accessType: accessTypeSchema,
        expiresAt: z.string().optional(),
        managerNote: z.string().trim().max(500).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [request] = await db
        .select()
        .from(vehicleAccessRequests)
        .where(eq(vehicleAccessRequests.id, input.requestId))
        .limit(1);
      if (!request) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Request not found" });
      }

      const canManage = await canManageVehicleAccess({
        fleetId: request.fleetId,
        user: ctx.user,
      });
      if (!canManage) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to approve access in this fleet",
        });
      }

      if (!request.vehicleId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This request is not linked to a fleet vehicle and cannot be auto-approved",
        });
      }

      const expiresAt = normalizeDate(input.expiresAt);
      if (input.accessType === "temporary" && !expiresAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Temporary access approval requires an expiry date",
        });
      }

      const [requestedVehicle] = await db
        .select({
          id: vehicles.id,
          assetRecordStatus: vehicles.assetRecordStatus,
        })
        .from(vehicles)
        .where(eq(vehicles.id, request.vehicleId))
        .limit(1);

      if (!requestedVehicle || requestedVehicle.assetRecordStatus !== "active") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only active company assets can be approved for driver access",
        });
      }

      const [assignment] = await db
        .insert(vehicleAssignments)
        .values({
          fleetId: request.fleetId,
          vehicleId: request.vehicleId,
          driverUserId: request.requestedByDriverId,
          assignedByUserId: ctx.user.id,
          accessType: input.accessType,
          startsAt: new Date(),
          expiresAt,
          status: "active",
          notes: input.managerNote?.trim() || request.note,
        })
        .returning();

      await db
        .update(vehicleAccessRequests)
        .set({
          status: "approved",
          reviewedByUserId: ctx.user.id,
          reviewedAt: new Date(),
          managerNote: input.managerNote?.trim() || null,
          accessTypeGranted: input.accessType,
          expiresAt,
          updatedAt: new Date(),
        })
        .where(eq(vehicleAccessRequests.id, request.id));

      await notifyUsers({
        fleetId: request.fleetId,
        vehicleId: request.vehicleId,
        actorUserId: ctx.user.id,
        recipientUserIds: [request.requestedByDriverId],
        alertType: "vehicle_access_granted",
        severity: "info",
        title: "Vehicle access approved",
        message:
          input.accessType === "temporary" && expiresAt
            ? `Your vehicle access request was approved until ${expiresAt.toLocaleString()}.`
            : "Your vehicle access request was approved.",
      });

      return assignment;
    }),

  denyAccessRequest: protectedProcedure
    .input(
      z.object({
        requestId: z.number().int().positive(),
        managerNote: z.string().trim().max(500).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [request] = await db
        .select()
        .from(vehicleAccessRequests)
        .where(eq(vehicleAccessRequests.id, input.requestId))
        .limit(1);
      if (!request) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Request not found" });
      }

      const canManage = await canManageVehicleAccess({
        fleetId: request.fleetId,
        user: ctx.user,
      });
      if (!canManage) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to deny access in this fleet",
        });
      }

      const [updated] = await db
        .update(vehicleAccessRequests)
        .set({
          status: "denied",
          reviewedByUserId: ctx.user.id,
          reviewedAt: new Date(),
          managerNote: input.managerNote?.trim() || null,
          updatedAt: new Date(),
        })
        .where(eq(vehicleAccessRequests.id, request.id))
        .returning();

      await notifyUsers({
        fleetId: request.fleetId,
        vehicleId: request.vehicleId ?? null,
        actorUserId: ctx.user.id,
        recipientUserIds: [request.requestedByDriverId],
        alertType: "vehicle_access_denied",
        severity: "warning",
        title: "Vehicle access denied",
        message: input.managerNote?.trim() || "Your vehicle access request was denied.",
      });

      return updated;
    }),
});
