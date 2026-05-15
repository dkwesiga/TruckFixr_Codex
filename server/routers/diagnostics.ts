import { z } from "zod";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  activityLogs,
  defects,
  inspectionChecklistResponses,
  inspections,
  maintenanceLogs,
  repairOutcomes,
  tadisAlerts,
  users,
  vehicles,
} from "../../drizzle/schema";
import {
  ClarificationTurnSchema,
  DiagnosticVehicleSchema,
  SimilarCaseSchema,
} from "../services/tadisCore";
import { mergeComplianceStatus } from "../../shared/compliance";
import { sendEmail } from "../services/email";
import { extractPhotoEvidenceText } from "../services/ocr";
import {
  assertDiagnosticsWithinPlan,
  getSubscriptionState,
  recordDiagnosticUsage,
} from "../services/subscriptions";
import { recordPilotMilestone } from "../services/pilotAccess";
import { canDiagnoseVehicle, canManageVehicleAccess } from "../services/vehicleAccess";
import { insertAiQualityReviewLog } from "../services/aiQualityReviewLog";
import { insertDiagnosticAiRequestLog } from "../services/diagnosticAiRequestLogs";
import {
  normalizeFaultCodes,
  runDiagnosisWorkflow,
  summarizeMaintenanceRecord,
  toLegacyDiagnosisAliases,
  type DiagnosisOutput,
  type MinimalDiagnosisContext,
} from "../services/diagnosisWorkflow";
import { preprocessDiagnosticInput } from "../services/faultCodeReferences";

const recentPartKeywords = [
  "hose",
  "radiator",
  "thermostat",
  "fan clutch",
  "brake chamber",
  "parking brake valve",
  "brake pad",
  "rotor",
  "drum",
  "abs sensor",
  "tone ring",
  "air line",
  "tie rod",
  "drag link",
  "tire",
  "wheel",
  "hub",
  "bearing",
  "fuel filter",
  "injector",
  "battery cable",
  "battery",
  "alternator",
];

function extractRecentParts(description: string | null | undefined) {
  const normalized = description?.toLowerCase() ?? "";
  return recentPartKeywords.filter((part) => normalized.includes(part));
}

export function tokenizeDiagnosticText(text: string) {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2)
  );
}

export function jaccardSimilarity(a: Set<string>, b: Set<string>) {
  if (a.size === 0 || b.size === 0) return 0;

  let intersection = 0;
  for (const token of Array.from(a)) {
    if (b.has(token)) intersection += 1;
  }

  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

export function scoreHistoricalDiagnosticCase(input: {
  caseSignals: string[];
  caseFaultCodes: string[];
  currentSymptoms: string[];
  currentFaultCodes: string[];
}) {
  const symptomScore = jaccardSimilarity(
    tokenizeDiagnosticText(input.caseSignals.join(" ")),
    tokenizeDiagnosticText(input.currentSymptoms.join(" "))
  );

  const normalizedCaseCodes = new Set(normalizeFaultCodes(input.caseFaultCodes));
  const normalizedCurrentCodes = new Set(normalizeFaultCodes(input.currentFaultCodes));
  let codeMatches = 0;
  for (const code of Array.from(normalizedCaseCodes)) {
    if (normalizedCurrentCodes.has(code)) codeMatches += 1;
  }
  const codeUnion = normalizedCaseCodes.size + normalizedCurrentCodes.size - codeMatches;
  const codeScore = codeUnion > 0 ? codeMatches / codeUnion : 0;

  return Math.min(1, symptomScore * 0.7 + codeScore * 0.3);
}

function getVehicleLifecycleStatus(complianceStatus: "green" | "yellow" | "red") {
  return complianceStatus === "red" ? "maintenance" : "active";
}

function toDiagnosisPlanType(tier: string) {
  if (tier === "fleet") return "fleet" as const;
  if (tier === "pro") return "pro" as const;
  if (tier === "pilot" || tier === "pilot_access") return "pilot_access" as const;
  return "free" as const;
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
  analysis: DiagnosisOutput;
  vehicleContext: {
    id: string;
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
  const topCauses = input.analysis.likely_causes
    .slice(0, 3)
    .map((item) => `${item.cause} (${item.likelihood}, ${item.probability}%)`);

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
      `Safe-to-drive decision: ${input.analysis.safe_to_drive_decision}`,
      input.analysis.recommended_tests.length > 0
        ? `Recommended tests: ${input.analysis.recommended_tests.join("; ")}`
        : "",
      input.analysis.likely_parts.length > 0 ? `Likely parts: ${input.analysis.likely_parts.join("; ")}` : "",
      input.analysis.maintenance_recommendation
        ? `Maintenance recommendation: ${input.analysis.maintenance_recommendation}`
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
      `<p>Safe-to-drive decision: ${input.analysis.safe_to_drive_decision}</p>`,
      input.analysis.recommended_tests.length > 0
        ? `<p>Recommended tests: ${input.analysis.recommended_tests.join("; ")}</p>`
        : "",
      input.analysis.likely_parts.length > 0 ? `<p>Likely parts: ${input.analysis.likely_parts.join("; ")}</p>` : "",
      input.analysis.maintenance_recommendation
        ? `<p>Maintenance recommendation: ${input.analysis.maintenance_recommendation}</p>`
        : "",
      input.diagnosticDefectId ? `<p>Diagnostic action record: defect #${input.diagnosticDefectId}</p>` : "",
      "<p>Please review this case in TruckFixr for next action.</p>",
    ]
      .filter(Boolean)
      .join(""),
  };
}

export function inferHistoricalCauseId(text: string) {
  const normalized = text.toLowerCase();
  if (/def|scr|nox|aftertreatment|dpf|regen|emission|derate/.test(normalized)) return "aftertreatment_derate";
  if (/coolant|overheat|thermostat|radiator|fan|water pump/.test(normalized)) return "cooling_system_fault";
  if (/oil pressure|low oil|lubrication|bearing|engine knock/.test(normalized)) return "engine_lubrication_fault";
  if (/abs|wheel speed|tone ring/.test(normalized)) return "abs_sensor_fault";
  if (/brake chamber|air leak|low air|air pressure|compressor/.test(normalized)) return "air_brake_leak";
  if (/brake|grinding|rotor|pad|drum|shoe/.test(normalized)) return "brake_friction_wear";
  if (/steer|wander|drag link|tie rod|free play/.test(normalized)) return "steering_linkage_wear";
  if (/tire|wheel|vibration|shake|shimmy|wheel end|bearing/.test(normalized)) return "tire_or_wheel_issue";
  if (/fuel|misfire|rough idle|injector|fuel filter|rail pressure/.test(normalized)) return "fuel_delivery_issue";
  if (/battery|alternator|voltage|charging|no start|starter/.test(normalized)) return "charging_system_fault";
  if (/transmission|clutch|gear|shift/.test(normalized)) return "transmission_driveline_fault";
  if (/hydraulic|pto|pump|cylinder|dump body|hose leak/.test(normalized)) return "hydraulic_pto_fault";
  if (/light|lamp|marker|turn signal|brake light|wiring/.test(normalized)) return "lighting_electrical_fault";
  if (/reefer|refrigeration|temperature control|thermo king|carrier/.test(normalized)) return "reefer_unit_fault";
  if (/annual|safety certificate|inspection due|mto|compliance/.test(normalized)) return "compliance_inspection_due";
  return "unclassified";
}

const vehicleSnapshotSchema = DiagnosticVehicleSchema.extend({
  complianceStatus: z.enum(["green", "yellow", "red"]).optional(),
});

const vehicleIdInputSchema = z
  .union([z.string().trim().min(1), z.number().int()])
  .transform((value) => String(value));

async function resolveVehicleContext(
  vehicleId: string,
  snapshot?: z.infer<typeof vehicleSnapshotSchema>
) {
  const db = await getDb();

  if (db) {
    try {
      const [vehicle] = await db
        .select()
        .from(vehicles)
        .where(sql`CAST(${vehicles.id} AS text) = ${vehicleId}`)
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

  throw new TRPCError({
    code: "NOT_FOUND",
    message: "Diagnostics require a valid vehicle. Select an existing vehicle or add one before starting diagnosis.",
  });
}

async function loadDiagnosticSupportData(
  fleetId: number,
  vehicleId: string,
  currentSymptoms: string[] = [],
  currentFaultCodes: string[] = []
) {
  const db = await getDb();
  if (!db) {
    return {
      priorDiagnostics: [],
      priorDefects: [],
      recentInspections: [],
      recentRepairs: [],
      repairHistory: [],
      maintenanceHistory: [],
      recentPartsReplaced: [],
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

  const [defectRows, inspectionRows, repairRows, feedbackRows, repairOutcomeRows] = await Promise.all([
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
    safeQuery(
      "repair outcomes",
      db
        .select()
        .from(repairOutcomes)
        .where(and(eq(repairOutcomes.fleetId, fleetId), eq(repairOutcomes.vehicleId, vehicleId)))
        .orderBy(desc(repairOutcomes.createdAt))
        .limit(12),
      []
    ),
  ]);

  const priorDefects = defectRows
    .filter((row) => String(row.vehicleId) === vehicleId)
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

  const repairHistory = repairRows
    .filter((row) => row.type === "repair")
    .map((row) => ({
      summary: row.description ?? "Repair record",
      category: row.type ?? undefined,
      status: row.completedAt ? "completed" : "open",
      occurredAt: row.completedAt?.toISOString?.() ?? row.createdAt?.toISOString?.() ?? undefined,
      outcome: row.completedAt ? "repair completed" : "repair pending",
    }));

  const confirmedRepairOutcomes = repairOutcomeRows.map((row) => {
    const parts = Array.isArray(row.partsReplaced)
      ? row.partsReplaced.filter((value): value is string => typeof value === "string")
      : [];

    return {
      summary: [row.confirmedFault, row.repairPerformed].filter(Boolean).join(" - "),
      category: "repair_outcome",
      status: row.aiDiagnosisCorrect ?? "unknown",
      occurredAt:
        row.returnedToServiceAt?.toISOString?.() ??
        row.createdAt?.toISOString?.() ??
        undefined,
      outcome: row.repairPerformed,
      parts,
    };
  });

  const maintenanceHistory = repairRows
    .filter((row) => row.type !== "repair")
    .map((row) => ({
      summary: row.description ?? `${row.type} maintenance recorded`,
      category: row.type ?? undefined,
      status: row.completedAt ? "completed" : "open",
      occurredAt: row.completedAt?.toISOString?.() ?? row.createdAt?.toISOString?.() ?? undefined,
      outcome: row.completedAt ? "maintenance completed" : "maintenance pending",
    }));

  const recentPartsReplaced = repairRows.flatMap((row) => {
    const occurredAt = row.completedAt ?? row.createdAt ?? null;
    const daysSinceReplacement = occurredAt
      ? Math.max(0, Math.round((Date.now() - occurredAt.getTime()) / 86_400_000))
      : null;

    return extractRecentParts(row.description).map((part) => ({
      part,
      replacedAt: occurredAt?.toISOString?.() ?? null,
      days_since_replacement: daysSinceReplacement,
      replacement_effect_direction: "unknown" as const,
      replacement_decay_weight:
        daysSinceReplacement == null
          ? 0.45
          : Math.max(0.15, Math.min(1, 1 - daysSinceReplacement / 180)),
      relevance_score: 55,
    }));
  });

  const priorDiagnostics = [
    ...confirmedRepairOutcomes.map((row) => ({
      summary: row.summary,
      category: row.category,
      status: row.status,
      occurredAt: row.occurredAt,
      outcome: row.outcome,
    })),
    ...feedbackRows
    .filter((row) => String(row.entityType) === "vehicle" && String(row.entityId) === vehicleId && row.action === "diagnostic_feedback")
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
    }),
  ];

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
      similarity: scoreHistoricalDiagnosticCase({
        caseSignals: [row.title, row.description ?? ""].filter(Boolean),
        caseFaultCodes: [],
        currentSymptoms,
        currentFaultCodes,
      }),
    })
  );

  repairOutcomeRows.forEach((row, index) => {
    const parts = Array.isArray(row.partsReplaced)
      ? row.partsReplaced.filter((value): value is string => typeof value === "string")
      : [];
    const caseSignals = [row.confirmedFault, row.repairPerformed, row.repairNotes ?? "", ...parts].filter(Boolean);

    similarCases.push(
      SimilarCaseSchema.parse({
        id: `repair-outcome-${row.id}-${index}`,
        source: "historical",
        causeId: inferHistoricalCauseId(caseSignals.join(" ")),
        cause: row.confirmedFault,
        systems_affected: [],
        symptomSignals: caseSignals,
        faultCodes: [],
        summary: [row.confirmedFault, row.repairPerformed].filter(Boolean).join(" - "),
        resolution: row.repairPerformed,
        confirmedFix: row.repairPerformed,
        resolutionSuccess: row.aiDiagnosisCorrect !== "no",
        risk_level: "medium",
        similarity: scoreHistoricalDiagnosticCase({
          caseSignals,
          caseFaultCodes: [],
          currentSymptoms,
          currentFaultCodes,
        }),
      })
    );
  });

  feedbackRows
    .filter((row) => String(row.entityType) === "vehicle" && String(row.entityId) === vehicleId && row.action === "diagnostic_feedback")
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
          similarity: scoreHistoricalDiagnosticCase({
            caseSignals: [cause, confirmedFix, ...symptoms].filter(Boolean),
            caseFaultCodes: faultCodes,
            currentSymptoms,
            currentFaultCodes,
          }),
        })
      );
    });

  return {
    priorDiagnostics,
    priorDefects,
    recentInspections,
    recentRepairs,
    repairHistory: [...repairHistory, ...confirmedRepairOutcomes],
    maintenanceHistory,
    recentPartsReplaced,
    complianceHistory,
    similarCases: similarCases.sort((a, b) => b.similarity - a.similarity),
  };
}

function inspectionStatusForContext(row: {
  complianceStatus?: string | null;
  overallVehicleResult?: string | null;
  status?: string | null;
}) {
  const text = [row.complianceStatus, row.overallVehicleResult, row.status]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /red|defect|failed|fail|flagged|needs_review/.test(text) ? "failed" as const : "passed" as const;
}

async function buildMinimalDiagnosisContext(input: {
  fleetId: number;
  vehicleId: string;
  vehicleContext: Awaited<ReturnType<typeof resolveVehicleContext>>;
  symptoms: string[];
  faultCodes: string[];
}): Promise<MinimalDiagnosisContext> {
  const db = await getDb();
  const vehicle = input.vehicleContext;
  const baseContext: MinimalDiagnosisContext = {
    vehicle: {
      make: vehicle.make ?? "",
      model: vehicle.model ?? "",
      year: vehicle.year ? String(vehicle.year) : "",
      engine:
        "engine" in vehicle && typeof vehicle.engine === "string"
          ? vehicle.engine
          : "engineMake" in vehicle && typeof vehicle.engineMake === "string"
            ? vehicle.engineMake
            : "",
    },
    user_report: {
      symptoms: input.symptoms.join("; "),
      fault_codes: normalizeFaultCodes(input.faultCodes),
    },
    maintenance_history: [],
    last_daily_inspection: null,
    clarification_history: [],
    fault_code_reference: {
      match_status: "none",
      references: [],
    },
  };

  if (!db) {
    return baseContext;
  }

  const safeQuery = async <T,>(label: string, query: Promise<T>, fallback: T) => {
    try {
      return await query;
    } catch (error) {
      console.warn(`[Diagnostics] Unable to load compact ${label}; continuing:`, error);
      return fallback;
    }
  };

  const [maintenanceRows, inspectionRows, confirmedFeedbackRows, repairOutcomeRows] = await Promise.all([
    safeQuery(
      "maintenance history",
      db
        .select()
        .from(maintenanceLogs)
        .where(eq(maintenanceLogs.vehicleId, input.vehicleId))
        .orderBy(desc(maintenanceLogs.createdAt))
        .limit(3),
      []
    ),
    safeQuery(
      "daily inspection",
      db
        .select()
        .from(inspections)
        .where(eq(inspections.vehicleId, input.vehicleId))
        .orderBy(desc(inspections.submittedAt))
        .limit(1),
      []
    ),
    safeQuery(
      "confirmed feedback outcomes",
      db
        .select()
        .from(activityLogs)
        .where(eq(activityLogs.fleetId, input.fleetId))
        .orderBy(desc(activityLogs.createdAt))
        .limit(30),
      []
    ),
    safeQuery(
      "normalized repair outcomes",
      db
        .select()
        .from(repairOutcomes)
        .where(and(eq(repairOutcomes.fleetId, input.fleetId), eq(repairOutcomes.vehicleId, input.vehicleId)))
        .orderBy(desc(repairOutcomes.createdAt))
        .limit(3),
      []
    ),
  ]);

  const lastInspection = inspectionRows[0];
  const defectsForInspection = lastInspection
    ? await safeQuery(
        "inspection defects",
        db
          .select({
            defectDescription: inspectionChecklistResponses.defectDescription,
            checklistItemLabel: inspectionChecklistResponses.checklistItemLabel,
            result: inspectionChecklistResponses.result,
          })
          .from(inspectionChecklistResponses)
          .where(
            and(
              eq(inspectionChecklistResponses.inspectionId, lastInspection.id),
              ne(inspectionChecklistResponses.result, "pass")
            )
          )
          .limit(8),
        []
      )
    : [];

  const confirmedFeedbackReferences = confirmedFeedbackRows
    .filter((row) => {
      if (row.action !== "diagnostic_feedback") return false;
      if (String(row.entityType) !== "vehicle" || String(row.entityId) !== input.vehicleId) return false;
      const details = row.details && typeof row.details === "object" ? row.details as Record<string, unknown> : {};
      return details.confirmationState === "manager_confirmed" || details.confirmationState === "mechanic_confirmed";
    })
    .slice(0, 3)
    .map((row) => {
      const details = row.details && typeof row.details === "object" ? row.details as Record<string, unknown> : {};
      return {
        date: row.createdAt?.toISOString?.().slice(0, 10) ?? "",
        summary:
          typeof details.summary === "string"
            ? details.summary.slice(0, 180)
            : [details.cause, details.confirmedFix].filter(Boolean).join(" - ").slice(0, 180),
      };
    })
    .filter((row) => row.summary);

  const normalizedRepairReferences = repairOutcomeRows
    .map((row) => {
      const parts = Array.isArray(row.partsReplaced)
        ? row.partsReplaced.filter((value): value is string => typeof value === "string")
        : [];
      const partsSummary = parts.length > 0 ? ` Parts: ${parts.join(", ")}.` : "";
      const aiAccuracy =
        row.aiDiagnosisCorrect && row.aiDiagnosisCorrect !== "unknown"
          ? ` AI diagnosis: ${row.aiDiagnosisCorrect}.`
          : "";

      return {
        date:
          row.returnedToServiceAt?.toISOString?.().slice(0, 10) ??
          row.createdAt?.toISOString?.().slice(0, 10) ??
          "",
        summary: `${row.confirmedFault}: ${row.repairPerformed}.${partsSummary}${aiAccuracy}`.slice(0, 180),
      };
    })
    .filter((row) => row.summary);

  const confirmedOutcomeReferences = [
    ...normalizedRepairReferences,
    ...confirmedFeedbackReferences,
  ].slice(0, 3);

  return {
    ...baseContext,
    maintenance_history: maintenanceRows.map((row) =>
      summarizeMaintenanceRecord({
        date: row.completedAt ?? row.createdAt,
        summary: row.description || `${row.type} maintenance recorded`,
        odometer: "",
      })
    ),
    last_daily_inspection: lastInspection
      ? {
          date:
            lastInspection.submittedAt?.toISOString?.().slice(0, 10) ??
            lastInspection.inspectionDate?.toISOString?.().slice(0, 10) ??
            "",
          status: inspectionStatusForContext(lastInspection),
          defects: defectsForInspection
            .map((row) => row.defectDescription || row.checklistItemLabel)
            .filter((value): value is string => Boolean(value))
            .slice(0, 8),
        }
      : null,
    ...(confirmedOutcomeReferences.length > 0
      ? { confirmed_outcome_references: confirmedOutcomeReferences }
      : {}),
  };
}

function complianceStatusFromDiagnosis(analysis: DiagnosisOutput) {
  if (
    analysis.risk_level === "critical" ||
    analysis.safe_to_drive_decision === "tow_or_repair_immediately" ||
    analysis.compliance_impact === "critical"
  ) {
    return "red" as const;
  }
  if (
    analysis.risk_level === "high" ||
    analysis.risk_level === "medium" ||
    analysis.safe_to_drive_decision === "stop_and_inspect" ||
    analysis.safe_to_drive_decision === "drive_with_caution" ||
    analysis.compliance_impact === "warning"
  ) {
    return "yellow" as const;
  }
  return "green" as const;
}

function tadisUrgencyFromDiagnosis(analysis: DiagnosisOutput) {
  if (analysis.risk_level === "critical" || analysis.safe_to_drive_decision === "tow_or_repair_immediately") {
    return "Critical" as const;
  }
  if (analysis.risk_level === "high" || analysis.safe_to_drive_decision === "stop_and_inspect") {
    return "Attention" as const;
  }
  return "Monitor" as const;
}

function tadisActionFromDiagnosis(analysis: DiagnosisOutput) {
  if (
    analysis.safe_to_drive_decision === "tow_or_repair_immediately" ||
    analysis.safe_to_drive_decision === "stop_and_inspect"
  ) {
    return "Stop Now" as const;
  }
  if (analysis.safe_to_drive_decision === "drive_with_caution") {
    return "Inspect Soon" as const;
  }
  return "Keep Running" as const;
}

export const diagnosticsRouter = router({
  analyze: protectedProcedure
    .input(
      z.object({
        fleetId: z.number(),
        vehicleId: vehicleIdInputSchema,
        vehicleContext: vehicleSnapshotSchema.optional(),
        symptoms: z.array(z.string().trim().min(1)).min(1, "At least one symptom is required"),
        faultCodes: z.array(z.string().trim().min(1)).default([]),
        driverNotes: z.string().trim().optional(),
        operatingConditions: z.string().trim().optional(),
        photoUrls: z.array(z.string().trim().min(1)).default([]),
        clarificationHistory: z.array(ClarificationTurnSchema).max(5).default([]),
        diagnosisSessionId: z.string().trim().min(8).max(128).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!input.fleetId || input.fleetId <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Select or join a company fleet before starting diagnosis.",
        });
      }

      const normalizedInputFaultCodes = normalizeFaultCodes(input.faultCodes);
      const preliminaryPreprocessing = preprocessDiagnosticInput({
        symptoms: [
          ...input.symptoms,
          input.driverNotes ?? "",
          input.operatingConditions ?? "",
          ...normalizedInputFaultCodes,
        ].join(" "),
        faultCodes: normalizedInputFaultCodes,
      });
      let entitlement = await getSubscriptionState(ctx.user.id);

      if (input.clarificationHistory.length === 0) {
        try {
          const entitlementResult = await assertDiagnosticsWithinPlan({
            userId: ctx.user.id,
            fleetId: input.fleetId,
          });
          entitlement = entitlementResult.subscription;
        } catch (error) {
          if (preliminaryPreprocessing.safetySignals.length === 0) {
            throw error;
          }
          console.warn(
            "[Diagnostics] Plan limit reached, continuing with safety-critical guidance:",
            error
          );
        }
      }

      const hasAccess = await canDiagnoseVehicle({
        user: ctx.user,
        vehicleId: input.vehicleId,
        fleetId: input.fleetId,
      });
      if (!hasAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not currently have access to this vehicle. Request access from your fleet manager or owner.",
        });
      }

      const vehicleContext = await resolveVehicleContext(input.vehicleId, input.vehicleContext);
      const ocrResult = await extractPhotoEvidenceText({
        photoUrls: input.photoUrls,
      });

      if (ocrResult.warning) {
        console.warn("[Diagnostics] OCR fallback:", ocrResult.warning);
      }

      const userSymptoms = [
        ...input.symptoms,
        input.driverNotes?.trim(),
        input.operatingConditions?.trim()
          ? `Operating conditions: ${input.operatingConditions.trim()}`
          : "",
        ocrResult.textSnippets.length > 0
          ? `Extracted text from evidence: ${ocrResult.textSnippets.join(" | ")}`
          : "",
      ]
        .filter(Boolean)
        .map((value) => String(value).trim())
        .filter(Boolean);
      const minimalContext = await buildMinimalDiagnosisContext({
        fleetId: input.fleetId,
        vehicleId: input.vehicleId,
        vehicleContext,
        symptoms: userSymptoms,
        faultCodes: input.faultCodes,
      });
      const workflow = await runDiagnosisWorkflow({
        caseId: input.clarificationHistory.length > 0 ? input.diagnosisSessionId : undefined,
        vehicleId: input.vehicleId,
        context: minimalContext,
        clarificationHistory: input.clarificationHistory,
        planType: toDiagnosisPlanType(entitlement.effectiveTier),
        includeInternalReferences: false,
      });
      const analysis = {
        ...workflow.diagnosis,
        ...toLegacyDiagnosisAliases(workflow.diagnosis),
        diagnosis_complexity: workflow.classification,
      };

      const numericVehicleId = Number(input.vehicleId);

      await recordPilotMilestone({
        userId: ctx.user.id,
        fleetId: input.fleetId,
        eventType: "first_diagnostic_run",
        eventMetadata: {
          vehicleId: input.vehicleId,
          confidenceScore: analysis.confidence_score,
          safeToDriveDecision: analysis.safe_to_drive_decision,
        },
      });

      const db = await getDb();
      const totalPromptTokens = workflow.aiCallHistory.reduce(
        (total, call) => total + call.promptTokens,
        0
      );
      const totalCompletionTokens = workflow.aiCallHistory.reduce(
        (total, call) => total + call.completionTokens,
        0
      );
      const totalTokens = workflow.aiCallHistory.reduce(
        (total, call) => total + call.totalTokens,
        0
      );
      const estimatedCostUsd = workflow.aiCallHistory.reduce(
        (total, call) => total + (call.estimatedCostUsd ?? 0),
        0
      );

      await Promise.all(
        workflow.aiCallHistory.map((call) =>
          insertDiagnosticAiRequestLog({
            companyId: input.fleetId,
            assetId: input.vehicleId,
            diagnosticSessionId: workflow.diagnosis.case_id,
            callType: call.callType,
            provider: call.provider,
            model: call.model,
            estimatedInputCharacters: JSON.stringify(workflow.promptContext).length,
            estimatedInputTokens: call.promptTokens,
            messageCount: 2,
            maxTokens: 0,
            temperature: 0,
            responseFormatEnabled: true,
            simpleTadisMode: false,
            truncationApplied: false,
            status: call.status === "failed" ? "failed" : call.fallbackUsed ? "fallback" : "success",
            errorCode: call.status === "failed" ? "ai_call_failed" : null,
            errorMessage: call.errorMessage ?? null,
            fallbackUsed: call.fallbackUsed,
          })
        )
      );

      await insertAiQualityReviewLog({
        diagnosticCaseId: workflow.diagnosis.case_id,
        fleetId: input.fleetId,
        userId: ctx.user.id,
        vehicleId: input.vehicleId,
        planType: entitlement.effectiveTier,
        modelUsed: analysis.model_used || null,
        providerUsed:
          workflow.aiCallHistory.find((call) => call.status === "success")?.provider ?? null,
        fallbackModelUsed:
          workflow.aiCallHistory.find((call) => call.fallbackUsed && call.model)?.model ?? null,
        fallbackUsed: analysis.fallback_used,
        caseType: workflow.routing.case_type,
        escalationReason: workflow.routing.reason_for_escalation || null,
        classificationConfidence: Math.round(workflow.routing.confidence_score),
        finalDiagnosisConfidence: Math.round(analysis.confidence_score),
        referenceLookupUsed: workflow.preprocessing.referenceLookupRequired,
        referenceMatchStatus: workflow.referenceLookup.match_status,
        clarificationCount: input.clarificationHistory.length,
        totalAiCalls: workflow.aiCallHistory.length,
        estimatedPromptTokens: totalPromptTokens,
        estimatedCompletionTokens: totalCompletionTokens,
        estimatedTotalTokens: totalTokens,
        estimatedCostUsd,
        finalSafeToDriveDecision: analysis.safe_to_drive_decision,
        metadata: {
          routing: workflow.routing,
          preprocessing: workflow.preprocessing,
          providerErrors: workflow.providerErrors.slice(-3),
        },
      });

      if (db) {
        try {
          await db.insert(activityLogs).values({
            fleetId: input.fleetId,
            userId: ctx.user.id,
            action:
              analysis.status === "clarification_needed"
                ? "diagnostic_clarification"
                : "diagnostic_ai_result",
            entityType: "vehicle",
            entityId: Number.isFinite(numericVehicleId) ? numericVehicleId : null,
            details: {
              diagnosticSessionId: workflow.diagnosis.case_id,
              vehicleId: input.vehicleId,
              status: analysis.status,
              clarificationHistory: input.clarificationHistory,
              clarifyingQuestion: analysis.clarifying_question,
              confidenceScore: analysis.confidence_score,
              safeToDriveDecision: analysis.safe_to_drive_decision,
              likelyCauses: analysis.likely_causes,
              recommendedTests: analysis.recommended_tests,
              likelyParts: analysis.likely_parts,
              modelUsed: analysis.model_used,
              fallbackUsed: analysis.fallback_used,
              diagnosisComplexity: workflow.classification,
              aiErrorMetadata: workflow.providerErrors.slice(-3),
              compactContext: workflow.promptContext,
            },
          });
        } catch (error) {
          console.warn("[Diagnostics] Unable to persist compact diagnostic activity:", error);
        }
      }

      if (analysis.status === "clarification_needed") {
        return analysis;
      }

      await recordDiagnosticUsage({
        userId: ctx.user.id,
        fleetId: input.fleetId,
        vehicleId: input.vehicleId,
        provider:
          workflow.aiCallHistory.find((call) => call.status === "success")?.provider ?? null,
        model: analysis.model_used,
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
        totalTokens,
        estimatedCostUsd,
        metadata: {
          confidenceScore: analysis.confidence_score,
          nextAction: analysis.status,
          systemsAffected: analysis.systems_affected,
          safeToDriveDecision: analysis.safe_to_drive_decision,
          modelUsed: analysis.model_used,
          fallbackUsed: analysis.fallback_used,
          advancedAiReviewUsed: analysis.advanced_ai_review_used,
          routing: {
            caseType: workflow.routing.case_type,
            riskLevel: workflow.routing.risk_level,
            referenceMatchStatus: workflow.referenceLookup.match_status,
          },
        },
      });

      const complianceStatus = complianceStatusFromDiagnosis(analysis);
      let persistedDefectId: number | null = null;

      if (db) {
        try {
          const [defect] = await db
                .insert(defects)
                .values({
                  fleetId: input.fleetId,
                  vehicleId: input.vehicleId,
                  driverId: ctx.user.id,
                  title: analysis.likely_causes[0]?.cause || input.symptoms[0] || "Driver diagnostic intake",
                  description: JSON.stringify({
                    driverNotes: input.driverNotes ?? "",
                    symptoms: input.symptoms,
                    faultCodes: input.faultCodes,
                    output: analysis,
                    confirmationState: "unconfirmed",
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
              urgency: tadisUrgencyFromDiagnosis(analysis),
              recommendedAction: tadisActionFromDiagnosis(analysis),
              likelyCause: analysis.likely_causes[0]?.cause,
              reasoning: JSON.stringify(analysis),
            });
          }

          try {
            const [existingVehicle] = await db
              .select()
              .from(vehicles)
              .where(sql`CAST(${vehicles.id} AS text) = ${input.vehicleId}`)
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
                .where(sql`CAST(${vehicles.id} AS text) = ${input.vehicleId}`);
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
        vehicleContext: {
          ...vehicleContext,
          id: String(vehicleContext.id),
        },
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
            entityId: persistedDefectId ?? (Number.isFinite(numericVehicleId) ? numericVehicleId : null),
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
      const canManage = await canManageVehicleAccess({
        fleetId: input.fleetId,
        user: ctx.user,
      });
      if (!canManage) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this fleet",
        });
      }

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
              return typeof details?.vehicleId === "string"
                ? details.vehicleId
                : typeof details?.vehicleId === "number"
                  ? String(details.vehicleId)
                  : null;
            })
            .filter((value): value is string => typeof value === "string")
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
          typeof details.vehicleId === "string"
            ? details.vehicleId
            : typeof details.vehicleId === "number"
              ? String(details.vehicleId)
              : null;
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
            Array.isArray(output.likely_causes) &&
            output.likely_causes.length > 0 &&
            output.likely_causes[0] &&
            typeof output.likely_causes[0] === "object" &&
            typeof (output.likely_causes[0] as Record<string, unknown>).cause === "string"
              ? ((output.likely_causes[0] as Record<string, unknown>).cause as string)
              : Array.isArray(output.possible_causes) &&
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
            typeof output.maintenance_recommendation === "string"
              ? output.maintenance_recommendation
              : typeof output.recommended_fix === "string"
                ? output.recommended_fix
              : undefined,
        };
      });
    }),

  feedback: protectedProcedure
    .input(
      z.object({
        fleetId: z.number(),
        vehicleId: vehicleIdInputSchema,
        defectId: z.number().int().positive().optional(),
        cause: z.string().trim().min(1),
        confirmedFix: z.string().trim().min(1),
        successful: z.boolean(),
        symptoms: z.array(z.string().trim().min(1)).default([]),
        faultCodes: z.array(z.string().trim().min(1)).default([]),
        partsReplaced: z.array(z.string().trim().min(1)).default([]),
        aiDiagnosisCorrect: z.enum(["yes", "partially", "no", "unknown"]).default("unknown"),
        complianceImpact: z.enum(["none", "warning", "critical"]).default("none"),
        system: z.string().trim().optional(),
        confirmationState: z
          .enum([
            "unconfirmed",
            "user_reported_resolved",
            "manager_confirmed",
            "mechanic_confirmed",
          ])
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        return { success: false, saved: false, reason: "database_unavailable" as const };
      }

      const hasAccess = await canDiagnoseVehicle({
        user: ctx.user,
        vehicleId: input.vehicleId,
        fleetId: input.fleetId,
      });
      if (!hasAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to record feedback for this vehicle.",
        });
      }

      const confirmationState =
        input.confirmationState ??
        (ctx.user.role === "owner" || ctx.user.role === "manager"
          ? "manager_confirmed"
          : "user_reported_resolved");
      const normalizedVehicleId = String(input.vehicleId);
      const numericVehicleId = Number(normalizedVehicleId);
      let normalizedRepairOutcomeSaved = false;

      if (
        input.defectId &&
        (ctx.user.role === "owner" || ctx.user.role === "manager") &&
        (confirmationState === "manager_confirmed" || confirmationState === "mechanic_confirmed")
      ) {
        const [defect] = await db
          .select()
          .from(defects)
          .where(eq(defects.id, input.defectId))
          .limit(1);

        if (!defect || defect.fleetId !== input.fleetId || String(defect.vehicleId) !== normalizedVehicleId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "The selected defect does not belong to this vehicle and fleet.",
          });
        }

        try {
          await db.insert(repairOutcomes).values({
            fleetId: input.fleetId,
            vehicleId: normalizedVehicleId,
            defectId: input.defectId,
            recordedByUserId: ctx.user.id,
            confirmedFault: input.cause,
            repairPerformed: input.confirmedFix,
            partsReplaced: input.partsReplaced,
            aiDiagnosisCorrect: input.aiDiagnosisCorrect,
            returnedToServiceAt: input.successful ? new Date() : null,
            repairNotes: `Captured from diagnostic feedback (${confirmationState}).`,
          });
          normalizedRepairOutcomeSaved = true;
        } catch (error) {
          console.warn("[Diagnostics] Unable to persist normalized repair outcome from feedback:", error);
        }
      }

      await db.insert(activityLogs).values({
        fleetId: input.fleetId,
        userId: ctx.user.id,
        action: "diagnostic_feedback",
        entityType: "vehicle",
        entityId: Number.isFinite(numericVehicleId) ? numericVehicleId : null,
        details: {
          vehicleId: normalizedVehicleId,
          defectId: input.defectId ?? null,
          cause: input.cause,
          confirmedFix: input.confirmedFix,
          successful: input.successful,
          symptoms: input.symptoms,
          faultCodes: input.faultCodes,
          partsReplaced: input.partsReplaced,
          aiDiagnosisCorrect: input.aiDiagnosisCorrect,
          complianceImpact: input.complianceImpact,
          system: input.system,
          confirmationState,
          normalizedRepairOutcomeSaved,
          summary: `${input.cause} confirmed with fix: ${input.confirmedFix}`,
        },
      });

      return { success: true, saved: true, normalizedRepairOutcomeSaved };
    }),
});
