import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { defects, inspections, users, vehicles, fleets } from "../../drizzle/schema";
import { desc, eq, and } from "drizzle-orm";
import {
  INSPECTION_VALIDITY_HOURS,
  buildChecklistByCategory,
  dailyInspectionSubmissionSchema,
  getInspectionDueAt,
  getVehicleInspectionConfig,
  parseInspectionResults,
  vehicleInspectionConfigSchema,
} from "../../shared/inspection";
import {
  getInspectionComplianceStatus,
  type ComplianceStatus,
} from "../../shared/compliance";
import {
  createInspectionReportDelivery,
  mapClassificationToSeverity,
  prepareInspectionSubmission,
} from "../services/inspectionWorkflow";
import { recordPilotMilestone } from "../services/pilotAccess";

async function verifyFleetAccess(fleetId: number, userId: number, userRole: string): Promise<boolean> {
  if (userRole !== "owner" && userRole !== "manager") {
    return false;
  }
  
  const db = await getDb();
  if (!db) return false;
  
  const [fleet] = await db
    .select()
    .from(fleets)
    .where(eq(fleets.id, fleetId))
    .limit(1);
  
  if (!fleet) return false;
  return fleet.ownerId === userId;
}

const fallbackVehicles = {
  42: {
    id: 42,
    fleetId: 1,
    vin: "1XPWD49X91D487964",
    licensePlate: "ABC-1234",
    make: "Peterbilt",
    model: "579",
    year: 2022,
    complianceStatus: "green" as const,
    configuration: getVehicleInspectionConfig(42),
  },
};

function getVehicleLifecycleStatus(complianceStatus: ComplianceStatus) {
  return complianceStatus === "red" ? "maintenance" : "active";
}

async function updateVehicleComplianceStatus(
  vehicleId: number,
  nextComplianceStatus: ComplianceStatus
) {
  if (vehicleId <= 0) return null;

  const db = await getDb();
  if (!db) return null;

  try {
    const [existingVehicle] = await db
      .select()
      .from(vehicles)
      .where(eq(vehicles.id, vehicleId))
      .limit(1);

    if (!existingVehicle) return null;

    const [updatedVehicle] = await db
      .update(vehicles)
      .set({
        complianceStatus: nextComplianceStatus,
        status: getVehicleLifecycleStatus(nextComplianceStatus),
        updatedAt: new Date(),
      })
      .where(eq(vehicles.id, vehicleId))
      .returning();

    return updatedVehicle ?? null;
  } catch (error) {
    console.warn("[Inspections] Skipping vehicle compliance update due to legacy vehicle schema:", error);
    return null;
  }
}

async function resolveInspectionRecipients(input: {
  fleetId: number;
  driverEmail?: string | null;
  managerEmail?: string | null;
  managerUserId?: number | null;
}) {
  const db = await getDb();
  const recipients = new Set<string>();
  const normalizedManagerEmail = input.managerEmail?.trim().toLowerCase() || null;

  if (input.driverEmail) {
    recipients.add(input.driverEmail.trim().toLowerCase());
  }

  if (!db) {
    if (normalizedManagerEmail) {
      recipients.add(normalizedManagerEmail);
    }
    return Array.from(recipients);
  }

  try {
    if (input.managerUserId) {
      const [manager] = await db
        .select({
          email: users.email,
        })
        .from(users)
        .where(eq(users.id, input.managerUserId))
        .limit(1);

      if (manager?.email) {
        recipients.add(manager.email.trim().toLowerCase());
        return Array.from(recipients);
      }
    }
  } catch (error) {
    console.warn("[Inspections] Unable to resolve linked manager email:", error);
  }

  if (normalizedManagerEmail) {
    recipients.add(normalizedManagerEmail);
  }

  return Array.from(recipients);
}

async function getVehicleProfile(vehicleId: number) {
  const db = await getDb();

  if (db) {
    try {
      const [vehicle] = await db
        .select()
        .from(vehicles)
        .where(eq(vehicles.id, vehicleId))
        .limit(1);

      if (vehicle) {
        const configuration = vehicleInspectionConfigSchema.parse({
          ...getVehicleInspectionConfig(vehicleId),
          ...(vehicle.configuration ?? {}),
        });

        return {
          vehicle: {
            id: vehicle.id,
            fleetId: vehicle.fleetId,
            vin: vehicle.vin,
            licensePlate: vehicle.licensePlate,
            make: vehicle.make,
            model: vehicle.model,
            year: vehicle.year,
            complianceStatus: vehicle.complianceStatus,
          },
          configuration,
        };
      }
    } catch (error) {
      console.warn("[Inspections] Falling back to local vehicle profile:", error);
    }
  }

  const fallback = fallbackVehicles[vehicleId as keyof typeof fallbackVehicles] ?? {
    id: vehicleId,
    fleetId: 1,
    licensePlate: "UNKNOWN",
    make: "Truck",
    model: "Unit",
    year: null,
    configuration: getVehicleInspectionConfig(vehicleId),
  };

  return {
    vehicle: {
      id: fallback.id,
      fleetId: fallback.fleetId,
      vin: fallback.vin,
      licensePlate: fallback.licensePlate,
      make: fallback.make,
      model: fallback.model,
      year: fallback.year,
      complianceStatus: fallback.complianceStatus,
    },
    configuration: fallback.configuration,
  };
}

function summarizeInspection(record: { submittedAt: Date | null; results: unknown }) {
  if (!record.submittedAt) return null;

  const parsed = parseInspectionResults(record.results) as
    | {
        checklist?: Array<{ status?: string; classification?: string }>;
        location?: string;
        odometer?: number;
        summary?: { complianceStatus?: ComplianceStatus };
      }
    | null;
  const checklist = Array.isArray(parsed?.checklist) ? parsed.checklist : [];
  const majorDefects = checklist.filter(
    (item) => item?.status === "fail" && item?.classification === "major"
  ).length;
  const minorDefects = checklist.filter(
    (item) => item?.status === "fail" && item?.classification === "minor"
  ).length;
  const validUntil = getInspectionDueAt(record.submittedAt);

  return {
    submittedAt: record.submittedAt,
    validUntil,
    isCurrent: validUntil.getTime() > Date.now(),
    majorDefects,
    minorDefects,
    canOperate: majorDefects === 0,
    complianceStatus:
      parsed?.summary?.complianceStatus ??
      getInspectionComplianceStatus({ majorDefectCount: majorDefects, minorDefectCount: minorDefects }),
    location: typeof parsed?.location === "string" ? parsed.location : "",
    odometer: typeof parsed?.odometer === "number" ? parsed.odometer : null,
  };
}

export const inspectionsRouter = router({
  getDailyChecklist: protectedProcedure
    .input(z.object({ vehicleId: z.number() }))
    .query(async ({ input }) => {
      const { vehicle, configuration } = await getVehicleProfile(input.vehicleId);
      const db = await getDb();
      let latestInspection = null;

      if (db) {
        try {
          const [record] = await db
            .select({
              submittedAt: inspections.submittedAt,
              results: inspections.results,
            })
            .from(inspections)
            .where(eq(inspections.vehicleId, input.vehicleId))
            .orderBy(desc(inspections.submittedAt))
            .limit(1);

          latestInspection = record ? summarizeInspection(record) : null;
        } catch (error) {
          console.warn("[Inspections] Unable to read recent inspection history:", error);
        }
      }

      return {
        vehicle,
        configuration,
        validityHours: INSPECTION_VALIDITY_HOURS,
        categories: buildChecklistByCategory(configuration),
        latestInspection,
      };
    }),

  create: protectedProcedure
    .input(dailyInspectionSubmissionSchema)
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      try {
        const { vehicle, configuration } = await getVehicleProfile(input.vehicleId);
        const prepared = prepareInspectionSubmission({
          input,
          user: ctx.user,
          vehicle,
          configuration,
        });

        const [inspectionResult] = await db.insert(inspections).values({
          vehicleId: input.vehicleId,
          fleetId: input.fleetId,
          driverId: ctx.user.id,
          status: "submitted",
          complianceStatus: prepared.complianceStatus,
          results: prepared.baseInspectionResults,
          submittedAt: prepared.submittedAt,
          updatedAt: prepared.submittedAt,
        }).returning({ id: inspections.id });

        const reportRecipients = await resolveInspectionRecipients({
          fleetId: input.fleetId,
          driverEmail: ctx.user.email,
          managerEmail: ctx.user.managerEmail,
          managerUserId: ctx.user.managerUserId,
        });

        const reportDelivery = await createInspectionReportDelivery({
          prepared,
          inspectionId: inspectionResult.id,
          recipients: reportRecipients,
          vehicle,
          input,
          userEmail: ctx.user.email,
        });

        await db
          .update(inspections)
          .set({
            results: reportDelivery.storedInspectionResults,
            updatedAt: new Date(),
          })
          .where(eq(inspections.id, inspectionResult.id));

        for (const item of prepared.normalizedChecklist) {
          if (item.status !== "fail") continue;

          await db.insert(defects).values({
            vehicleId: input.vehicleId,
            fleetId: input.fleetId,
            driverId: ctx.user.id,
            inspectionId: inspectionResult.id,
            title: item.label,
            description: item.comment,
            category: item.category,
            severity: mapClassificationToSeverity(item.classification),
            complianceStatus: prepared.complianceStatus,
            status: "open",
            photoUrls: item.photoUrls,
            updatedAt: prepared.submittedAt,
          });
        }

        await updateVehicleComplianceStatus(input.vehicleId, prepared.complianceStatus);
        await recordPilotMilestone({
          userId: ctx.user.id,
          fleetId: input.fleetId,
          eventType: "first_inspection_completed",
          eventMetadata: {
            inspectionId: inspectionResult.id,
            vehicleId: input.vehicleId,
          },
        });

        console.log('[Analytics] Inspection submitted:', {
          inspectionId: inspectionResult.id,
          vehicleId: input.vehicleId,
          fleetId: input.fleetId,
          defectCount: prepared.majorDefectCount + prepared.minorDefectCount,
          majorDefectCount: prepared.majorDefectCount,
          minorDefectCount: prepared.minorDefectCount,
          complianceStatus: prepared.complianceStatus,
          userId: ctx.user.id,
        });
        
        for (const item of prepared.normalizedChecklist) {
          if (item.status !== "fail") continue;
          console.log('[Analytics] Defect created:', {
            severity: mapClassificationToSeverity(item.classification),
            category: item.category,
            classification: item.classification,
            vehicleId: input.vehicleId,
            userId: ctx.user.id,
          });
        }
        
        return {
          success: true,
          inspectionId: inspectionResult.id,
          defectsCreated: prepared.majorDefectCount + prepared.minorDefectCount,
          majorDefectCount: prepared.majorDefectCount,
          minorDefectCount: prepared.minorDefectCount,
          complianceStatus: prepared.complianceStatus,
          validUntil: prepared.validUntil,
          canOperate: prepared.canOperate,
          reportFileName: reportDelivery.reportFileName,
          reportRecipients,
          emailDelivered: reportDelivery.emailDelivery.delivered,
          emailDeliveryReason: reportDelivery.emailDelivery.reason ?? null,
          reportGenerated: reportDelivery.reportGenerated,
          reportWarning: reportDelivery.reportWarning,
          reportPdfBase64: reportDelivery.storedInspectionResults.report.pdfBase64 ?? null,
          reportMimeType: reportDelivery.storedInspectionResults.report.mimeType,
        };
      } catch (error) {
        console.error("Failed to create inspection:", error);
        throw error;
      }
    }),

  // Get inspection by ID
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return null;

      const [inspection] = await db
        .select()
        .from(inspections)
        .where(eq(inspections.id, input.id))
        .limit(1);

      if (!inspection) return null;

      const hasAccess = await verifyFleetAccess(inspection.fleetId, ctx.user.id, ctx.user.role);
      if (!hasAccess && inspection.driverId !== ctx.user.id) {
        const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, inspection.vehicleId)).limit(1);
        if (!vehicle || vehicle.assignedDriverId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You do not have access to this inspection",
          });
        }
      }

      return inspection;
    }),

  // Get inspections for a vehicle
  getByVehicle: protectedProcedure
    .input(z.object({ vehicleId: z.number(), limit: z.number().default(10) }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];

      const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, input.vehicleId)).limit(1);
      if (!vehicle) return [];

      const hasAccess = await verifyFleetAccess(vehicle.fleetId, ctx.user.id, ctx.user.role);
      if (!hasAccess && vehicle.assignedDriverId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this vehicle",
        });
      }

      const result = await db
        .select()
        .from(inspections)
        .where(eq(inspections.vehicleId, input.vehicleId))
        .orderBy(desc(inspections.submittedAt))
        .limit(input.limit);

      return result;
    }),

  // Get recent inspections for a fleet
  getRecentByFleet: protectedProcedure
    .input(z.object({ fleetId: z.number(), limit: z.number().default(20) }))
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

      const result = await db
        .select()
        .from(inspections)
        .where(eq(inspections.fleetId, input.fleetId))
        .orderBy(desc(inspections.submittedAt))
        .limit(input.limit);

      return result;
    }),
});
