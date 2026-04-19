import { z } from "zod";
import { desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { activityLogs, defects, inspections, maintenanceLogs, tadisAlerts, users, vehicles } from "../../drizzle/schema";
import {
  ClarificationTurnSchema,
  DiagnosticVehicleSchema,
  SimilarCaseSchema,
  analyzeDiagnosticWithAi,
  mapDiagnosticRiskToAction,
  mapDiagnosticRiskToUrgency,
} from "../services/tadisCore";
import { getDiagnosticComplianceStatus, mergeComplianceStatus } from "../../shared/compliance";
import { sendEmail } from "../services/email";
import { extractPhotoEvidenceText } from "../services/ocr";
import { assertDiagnosticsWithinPlan, recordDiagnosticUsage } from "../services/subscriptions";
import { recordPilotMilestone } from "../services/pilotAccess";

const fallbackDiagnosticVehicles = {
  42: {
    id: 42,
    make: "Peterbilt",
    model: "579",
    year: 2022,
    mileage: 245320,
    engineHours: 0,
    status: "active",
    configuration: { airBrakes: true },
    complianceStatus: "green" as const,
  },
};

function getVehicleLifecycleStatus(complianceStatus: "green" | "yellow" | "red") {
  return complianceStatus === "red" ? "maintenance" : "active";
}

async function resolveManagerContact(input: {
  db: Awaited<ReturnType<typeof getDb>>;
  managerUserId?: number | null;
  managerEmail?: string | null;
}) {
  const normalizedManagerEmail = input.managerEmail?.trim().toLowerCase() || null;

  if (input.db && input.managerUserId) {
    try {
      const [manager] = await input.db
        .select({
          email: users.email,
        })
        .from(users)
        .where(eq(users.id, input.managerUserId))
        .limit(1);

      if (manager?.email) {
        return {
          managerUserId: input.managerUserId,
          managerEmail: manager.email.trim().toLowerCase(),
        };
      }
    } catch (error) {
      console.warn("[Diagnostics] Unable to resolve linked manager email:", error);
    }
  }

  return {
    managerUserId: input.managerUserId ?? null,
    managerEmail: normalizedManagerEmail,
  };
}

function buildDiagnosticManagerSummary(input: {
  analysis: {
    systems_affected: string[];
    possible_causes: Array<{ cause: string; probability: number }>;
    confidence_score: number;
    recommended_tests: string[];
    recommended_fix: string;
    risk_level: string;
    maintenance_recommendations?: string[];
    compliance_impact?: string;
  };
  vehicleContext: {
    id: number;
    make?: string;
    model?: string;
    year?: number | null;
    vin?: string;
  };
  symptoms: string[];
  faultCodes: string[];
  driverNotes?: string;
  diagnosticDefectId?: number | null;
}) {
  const vehicleLabel = [input.vehicleContext.year, input.vehicleContext.make, input.vehicleContext.model]
    .filter(Boolean)
    .join(" ")
    .trim() || `Vehicle ${input.vehicleContext.id}`;
  const topCauses = input.analysis.possible_causes
    .slice(0, 3)
    .map((item) => `${item.cause} (${item.probability}%)`);

  return {
    subject: `TruckFixr Diagnosis Summary - ${vehicleLabel}`,
    text: [
      `TruckFixr generated a diagnosis summary for ${vehicleLabel}.`,
      input.vehicleContext.vin ? `VIN: ${input.vehicleContext.vin}` : "",
      `Symptoms: ${input.symptoms.join(", ")}`,
      input.faultCodes.length > 0 ? `Fault codes: ${input.faultCodes.join(", ")}` : "",
      input.driverNotes ? `Driver notes: ${input.driverNotes}` : "",
      `Systems affected: ${input.analysis.systems_affected.join(", ") || "Not specified"}`,
      `Top possible causes: ${topCauses.join("; ") || "Not specified"}`,
      `Confidence score: ${input.analysis.confidence_score}%`,
      `Risk level: ${input.analysis.risk_level}`,
      `Compliance impact: ${input.analysis.compliance_impact ?? "none"}`,
      input.analysis.recommended_tests.length > 0
        ? `Recommended tests: ${input.analysis.recommended_tests.join("; ")}`
        : "",
      input.analysis.recommended_fix ? `Recommended fix: ${input.analysis.recommended_fix}` : "",
      input.analysis.maintenance_recommendations && input.analysis.maintenance_recommendations.length > 0
        ? `Maintenance recommendations: ${input.analysis.maintenance_recommendations.join("; ")}`
        : "",
      input.diagnosticDefectId ? `Diagnostic action record: defect #${input.diagnosticDefectId}` : "",
      "Please review this case in TruckFixr for next action.",
    ]
      .filter(Boolean)
      .join("\n"),
    html: [
      `<p><strong>TruckFixr generated a diagnosis summary for ${vehicleLabel}.</strong></p>`,
      input.vehicleContext.vin ? `<p>VIN: ${input.vehicleContext.vin}</p>` : "",
      `<p>Symptoms: ${input.symptoms.join(", ")}</p>`,
      input.faultCodes.length > 0 ? `<p>Fault codes: ${input.faultCodes.join(", ")}</p>` : "",
      input.driverNotes ? `<p>Driver notes: ${input.driverNotes}</p>` : "",
      `<p>Systems affected: ${input.analysis.systems_affected.join(", ") || "Not specified"}</p>`,
      `<p>Top possible causes: ${topCauses.join("; ") || "Not specified"}</p>`,
      `<p>Confidence score: ${input.analysis.confidence_score}%</p>`,
      `<p>Risk level: ${input.analysis.risk_level}</p>`,
      `<p>Compliance impact: ${input.analysis.compliance_impact ?? "none"}</p>`,
      input.analysis.recommended_tests.length > 0
        ? `<p>Recommended tests: ${input.analysis.recommended_tests.join("; ")}</p>`
        : "",
      input.analysis.recommended_fix ? `<p>Recommended fix: ${input.analysis.recommended_fix}</p>` : "",
      input.analysis.maintenance_recommendations && input.analysis.maintenance_recommendations.length > 0
        ? `<p>Maintenance recommendations: ${input.analysis.maintenance_recommendations.join("; ")}</p>`
        : "",
      input.diagnosticDefectId ? `<p>Diagnostic action record: defect #${input.diagnosticDefectId}</p>` : "",
      "<p>Please review this case in TruckFixr for next action.</p>",
    ]
      .filter(Boolean)
      .join(""),
  };
}

function inferHistoricalCauseId(text: string) {
  const normalized = text.toLowerCase();
  if (/coolant|overheat|thermostat|radiator|fan/.test(normalized)) return "coolant_leak";
  if (/abs|wheel speed/.test(normalized)) return "abs_sensor_fault";
  if (/brake|grinding|rotor|pad/.test(normalized)) return "brake_friction_wear";
  if (/air leak|low air|pressure/.test(normalized)) return "air_brake_leak";
  if (/steer|wander|drag link|tie rod|free play/.test(normalized)) return "steering_linkage_wear";
  if (/tire|wheel|vibration|shake|shimmy/.test(normalized)) return "tire_or_wheel_issue";
  if (/fuel|misfire|rough idle|power/.test(normalized)) return "fuel_delivery_issue";
  if (/battery|alternator|voltage|charging/.test(normalized)) return "charging_system_fault";
  return "fuel_delivery_issue";
}

const vehicleSnapshotSchema = DiagnosticVehicleSchema.extend({
  complianceStatus: z.enum(["green", "yellow", "red"]).optional(),
});

async function resolveVehicleContext(
  vehicleId: number,
  snapshot?: z.infer<typeof vehicleSnapshotSchema>
) {
  const db = await getDb();

  if (db) {
    try {
      const [vehicle] = await db
        .select()
        .from(vehicles)
        .where(eq(vehicles.id, vehicleId))
        .limit(1);

      if (vehicle) {
        return {
          id: vehicle.id,
          vin: vehicle.vin ?? undefined,
          make: vehicle.make ?? undefined,
          model: vehicle.model ?? undefined,
          year: vehicle.year ?? null,
          mileage: vehicle.mileage ?? 0,
          engineHours: vehicle.engineHours ?? 0,
          status: vehicle.status ?? "active",
          configuration: typeof vehicle.configuration === "object" && vehicle.configuration ? vehicle.configuration as Record<string, unknown> : {},
          brakeConfiguration:
            typeof vehicle.configuration === "object" && vehicle.configuration && "airBrakes" in vehicle.configuration
              ? ((vehicle.configuration as Record<string, unknown>).airBrakes ? "air_brakes" : "hydraulic_brakes")
              : undefined,
          trailerConfiguration:
            typeof vehicle.configuration === "object" && vehicle.configuration && "trailerAttached" in vehicle.configuration
              ? ((vehicle.configuration as Record<string, unknown>).trailerAttached ? "trailer_attached" : "tractor_only")
              : undefined,
          complianceStatus: vehicle.complianceStatus,
        };
      }
    } catch (error) {
      console.warn("[Diagnostics] Falling back to built-in vehicle context:", error);
    }
  }

  if (snapshot) {
    return {
      ...snapshot,
      complianceStatus: snapshot.complianceStatus ?? "green",
    };
  }

  const fallback = fallbackDiagnosticVehicles[vehicleId as keyof typeof fallbackDiagnosticVehicles];
  if (fallback) return fallback;

  throw new TRPCError({
    code: "NOT_FOUND",
    message: "Diagnostics require a valid vehicle. Select an existing vehicle or add one before starting diagnosis.",
  });
}

async function loadDiagnosticSupportData(fleetId: number, vehicleId: number) {
  const db = await getDb();
  if (!db) {
    return {
      priorDiagnostics: [],
      priorDefects: [],
      recentInspections: [],
      recentRepairs: [],
      complianceHistory: [],
      similarCases: [],
    };
  }

  const safeQuery = async <T,>(label: string, query: Promise<T>, fallback: T): Promise<T> => {
    try {
      return await query;
    } catch (error) {
      console.warn(`[Diagnostics] Unable to load ${label}; continuing with fallback context:`, error);
      return fallback;
    }
  };

  const [defectRows, inspectionRows, repairRows, feedbackRows] = await Promise.all([
    safeQuery(
      "defect history",
      db
        .select()
        .from(defects)
        .where(eq(defects.fleetId, fleetId))
        .orderBy(desc(defects.createdAt))
        .limit(12),
      []
    ),
    safeQuery(
      "inspection history",
      db
        .select()
        .from(inspections)
        .where(eq(inspections.vehicleId, vehicleId))
        .orderBy(desc(inspections.submittedAt))
        .limit(6),
      []
    ),
    safeQuery(
      "maintenance history",
      db
        .select()
        .from(maintenanceLogs)
        .where(eq(maintenanceLogs.vehicleId, vehicleId))
        .orderBy(desc(maintenanceLogs.createdAt))
        .limit(8),
      []
    ),
    safeQuery(
      "diagnostic feedback",
      db
        .select()
        .from(activityLogs)
        .where(eq(activityLogs.fleetId, fleetId))
        .orderBy(desc(activityLogs.createdAt))
        .limit(20),
      []
    ),
  ]);

  const priorDefects = defectRows
    .filter((row) => row.vehicleId === vehicleId)
    .map((row) => ({
      summary: [row.title, row.description].filter(Boolean).join(" - "),
      category: row.category ?? undefined,
      status: row.status ?? undefined,
      occurredAt: row.createdAt?.toISOString?.() ?? undefined,
    }));

  const recentInspections = inspectionRows.map((row) => ({
    summary: `Inspection ${row.id} submitted with compliance ${row.complianceStatus}`,
    status: row.status ?? undefined,
    occurredAt: row.submittedAt?.toISOString?.() ?? undefined,
    outcome: row.complianceStatus ?? undefined,
  }));

  const recentRepairs = repairRows.map((row) => ({
    summary: row.description ?? `${row.type} maintenance recorded`,
    category: row.type ?? undefined,
    status: row.completedAt ? "completed" : "open",
    occurredAt: row.completedAt?.toISOString?.() ?? row.createdAt?.toISOString?.() ?? undefined,
    outcome: row.completedAt ? "repair completed" : "repair pending",
  }));

  const priorDiagnostics = feedbackRows
    .filter((row) => row.entityType === "vehicle" && row.entityId === vehicleId && row.action === "diagnostic_feedback")
    .map((row) => {
      const details =
        row.details && typeof row.details === "object" ? (row.details as Record<string, unknown>) : {};

      return {
        summary:
          typeof details.summary === "string"
            ? details.summary
            : `Feedback recorded for ${typeof details.cause === "string" ? details.cause : "diagnostic outcome"}`,
        category: "diagnostic_feedback",
        status: typeof details.successful === "boolean" ? (details.successful ? "confirmed" : "rejected") : "recorded",
        occurredAt: row.createdAt?.toISOString?.() ?? undefined,
        outcome: typeof details.confirmedFix === "string" ? details.confirmedFix : undefined,
      };
    });

  const complianceHistory = inspectionRows.map((row) => ({
    summary: `Compliance state ${row.complianceStatus} recorded on inspection ${row.id}`,
    category: "compliance",
    status: row.complianceStatus ?? undefined,
    occurredAt: row.submittedAt?.toISOString?.() ?? undefined,
    outcome: row.complianceStatus ?? undefined,
  }));

  const similarCases = defectRows.map((row, index) =>
    SimilarCaseSchema.parse({
      id: `historical-${row.id}-${index}`,
      source: "historical",
      causeId: inferHistoricalCauseId(`${row.title} ${row.description ?? ""}`),
      cause: row.title,
      systems_affected: row.category ? [row.category] : [],
      symptomSignals: [row.title, row.description ?? ""].filter(Boolean),
      faultCodes: [],
      summary: [row.title, row.description].filter(Boolean).join(" - "),
      resolution: row.status === "resolved" ? "Resolved historically" : "Historical fleet case",
      confirmedFix: row.status === "resolved" ? "Historical repair completed" : undefined,
      resolutionSuccess: row.status === "resolved",
      risk_level: row.severity === "critical" || row.severity === "high" ? "high" : row.severity === "medium" ? "medium" : "low",
      similarity: 0,
    })
  );

  feedbackRows
    .filter((row) => row.entityType === "vehicle" && row.entityId === vehicleId && row.action === "diagnostic_feedback")
    .forEach((row, index) => {
      const details =
        row.details && typeof row.details === "object" ? (row.details as Record<string, unknown>) : {};
      const cause = typeof details.cause === "string" ? details.cause : "Confirmed historical diagnosis";
      const confirmedFix =
        typeof details.confirmedFix === "string" ? details.confirmedFix : "Historical fix confirmed";
      const symptoms = Array.isArray(details.symptoms)
        ? details.symptoms.filter((value): value is string => typeof value === "string")
        : [];
      const faultCodes = Array.isArray(details.faultCodes)
        ? details.faultCodes.filter((value): value is string => typeof value === "string")
        : [];
      const causeId = inferHistoricalCauseId([cause, confirmedFix, ...symptoms].join(" "));

      similarCases.push(
        SimilarCaseSchema.parse({
          id: `feedback-${row.id}-${index}`,
          source: "historical",
          causeId,
          cause,
          systems_affected: typeof details.system === "string" ? [details.system] : [],
          symptomSignals: symptoms,
          faultCodes,
          summary:
            typeof details.summary === "string"
              ? details.summary
              : [cause, confirmedFix].filter(Boolean).join(" - "),
          resolution: confirmedFix,
          confirmedFix,
          resolutionSuccess:
            typeof details.successful === "boolean" ? details.successful : true,
          risk_level:
            details.complianceImpact === "critical"
              ? "high"
              : details.complianceImpact === "warning"
                ? "medium"
                : "low",
          similarity: 0,
        })
      );
    });

  return {
    priorDiagnostics,
    priorDefects,
    recentInspections,
    recentRepairs,
    complianceHistory,
    similarCases,
  };
}

export const diagnosticsRouter = router({
  analyze: protectedProcedure
    .input(
      z.object({
        fleetId: z.number(),
        vehicleId: z.number(),
        vehicleContext: DiagnosticVehicleSchema.optional(),
        symptoms: z.array(z.string().trim().min(1)).min(1, "At least one symptom is required"),
        faultCodes: z.array(z.string().trim().min(1)).default([]),
        driverNotes: z.string().trim().optional(),
        operatingConditions: z.string().trim().optional(),
        photoUrls: z.array(z.string().trim().min(1)).default([]),
        clarificationHistory: z.array(ClarificationTurnSchema).max(5).default([]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await assertDiagnosticsWithinPlan({
        userId: ctx.user.id,
        fleetId: input.fleetId,
      });

      const vehicleContext = await resolveVehicleContext(input.vehicleId, input.vehicleContext);
      const supportData = await loadDiagnosticSupportData(input.fleetId, input.vehicleId);
      const ocrResult = await extractPhotoEvidenceText({
        photoUrls: input.photoUrls,
      });

      if (ocrResult.warning) {
        console.warn("[Diagnostics] OCR fallback:", ocrResult.warning);
      }

      const driverNotes = [
        input.driverNotes?.trim(),
        input.operatingConditions?.trim()
          ? `Operating conditions: ${input.operatingConditions.trim()}`
          : "",
        ocrResult.textSnippets.length > 0
          ? `Extracted text from evidence: ${ocrResult.textSnippets.join(" | ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");

      const analysis = await analyzeDiagnosticWithAi({
        vehicleId: input.vehicleId,
        symptoms: input.symptoms,
        faultCodes: input.faultCodes,
        driverNotes,
        operatingConditions: input.operatingConditions,
        vehicle: vehicleContext,
        issueHistory: {
          priorDiagnostics: supportData.priorDiagnostics,
          priorDefects: supportData.priorDefects,
          recentInspections: supportData.recentInspections,
          recentRepairs: supportData.recentRepairs,
          complianceHistory: supportData.complianceHistory,
        },
        similarCases: supportData.similarCases,
        clarificationHistory: input.clarificationHistory,
      });

      await recordDiagnosticUsage({
        userId: ctx.user.id,
        fleetId: input.fleetId,
        vehicleId: input.vehicleId,
        metadata: {
          confidenceScore: analysis.confidence_score,
          nextAction: analysis.next_action,
          systemsAffected: analysis.systems_affected,
        },
      });
      await recordPilotMilestone({
        userId: ctx.user.id,
        fleetId: input.fleetId,
        eventType: "first_diagnostic_run",
        eventMetadata: {
          vehicleId: input.vehicleId,
          confidenceScore: analysis.confidence_score,
        },
      });

      if (analysis.next_action === "ask_question") {
        return analysis;
      }

      const complianceStatus = getDiagnosticComplianceStatus(mapDiagnosticRiskToUrgency(analysis.risk_level));

      const db = await getDb();
      let persistedDefectId: number | null = null;

      if (db) {
        try {
          const [defect] = await db
            .insert(defects)
            .values({
              fleetId: input.fleetId,
              vehicleId: input.vehicleId,
              driverId: ctx.user.id,
              title: analysis.possible_causes[0]?.cause || input.symptoms[0] || "Driver diagnostic intake",
              description: JSON.stringify({
                driverNotes: input.driverNotes ?? "",
                symptoms: input.symptoms,
                faultCodes: input.faultCodes,
                output: analysis,
              }),
              category: "diagnostic",
              severity: complianceStatus === "red" ? "critical" : complianceStatus === "yellow" ? "high" : "medium",
              complianceStatus,
              status: "open",
              photoUrls: input.photoUrls,
              updatedAt: new Date(),
            })
            .returning({ id: defects.id });

          persistedDefectId = defect?.id ?? null;

          if (defect?.id) {
            await db.insert(tadisAlerts).values({
              fleetId: input.fleetId,
              defectId: defect.id,
              urgency: mapDiagnosticRiskToUrgency(analysis.risk_level),
              recommendedAction: mapDiagnosticRiskToAction(analysis.risk_level),
              likelyCause: analysis.possible_causes[0]?.cause,
              reasoning: JSON.stringify(analysis),
            });
          }

          try {
            const [existingVehicle] = await db
              .select()
              .from(vehicles)
              .where(eq(vehicles.id, input.vehicleId))
              .limit(1);

            if (existingVehicle) {
              const mergedComplianceStatus = mergeComplianceStatus(
                existingVehicle.complianceStatus,
                complianceStatus
              );

              await db
                .update(vehicles)
                .set({
                  complianceStatus: mergedComplianceStatus,
                  status: getVehicleLifecycleStatus(mergedComplianceStatus),
                  updatedAt: new Date(),
                })
                .where(eq(vehicles.id, input.vehicleId));
            }
          } catch (vehicleError) {
            console.warn("[Diagnostics] Skipping vehicle compliance update due to legacy schema mismatch:", vehicleError);
          }
        } catch (error) {
          console.warn("[Diagnostics] Unable to persist diagnostic artifacts:", error);
        }
      }

      const managerContact = await resolveManagerContact({
        db,
        managerUserId: ctx.user.managerUserId,
        managerEmail: ctx.user.managerEmail,
      });
      const managerSummary = buildDiagnosticManagerSummary({
        analysis,
        vehicleContext,
        symptoms: input.symptoms,
        faultCodes: input.faultCodes,
        driverNotes: input.driverNotes?.trim(),
        diagnosticDefectId: persistedDefectId,
      });

      if (db && managerContact.managerUserId) {
        try {
          await db.insert(activityLogs).values({
            fleetId: input.fleetId,
            userId: managerContact.managerUserId,
            action: "diagnostic_summary_shared",
            entityType: "defect",
            entityId: persistedDefectId ?? input.vehicleId,
            details: {
              vehicleId: input.vehicleId,
              defectId: persistedDefectId,
              summary: managerSummary.text,
              output: analysis,
              symptoms: input.symptoms,
              faultCodes: input.faultCodes,
              sharedByDriverId: ctx.user.id,
              requiresManagerAction: true,
            },
          });
        } catch (error) {
          console.warn("[Diagnostics] Unable to store manager activity copy of diagnosis summary:", error);
        }
      }

      if (managerContact.managerEmail) {
        try {
          await sendEmail({
            to: [managerContact.managerEmail],
            subject: managerSummary.subject,
            text: managerSummary.text,
            html: managerSummary.html,
          });
        } catch (error) {
          console.warn("[Diagnostics] Unable to email diagnosis summary to manager:", error);
        }
      }

      return analysis;
    }),

  getManagerActionQueue: adminProcedure
    .input(
      z.object({
        fleetId: z.number(),
        limit: z.number().min(1).max(20).default(6),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        return [];
      }

      const rows = await db
        .select()
        .from(activityLogs)
        .where(eq(activityLogs.fleetId, input.fleetId))
        .orderBy(desc(activityLogs.createdAt))
        .limit(40);

      const managerItems = rows.filter(
        (row) =>
          row.userId === ctx.user.id &&
          row.action === "diagnostic_summary_shared"
      );

      if (managerItems.length === 0) {
        return [];
      }

      const limitedItems = managerItems.slice(0, input.limit);
      const vehicleIds = Array.from(
        new Set(
          limitedItems
            .map((row) => {
              const details =
                row.details && typeof row.details === "object"
                  ? (row.details as Record<string, unknown>)
                  : null;
              return typeof details?.vehicleId === "number" ? details.vehicleId : null;
            })
            .filter((value): value is number => typeof value === "number")
        )
      );
      const driverIds = Array.from(
        new Set(
          limitedItems
            .map((row) => {
              const details =
                row.details && typeof row.details === "object"
                  ? (row.details as Record<string, unknown>)
                  : null;
              return typeof details?.sharedByDriverId === "number"
                ? details.sharedByDriverId
                : null;
            })
            .filter((value): value is number => typeof value === "number")
        )
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
                year: vehicles.year,
              })
              .from(vehicles)
              .where(inArray(vehicles.id, vehicleIds))
          : [];

      const driverRows =
        driverIds.length > 0
          ? await db
              .select({
                id: users.id,
                name: users.name,
                email: users.email,
              })
              .from(users)
              .where(inArray(users.id, driverIds))
          : [];

      const vehicleMap = new Map(vehicleRows.map((row) => [row.id, row]));
      const driverMap = new Map(driverRows.map((row) => [row.id, row]));

      return limitedItems.map((row) => {
        const details =
          row.details && typeof row.details === "object"
            ? (row.details as Record<string, unknown>)
            : {};
        const output =
          details.output && typeof details.output === "object"
            ? (details.output as Record<string, unknown>)
            : {};
        const vehicleId =
          typeof details.vehicleId === "number" ? details.vehicleId : null;
        const defectId =
          typeof details.defectId === "number" ? details.defectId : null;
        const sharedByDriverId =
          typeof details.sharedByDriverId === "number"
            ? details.sharedByDriverId
            : null;
        const vehicle = vehicleId ? vehicleMap.get(vehicleId) : undefined;
        const driver = sharedByDriverId ? driverMap.get(sharedByDriverId) : undefined;

        return {
          id: row.id,
          createdAt: row.createdAt,
          defectId,
          vehicleId,
          truckLabel:
            vehicle?.unitNumber?.trim() ||
            vehicle?.licensePlate?.trim() ||
            vehicle?.vin?.trim() ||
            (vehicleId ? `Vehicle ${vehicleId}` : "Vehicle"),
          truckDetail: [vehicle?.year, vehicle?.make, vehicle?.model]
            .filter(Boolean)
            .join(" ")
            .trim(),
          driverName:
            driver?.name?.trim() || driver?.email?.trim() || "Assigned driver",
          summary:
            typeof details.summary === "string"
              ? details.summary
              : "Diagnosis summary shared for manager follow-up.",
          symptoms: Array.isArray(details.symptoms)
            ? details.symptoms.filter((value): value is string => typeof value === "string")
            : [],
          faultCodes: Array.isArray(details.faultCodes)
            ? details.faultCodes.filter((value): value is string => typeof value === "string")
            : [],
          possibleCause:
            Array.isArray(output.possible_causes) &&
            output.possible_causes.length > 0 &&
            output.possible_causes[0] &&
            typeof output.possible_causes[0] === "object" &&
            typeof (output.possible_causes[0] as Record<string, unknown>).cause === "string"
              ? ((output.possible_causes[0] as Record<string, unknown>).cause as string)
              : undefined,
          confidenceScore:
            typeof output.confidence_score === "number"
              ? output.confidence_score
              : null,
          riskLevel:
            typeof output.risk_level === "string" ? output.risk_level : undefined,
          complianceImpact:
            typeof output.compliance_impact === "string"
              ? output.compliance_impact
              : undefined,
          recommendedFix:
            typeof output.recommended_fix === "string"
              ? output.recommended_fix
              : undefined,
        };
      });
    }),

  feedback: protectedProcedure
    .input(
      z.object({
        fleetId: z.number(),
        vehicleId: z.number(),
        cause: z.string().trim().min(1),
        confirmedFix: z.string().trim().min(1),
        successful: z.boolean(),
        symptoms: z.array(z.string().trim().min(1)).default([]),
        faultCodes: z.array(z.string().trim().min(1)).default([]),
        complianceImpact: z.enum(["none", "warning", "critical"]).default("none"),
        system: z.string().trim().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        return { success: false, saved: false, reason: "database_unavailable" as const };
      }

      await db.insert(activityLogs).values({
        fleetId: input.fleetId,
        userId: ctx.user.id,
        action: "diagnostic_feedback",
        entityType: "vehicle",
        entityId: input.vehicleId,
        details: {
          cause: input.cause,
          confirmedFix: input.confirmedFix,
          successful: input.successful,
          symptoms: input.symptoms,
          faultCodes: input.faultCodes,
          complianceImpact: input.complianceImpact,
          system: input.system,
          summary: `${input.cause} confirmed with fix: ${input.confirmedFix}`,
        },
      });

      return { success: true, saved: true };
    }),
});
