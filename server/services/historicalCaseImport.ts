// AI-assisted historical Mr Diesel backfill (§16, Scenario D). Two-step by
// design so nothing AI-generated ever reaches the database unreviewed (§6):
// 1. extractHistoricalCaseDraft() — pure AI call, returns a PROPOSED draft.
//    Never writes to the database. A failure degrades to an empty draft the
//    human fills in manually, matching the rest of the codebase's AI
//    fallback convention (ocr.ts, guestCaseAiReport.ts).
// 2. importHistoricalCase() — persists whatever the human confirmed (which
//    may differ from the AI draft) as a case tagged recordOrigin:
//    "historical_import". Evidence-quality scoring (knowledgeQuality.ts)
//    already caps historical imports below live closed-loop cases, so the
//    record never receives outsized trust just because a form got filled in.
import { invokeWithOrchestration, extractJsonObject } from "./aiOrchestrator";
import { createManualCase } from "./maintenanceCases";
import { addDecision } from "./maintenanceDecisions";
import { ensureShopVehicle } from "./shopVehicleIntake";
import { isKnownCaseType, isKnownResolutionCategory, type CaseType, type ResolutionCategory } from "@shared/tadis/caseTypes";
import type { MaintenanceSeverity } from "@shared/maintenance/caseWorkflow";

export type HistoricalCaseDraft = {
  vin: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  complaint: string;
  symptoms: string[];
  faultCodes: string[];
  diagnosis: string | null;
  rootCause: string | null;
  repairPerformed: string | null;
  partsReplaced: string[];
  caseType: CaseType;
  resolutionCategory: ResolutionCategory;
  confidence: number;
};

const EMPTY_DRAFT: HistoricalCaseDraft = {
  vin: null,
  make: null,
  model: null,
  year: null,
  complaint: "",
  symptoms: [],
  faultCodes: [],
  diagnosis: null,
  rootCause: null,
  repairPerformed: null,
  partsReplaced: [],
  caseType: "other",
  resolutionCategory: "other",
  confidence: 0,
};

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim());
}

// Extracts a proposed draft from pasted historical text (work order,
// invoice, technician notes). Never touches the database.
export async function extractHistoricalCaseDraft(sourceText: string): Promise<HistoricalCaseDraft> {
  const trimmed = sourceText.trim();
  if (!trimmed) return EMPTY_DRAFT;

  try {
    const result = await invokeWithOrchestration({
      feature: "historical_case_extraction",
      preferredProvider: "openrouter",
      fallbackProviders: ["openai", "gemini"],
      timeoutMs: 15_000,
      maxTokens: 700,
      responseFormat: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You extract structured repair-shop case data from a pasted historical document (work order, invoice, or technician notes) for a heavy-duty truck repair shop. " +
            "Return strict JSON with exactly these keys: vin (string|null), make (string|null), model (string|null), year (number|null), " +
            "complaint (string), symptoms (string[]), faultCodes (string[]), diagnosis (string|null), rootCause (string|null), " +
            "repairPerformed (string|null), partsReplaced (string[]), " +
            'caseType (one of "diagnostic_troubleshooting","corrective_repair","preventive_maintenance","compliance_inspection","customer_inquiry","repeat_comeback","parts_only","administrative","other"), ' +
            'resolutionCategory (one of "likely_cause","recommended_test","recommended_repair","monitor","schedule_maintenance","pull_from_service","tow","continue_operating","replace_component","perform_regen","inspect_wiring","verify_fuel_pressure","further_diagnostics","other"), ' +
            "confidence (0-100 integer, your own confidence this extraction is accurate). " +
            "Never invent facts not present in the source text — use null/empty where the document doesn't say.",
        },
        { role: "user", content: `Extract case data from this document:\n\n${trimmed.slice(0, 8000)}` },
      ],
    });

    const rawContent = result.choices[0]?.message.content;
    const textContent =
      typeof rawContent === "string"
        ? rawContent
        : rawContent?.filter((part) => part.type === "text").map((part) => part.text).join("\n") ?? "";

    const parsed = JSON.parse(extractJsonObject(textContent)) as Record<string, unknown>;

    return {
      vin: typeof parsed.vin === "string" ? parsed.vin.trim().toUpperCase() : null,
      make: typeof parsed.make === "string" ? parsed.make : null,
      model: typeof parsed.model === "string" ? parsed.model : null,
      year: typeof parsed.year === "number" ? parsed.year : null,
      complaint: typeof parsed.complaint === "string" ? parsed.complaint : "",
      symptoms: toStringArray(parsed.symptoms),
      faultCodes: toStringArray(parsed.faultCodes),
      diagnosis: typeof parsed.diagnosis === "string" ? parsed.diagnosis : null,
      rootCause: typeof parsed.rootCause === "string" ? parsed.rootCause : null,
      repairPerformed: typeof parsed.repairPerformed === "string" ? parsed.repairPerformed : null,
      partsReplaced: toStringArray(parsed.partsReplaced),
      caseType: isKnownCaseType(String(parsed.caseType ?? "")) ? (parsed.caseType as CaseType) : "other",
      resolutionCategory: isKnownResolutionCategory(String(parsed.resolutionCategory ?? ""))
        ? (parsed.resolutionCategory as ResolutionCategory)
        : "other",
      confidence: typeof parsed.confidence === "number" ? Math.max(0, Math.min(100, parsed.confidence)) : 0,
    };
  } catch (error) {
    console.error("[historicalCaseImport] extraction failed; returning empty draft for manual entry", error);
    return EMPTY_DRAFT;
  }
}

// Persists a human-REVIEWED (possibly edited) draft as a case flagged
// recordOrigin: "historical_import". Never creates an Outcome — historical
// import only ever produces a Case + an initial Resolution; any repair
// outcome must go through the normal reportOutcome/verifyOutcome flow like
// any other case, so it can never appear pre-verified.
export async function importHistoricalCase(input: {
  fleetId: number;
  actorUserId: number;
  draft: HistoricalCaseDraft;
}) {
  const { vehicle } = await ensureShopVehicle({
    fleetId: input.fleetId,
    vin: input.draft.vin,
    make: input.draft.make,
    model: input.draft.model,
    year: input.draft.year,
    vinSource: "historical_import",
    createdByUserId: input.actorUserId,
  });

  const caseRow = await createManualCase({
    fleetId: input.fleetId,
    vehicleId: vehicle.id,
    origin: "manual",
    title: input.draft.complaint.slice(0, 120) || "Historical import",
    summary: input.draft.complaint || null,
    severity: "stable" as MaintenanceSeverity,
    createdByUserId: input.actorUserId,
    caseType: input.draft.caseType,
    recordOrigin: "historical_import",
    vehicleContextProvenance: {
      vin: "historical_import",
      make: "historical_import",
      model: "historical_import",
      year: "historical_import",
    },
  });

  if (!caseRow) throw new Error("Failed to create historical case.");

  const decision =
    input.draft.diagnosis || input.draft.rootCause || input.draft.repairPerformed
      ? await addDecision({
          fleetId: input.fleetId,
          caseId: caseRow.id,
          actorUserId: input.actorUserId,
          source: "manual",
          severity: "stable",
          proposedAction: "continue_monitor",
          resolutionCategory: input.draft.resolutionCategory,
          rationale: [input.draft.diagnosis, input.draft.rootCause].filter(Boolean).join(" — ") || undefined,
          likelyCauses: input.draft.symptoms,
          evidence: input.draft.faultCodes.length ? { faultCodes: input.draft.faultCodes } : undefined,
        })
      : null;

  return { case: caseRow, vehicle, decision };
}
