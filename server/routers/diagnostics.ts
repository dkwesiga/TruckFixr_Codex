import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { defects, inspections, tadisAlerts, vehicles } from "../../drizzle/schema";
import {
  ClarificationTurnSchema,
  SimilarCaseSchema,
  analyzeDiagnostic,
  mapDiagnosticRiskToAction,
  mapDiagnosticRiskToUrgency,
} from "../services/tadisCore";
import { getDiagnosticComplianceStatus, mergeComplianceStatus } from "../../shared/compliance";
import { extractPhotoEvidenceText } from "../services/ocr";

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

async function resolveVehicleContext(vehicleId: number) {
  const db = await getDb();

  if (db) {
    const [vehicle] = await db
      .select()
      .from(vehicles)
      .where(eq(vehicles.id, vehicleId))
      .limit(1);

    if (vehicle) {
      return {
        id: vehicle.id,
        make: vehicle.make ?? undefined,
        model: vehicle.model ?? undefined,
        year: vehicle.year ?? null,
        mileage: vehicle.mileage ?? 0,
        engineHours: vehicle.engineHours ?? 0,
        status: vehicle.status ?? "active",
        configuration: typeof vehicle.configuration === "object" && vehicle.configuration ? vehicle.configuration as Record<string, unknown> : {},
        complianceStatus: vehicle.complianceStatus,
      };
    }
  }

  const fallback = fallbackDiagnosticVehicles[vehicleId as keyof typeof fallbackDiagnosticVehicles];
  if (fallback) return fallback;

  throw new TRPCError({
    code: "NOT_FOUND",
    message: "Diagnostics require a valid vehicle. Start diagnosis from a selected vehicle.",
  });
}

async function loadDiagnosticSupportData(fleetId: number, vehicleId: number) {
  const db = await getDb();
  if (!db) {
    return {
      priorDefects: [],
      recentInspections: [],
      similarCases: [],
    };
  }

  const [defectRows, inspectionRows] = await Promise.all([
    db
      .select()
      .from(defects)
      .where(eq(defects.fleetId, fleetId))
      .orderBy(desc(defects.createdAt))
      .limit(12),
    db
      .select()
      .from(inspections)
      .where(eq(inspections.vehicleId, vehicleId))
      .orderBy(desc(inspections.submittedAt))
      .limit(6),
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
      risk_level: row.severity === "critical" || row.severity === "high" ? "high" : row.severity === "medium" ? "medium" : "low",
      similarity: 0,
    })
  );

  return {
    priorDefects,
    recentInspections,
    similarCases,
  };
}

export const diagnosticsRouter = router({
  analyze: protectedProcedure
    .input(
      z.object({
        fleetId: z.number(),
        vehicleId: z.number(),
        symptoms: z.array(z.string().trim().min(1)).min(1, "At least one symptom is required"),
        faultCodes: z.array(z.string().trim().min(1)).default([]),
        driverNotes: z.string().trim().optional(),
        photoUrls: z.array(z.string().trim().min(1)).default([]),
        clarificationHistory: z.array(ClarificationTurnSchema).max(4).default([]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const vehicleContext = await resolveVehicleContext(input.vehicleId);
      const supportData = await loadDiagnosticSupportData(input.fleetId, input.vehicleId);
      const ocrResult = await extractPhotoEvidenceText({
        photoUrls: input.photoUrls,
      });

      if (ocrResult.warning) {
        console.warn("[Diagnostics] OCR fallback:", ocrResult.warning);
      }

      const driverNotes = [
        input.driverNotes?.trim(),
        ocrResult.textSnippets.length > 0
          ? `Extracted text from evidence: ${ocrResult.textSnippets.join(" | ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");

      const analysis = analyzeDiagnostic({
        vehicleId: input.vehicleId,
        symptoms: input.symptoms,
        faultCodes: input.faultCodes,
        driverNotes,
        vehicle: vehicleContext,
        issueHistory: {
          priorDefects: supportData.priorDefects,
          recentInspections: supportData.recentInspections,
          recentRepairs: [],
        },
        similarCases: supportData.similarCases,
        clarificationHistory: input.clarificationHistory,
      });

      if (analysis.next_action === "ask_question") {
        return analysis;
      }

      const complianceStatus = getDiagnosticComplianceStatus(mapDiagnosticRiskToUrgency(analysis.risk_level));

      const db = await getDb();

      if (db) {
        const [existingVehicle] = await db
          .select()
          .from(vehicles)
          .where(eq(vehicles.id, input.vehicleId))
          .limit(1);

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
      }

      return analysis;
    }),
});
