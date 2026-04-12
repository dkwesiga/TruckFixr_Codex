import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { defects, fleets, inspections, users, vehicles } from "../../drizzle/schema";
import { desc, eq } from "drizzle-orm";
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
import { ENV } from "../_core/env";
import {
  createInspectionReportDelivery,
  mapClassificationToSeverity,
  prepareInspectionSubmission,
} from "../services/inspectionWorkflow";

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
  const db = await getDb();
  if (!db) return null;

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
}

async function resolveInspectionRecipients(input: {
  fleetId: number;
  driverEmail?: string | null;
}) {
  const db = await getDb();
  const recipients = new Set<string>();

  if (input.driverEmail) {
    recipients.add(input.driverEmail.trim().toLowerCase());
  }

  if (ENV.fleetManagerEmail) {
    recipients.add(ENV.fleetManagerEmail.trim().toLowerCase());
  }

  if (!db) {
    return Array.from(recipients);
  }

  try {
    const [fleet] = await db
      .select()
      .from(fleets)
      .where(eq(fleets.id, input.fleetId))
      .limit(1);

    if (fleet) {
      const [owner] = await db
        .select({
          email: users.email,
        })
        .from(users)
        .where(eq(users.id, fleet.ownerId))
        .limit(1);

      if (owner?.email) {
        recipients.add(owner.email.trim().toLowerCase());
      }
    }
  } catch (error) {
    console.warn("[Inspections] Unable to resolve fleet owner email:", error);
  }

  try {
    const userRows = await db
      .select({
        email: users.email,
        role: users.role,
      })
      .from(users);

    userRows
      .filter((user) => user.email && (user.role === "owner" || user.role === "manager"))
      .forEach((user) => {
        recipients.add(user.email!.trim().toLowerCase());
      });
  } catch (error) {
    console.warn("[Inspections] Unable to resolve manager recipients:", error);
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
          reportGenerated: reportDelivery.reportGenerated,
          reportWarning: reportDelivery.reportWarning,
        };
      } catch (error) {
        console.error("Failed to create inspection:", error);
        throw error;
      }
    }),

  // Get inspection by ID
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const result = await db
        .select()
        .from(inspections)
        .where(eq(inspections.id, input.id))
        .limit(1);

      return result.length > 0 ? result[0] : null;
    }),

  // Get inspections for a vehicle
  getByVehicle: protectedProcedure
    .input(z.object({ vehicleId: z.number(), limit: z.number().default(10) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

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
    .query(async ({ input }) => {
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
