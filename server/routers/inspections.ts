import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  aiTriageRecords,
  combinedInspectionSessions,
  defects,
  fleets,
  inAppAlerts,
  inspectionChecklistResponses,
  inspectionFlags,
  inspectionPhotos,
  inspectionReviewActions,
  inspectionReviewQueueItems,
  inspections,
  maintenanceLogs,
  randomProofRequests,
  repairOutcomes,
  users,
  vehicleAssignments,
  vehicles,
} from "../../drizzle/schema";
import { desc, eq, and, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import {
  INSPECTION_VALIDITY_HOURS,
  buildChecklistByCategory,
  dailyInspectionSubmissionSchema,
  getInspectionDueAt,
  getVehicleInspectionConfig,
  inspectionSheetLabels,
  inspectionSheetTypeSchema,
  isReeferAsset,
  parseInspectionResults,
  randomProofItems,
  resolveInspectionSheetType,
  startVerifiedInspectionSchema,
  submitVerifiedInspectionSchema,
  vehicleInspectionConfigSchema,
  type InspectionSheetType,
} from "../../shared/inspection";
import { validateInspectionOdometer } from "../../shared/inspectionOdometer";
import {
  getInspectionComplianceStatus,
  type ComplianceStatus,
} from "../../shared/compliance";
import {
  createInspectionReportDelivery,
  mapClassificationToSeverity,
  prepareInspectionSubmission,
} from "../services/inspectionWorkflow";
import {
  deriveCombinedCompletionState,
  deriveCombinedHeadlineStatus,
  deriveInspectionReviewSeverity,
  deriveManagerReviewRequired,
  deriveOperationalStateForDecision,
  deriveOperationalStateForSeverity,
  derivePrimaryQueueDetails,
  deriveProvisionalDriverGuidance,
  deriveReportOutcome,
  deriveUrgentDefectQueueDetails,
  type QueueHeadlineStatus,
  type ReportOutcome,
  type ReviewSeverity,
  type VehicleOperationalState,
} from "../services/inspectionReviewWorkflow";
import {
  buildMissedInspectionReminderAlerts,
  type MissedInspectionReminderCandidate,
} from "../services/inspectionReminders";
import { recordPilotMilestone } from "../services/pilotAccess";
import {
  calculateInspectionIntegrity,
  getInspectionStatusFromIntegrity,
} from "../services/inspectionIntegrity";
import { analyzeDiagnosticWithAi } from "../services/tadisCore";
import { evaluateEarlyWarnings } from "../services/earlyWarning";
import {
  canInspectVehicle,
  canManageVehicleAccess,
  canViewVehicle,
} from "../services/vehicleAccess";
import { sendEmail } from "../services/email";
import { ENV } from "../_core/env";
import { storagePut } from "../storage";
import {
  buildEvidencePhotoStorageKey,
  classifyEvidencePhotoSource,
  normalizeSubmittedEvidencePhotoUrls,
  parseEvidenceImageDataUrl,
} from "../services/evidencePhotos";

async function verifyFleetAccess(fleetId: number, userId: number, userRole: string): Promise<boolean> {
  return canManageVehicleAccess({
    fleetId,
    user: {
      id: userId,
      role: userRole,
    },
  });
}

async function verifyVehicleInspectionAccess(input: {
  fleetId: number;
  vehicleId: number | string;
  userId: number;
  userRole: string;
}) {
  return canInspectVehicle({
    user: {
      id: input.userId,
      role: input.userRole,
    },
    vehicleId: input.vehicleId,
    fleetId: input.fleetId,
  });
}

function randomProofSelection() {
  const shuffled = [...randomProofItems].sort(() => Math.random() - 0.5);
  const count = Math.random() > 0.5 ? 2 : 1;
  return shuffled.slice(0, count);
}

function locationFields(
  location:
    | {
        latitude?: number;
        longitude?: number;
        accuracy?: number;
        capturedAt?: string;
        permissionStatus?: "granted" | "denied" | "unavailable";
      }
    | undefined,
  prefix: "start" | "submit"
) {
  const capturedAt = location?.capturedAt ? new Date(location.capturedAt) : null;
  const latitude = typeof location?.latitude === "number" ? String(location.latitude) : null;
  const longitude = typeof location?.longitude === "number" ? String(location.longitude) : null;
  const accuracy = typeof location?.accuracy === "number" ? String(location.accuracy) : null;

  if (prefix === "start") {
    return {
      startLatitude: latitude,
      startLongitude: longitude,
      startLocationAccuracy: accuracy,
      startLocationCapturedAt: capturedAt,
    };
  }

  return {
    submitLatitude: latitude,
    submitLongitude: longitude,
    submitLocationAccuracy: accuracy,
    submitLocationCapturedAt: capturedAt,
  };
}

function mapVerifiedSeverityToCompliance(severity: string | undefined): ComplianceStatus {
  if (severity === "critical") return "red";
  if (severity === "moderate") return "yellow";
  return "green";
}

function getOverallVehicleResult(responses: z.infer<typeof submitVerifiedInspectionSchema>["checklistResponses"]) {
  const issueResponses = responses.filter((item) => item.result === "issue_found");
  if (issueResponses.length === 0) return "no_defect";
  if (issueResponses.some((item) => item.severity === "critical")) return "not_safe_to_operate";
  if (issueResponses.some((item) => item.severity === "moderate")) return "critical_defect";
  return "defect_reported";
}

function mapTriageAction(riskLevel: string, confidenceScore: number) {
  const normalized = riskLevel.toLowerCase();
  if (/critical|red|stop|tow|do_not|not safe/.test(normalized)) return "do_not_operate";
  if (/high|repair|attention/.test(normalized)) return "repair_before_next_dispatch";
  if (confidenceScore < 85) return "continue_but_monitor";
  return "book_repair";
}

async function runInspectionTriage(input: {
  fleetId: number;
  vehicleId: number | string;
  inspectionId: number;
  defectId: number;
  defectDescription: string;
  category: string;
  severity: "minor" | "moderate" | "critical";
  vehicle: Awaited<ReturnType<typeof getVehicleProfile>>["vehicle"];
  driverNotes?: string | null;
}) {
  try {
    const analysis = await analyzeDiagnosticWithAi({
      vehicleId: input.vehicleId,
      vehicle: {
        id: input.vehicle.id,
        vin: input.vehicle.vin ?? undefined,
        make: input.vehicle.make ?? undefined,
        model: input.vehicle.model ?? undefined,
        year: input.vehicle.year ?? undefined,
        configuration: {},
      },
      symptoms: [input.defectDescription, input.category].filter(Boolean),
      faultCodes: [],
      driverNotes: input.driverNotes ?? input.defectDescription,
    });

    const confidenceScore = Math.round(analysis.confidence_score ?? 0);
    const recommendedAction =
      input.severity === "critical"
        ? "do_not_operate"
        : mapTriageAction(analysis.risk_level ?? "", confidenceScore);
    const clarifyingQuestions =
      confidenceScore < 85 && input.severity !== "critical" && analysis.clarifying_question
        ? [analysis.clarifying_question]
        : [];

    return {
      most_likely_cause: analysis.top_most_likely_cause || analysis.possible_causes[0]?.cause || input.category,
      severity: input.severity,
      confidence_score: confidenceScore,
      recommended_action: recommendedAction,
      driver_message:
        recommendedAction === "do_not_operate"
          ? "Do not operate this vehicle until a manager or mechanic reviews the defect."
          : confidenceScore < 85
            ? "TruckFixr needs one more detail before a final recommendation. Notify your manager and answer the follow-up question."
            : "Report submitted. Follow manager instructions before dispatch.",
      manager_summary:
        analysis.confidence_rationale?.join(" ") ||
        `Driver reported ${input.defectDescription}. TruckFixr triage recommends ${recommendedAction}.`,
      clarifying_questions: clarifyingQuestions,
      safety_warning: analysis.safety_note || analysis.risk_summary || "",
      suggested_next_steps: analysis.recommended_tests ?? [],
      raw: analysis,
    };
  } catch (error) {
    console.warn("[Inspections] AI triage failed; storing conservative triage:", error);
    return {
      most_likely_cause: input.defectDescription,
      severity: input.severity,
      confidence_score: 0,
      recommended_action: input.severity === "critical" ? "do_not_operate" : "book_repair",
      driver_message:
        input.severity === "critical"
          ? "Do not operate this vehicle until the defect is reviewed."
          : "Defect submitted. Manager review is required because AI triage was unavailable.",
      manager_summary: "AI triage was unavailable. Review the driver defect report manually.",
      clarifying_questions: input.severity === "critical" ? [] : ["Can the driver confirm when this issue started and whether it is getting worse?"],
      safety_warning: input.severity === "critical" ? "Critical defect reported." : "",
      suggested_next_steps: ["Manager review required"],
      raw: { error: error instanceof Error ? error.message : String(error) },
    };
  }
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function getVehicleLifecycleStatus(complianceStatus: ComplianceStatus) {
  return complianceStatus === "red" ? "maintenance" : "active";
}

const dvirCategoryCodeMap: Record<string, { code: string; label: string; side: "tractor" | "trailer" }> = {
  dashboard_warning_lights: { code: "6", label: "Driver controls / warning lights", side: "tractor" },
  tires_wheels: { code: "21", label: "Tires, wheels, hubs, fasteners", side: "trailer" },
  brakes: { code: "1", label: "Air brake system / brakes", side: "trailer" },
  brakes_air_system: { code: "1", label: "Air brake system", side: "trailer" },
  steering: { code: "19", label: "Steering", side: "tractor" },
  lights: { code: "18", label: "Lamps / reflectors", side: "trailer" },
  lights_reflectors: { code: "18", label: "Lamps / reflectors", side: "trailer" },
  tires: { code: "21", label: "Tires", side: "trailer" },
  suspension: { code: "20", label: "Suspension system", side: "trailer" },
  fluid_leaks: { code: "12", label: "Fluid systems / visible leaks", side: "tractor" },
  coupling: { code: "4", label: "Coupling devices", side: "trailer" },
  mirrors_windshield: { code: "14", label: "Glass and mirrors", side: "tractor" },
  body_damage: { code: "11", label: "Frame and cargo body", side: "trailer" },
  load_security: { code: "3", label: "Cargo securement", side: "trailer" },
  other: { code: "13", label: "General", side: "tractor" },
  safety_equipment: { code: "9", label: "Emergency equipment and safety devices", side: "tractor" },
};

function toDisplayDate(value: unknown) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-US");
}

function toDisplayTime(value: unknown) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function buildDvirPayload(input: {
  inspection: typeof inspections.$inferSelect;
  vehicle: typeof vehicles.$inferSelect | null;
  fleet: typeof fleets.$inferSelect | null;
  driver: typeof users.$inferSelect | null;
}) {
  const results = parseInspectionResults(input.inspection.results) as any;
  const checklistResponses = Array.isArray(results?.checklistResponses)
    ? results.checklistResponses
    : Array.isArray(results?.checklist)
      ? results.checklist.map((item: any) => ({
          itemId: item.itemId,
          itemLabel: item.label,
          category: item.category,
          categoryLabel: item.categoryLabel,
          result: item.status === "fail" ? "issue_found" : "pass",
          defectDescription: item.comment,
          severity:
            item.classification === "major"
              ? "major"
              : item.classification === "not_sure"
                ? "not sure"
                : item.classification ?? null,
          note: item.comment,
        }))
      : [];
  const issueItems = checklistResponses.filter((item: any) => item.result === "issue_found");
  const resolvedSheetType =
    inspectionSheetTypeSchema.safeParse(results?.inspectionSheetType).success
      ? (results.inspectionSheetType as InspectionSheetType)
      : resolveInspectionSheetType({
          assetType: input.vehicle?.assetType,
          vehicleType: input.vehicle?.vehicleType,
          model: input.vehicle?.model,
          isTrailer: input.vehicle?.isTrailer,
        }) ?? "tractor";
  const groupedRows = checklistResponses.map((item: any) => {
    const mapped = dvirCategoryCodeMap[item.category] ?? dvirCategoryCodeMap.other;
    return {
      code: mapped.code,
      side: mapped.side,
      item: item.itemLabel,
      originalItem: mapped.label,
      categoryLabel: item.categoryLabel ?? mapped.label,
      defectCode: item.result === "issue_found" ? mapped.code : "",
      defectMarked: item.result === "issue_found",
      repairedMarked: false,
      severity: item.severity ?? null,
      note:
        item.result === "issue_found"
          ? item.defectDescription ?? ""
          : item.result === "not_checked"
            ? item.note ?? "Not checked"
            : "",
    };
  });

  const location =
    input.inspection.submitLatitude && input.inspection.submitLongitude
      ? `${input.inspection.submitLatitude}, ${input.inspection.submitLongitude}`
      : input.inspection.locationStatus ?? "unavailable";
  const odometer = typeof results?.odometer === "number" ? results.odometer : null;
  const vehicleLabel =
    input.vehicle?.unitNumber ||
    input.vehicle?.licensePlate ||
    input.vehicle?.vin ||
    String(input.inspection.vehicleId);
  const trailerInspected =
    resolvedSheetType === "trailer" ||
    Boolean(input.inspection.linkedVehicleId) ||
    results?.trailerIncluded === true ||
    results?.combinedStage === "trailer";

  return {
    inspectionId: input.inspection.id,
    inspectionSessionId:
      input.inspection.inspectionSessionId ?? results?.inspectionSessionId ?? null,
    odometer,
    reportType: "Driver Vehicle Inspection Report",
    formStyle: "DVIR familiar layout",
    company: {
      name: input.fleet?.name ?? "TruckFixr fleet",
      address: input.fleet?.address ?? "",
    },
    tripType: "pre_trip",
    date: toDisplayDate(input.inspection.submittedAt ?? input.inspection.updatedAt),
    time: toDisplayTime(input.inspection.submittedAt ?? input.inspection.updatedAt),
    location,
    vehicle: {
      id: input.inspection.vehicleId,
      unitNumber: vehicleLabel,
      vin: input.vehicle?.vin ?? "",
      licensePlate: input.vehicle?.licensePlate ?? "",
      make: input.vehicle?.make ?? "",
      model: input.vehicle?.model ?? "",
      year: input.vehicle?.year ?? null,
      assetType: input.vehicle?.assetType ?? "",
      isTrailer: Boolean(input.vehicle?.isTrailer),
    },
    driver: {
      id: input.inspection.driverId,
      name: results?.driverPrintedName || input.driver?.name || input.driver?.email || "Driver",
      signature: results?.driverSignature ?? "",
      email: input.driver?.email ?? "",
    },
    inspectionSheetType: resolvedSheetType,
    trailerInspected,
    inspectionSheetLabel: results?.inspectionSheetLabel ?? inspectionSheetLabels[resolvedSheetType],
    status: {
      noDefectsFound: issueItems.length === 0,
      defectsFound: issueItems.length > 0,
      overallVehicleResult: input.inspection.overallVehicleResult ?? "no_defect",
      complianceStatus: input.inspection.complianceStatus,
      integrityScore: input.inspection.integrityScore ?? 100,
      durationSeconds: input.inspection.durationSeconds ?? 0,
      locationStatus: input.inspection.locationStatus ?? "unavailable",
    },
    rows: groupedRows,
    tractorRows: groupedRows.filter((row: any) => row.side === "tractor"),
    trailerRows: trailerInspected ? groupedRows.filter((row: any) => row.side === "trailer") : [],
    sheetSections: Array.from(
      groupedRows.reduce((sections: Map<string, any>, row: any) => {
        const key = row.categoryLabel || "Inspection items";
        const current = sections.get(key) ?? { label: key, rows: [] };
        current.rows.push(row);
        sections.set(key, current);
        return sections;
      }, new Map<string, any>()).values()
    ),
    defectsNotCodedAbove: issueItems
      .map((item: any) => `${item.itemLabel}: ${item.defectDescription ?? item.note ?? ""}`.trim())
      .filter(Boolean),
    proofPhotos: Array.isArray(results?.proofPhotos) ? results.proofPhotos : [],
    flags: Array.isArray(results?.flags) ? results.flags : [],
    triageResults: Array.isArray(results?.triageResults) ? results.triageResults : [],
    notes: input.inspection.notes ?? "",
    submittedAt: input.inspection.submittedAt ?? input.inspection.updatedAt,
  };
}

async function updateVehicleComplianceStatus(
  vehicleId: number | string,
  nextComplianceStatus: ComplianceStatus,
  nextMileage?: number | null
) {
  if (!vehicleId || vehicleId === 0 || vehicleId === "") return null;

  const db = await getDb();
  if (!db) return null;

  try {
    const [existingVehicle] = await db
      .select()
      .from(vehicles)
      .where(sql`CAST(${vehicles.id} AS text) = ${String(vehicleId)}`)
      .limit(1);

    if (!existingVehicle) return null;

    const [updatedVehicle] = await db
      .update(vehicles)
      .set({
        complianceStatus: nextComplianceStatus,
        status: getVehicleLifecycleStatus(nextComplianceStatus),
        ...(typeof nextMileage === "number" ? { mileage: nextMileage } : {}),
        updatedAt: new Date(),
      })
      .where(sql`CAST(${vehicles.id} AS text) = ${String(vehicleId)}`)
      .returning();

    return updatedVehicle ?? null;
  } catch (error) {
    console.warn("[Inspections] Skipping vehicle compliance update due to legacy vehicle schema:", error);
    return null;
  }
}

async function updateVehicleOperationalState(input: {
  vehicleId: number | string;
  operationalState: VehicleOperationalState;
  inspectionId?: number | null;
  defectId?: number | null;
  decisionByUserId?: number | null;
  instruction?: string | null;
  complianceStatus?: ComplianceStatus;
  lastCleanInspectionId?: number | null;
  lastCleanInspectionAt?: Date | null;
}) {
  const db = await getDb();
  if (!db) return null;

  try {
    const nextStatus =
      input.operationalState === "active" || input.operationalState === "returned_to_service"
        ? "active"
        : "maintenance";

    const [updatedVehicle] = await db
      .update(vehicles)
      .set({
        operationalState: input.operationalState,
        operationalDecisionInspectionId: input.inspectionId ?? null,
        operationalDecisionDefectId: input.defectId ?? null,
        operationalDecisionByUserId: input.decisionByUserId ?? null,
        operationalDecisionAt: new Date(),
        operationalInstruction: input.instruction ?? null,
        ...(input.complianceStatus ? { complianceStatus: input.complianceStatus } : {}),
        ...(input.lastCleanInspectionId !== undefined
          ? { lastCleanInspectionId: input.lastCleanInspectionId }
          : {}),
        ...(input.lastCleanInspectionAt !== undefined
          ? { lastCleanInspectionAt: input.lastCleanInspectionAt }
          : {}),
        status: nextStatus,
        updatedAt: new Date(),
      })
      .where(sql`CAST(${vehicles.id} AS text) = ${String(input.vehicleId)}`)
      .returning();

    return updatedVehicle ?? null;
  } catch (error) {
    console.warn("[Inspections] Skipping vehicle operational update:", error);
    return null;
  }
}

async function supersedePriorBlockingInspection(input: {
  fleetId: number;
  vehicleId: string;
  inspectionId: number;
  submittedAt: Date;
}) {
  const db = await getDb();
  if (!db) return null;

  const [priorInspection] = await db
    .select({
      id: inspections.id,
    })
    .from(inspections)
    .where(
      and(
        eq(inspections.fleetId, input.fleetId),
        eq(inspections.vehicleId, input.vehicleId),
        eq(inspections.reportOutcome, "major_action_required"),
        isNull(inspections.supersededByInspectionId),
        sql`${inspections.id} <> ${input.inspectionId}`
      )
    )
    .orderBy(desc(inspections.submittedAt))
    .limit(1);

  if (!priorInspection) return null;

  await db
    .update(inspections)
    .set({
      reportOutcome: "superseded",
      supersededByInspectionId: input.inspectionId,
      supersededAt: input.submittedAt,
      updatedAt: input.submittedAt,
    })
    .where(eq(inspections.id, priorInspection.id));

  await db
    .update(inspectionReviewQueueItems)
    .set({
      status: "reviewed",
      headlineStatus: "reviewed",
      reviewedAt: input.submittedAt,
      updatedAt: input.submittedAt,
    })
    .where(eq(inspectionReviewQueueItems.inspectionId, priorInspection.id));

  return priorInspection.id;
}

async function syncCombinedInspectionSession(input: {
  fleetId: number;
  inspectionSessionId: string | null;
  combinedStage: "truck" | "trailer" | null;
  linkedVehicleId: string | null;
  vehicleId: string;
  inspectionId: number;
  reportOutcome: "clean" | "minor_review" | "major_action_required" | "reviewed" | "superseded";
  highestSeverity: ReviewSeverity;
  provisionalGuidance: string | null;
}) {
  if (!input.inspectionSessionId || !input.combinedStage) return null;

  const db = await getDb();
  if (!db) return null;

  const [existingSession] = await db
    .select()
    .from(combinedInspectionSessions)
    .where(eq(combinedInspectionSessions.inspectionSessionId, input.inspectionSessionId))
    .limit(1);

  const nextTruckVehicleId =
    input.combinedStage === "truck" ? input.vehicleId : existingSession?.truckVehicleId ?? input.linkedVehicleId;
  const nextTrailerVehicleId =
    input.combinedStage === "trailer"
      ? input.vehicleId
      : existingSession?.trailerVehicleId ?? input.linkedVehicleId;
  const nextTruckInspectionId =
    input.combinedStage === "truck" ? input.inspectionId : existingSession?.truckInspectionId ?? null;
  const nextTrailerInspectionId =
    input.combinedStage === "trailer" ? input.inspectionId : existingSession?.trailerInspectionId ?? null;

  const relatedInspectionIds = [nextTruckInspectionId, nextTrailerInspectionId].filter(
    (value): value is number => typeof value === "number"
  );
  const relatedInspections =
    relatedInspectionIds.length > 0
      ? await db
          .select({
            id: inspections.id,
            reportOutcome: inspections.reportOutcome,
          })
          .from(inspections)
          .where(inArray(inspections.id, relatedInspectionIds))
      : [];

  const outcomesByInspectionId = new Map<number, ReportOutcome | null>(
    relatedInspections.map((inspection) => [inspection.id, inspection.reportOutcome as ReportOutcome | null])
  );
  outcomesByInspectionId.set(input.inspectionId, input.reportOutcome);

  const truckOutcome = nextTruckInspectionId
    ? outcomesByInspectionId.get(nextTruckInspectionId) ?? null
    : null;
  const trailerOutcome = nextTrailerInspectionId
    ? outcomesByInspectionId.get(nextTrailerInspectionId) ?? null
    : null;

  const headlineStatus = deriveCombinedHeadlineStatus({
    truckOutcome,
    trailerOutcome,
  });
  const completionState = deriveCombinedCompletionState({
    truckInspectionId: nextTruckInspectionId,
    trailerInspectionId: nextTrailerInspectionId,
    truckOutcome,
    trailerOutcome,
  });

  let groupedQueueItemId = existingSession?.groupedQueueItemId ?? null;

  if (headlineStatus !== "reviewed") {
    const queueStatus = headlineStatus === "urgent" ? "new" : "new";
    const priority = headlineStatus === "urgent" ? "high" : "normal";
    if (groupedQueueItemId) {
      await db
        .update(inspectionReviewQueueItems)
        .set({
          inspectionId: input.inspectionId,
          queueType: "grouped_combined_session",
          status: queueStatus,
          headlineStatus,
          priority,
          highestSeverity: input.highestSeverity,
          provisionalGuidanceSnapshot: input.provisionalGuidance,
          updatedAt: new Date(),
        })
        .where(eq(inspectionReviewQueueItems.id, groupedQueueItemId));
    } else {
      const [groupedQueueItem] = await db
        .insert(inspectionReviewQueueItems)
        .values({
          fleetId: input.fleetId,
          inspectionId: input.inspectionId,
          inspectionSessionId: input.inspectionSessionId,
          queueType: "grouped_combined_session",
          status: queueStatus,
          headlineStatus,
          priority,
          highestSeverity: input.highestSeverity,
          managerDecisionRequired: false,
          requiresDriverInstruction: false,
          provisionalGuidanceSnapshot: input.provisionalGuidance,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning({ id: inspectionReviewQueueItems.id });
      groupedQueueItemId = groupedQueueItem?.id ?? null;
    }
  } else if (groupedQueueItemId) {
    await db
      .update(inspectionReviewQueueItems)
      .set({
        status: "reviewed",
        headlineStatus: "reviewed",
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(inspectionReviewQueueItems.id, groupedQueueItemId));
  }

  const sessionPayload = {
    fleetId: input.fleetId,
    inspectionSessionId: input.inspectionSessionId,
    truckVehicleId: nextTruckVehicleId,
    trailerVehicleId: nextTrailerVehicleId,
    truckInspectionId: nextTruckInspectionId,
    trailerInspectionId: nextTrailerInspectionId,
    groupedQueueItemId,
    headlineStatus,
    completionState,
    updatedAt: new Date(),
  };

  if (existingSession) {
    await db
      .update(combinedInspectionSessions)
      .set(sessionPayload)
      .where(eq(combinedInspectionSessions.id, existingSession.id));
  } else {
    await db.insert(combinedInspectionSessions).values(sessionPayload);
  }

  return {
    groupedQueueItemId,
    headlineStatus,
    completionState,
  };
}

async function createInspectionReviewQueueArtifacts(input: {
  fleetId: number;
  inspectionId: number;
  vehicleId: string;
  inspectionSessionId: string | null;
  highestSeverity: ReviewSeverity;
  provisionalGuidance: string;
  defectRows: Array<{
    id: number;
    severity: string | null;
    isBlockingOperationally: boolean;
  }>;
}) {
  const db = await getDb();
  if (!db) return { primaryQueueItemId: null, urgentQueueItemIds: [] as number[] };

  let primaryQueueItemId: number | null = null;
  const urgentQueueItemIds: number[] = [];
  const primaryQueue = derivePrimaryQueueDetails(input.highestSeverity);

  if (primaryQueue) {
    const [queueItem] = await db
      .insert(inspectionReviewQueueItems)
      .values({
        fleetId: input.fleetId,
        inspectionId: input.inspectionId,
        vehicleId: input.vehicleId,
        inspectionSessionId: input.inspectionSessionId,
        queueType: primaryQueue.queueType,
        status: "new",
        headlineStatus: primaryQueue.headlineStatus,
        priority: primaryQueue.priority,
        highestSeverity: input.highestSeverity,
        managerDecisionRequired: primaryQueue.managerDecisionRequired,
        requiresDriverInstruction: primaryQueue.requiresDriverInstruction,
        provisionalGuidanceSnapshot: input.provisionalGuidance,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning({ id: inspectionReviewQueueItems.id });
    primaryQueueItemId = queueItem?.id ?? null;
  }

  for (const defect of input.defectRows) {
    const defectSeverity =
      defect.severity === "critical"
        ? "unsafe"
        : defect.severity === "high"
          ? "major"
          : defect.isBlockingOperationally
            ? "major"
            : "minor";
    const urgentQueue = deriveUrgentDefectQueueDetails(defectSeverity as ReviewSeverity);
    if (!urgentQueue) continue;

    const [queueItem] = await db
      .insert(inspectionReviewQueueItems)
      .values({
        fleetId: input.fleetId,
        inspectionId: input.inspectionId,
        defectId: defect.id,
        vehicleId: input.vehicleId,
        inspectionSessionId: input.inspectionSessionId,
        parentQueueItemId: primaryQueueItemId,
        queueType: urgentQueue.queueType,
        status: "new",
        headlineStatus: urgentQueue.headlineStatus,
        priority: urgentQueue.priority,
        highestSeverity: defectSeverity,
        managerDecisionRequired: urgentQueue.managerDecisionRequired,
        requiresDriverInstruction: urgentQueue.requiresDriverInstruction,
        provisionalGuidanceSnapshot: input.provisionalGuidance,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning({ id: inspectionReviewQueueItems.id });

    if (queueItem?.id) {
      urgentQueueItemIds.push(queueItem.id);
    }
  }

  return {
    primaryQueueItemId,
    urgentQueueItemIds,
  };
}

async function resolveInspectionRecipients(input: {
  fleetId: number;
  vehicleId: number | string;
  driverEmail?: string | null;
  managerEmail?: string | null;
  managerUserId?: number | null;
}) {
  const db = await getDb();
  const recipients = new Set<string>();
  const normalizedManagerEmail = input.managerEmail?.trim().toLowerCase() || null;
  const normalizedVehicleId = String(input.vehicleId).trim();

  if (input.driverEmail) {
    recipients.add(input.driverEmail.trim().toLowerCase());
  }

  if (!db) {
    if (normalizedManagerEmail) {
      recipients.add(normalizedManagerEmail);
    }
    return {
      recipients: Array.from(recipients),
      managerUserId: input.managerUserId ?? null,
      managerEmail: normalizedManagerEmail,
      managerName: null,
    };
  }

  try {
    const assignmentResult = await db.execute(sql`
      select
        "assignedByUserId"
      from "vehicleAssignments"
      where
        "fleetId" = ${input.fleetId}
        and CAST("vehicleId" AS text) = ${normalizedVehicleId}
        and "status" = ${"active"}
        and "startsAt" <= ${new Date()}
        and ("expiresAt" is null or "expiresAt" >= ${new Date()})
      order by "updatedAt" desc
      limit 1
    `);
    const assignedByUserId = (assignmentResult.rows?.[0] as any)?.assignedByUserId as number | null | undefined;
    const managerUserId = assignedByUserId ?? input.managerUserId ?? null;

    if (managerUserId) {
      const [manager] = await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
        })
        .from(users)
        .where(eq(users.id, managerUserId))
        .limit(1);

      if (manager?.email) {
        recipients.add(manager.email.trim().toLowerCase());
      }

      return {
        recipients: Array.from(recipients),
        managerUserId: manager?.id ?? managerUserId,
        managerEmail: manager?.email?.trim().toLowerCase() ?? normalizedManagerEmail,
        managerName: manager?.name ?? null,
      };
    }
  } catch (error) {
    console.warn("[Inspections] Unable to resolve linked manager email:", error);
  }

  if (normalizedManagerEmail) {
    recipients.add(normalizedManagerEmail);
  }

  return {
    recipients: Array.from(recipients),
    managerUserId: input.managerUserId ?? null,
    managerEmail: normalizedManagerEmail,
    managerName: null,
  };
}

async function getVehicleProfile(vehicleId: number | string) {
  const db = await getDb();

  if (db) {
    try {
      const [vehicle] = await db
        .select()
        .from(vehicles)
        .where(sql`CAST(${vehicles.id} AS text) = ${String(vehicleId)}`)
        .limit(1);

      if (vehicle) {
        const inspectionSheetType = resolveInspectionSheetType({
          assetType: vehicle.assetType,
          vehicleType: vehicle.vehicleType,
          model: vehicle.model,
          isTrailer: vehicle.isTrailer,
        });
        const reeferUnit = isReeferAsset({
          assetType: vehicle.assetType,
          vehicleType: vehicle.vehicleType,
          model: vehicle.model,
        });
        const configuration = vehicleInspectionConfigSchema.parse({
          ...getVehicleInspectionConfig(vehicleId),
          reeferUnit,
          ...(vehicle.configuration ?? {}),
        });

        return {
          vehicle: {
            id: vehicle.id,
            fleetId: vehicle.fleetId,
            unitNumber: vehicle.unitNumber,
            vin: vehicle.vin,
            licensePlate: vehicle.licensePlate,
            make: vehicle.make,
            model: vehicle.model,
            year: vehicle.year,
            mileage: vehicle.mileage,
            complianceStatus: vehicle.complianceStatus,
            assetType: vehicle.assetType,
            vehicleType: vehicle.vehicleType,
            isTrailer: vehicle.isTrailer,
          },
          configuration,
          inspectionSheetType,
          requiresSheetSelection: !inspectionSheetType,
        };
      }
    } catch (error) {
      console.warn("[Inspections] Falling back to local vehicle profile:", error);
  }
}

  throw new TRPCError({
    code: "NOT_FOUND",
    message: "Inspection requires a valid company vehicle. Select an assigned vehicle before starting.",
  });
}

const managerReviewActionTypeSchema = z.enum([
  "minor_reviewed",
  "escalated_to_major",
  "decision_return_to_service",
  "decision_move_for_repair_only",
  "decision_do_not_operate",
]);

function mapReviewActionToDecision(
  actionType: z.infer<typeof managerReviewActionTypeSchema>
): "return_to_service" | "move_for_repair_only" | "do_not_operate" | null {
  switch (actionType) {
    case "decision_return_to_service":
      return "return_to_service";
    case "decision_move_for_repair_only":
      return "move_for_repair_only";
    case "decision_do_not_operate":
      return "do_not_operate";
    default:
      return null;
  }
}

function mapDecisionToDefectReviewStatus(
  decision: "return_to_service" | "move_for_repair_only" | "do_not_operate" | null
) {
  switch (decision) {
    case "return_to_service":
      return {
        managerReviewStatus: "reviewed",
        status: "acknowledged",
      } as const;
    case "move_for_repair_only":
      return {
        managerReviewStatus: "scheduled",
        status: "assigned",
      } as const;
    case "do_not_operate":
      return {
        managerReviewStatus: "escalated",
        status: "repair_required",
      } as const;
    default:
      return null;
  }
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
    (item) =>
      item?.status === "fail" &&
      (item?.classification === "minor" || item?.classification === "not_sure")
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

function getDailyOverallVehicleResult(input: {
  majorDefectCount: number;
  minorDefectCount: number;
}) {
  if (input.majorDefectCount > 0) return "not_safe_to_operate";
  if (input.minorDefectCount > 0) return "defect_reported";
  return "no_defect";
}

function buildDailyInspectionCreateResponse(input: {
  inspection: {
    id: number;
    results: unknown;
    complianceStatus: ComplianceStatus;
    submittedAt: Date | null;
    updatedAt: Date;
  };
}) {
  const parsed = (parseInspectionResults(input.inspection.results) ?? {}) as Record<string, any>;
  const summary = parsed.summary ?? {};
  const report = parsed.report ?? {};
  const submittedAt = input.inspection.submittedAt ?? input.inspection.updatedAt;
  const majorDefectCount = Number(summary.majorDefectCount ?? 0);
  const minorDefectCount = Number(summary.minorDefectCount ?? 0);
  const validUntil =
    parsed.validUntil && !Number.isNaN(new Date(parsed.validUntil).getTime())
      ? new Date(parsed.validUntil)
      : getInspectionDueAt(submittedAt);
  const recipients = Array.isArray(report.recipients) ? report.recipients : [];
  const emailDelivery = report.emailDelivery ?? {};
  const reportFileName =
    typeof report.fileName === "string" && report.fileName.trim().length > 0
      ? report.fileName
      : `canada-daily-inspection-${input.inspection.id}.pdf`;

  return {
    success: true,
    inspectionId: input.inspection.id,
    defectsCreated: majorDefectCount + minorDefectCount,
    majorDefectCount,
    minorDefectCount,
    complianceStatus: input.inspection.complianceStatus,
    validUntil,
    canOperate: summary.canOperate ?? input.inspection.complianceStatus !== "red",
    reportFileName,
    reportRecipients: {
      recipients,
      managerUserId: null,
      managerEmail: null,
      managerName: null,
    },
    emailDelivered: Boolean(emailDelivery.delivered),
    emailDeliveryReason:
      typeof emailDelivery.reason === "string" ? emailDelivery.reason : null,
    reportGenerated: Boolean(report.pdfBase64),
    reportWarning:
      typeof report.warning === "string" ? report.warning : undefined,
    reportPdfBase64:
      typeof report.pdfBase64 === "string" ? report.pdfBase64 : null,
    reportMimeType:
      typeof report.mimeType === "string" ? report.mimeType : "application/pdf",
  };
}

export const inspectionsRouter = router({
  uploadEvidencePhoto: protectedProcedure
    .input(
      z.object({
        fleetId: z.number().int().positive(),
        vehicleId: z.union([
          z.coerce.number().int().positive(),
          z.string().trim().min(1),
        ]),
        inspectionId: z
          .union([z.coerce.number().int().positive(), z.string().trim().min(1)])
          .nullish(),
        kind: z.enum(["defect", "proof"]),
        dataUrl: z.string().min(32),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const hasAccess = await verifyVehicleInspectionAccess({
        fleetId: input.fleetId,
        vehicleId: input.vehicleId,
        userId: ctx.user.id,
        userRole: ctx.user.role,
      });
      if (!hasAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to upload evidence for this vehicle",
        });
      }

      const inspectionId = input.inspectionId ?? null;
      if (inspectionId != null) {
        const [inspection] = await db
          .select({
            id: inspections.id,
            fleetId: inspections.fleetId,
            vehicleId: inspections.vehicleId,
          })
          .from(inspections)
          .where(eq(inspections.id, Number(inspectionId)))
          .limit(1);

        if (
          !inspection ||
          Number(inspection.fleetId) !== Number(input.fleetId) ||
          String(inspection.vehicleId) !== String(input.vehicleId)
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Evidence upload is not permitted for this inspection",
          });
        }
      }

      const parsed = parseEvidenceImageDataUrl(input.dataUrl);
      const key = buildEvidencePhotoStorageKey({
        bucketId: "inspection-evidence",
        fleetId: input.fleetId,
        vehicleId: input.vehicleId,
        inspectionId,
        kind: input.kind,
        extension: parsed.extension,
      });

      const { url } = await storagePut(key, parsed.bytes, parsed.mimeType);
      return {
        ok: true,
        key,
        url,
        sizeBytes: parsed.sizeBytes,
        mimeType: parsed.mimeType,
      };
    }),

  getDailyChecklist: protectedProcedure
    .input(z.object({ vehicleId: z.union([z.number(), z.string()]) }))
    .query(async ({ input, ctx }) => {
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

      const { vehicle, configuration, inspectionSheetType, requiresSheetSelection } =
        await getVehicleProfile(input.vehicleId);
      const checklistSheetType = inspectionSheetType ?? "tractor";
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
            .where(eq(inspections.vehicleId, String(input.vehicleId)))
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
        inspectionSheetType,
        inspectionSheetLabel: inspectionSheetType ? inspectionSheetLabels[inspectionSheetType] : null,
        requiresSheetSelection,
        availableInspectionSheets: inspectionSheetType
          ? []
          : inspectionSheetTypeSchema.options.map((value) => ({
              value,
              label: inspectionSheetLabels[value],
            })),
        validityHours: INSPECTION_VALIDITY_HOURS,
        categories: buildChecklistByCategory(configuration, checklistSheetType),
        latestInspection,
      };
    }),

  startVerified: protectedProcedure
    .input(startVerifiedInspectionSchema)
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const hasAccess = await verifyVehicleInspectionAccess({
        fleetId: input.fleetId,
        vehicleId: input.vehicleId,
        userId: ctx.user.id,
        userRole: ctx.user.role,
      });

      if (!hasAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to inspect this vehicle",
        });
      }

      const { vehicle, configuration, inspectionSheetType, requiresSheetSelection } =
        await getVehicleProfile(input.vehicleId);
      const checklistSheetType = inspectionSheetType ?? "tractor";
      const startedAt = new Date();
      const requestedProofItems = randomProofSelection();

      const [inspection] = await db
        .insert(inspections)
        .values({
          fleetId: input.fleetId,
          vehicleId: String(input.vehicleId),
          driverId: ctx.user.id,
          status: "in_progress",
          inspectionDate: startOfToday(),
          startedAt,
          locationStatus: input.startLocation?.permissionStatus ?? "unavailable",
          ...locationFields(input.startLocation, "start"),
          results: {
            workflow: "verified_daily",
            proofItems: requestedProofItems,
          },
          updatedAt: startedAt,
        } as any)
        .returning();

      await db.insert(randomProofRequests).values(
        requestedProofItems.map((proofItem) => ({
          inspectionId: inspection.id,
          fleetId: input.fleetId,
          vehicleId: String(input.vehicleId),
          driverId: ctx.user.id,
          proofItem,
        }))
      );

      const openDefects = await db
        .select()
        .from(defects)
        .where(and(eq(defects.vehicleId, String(input.vehicleId)), eq(defects.fleetId, input.fleetId)))
        .orderBy(desc(defects.createdAt));

      return {
        inspectionId: inspection.id,
        startedAt,
        vehicle,
        inspectionSheetType,
        inspectionSheetLabel: inspectionSheetType ? inspectionSheetLabels[inspectionSheetType] : null,
        requiresSheetSelection,
        availableInspectionSheets: inspectionSheetType
          ? []
          : inspectionSheetTypeSchema.options.map((value) => ({
              value,
              label: inspectionSheetLabels[value],
            })),
        categories: buildChecklistByCategory(configuration, checklistSheetType),
        requestedProofItems,
        openDefects: openDefects.filter((defect) => defect.status !== "resolved" && defect.status !== "dismissed"),
      };
    }),

  submitVerified: protectedProcedure
    .input(submitVerifiedInspectionSchema)
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [inspection] = await db
        .select()
        .from(inspections)
        .where(eq(inspections.id, input.inspectionId))
        .limit(1);

      if (!inspection) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Inspection not found" });
      }

      if (inspection.driverId !== ctx.user.id && ctx.user.role === "driver") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to submit this inspection",
        });
      }

      const hasAccess = await verifyVehicleInspectionAccess({
        fleetId: inspection.fleetId,
        vehicleId: inspection.vehicleId,
        userId: ctx.user.id,
        userRole: ctx.user.role,
      });

      if (!hasAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to submit this inspection",
        });
      }

      const submittedAt = new Date();
      const startedAt = inspection.startedAt ?? inspection.createdAt ?? submittedAt;
      const durationSeconds = Math.max(
        0,
        Math.round((submittedAt.getTime() - new Date(startedAt).getTime()) / 1000)
      );
      const locationStatus = input.submitLocation?.permissionStatus ?? inspection.locationStatus ?? "unavailable";
      const proofRequests = await db
        .select()
        .from(randomProofRequests)
        .where(eq(randomProofRequests.inspectionId, input.inspectionId));
      const proofMap = new Map(input.proofPhotos.map((item) => [item.proofItem, item]));
      const skippedRandomProof = proofRequests.some((proof) => !proofMap.get(proof.proofItem)?.photoUrl);
      const missingRequiredDefectPhoto = input.checklistResponses.some(
        (item) => item.result === "issue_found" && item.photoUrls.length === 0
      );

      const openDefects = await db
        .select()
        .from(defects)
        .where(and(eq(defects.vehicleId, inspection.vehicleId), eq(defects.fleetId, inspection.fleetId)));
      const activeKnownDefects = openDefects.filter(
        (defect) => defect.status !== "resolved" && defect.status !== "dismissed"
      );
      const acknowledgedDefectIds = new Set(
        input.knownDefectFollowUps.flatMap((item) => item.defectIds)
      );
      const knownDefectNotAcknowledged = activeKnownDefects.some(
        (defect) => !acknowledgedDefectIds.has(defect.id)
      );

      const integrity = calculateInspectionIntegrity({
        durationSeconds,
        locationStatus: locationStatus as "granted" | "denied" | "unavailable",
        missingRequiredDefectPhoto,
        skippedRandomProof,
        knownDefectNotAcknowledged,
        checklistResponses: input.checklistResponses,
      });
      const hasCriticalDefect = input.checklistResponses.some(
        (item) => item.result === "issue_found" && item.severity === "critical"
      );
      const status = getInspectionStatusFromIntegrity({
        durationSeconds,
        flags: integrity.flags,
        hasCriticalDefect,
      });
      const dbStatus = status === "completed" ? "submitted" : "reviewed";
      const overallVehicleResult = getOverallVehicleResult(input.checklistResponses);
      const complianceStatus = input.checklistResponses.reduce<ComplianceStatus>(
        (current, item) => {
          const next = item.result === "issue_found" ? mapVerifiedSeverityToCompliance(item.severity) : "green";
          return current === "red" || next === "red" ? "red" : current === "yellow" || next === "yellow" ? "yellow" : "green";
        },
        "green"
      );

      await db.insert(inspectionChecklistResponses).values(
        input.checklistResponses.map((item) => ({
          inspectionId: input.inspectionId,
          fleetId: inspection.fleetId,
          vehicleId: inspection.vehicleId,
          driverId: inspection.driverId,
          checklistItemId: item.itemId,
          checklistItemLabel: item.itemLabel,
          category: item.category,
          result: item.result,
          defectDescription: item.defectDescription ?? null,
          severity: item.severity as any,
          note: item.note ?? null,
          unableToTakePhoto: item.unableToTakePhoto,
          unableToTakePhotoReason: item.unableToTakePhotoReason ?? null,
        }))
      );

      const photoRows = input.checklistResponses.flatMap((item) =>
        normalizeSubmittedEvidencePhotoUrls(item.photoUrls).map((imageUrl) => ({
          inspectionId: input.inspectionId,
          fleetId: inspection.fleetId,
          vehicleId: inspection.vehicleId,
          driverId: inspection.driverId,
          checklistItemId: item.itemId,
          photoType: "defect",
          imageUrl,
          source: classifyEvidencePhotoSource(imageUrl),
          notes: item.note ?? null,
        }))
      );
      const proofPhotoRows = input.proofPhotos
        .filter((item) => item.photoUrl)
        .flatMap((item) =>
          normalizeSubmittedEvidencePhotoUrls([item.photoUrl]).map((imageUrl) => ({
            inspectionId: input.inspectionId,
            fleetId: inspection.fleetId,
            vehicleId: inspection.vehicleId,
            driverId: inspection.driverId,
            checklistItemId: item.proofItem,
            photoType: "random_proof",
            imageUrl,
            source: classifyEvidencePhotoSource(imageUrl),
            notes: `Random proof: ${item.proofItem}`,
          }))
        );

      if (photoRows.length + proofPhotoRows.length > 0) {
        await db.insert(inspectionPhotos).values([...photoRows, ...proofPhotoRows]);
      }

      for (const proof of proofRequests) {
        const submitted = proofMap.get(proof.proofItem);
        await db
          .update(randomProofRequests)
          .set({
            photoSubmitted: Boolean(submitted?.photoUrl),
            photoUrl: submitted?.photoUrl ?? null,
            complianceStatus: submitted?.photoUrl ? "submitted" : submitted?.skipped ? "skipped" : "failed_upload",
            updatedAt: submittedAt,
          })
          .where(eq(randomProofRequests.id, proof.id));
      }

      if (integrity.flags.length > 0) {
        await db.insert(inspectionFlags).values(
          integrity.flags.map((flag) => ({
            inspectionId: input.inspectionId,
            fleetId: inspection.fleetId,
            vehicleId: inspection.vehicleId,
            driverId: inspection.driverId,
            flagType: flag.flagType,
            severity: flag.severity,
            message: flag.message,
          }))
        );
      }

      for (const followUp of input.knownDefectFollowUps) {
        for (const defectId of followUp.defectIds) {
          await db
            .update(defects)
            .set({
              latestFollowUpStatus: followUp.status,
              latestFollowUpAt: submittedAt,
              status: followUp.status === "repaired" ? "monitoring" : undefined,
              updatedAt: submittedAt,
            } as any)
            .where(eq(defects.id, defectId));
        }
      }

      const { vehicle } = await getVehicleProfile(inspection.vehicleId);
      const triageResults = [];
      for (const item of input.checklistResponses.filter((entry) => entry.result === "issue_found")) {
        const [defect] = await db
          .insert(defects)
          .values({
            vehicleId: inspection.vehicleId,
            fleetId: inspection.fleetId,
            driverId: inspection.driverId,
            inspectionId: input.inspectionId,
            title: item.itemLabel,
            description: item.defectDescription ?? item.note ?? "",
            category: item.category,
            severity: item.severity as any,
            complianceStatus,
            status: item.severity === "critical" ? "repair_required" : "open",
            managerReviewStatus: "submitted",
            managerReviewStatusUpdatedAt: submittedAt,
            photoUrls: item.photoUrls,
            updatedAt: submittedAt,
          })
          .returning();

        const triage = await runInspectionTriage({
          fleetId: inspection.fleetId,
          vehicleId: inspection.vehicleId,
          inspectionId: input.inspectionId,
          defectId: defect.id,
          defectDescription: item.defectDescription ?? item.itemLabel,
          category: item.category,
          severity: item.severity ?? "minor",
          vehicle,
          driverNotes: input.notes,
        });

        const [triageRecord] = await db
          .insert(aiTriageRecords)
          .values({
            fleetId: inspection.fleetId,
            vehicleId: inspection.vehicleId,
            inspectionId: input.inspectionId,
            defectId: defect.id,
            mostLikelyCause: triage.most_likely_cause,
            severity: triage.severity,
            confidenceScore: triage.confidence_score,
            recommendedAction: triage.recommended_action,
            driverMessage: triage.driver_message,
            managerSummary: triage.manager_summary,
            clarifyingQuestions: triage.clarifying_questions,
            safetyWarning: triage.safety_warning,
            suggestedNextSteps: triage.suggested_next_steps,
            rawResult: triage.raw,
          })
          .returning();

        await db
          .update(defects)
          .set({
            aiRecommendation: triage.recommended_action,
            aiConfidenceScore: triage.confidence_score,
            aiSummary: triage.manager_summary,
            updatedAt: submittedAt,
          })
          .where(eq(defects.id, defect.id));

        triageResults.push({ defect, triage: { ...triage, id: triageRecord.id } });

        if (item.severity === "critical" || triage.recommended_action === "do_not_operate") {
          await db.insert(inAppAlerts).values({
            fleetId: inspection.fleetId,
            vehicleId: inspection.vehicleId,
            inspectionId: input.inspectionId,
            defectId: defect.id,
            alertType: "critical_defect_reported",
            severity: "critical",
            title: "Critical defect reported",
            message: `${item.itemLabel}: ${item.defectDescription ?? "Driver reported a critical defect."}`,
          });
        }
      }

      // Re-evaluate rule-based early warnings for this vehicle now that the
      // inspection's defects have been recorded (e.g. high/critical defect).
      await evaluateEarlyWarnings({
        fleetId: inspection.fleetId,
        vehicleId: inspection.vehicleId,
      });

      for (const flag of integrity.flags) {
        await db.insert(inAppAlerts).values({
          fleetId: inspection.fleetId,
          vehicleId: inspection.vehicleId,
          inspectionId: input.inspectionId,
          alertType: flag.flagType,
          severity: flag.severity,
          title: "Inspection integrity alert",
          message: flag.message,
        });
      }

      await db
        .update(inspections)
        .set({
          status: dbStatus,
          complianceStatus,
          submittedAt,
          durationSeconds,
          overallVehicleResult,
          notes: input.notes ?? null,
          locationStatus,
          integrityScore: integrity.score,
          ...locationFields(input.submitLocation, "submit"),
          results: {
            workflow: "verified_daily",
            verifiedStatus: status,
            driverPrintedName: input.driverPrintedName,
            driverSignature: input.driverSignature,
            checklistResponses: input.checklistResponses,
            proofPhotos: input.proofPhotos,
            knownDefectFollowUps: input.knownDefectFollowUps,
            flags: integrity.flags,
            triageResults,
          },
          updatedAt: submittedAt,
        } as any)
        .where(eq(inspections.id, input.inspectionId));

      await updateVehicleComplianceStatus(inspection.vehicleId, complianceStatus);

      const reportRecipients = await resolveInspectionRecipients({
        fleetId: inspection.fleetId,
        vehicleId: inspection.vehicleId,
        driverEmail: ctx.user.email,
        managerEmail: ctx.user.managerEmail,
        managerUserId:
          ctx.user.role === "owner" || ctx.user.role === "manager"
            ? ctx.user.id
            : ctx.user.managerUserId,
      });

      if (reportRecipients.managerUserId) {
        await db.insert(inAppAlerts).values({
          fleetId: inspection.fleetId,
          userId: reportRecipients.managerUserId,
          vehicleId: String(inspection.vehicleId),
          inspectionId: input.inspectionId,
          alertType: "inspection_report_submitted",
          severity: complianceStatus === "red" ? "critical" : "info",
          title: "DVIR inspection report received",
          message: `${ctx.user.name || "A driver"} submitted a verified DVIR-style inspection report.`,
        });
      }

      if (reportRecipients.recipients.length > 0) {
        const reportUrl = `${ENV.appBaseUrl.replace(/\/+$/, "")}/inspection-report/${input.inspectionId}`;
        sendEmail({
          to: reportRecipients.recipients,
          subject: `TruckFixr DVIR report #${input.inspectionId}`,
          text: `A verified daily vehicle inspection report was submitted.\n\nReport: ${reportUrl}\n\nVehicle: ${vehicle?.unitNumber || vehicle?.licensePlate || vehicle?.vin || inspection.vehicleId}\nDriver: ${ctx.user.name || ctx.user.email || "Driver"}\nResult: ${overallVehicleResult}\nIntegrity score: ${integrity.score}/100`,
          html: `
            <p>A verified daily vehicle inspection report was submitted.</p>
            <p><strong>Vehicle:</strong> ${vehicle?.unitNumber || vehicle?.licensePlate || vehicle?.vin || inspection.vehicleId}</p>
            <p><strong>Driver:</strong> ${ctx.user.name || ctx.user.email || "Driver"}</p>
            <p><strong>Result:</strong> ${overallVehicleResult}</p>
            <p><strong>Integrity score:</strong> ${integrity.score}/100</p>
            <p><a href="${reportUrl}">Open the TruckFixr DVIR report</a></p>
          `,
        }).catch((error) => {
          console.warn("[Inspections] Unable to email verified DVIR report:", error);
        });
      }

      return {
        success: true,
        inspectionId: input.inspectionId,
        status,
        durationSeconds,
        integrityScore: integrity.score,
        flags: integrity.flags,
        overallVehicleResult,
        complianceStatus,
        triageResults,
        locationProofCaptured: locationStatus === "granted",
      };
    }),

  create: protectedProcedure
    .input(dailyInspectionSubmissionSchema)
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      try {
        const normalizedInspectionSessionId = input.inspectionSessionId?.trim() || null;
        const normalizedVehicleId = String(input.vehicleId);
        const normalizedLinkedVehicleId = input.linkedVehicleId ? String(input.linkedVehicleId) : null;
        const normalizedCombinedStage = input.combinedStage ?? null;

        if (normalizedInspectionSessionId) {
          const [existingInspection] = await db
            .select({
              id: inspections.id,
              results: inspections.results,
              complianceStatus: inspections.complianceStatus,
              submittedAt: inspections.submittedAt,
              updatedAt: inspections.updatedAt,
            })
            .from(inspections)
            .where(
              and(
                eq(inspections.fleetId, input.fleetId),
                eq(inspections.driverId, ctx.user.id),
                eq(inspections.vehicleId, normalizedVehicleId),
                eq(inspections.inspectionSessionId, normalizedInspectionSessionId)
              )
            )
            .limit(1);

          if (existingInspection) {
            return buildDailyInspectionCreateResponse({
              inspection: existingInspection,
            });
          }
        }

        const { vehicle, configuration, inspectionSheetType: vehicleInspectionSheetType } =
          await getVehicleProfile(input.vehicleId);
        const inspectionSheetType = vehicleInspectionSheetType ?? input.inspectionSheetType;
        if (!inspectionSheetType) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Choose the correct inspection sheet before submitting this inspection.",
          });
        }
        let odometerReading: number | null = null;

        try {
          odometerReading = validateInspectionOdometer({
            isTrailer: inspectionSheetType === "trailer" || Boolean(vehicle.isTrailer),
            enteredOdometer: typeof input.odometer === "number" ? input.odometer : null,
            currentMileage: typeof vehicle.mileage === "number" ? vehicle.mileage : null,
          }).normalizedOdometer;
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error instanceof Error ? error.message : "Revise the odometer reading and try again.",
          });
        }

        const prepared = prepareInspectionSubmission({
          input: {
            ...input,
            ...(odometerReading != null ? { odometer: odometerReading } : {}),
          },
          user: ctx.user,
          vehicle,
          configuration,
          inspectionSheetType,
        });
        const overallVehicleResult = getDailyOverallVehicleResult({
          majorDefectCount: prepared.majorDefectCount,
          minorDefectCount: prepared.minorDefectCount,
        });
        const highestDefectSeverity = deriveInspectionReviewSeverity({
          majorDefectCount: prepared.majorDefectCount,
          minorDefectCount: prepared.minorDefectCount,
        });
        const reportOutcome = deriveReportOutcome(highestDefectSeverity);
        const managerReviewRequired = deriveManagerReviewRequired(highestDefectSeverity);
        const provisionalDriverGuidance = deriveProvisionalDriverGuidance(highestDefectSeverity);

        const [inspectionResult] = await db.insert(inspections).values({
          vehicleId: normalizedVehicleId,
          fleetId: input.fleetId,
          driverId: ctx.user.id,
          inspectionSessionId: normalizedInspectionSessionId,
          linkedVehicleId: normalizedLinkedVehicleId,
          combinedStage: normalizedCombinedStage,
          inspectionDate: startOfToday(),
          status: "submitted",
          complianceStatus: prepared.complianceStatus,
          overallVehicleResult,
          reportOutcome,
          highestDefectSeverity,
          managerReviewRequired,
          provisionalDriverGuidance,
          results: {
            ...prepared.baseInspectionResults,
            inspectionSessionId: normalizedInspectionSessionId,
            linkedVehicleId: normalizedLinkedVehicleId,
            combinedStage: normalizedCombinedStage,
          },
          submittedAt: prepared.submittedAt,
          updatedAt: prepared.submittedAt,
        }).returning({ id: inspections.id });

        const reportRecipients = await resolveInspectionRecipients({
          fleetId: input.fleetId,
          vehicleId: String(input.vehicleId),
          driverEmail: ctx.user.email,
          managerEmail: ctx.user.managerEmail,
          managerUserId: ctx.user.managerUserId,
        });

        // Carrier/operator details for the DVIR header, from the fleet record.
        const [reportFleet] = await db
          .select({ name: fleets.name, address: fleets.address })
          .from(fleets)
          .where(eq(fleets.id, input.fleetId))
          .limit(1);

        const reportDelivery = await createInspectionReportDelivery({
          prepared,
          inspectionId: inspectionResult.id,
          recipients: reportRecipients.recipients,
          vehicle,
          carrier: { name: reportFleet?.name ?? null, address: reportFleet?.address ?? null },
          input: {
            ...input,
            ...(odometerReading != null ? { odometer: odometerReading } : {}),
          },
          userEmail: ctx.user.email,
        });

        await db
          .update(inspections)
          .set({
            results: {
              ...reportDelivery.storedInspectionResults,
              inspectionSessionId: normalizedInspectionSessionId,
              linkedVehicleId: normalizedLinkedVehicleId,
              combinedStage: normalizedCombinedStage,
            },
            updatedAt: new Date(),
          })
          .where(eq(inspections.id, inspectionResult.id));

        const createdDefects: Array<{
          id: number;
          severity: string | null;
          isBlockingOperationally: boolean;
        }> = [];
        for (const item of prepared.normalizedChecklist) {
          if (item.status !== "fail") continue;
          const defectSeverity = mapClassificationToSeverity(item.classification);
          const isBlockingOperationally = defectSeverity === "critical";

          const [createdDefect] = await db
            .insert(defects)
            .values({
              vehicleId: normalizedVehicleId,
              fleetId: input.fleetId,
              driverId: ctx.user.id,
              inspectionId: inspectionResult.id,
              title: item.label,
              description: item.comment,
              category: item.category,
              severity: defectSeverity,
              complianceStatus: prepared.complianceStatus,
              status: defectSeverity === "critical" ? "repair_required" : "open",
              managerReviewStatus: "submitted",
              managerReviewStatusUpdatedAt: prepared.submittedAt,
              isBlockingOperationally,
              photoUrls: item.photoUrls,
              updatedAt: prepared.submittedAt,
            })
            .returning({
              id: defects.id,
              severity: defects.severity,
              isBlockingOperationally: defects.isBlockingOperationally,
            });

          if (createdDefect) {
            createdDefects.push(createdDefect);
          }
        }

        // Save proof photos submitted with the daily inspection
        if (input.proofPhotos && input.proofPhotos.length > 0) {
          try {
            await db.insert(randomProofRequests).values(
              input.proofPhotos.map((proof) => ({
                inspectionId: inspectionResult.id,
                fleetId: input.fleetId,
                vehicleId: normalizedVehicleId,
                driverId: ctx.user.id,
                proofItem: proof.proofItem,
                photoSubmitted: Boolean(proof.photoUrl),
                photoUrl: proof.photoUrl ?? null,
                complianceStatus: proof.photoUrl ? "submitted" : proof.skipped ? "skipped" : "failed_upload",
                updatedAt: new Date(),
              }))
            );
            const proofPhotoRows = input.proofPhotos
              .filter((p) => p.photoUrl)
              .flatMap((p) =>
                normalizeSubmittedEvidencePhotoUrls([p.photoUrl]).map((imageUrl) => ({
                  inspectionId: inspectionResult.id,
                  fleetId: input.fleetId,
                  vehicleId: normalizedVehicleId,
                  driverId: ctx.user.id,
                  checklistItemId: p.proofItem,
                  photoType: "random_proof",
                  imageUrl,
                  source: classifyEvidencePhotoSource(imageUrl),
                  notes: `Random proof: ${p.proofLabel ?? p.proofItem}`,
                }))
              );
            if (proofPhotoRows.length > 0) {
              await db.insert(inspectionPhotos).values(proofPhotoRows);
            }
          } catch (proofError) {
            console.warn("[Inspections] Unable to save proof photos for daily inspection:", proofError);
          }
        }

        const queueArtifacts = await createInspectionReviewQueueArtifacts({
          fleetId: input.fleetId,
          inspectionId: inspectionResult.id,
          vehicleId: normalizedVehicleId,
          inspectionSessionId: normalizedInspectionSessionId,
          highestSeverity: highestDefectSeverity,
          provisionalGuidance: provisionalDriverGuidance,
          defectRows: createdDefects,
        });

        await updateVehicleComplianceStatus(
          input.vehicleId,
          prepared.complianceStatus,
          odometerReading
        );

        if (reportOutcome === "clean") {
          await supersedePriorBlockingInspection({
            fleetId: input.fleetId,
            vehicleId: normalizedVehicleId,
            inspectionId: inspectionResult.id,
            submittedAt: prepared.submittedAt,
          });
          await updateVehicleOperationalState({
            vehicleId: normalizedVehicleId,
            operationalState: "active",
            inspectionId: inspectionResult.id,
            complianceStatus: prepared.complianceStatus,
            instruction: null,
            lastCleanInspectionId: inspectionResult.id,
            lastCleanInspectionAt: prepared.submittedAt,
          });
        } else if (highestDefectSeverity === "major" || highestDefectSeverity === "unsafe") {
          const blockingDefect = createdDefects.find((defect) => defect.isBlockingOperationally);
          await updateVehicleOperationalState({
            vehicleId: normalizedVehicleId,
            operationalState: deriveOperationalStateForSeverity(highestDefectSeverity),
            inspectionId: inspectionResult.id,
            defectId: blockingDefect?.id ?? null,
            complianceStatus: prepared.complianceStatus,
            instruction: provisionalDriverGuidance,
          });
        }

        await syncCombinedInspectionSession({
          fleetId: input.fleetId,
          inspectionSessionId: normalizedInspectionSessionId,
          combinedStage: normalizedCombinedStage,
          linkedVehicleId: normalizedLinkedVehicleId,
          vehicleId: normalizedVehicleId,
          inspectionId: inspectionResult.id,
          reportOutcome,
          highestSeverity: highestDefectSeverity,
          provisionalGuidance: provisionalDriverGuidance,
        });

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

        if (reportRecipients.managerUserId) {
          try {
            await db.insert(inAppAlerts).values({
              fleetId: input.fleetId,
              userId: reportRecipients.managerUserId,
              vehicleId: String(input.vehicleId),
              inspectionId: inspectionResult.id,
              alertType: "inspection_report_submitted",
              severity: prepared.complianceStatus === "red" ? "critical" : "info",
              title: "Inspection report received",
              message:
                `${ctx.user.name || "A driver"} submitted a verified inspection for ${vehicle?.licensePlate || vehicle?.vin || "the assigned vehicle"}.` +
                (reportRecipients.managerName ? ` Routed to ${reportRecipients.managerName}.` : ""),
            });
          } catch (alertError) {
            console.warn("[Inspections] Unable to persist manager inspection report alert:", alertError);
          }
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
          reportOutcome,
          highestDefectSeverity,
          managerReviewRequired,
          provisionalDriverGuidance,
          reviewQueueCreated: queueArtifacts.primaryQueueItemId != null,
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

      const hasAccess = await canViewVehicle({
        user: ctx.user,
        vehicleId: inspection.vehicleId,
        fleetId: inspection.fleetId,
      });
      if (!hasAccess && inspection.driverId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this inspection",
        });
      }

      return inspection;
    }),

  getDvirReport: protectedProcedure
    .input(z.object({ inspectionId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return null;

      const [inspection] = await db
        .select()
        .from(inspections)
        .where(eq(inspections.id, input.inspectionId))
        .limit(1);

      if (!inspection) return null;

      const hasAccess = await canViewVehicle({
        user: ctx.user,
        vehicleId: inspection.vehicleId,
        fleetId: inspection.fleetId,
      });

      if (!hasAccess && inspection.driverId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this inspection report",
        });
      }

      const [vehicle] = await db
        .select()
        .from(vehicles)
        .where(sql`CAST(${vehicles.id} AS text) = ${String(inspection.vehicleId)}`)
        .limit(1);
      const [fleet] = await db
        .select()
        .from(fleets)
        .where(eq(fleets.id, inspection.fleetId))
        .limit(1);
      const [driver] = await db
        .select()
        .from(users)
        .where(eq(users.id, inspection.driverId))
        .limit(1);

      const linkedDefectRows = await db
        .select({
          id: defects.id,
          title: defects.title,
          status: defects.status,
          severity: defects.severity,
          category: defects.category,
        })
        .from(defects)
        .where(eq(defects.inspectionId, input.inspectionId));

      return {
        ...buildDvirPayload({
          inspection,
          vehicle: vehicle ?? null,
          fleet: fleet ?? null,
          driver: driver ?? null,
        }),
        linkedDefects: linkedDefectRows,
      };
    }),

  getMyReports: protectedProcedure
    .input(
      z.object({
        fleetId: z.number().int().positive().optional(),
        limit: z.number().int().positive().max(25).default(10),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];

      const isManager = ctx.user.role === "owner" || ctx.user.role === "manager";
      if (isManager) {
        if (!input.fleetId) return [];
        const hasAccess = await verifyFleetAccess(input.fleetId, ctx.user.id, ctx.user.role);
        if (!hasAccess) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You do not have access to this fleet",
          });
        }
      }

      const rows = await db
        .select({
          id: inspections.id,
          fleetId: inspections.fleetId,
          vehicleId: inspections.vehicleId,
          driverId: inspections.driverId,
          inspectionSessionId: inspections.inspectionSessionId,
          submittedAt: inspections.submittedAt,
          updatedAt: inspections.updatedAt,
          overallVehicleResult: inspections.overallVehicleResult,
          complianceStatus: inspections.complianceStatus,
          integrityScore: inspections.integrityScore,
          status: inspections.status,
        })
        .from(inspections)
        .where(
          isManager && input.fleetId
            ? eq(inspections.fleetId, input.fleetId)
            : eq(inspections.driverId, ctx.user.id)
        )
        .orderBy(desc(inspections.submittedAt), desc(inspections.updatedAt))
        .limit(input.limit);

      const vehicleIds = Array.from(new Set(rows.map((row) => String(row.vehicleId))));
      const driverIds = Array.from(new Set(rows.map((row) => row.driverId)));
      const vehicleRows =
        vehicleIds.length > 0
          ? await db
              .select()
              .from(vehicles)
              .where(or(...vehicleIds.map((vehicleId) => sql`CAST(${vehicles.id} AS text) = ${vehicleId}`)))
          : [];
      const driverRows =
        driverIds.length > 0
          ? await db.select().from(users).where(inArray(users.id, driverIds))
          : [];
      const vehicleMap = new Map(vehicleRows.map((vehicle) => [String(vehicle.id), vehicle]));
      const driverMap = new Map(driverRows.map((driver) => [driver.id, driver]));

      return rows.map((row) => {
        const vehicle = vehicleMap.get(String(row.vehicleId));
        const driver = driverMap.get(row.driverId);
        return {
          ...row,
          vehicleLabel:
            vehicle?.unitNumber ||
            vehicle?.licensePlate ||
            vehicle?.vin ||
            String(row.vehicleId),
          driverName: driver?.name || driver?.email || "Driver",
          submittedAt: row.submittedAt ?? row.updatedAt,
        };
      });
    }),

  // Get inspections for a vehicle
  getByVehicle: protectedProcedure
    .input(z.object({ vehicleId: z.union([z.number(), z.string()]), limit: z.number().default(10) }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];

      const [vehicle] = await db
        .select()
        .from(vehicles)
        .where(sql`CAST(${vehicles.id} AS text) = ${String(input.vehicleId)}`)
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

      const result = await db
        .select()
        .from(inspections)
        .where(eq(inspections.vehicleId, String(input.vehicleId)))
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

  getManagerReports: protectedProcedure
    .input(z.object({ limit: z.number().int().positive().max(25).default(10) }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== "owner" && ctx.user.role !== "manager") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only managers can view received inspection reports",
        });
      }

      const db = await getDb();
      if (!db) return [];

      return db
        .select()
        .from(inAppAlerts)
        .where(
          and(
            eq(inAppAlerts.userId, ctx.user.id),
            eq(inAppAlerts.alertType, "inspection_report_submitted")
          )
        )
        .orderBy(desc(inAppAlerts.createdAt))
        .limit(input.limit);
    }),

  getReviewQueue: protectedProcedure
    .input(
      z.object({
        fleetId: z.number().int().positive(),
        includeReviewed: z.boolean().default(false),
        limit: z.number().int().positive().max(50).default(25),
      })
    )
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== "owner" && ctx.user.role !== "manager") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only managers can view inspection review work",
        });
      }

      const hasAccess = await verifyFleetAccess(input.fleetId, ctx.user.id, ctx.user.role);
      if (!hasAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this fleet",
        });
      }

      const db = await getDb();
      if (!db) return [];

      const conditions = [eq(inspectionReviewQueueItems.fleetId, input.fleetId)];
      if (!input.includeReviewed) {
        conditions.push(sql`${inspectionReviewQueueItems.status} <> ${"reviewed"}` as any);
      }

      return db
        .select({
          id: inspectionReviewQueueItems.id,
          inspectionId: inspectionReviewQueueItems.inspectionId,
          defectId: inspectionReviewQueueItems.defectId,
          vehicleId: inspectionReviewQueueItems.vehicleId,
          inspectionSessionId: inspectionReviewQueueItems.inspectionSessionId,
          parentQueueItemId: inspectionReviewQueueItems.parentQueueItemId,
          queueType: inspectionReviewQueueItems.queueType,
          status: inspectionReviewQueueItems.status,
          headlineStatus: inspectionReviewQueueItems.headlineStatus,
          priority: inspectionReviewQueueItems.priority,
          highestSeverity: inspectionReviewQueueItems.highestSeverity,
          managerDecisionRequired: inspectionReviewQueueItems.managerDecisionRequired,
          requiresDriverInstruction: inspectionReviewQueueItems.requiresDriverInstruction,
          latestManagerDecision: inspectionReviewQueueItems.latestManagerDecision,
          latestDriverInstruction: inspectionReviewQueueItems.latestDriverInstruction,
          reviewedAt: inspectionReviewQueueItems.reviewedAt,
          createdAt: inspectionReviewQueueItems.createdAt,
          reportOutcome: inspections.reportOutcome,
          submittedAt: inspections.submittedAt,
          overallVehicleResult: inspections.overallVehicleResult,
        })
        .from(inspectionReviewQueueItems)
        .leftJoin(inspections, eq(inspectionReviewQueueItems.inspectionId, inspections.id))
        .where(and(...conditions))
        .orderBy(desc(inspectionReviewQueueItems.createdAt))
        .limit(input.limit);
    }),

  applyManagerReviewAction: protectedProcedure
    .input(
      z.object({
        queueItemId: z.number().int().positive(),
        actionType: managerReviewActionTypeSchema,
        driverInstructionNote: z.string().trim().optional(),
        internalNote: z.string().trim().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "owner" && ctx.user.role !== "manager") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only managers can review inspection work",
        });
      }

      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      const [queueItem] = await db
        .select({
          id: inspectionReviewQueueItems.id,
          fleetId: inspectionReviewQueueItems.fleetId,
          inspectionId: inspectionReviewQueueItems.inspectionId,
          defectId: inspectionReviewQueueItems.defectId,
          vehicleId: inspectionReviewQueueItems.vehicleId,
          inspectionSessionId: inspectionReviewQueueItems.inspectionSessionId,
          queueType: inspectionReviewQueueItems.queueType,
          status: inspectionReviewQueueItems.status,
          highestSeverity: inspectionReviewQueueItems.highestSeverity,
          reviewStartedAt: inspectionReviewQueueItems.reviewStartedAt,
          reportOutcome: inspections.reportOutcome,
          linkedVehicleId: inspections.linkedVehicleId,
          combinedStage: inspections.combinedStage,
          complianceStatus: inspections.complianceStatus,
        })
        .from(inspectionReviewQueueItems)
        .leftJoin(inspections, eq(inspectionReviewQueueItems.inspectionId, inspections.id))
        .where(eq(inspectionReviewQueueItems.id, input.queueItemId))
        .limit(1);

      if (!queueItem) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Review queue item not found",
        });
      }

      const hasAccess = await verifyFleetAccess(queueItem.fleetId, ctx.user.id, ctx.user.role);
      if (!hasAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this fleet",
        });
      }

      const now = new Date();
      const decision = mapReviewActionToDecision(input.actionType);
      const driverInstructionNote = input.driverInstructionNote?.trim() || null;
      const internalNote = input.internalNote?.trim() || null;
      const vehicleId = queueItem.vehicleId;

      if (decision && !driverInstructionNote) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A driver-facing instruction is required for this decision",
        });
      }

      if (!queueItem.inspectionId || !vehicleId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This review item is missing its linked inspection or asset",
        });
      }

      await db.insert(inspectionReviewActions).values({
        queueItemId: queueItem.id,
        inspectionId: queueItem.inspectionId,
        defectId: queueItem.defectId,
        vehicleId,
        managerUserId: ctx.user.id,
        actionType: input.actionType,
        driverInstructionNote,
        internalNote,
        createdAt: now,
      });

      if (input.actionType === "escalated_to_major") {
        await db
          .update(inspectionReviewQueueItems)
          .set({
            queueType: "inspection_major_action",
            status: "new",
            headlineStatus: "urgent",
            priority: "high",
            highestSeverity:
              queueItem.highestSeverity === "unsafe" ? queueItem.highestSeverity : "major",
            managerDecisionRequired: true,
            requiresDriverInstruction: true,
            latestInternalNote: internalNote,
            reviewStartedAt: queueItem.reviewStartedAt ?? now,
            updatedAt: now,
          })
          .where(eq(inspectionReviewQueueItems.id, queueItem.id));

        await db
          .update(inspections)
          .set({
            reportOutcome: "major_action_required",
            highestDefectSeverity:
              queueItem.highestSeverity === "unsafe" ? queueItem.highestSeverity : "major",
            managerReviewRequired: true,
            updatedAt: now,
          })
          .where(eq(inspections.id, queueItem.inspectionId));

        if (queueItem.defectId) {
          await db
            .update(defects)
            .set({
              status: "repair_required",
              managerReviewStatus: "escalated",
              managerReviewStatusUpdatedAt: now,
              escalatedFromMinor: true,
              isBlockingOperationally: true,
              latestManagerActionByUserId: ctx.user.id,
              latestManagerActionAt: now,
              updatedAt: now,
            })
            .where(eq(defects.id, queueItem.defectId));
        } else {
          await db
            .update(defects)
            .set({
              status: "repair_required",
              managerReviewStatus: "escalated",
              managerReviewStatusUpdatedAt: now,
              escalatedFromMinor: true,
              isBlockingOperationally: true,
              latestManagerActionByUserId: ctx.user.id,
              latestManagerActionAt: now,
              updatedAt: now,
            })
            .where(eq(defects.inspectionId, queueItem.inspectionId));
        }

        await updateVehicleOperationalState({
          vehicleId,
          operationalState: "blocked_pending_manager_review",
          inspectionId: queueItem.inspectionId,
          defectId: queueItem.defectId ?? null,
          decisionByUserId: ctx.user.id,
          instruction:
            driverInstructionNote ??
            "Do not operate this asset until a manager completes the defect review.",
          complianceStatus: queueItem.complianceStatus ?? undefined,
        });
      } else {
        const queueStatusUpdate = {
          status: "reviewed",
          headlineStatus: "reviewed" as QueueHeadlineStatus,
          latestManagerDecision: decision,
          latestDriverInstruction: driverInstructionNote,
          latestInternalNote: internalNote,
          reviewStartedAt: queueItem.reviewStartedAt ?? now,
          decisionMadeAt: decision ? now : null,
          reviewedAt: now,
          reviewedByUserId: ctx.user.id,
          updatedAt: now,
        };

        await db
          .update(inspectionReviewQueueItems)
          .set(queueStatusUpdate)
          .where(eq(inspectionReviewQueueItems.id, queueItem.id));

        await db
          .update(inspectionReviewQueueItems)
          .set(queueStatusUpdate)
          .where(eq(inspectionReviewQueueItems.parentQueueItemId, queueItem.id));

        await db
          .update(inspections)
          .set({
            reportOutcome: "reviewed",
            latestManagerDecision: decision,
            latestManagerInstruction: driverInstructionNote,
            latestManagerReviewedByUserId: ctx.user.id,
            latestManagerReviewedAt: now,
            updatedAt: now,
          })
          .where(eq(inspections.id, queueItem.inspectionId));

        const defectReviewStatus = mapDecisionToDefectReviewStatus(decision);
        const defectUpdate = {
          ...(defectReviewStatus ? defectReviewStatus : {}),
          latestManagerDecision: decision,
          latestDriverInstruction: driverInstructionNote,
          latestManagerActionByUserId: ctx.user.id,
          latestManagerActionAt: now,
          managerReviewStatusUpdatedAt: now,
          updatedAt: now,
        };

        if (queueItem.defectId) {
          await db.update(defects).set(defectUpdate).where(eq(defects.id, queueItem.defectId));
        } else {
          await db
            .update(defects)
            .set(defectUpdate)
            .where(eq(defects.inspectionId, queueItem.inspectionId));
        }

        if (decision) {
          await updateVehicleOperationalState({
            vehicleId,
            operationalState: deriveOperationalStateForDecision(decision),
            inspectionId: queueItem.inspectionId,
            defectId: queueItem.defectId ?? null,
            decisionByUserId: ctx.user.id,
            instruction: driverInstructionNote,
            complianceStatus: queueItem.complianceStatus ?? undefined,
            ...(decision === "return_to_service"
              ? {
                  lastCleanInspectionId: queueItem.inspectionId,
                  lastCleanInspectionAt: now,
                }
              : {}),
          });
        }
      }

      await syncCombinedInspectionSession({
        fleetId: queueItem.fleetId,
        inspectionSessionId: queueItem.inspectionSessionId,
        combinedStage:
          queueItem.combinedStage === "truck" || queueItem.combinedStage === "trailer"
            ? queueItem.combinedStage
            : null,
        linkedVehicleId: queueItem.linkedVehicleId ?? null,
        vehicleId,
        inspectionId: queueItem.inspectionId,
        reportOutcome: input.actionType === "escalated_to_major" ? "major_action_required" : "reviewed",
        highestSeverity:
          input.actionType === "escalated_to_major"
            ? queueItem.highestSeverity === "unsafe"
              ? "unsafe"
              : "major"
            : "minor",
        provisionalGuidance: driverInstructionNote,
      });

      return {
        success: true,
        queueItemId: queueItem.id,
        actionType: input.actionType,
        decision,
      };
    }),

  getFleetDailyHealth: protectedProcedure
    .input(z.object({ fleetId: z.number() }))
    .query(async ({ input, ctx }) => {
      const hasAccess = await verifyFleetAccess(input.fleetId, ctx.user.id, ctx.user.role);
      if (!hasAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this fleet",
        });
      }

      const db = await getDb();
      if (!db) {
        return {
          today: {
            inspectedVehicles: 0,
            notInspectedVehicles: 0,
            completionRate: 0,
            missedInspections: 0,
          },
          vehicles: [],
          openDefects: [],
          integrityAlerts: [],
          averages: {
            fleetIntegrityScore: 100,
            byVehicle: [],
            byDriver: [],
          },
        };
      }

      const todayStart = startOfToday();
      const fleetVehicles = await db
        .select()
        .from(vehicles)
        .where(eq(vehicles.fleetId, input.fleetId));
      const fleetInspections = await db
        .select()
        .from(inspections)
        .where(eq(inspections.fleetId, input.fleetId))
        .orderBy(desc(inspections.submittedAt));
      const todayInspections = fleetInspections.filter(
        (inspection) => inspection.submittedAt && new Date(inspection.submittedAt) >= todayStart
      );
      const openDefectRows = (
        await db.select().from(defects).where(eq(defects.fleetId, input.fleetId))
      ).filter((defect) => defect.status !== "resolved" && defect.status !== "dismissed");
      const now = new Date();
      const activeAssignments = await db
        .select({
          vehicleId: vehicleAssignments.vehicleId,
          driverUserId: vehicleAssignments.driverUserId,
          updatedAt: vehicleAssignments.updatedAt,
        })
        .from(vehicleAssignments)
        .where(
          and(
            eq(vehicleAssignments.fleetId, input.fleetId),
            eq(vehicleAssignments.status, "active"),
            lte(vehicleAssignments.startsAt, now),
            or(isNull(vehicleAssignments.expiresAt), gte(vehicleAssignments.expiresAt, now))
          )
        )
        .orderBy(desc(vehicleAssignments.updatedAt));
      const flags = await db
        .select()
        .from(inspectionFlags)
        .where(eq(inspectionFlags.fleetId, input.fleetId))
        .orderBy(desc(inspectionFlags.createdAt));
      const triageRows = await db
        .select()
        .from(aiTriageRecords)
        .where(eq(aiTriageRecords.fleetId, input.fleetId))
        .orderBy(desc(aiTriageRecords.createdAt));

      const todayVehicleIds = new Set(todayInspections.map((inspection) => inspection.vehicleId));
      const latestInspectionByVehicle = new Map<string, (typeof fleetInspections)[number]>();
      for (const inspection of fleetInspections) {
        if (!latestInspectionByVehicle.has(inspection.vehicleId)) {
          latestInspectionByVehicle.set(inspection.vehicleId, inspection);
        }
      }
      const latestTriageByDefect = new Map<number, (typeof triageRows)[number]>();
      for (const triage of triageRows) {
        if (triage.defectId && !latestTriageByDefect.has(triage.defectId)) {
          latestTriageByDefect.set(triage.defectId, triage);
        }
      }
      const latestAssignmentByVehicle = new Map<string, (typeof activeAssignments)[number]>();
      for (const assignment of activeAssignments) {
        if (!latestAssignmentByVehicle.has(assignment.vehicleId)) {
          latestAssignmentByVehicle.set(assignment.vehicleId, assignment);
        }
      }
      const driverIds = Array.from(
        new Set(
          [
            ...fleetVehicles
              .map((vehicle) => vehicle.assignedDriverId)
              .filter((value): value is number => typeof value === "number"),
            ...Array.from(latestAssignmentByVehicle.values())
              .map((assignment) => assignment.driverUserId)
              .filter((value): value is number => typeof value === "number"),
          ]
        )
      );
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
      const driverMap = new Map(
        driverRows.map((driver) => [
          driver.id,
          driver.name?.trim() || driver.email?.trim() || `Driver ${driver.id}`,
        ])
      );

      const vehicleSummaries = fleetVehicles.map((vehicle) => {
        const latestInspection = latestInspectionByVehicle.get(vehicle.id);
        const latestInspectionResults = latestInspection?.results as any;
        const verifiedStatus = latestInspectionResults?.verifiedStatus ?? latestInspection?.status;
        const vehicleDefects = openDefectRows.filter((defect) => defect.vehicleId === vehicle.id);
        const criticalDefect = vehicleDefects.some((defect) => defect.severity === "critical");
        const latestTriage = vehicleDefects
          .map((defect) => (defect.id ? latestTriageByDefect.get(defect.id) : null))
          .find(Boolean);
        const isInspectedToday = todayVehicleIds.has(vehicle.id);
        const activeAssignment = latestAssignmentByVehicle.get(vehicle.id);
        const assignedDriverId = activeAssignment?.driverUserId ?? vehicle.assignedDriverId ?? null;

        return {
          vehicleId: vehicle.id,
          unit: vehicle.unitNumber || vehicle.licensePlate || `Vehicle ${vehicle.id}`,
          assignedDriverId,
          assignedDriverName:
            assignedDriverId != null ? driverMap.get(assignedDriverId) || `Driver ${assignedDriverId}` : null,
          status: !isInspectedToday
            ? "not_inspected"
            : criticalDefect || latestInspection?.overallVehicleResult === "not_safe_to_operate"
              ? "critical"
              : vehicleDefects.length > 0 || verifiedStatus === "needs_review" || verifiedStatus === "flagged"
                ? "attention"
                : "safe",
          openDefects: vehicleDefects.length,
          mostRecentInspectionAt: latestInspection?.submittedAt ?? null,
          latestAiRecommendation: latestTriage?.recommendedAction ?? null,
          locationProofCaptured: latestInspection?.locationStatus === "granted",
          photoProofSubmitted: Boolean(latestInspectionResults?.proofPhotos?.some((item: any) => item.photoUrl)),
          inspectionFlagged: verifiedStatus === "flagged" || verifiedStatus === "needs_review",
          integrityScore: latestInspection?.integrityScore ?? null,
        };
      });

      const scoreRows = fleetInspections.filter(
        (inspection) => typeof inspection.integrityScore === "number"
      );
      const average = (values: number[]) =>
        values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 100;

      return {
        today: {
          inspectedVehicles: todayVehicleIds.size,
          notInspectedVehicles: Math.max(0, fleetVehicles.length - todayVehicleIds.size),
          completionRate: fleetVehicles.length
            ? Math.round((todayVehicleIds.size / fleetVehicles.length) * 100)
            : 0,
          missedInspections: Math.max(0, fleetVehicles.length - todayVehicleIds.size),
        },
        vehicles: vehicleSummaries,
        openDefects: openDefectRows.map((defect) => {
          const triage = latestTriageByDefect.get(defect.id);
          return {
            ...defect,
            aiRecommendation: triage?.recommendedAction ?? defect.aiRecommendation ?? null,
            aiConfidenceScore: triage?.confidenceScore ?? defect.aiConfidenceScore ?? null,
            aiSummary: triage?.managerSummary ?? defect.aiSummary ?? null,
          };
        }),
        integrityAlerts: flags.slice(0, 25),
        averages: {
          fleetIntegrityScore: average(scoreRows.map((inspection) => inspection.integrityScore ?? 100)),
          byVehicle: fleetVehicles.map((vehicle) => ({
            vehicleId: vehicle.id,
            unit: vehicle.unitNumber || vehicle.licensePlate || `Vehicle ${vehicle.id}`,
            score: average(
              scoreRows
                .filter((inspection) => inspection.vehicleId === vehicle.id)
                .map((inspection) => inspection.integrityScore ?? 100)
            ),
          })),
          byDriver: Array.from(new Set(scoreRows.map((inspection) => inspection.driverId))).map((driverId) => ({
            driverId,
            score: average(
              scoreRows
                .filter((inspection) => inspection.driverId === driverId)
                .map((inspection) => inspection.integrityScore ?? 100)
            ),
          })),
        },
      };
    }),

  generateDailyInspectionReminders: protectedProcedure
    .input(z.object({ fleetId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const hasAccess = await verifyFleetAccess(input.fleetId, ctx.user.id, ctx.user.role);
      if (!hasAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this fleet",
        });
      }

      const db = await getDb();
      if (!db) {
        return { created: 0, skipped: 0, reminders: [] };
      }

      const todayStart = startOfToday();
      const now = new Date();
      const [fleetVehicles, fleetInspections, activeAssignments, existingAlerts] = await Promise.all([
        db.select().from(vehicles).where(eq(vehicles.fleetId, input.fleetId)),
        db
          .select()
          .from(inspections)
          .where(eq(inspections.fleetId, input.fleetId))
          .orderBy(desc(inspections.submittedAt)),
        db
          .select()
          .from(vehicleAssignments)
          .where(
            and(
              eq(vehicleAssignments.fleetId, input.fleetId),
              eq(vehicleAssignments.status, "active"),
              lte(vehicleAssignments.startsAt, now),
              or(isNull(vehicleAssignments.expiresAt), gte(vehicleAssignments.expiresAt, now))
            )
          )
          .orderBy(desc(vehicleAssignments.updatedAt)),
        db
          .select()
          .from(inAppAlerts)
          .where(
            and(
              eq(inAppAlerts.fleetId, input.fleetId),
              eq(inAppAlerts.alertType, "daily_inspection_missed"),
              gte(inAppAlerts.createdAt, todayStart)
            )
          ),
      ]);

      const todayInspections = fleetInspections.filter(
        (inspection) => inspection.submittedAt && new Date(inspection.submittedAt) >= todayStart
      );
      const todayVehicleIds = new Set(todayInspections.map((inspection) => inspection.vehicleId));
      const latestAssignmentByVehicle = new Map<string, (typeof activeAssignments)[number]>();
      for (const assignment of activeAssignments) {
        if (!latestAssignmentByVehicle.has(assignment.vehicleId)) {
          latestAssignmentByVehicle.set(assignment.vehicleId, assignment);
        }
      }
      const driverIds = Array.from(
        new Set(
          activeAssignments
            .map((assignment) => assignment.driverUserId)
            .filter((value): value is number => typeof value === "number")
        )
      );
      const driverRows =
        driverIds.length > 0
          ? await db
              .select({ id: users.id, name: users.name, email: users.email })
              .from(users)
              .where(inArray(users.id, driverIds))
          : [];
      const driverMap = new Map(
        driverRows.map((driver) => [
          driver.id,
          driver.name?.trim() || driver.email?.trim() || `Driver ${driver.id}`,
        ])
      );

      const latestInspectionByVehicle = new Map<string, (typeof fleetInspections)[number]>();
      for (const inspection of fleetInspections) {
        if (!latestInspectionByVehicle.has(inspection.vehicleId)) {
          latestInspectionByVehicle.set(inspection.vehicleId, inspection);
        }
      }

      const candidates: MissedInspectionReminderCandidate[] = fleetVehicles.map((vehicle) => {
        const assignment = latestAssignmentByVehicle.get(vehicle.id);
        const assignedDriverId = assignment?.driverUserId ?? vehicle.assignedDriverId ?? null;
        return {
          vehicleId: vehicle.id,
          unit: vehicle.unitNumber || vehicle.licensePlate || `Vehicle ${vehicle.id}`,
          assignedDriverId,
          assignedDriverName:
            assignedDriverId != null ? driverMap.get(assignedDriverId) || `Driver ${assignedDriverId}` : null,
          inspectedToday: todayVehicleIds.has(vehicle.id),
          mostRecentInspectionAt:
            latestInspectionByVehicle.get(vehicle.id)?.submittedAt ??
            latestInspectionByVehicle.get(vehicle.id)?.inspectionDate ??
            null,
        };
      });

      const reminderAlerts = buildMissedInspectionReminderAlerts({
        fleetId: input.fleetId,
        managerUserId: ctx.user.id,
        vehicles: candidates,
      });
      const existingKeys = new Set(
        existingAlerts.map((alert) => `${alert.userId ?? "fleet"}:${alert.vehicleId}`)
      );
      const newAlerts = reminderAlerts.filter(
        (alert) => !existingKeys.has(`${alert.userId ?? "fleet"}:${alert.vehicleId}`)
      );

      if (newAlerts.length > 0) {
        await db.insert(inAppAlerts).values(newAlerts);
      }

      return {
        created: newAlerts.length,
        skipped: reminderAlerts.length - newAlerts.length,
        reminders: reminderAlerts,
      };
    }),

  recordRepairOutcome: protectedProcedure
    .input(
      z.object({
        defectId: z.number().int().positive(),
        diagnosticCaseId: z.string().trim().min(8).max(128).optional(),
        confirmedFault: z.string().trim().min(1),
        repairPerformed: z.string().trim().min(1),
        partsReplaced: z.array(z.string().trim().min(1)).default([]),
        aiDiagnosisCorrect: z.enum(["yes", "partially", "no", "unknown"]).default("unknown"),
        downtimeStart: z.string().optional(),
        downtimeEnd: z.string().optional(),
        returnedToServiceAt: z.string().optional(),
        repairNotes: z.string().trim().optional(),
        resolveDefect: z.boolean().default(true),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "owner" && ctx.user.role !== "manager") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only managers can record repair outcomes",
        });
      }

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [defect] = await db
        .select()
        .from(defects)
        .where(eq(defects.id, input.defectId))
        .limit(1);

      if (!defect) throw new TRPCError({ code: "NOT_FOUND", message: "Defect not found" });

      const hasAccess = await verifyFleetAccess(defect.fleetId, ctx.user.id, ctx.user.role);
      if (!hasAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this defect",
        });
      }

      const [outcome] = await db
        .insert(repairOutcomes)
        .values({
          fleetId: defect.fleetId,
          vehicleId: defect.vehicleId,
          defectId: defect.id,
          diagnosticCaseId: input.diagnosticCaseId ?? null,
          recordedByUserId: ctx.user.id,
          confirmedFault: input.confirmedFault,
          repairPerformed: input.repairPerformed,
          partsReplaced: input.partsReplaced,
          aiDiagnosisCorrect: input.aiDiagnosisCorrect,
          confirmationState: "manager_confirmed",
          source: "inspection_repair_outcome",
          downtimeStart: input.downtimeStart ? new Date(input.downtimeStart) : null,
          downtimeEnd: input.downtimeEnd ? new Date(input.downtimeEnd) : null,
          returnedToServiceAt: input.returnedToServiceAt ? new Date(input.returnedToServiceAt) : null,
          repairNotes: input.repairNotes ?? null,
        })
        .returning();

      await db.insert(maintenanceLogs).values({
        fleetId: defect.fleetId,
        vehicleId: defect.vehicleId,
        defectId: defect.id,
        type: "repair",
        description: `${input.confirmedFault}: ${input.repairPerformed}`,
        completedAt: input.returnedToServiceAt ? new Date(input.returnedToServiceAt) : new Date(),
      });

      if (input.resolveDefect) {
        await db
          .update(defects)
          .set({
            status: "resolved",
            resolvedByUserId: ctx.user.id,
            resolvedAt: new Date(),
            updatedAt: new Date(),
          } as any)
          .where(eq(defects.id, defect.id));
      }

      return outcome;
    }),
});
