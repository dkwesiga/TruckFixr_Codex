// Reusable AI triage service (TruckFixr V1.0 Early Warning & Repair Decision
// Workflow). Wraps the existing TADIS / OpenRouter-backed diagnostic engine so
// the same triage logic can run from:
//   - the inspection submit flow (auto-triage on defect creation), and
//   - the manual "Run AI Triage" action a manager triggers on an issue.
//
// All AI access goes through analyzeDiagnosticWithAi -> the server-side
// aiOrchestrator. API keys are never exposed to the client. The model/provider
// are configured via environment variables (see aiOrchestrator.ts).

import { analyzeDiagnosticWithAi } from "./tadisCore";
import { getSimilarCasesForDiagnosis } from "./tadisLearningRetrieval";

export type TriageVehicleContext = {
  id: string | number;
  vin?: string | null;
  make?: string | null;
  model?: string | null;
  year?: number | null;
};

export type TriageResult = {
  most_likely_cause: string;
  severity: string;
  confidence_score: number;
  recommended_action: string;
  driver_message: string;
  manager_summary: string;
  clarifying_questions: string[];
  safety_warning: string;
  suggested_next_steps: string[];
  raw: unknown;
};

// Maps the diagnostic engine's risk level + confidence into the triage action
// vocabulary used by aiTriageRecords / defects.aiRecommendation.
export function mapTriageAction(riskLevel: string, confidenceScore: number) {
  const normalized = (riskLevel ?? "").toLowerCase();
  if (/critical|red|stop|tow|do_not|not safe/.test(normalized)) return "do_not_operate";
  if (/high|repair|attention/.test(normalized)) return "repair_before_next_dispatch";
  if (confidenceScore < 85) return "continue_but_monitor";
  return "book_repair";
}

const SAFETY_DISCLAIMER =
  "Decision-support only. TruckFixr AI triage assists manager judgement and does not replace a qualified mechanic's inspection.";

export type RunTriageInput = {
  vehicleId: number | string;
  vehicle: TriageVehicleContext;
  defectDescription: string;
  category?: string | null;
  severity: string;
  symptoms?: string[];
  faultCodes?: string[];
  driverNotes?: string | null;
};

/**
 * Run AI triage for a single defect/issue and return a normalized result ready
 * to persist into aiTriageRecords. Never throws: on AI failure it returns a
 * conservative, safety-first triage so the caller can still record an outcome.
 */
export async function runDefectTriage(input: RunTriageInput): Promise<TriageResult> {
  const isCritical = input.severity === "critical";
  const symptoms =
    input.symptoms && input.symptoms.length > 0
      ? input.symptoms
      : [input.defectDescription, input.category ?? ""].filter(Boolean);

  try {
    // Evidence-weighted TADIS learning records (§15) — promoted, de-identified
    // prior repair outcomes from any contributing tenant, ranked against this
    // vehicle/symptom/fault-code context. Never blocks triage: an empty
    // knowledge base or a lookup failure just yields no similar cases.
    const similarCases = await getSimilarCasesForDiagnosis({
      make: input.vehicle.make,
      model: input.vehicle.model,
      modelYear: input.vehicle.year,
      symptoms,
      faultCodes: input.faultCodes ?? [],
    });

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
      symptoms,
      faultCodes: input.faultCodes ?? [],
      driverNotes: input.driverNotes ?? input.defectDescription,
      similarCases,
    });

    const confidenceScore = Math.round(analysis.confidence_score ?? 0);
    const recommendedAction = isCritical
      ? "do_not_operate"
      : mapTriageAction(analysis.risk_level ?? "", confidenceScore);
    const clarifyingQuestions =
      confidenceScore < 85 && !isCritical && analysis.clarifying_question
        ? [analysis.clarifying_question]
        : [];

    return {
      most_likely_cause:
        analysis.top_most_likely_cause ||
        analysis.possible_causes[0]?.cause ||
        input.category ||
        input.defectDescription,
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
        `Reported issue: ${input.defectDescription}. TruckFixr triage recommends ${recommendedAction}.`,
      clarifying_questions: clarifyingQuestions,
      safety_warning:
        analysis.safety_note || analysis.risk_summary || SAFETY_DISCLAIMER,
      suggested_next_steps: analysis.recommended_tests ?? [],
      raw: analysis,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorType = errorMessage.includes("not_configured") ? "AI_PROVIDER_NOT_CONFIGURED"
                    : errorMessage.includes("timeout") ? "AI_PROVIDER_TIMEOUT"
                    : errorMessage.includes("rate_limit") ? "AI_PROVIDER_RATE_LIMIT"
                    : "AI_TRIAGE_FAILED";

    console.error(`[AiTriage] ${errorType}: ${errorMessage}`, {
      vehicleId: input.vehicleId,
      defectDescription: input.defectDescription,
      severity: input.severity,
    });

    return {
      most_likely_cause: input.defectDescription,
      severity: input.severity,
      confidence_score: 0,
      recommended_action: isCritical ? "do_not_operate" : "book_repair",
      driver_message: isCritical
        ? "Do not operate this vehicle until the defect is reviewed by a qualified technician."
        : "Defect submitted. Manager will review your report manually since automated AI diagnosis is temporarily unavailable.",
      manager_summary: `AI triage unavailable (${errorType}). Manual review required. Error: ${errorMessage.slice(0, 100)}`,
      clarifying_questions: isCritical
        ? []
        : ["Can the driver confirm when this issue started and whether it is getting worse?"],
      safety_warning: isCritical ? "Critical defect reported. Immediate review required." : SAFETY_DISCLAIMER,
      suggested_next_steps: ["Manager review required", "Check AI provider configuration if persistent"],
      raw: { error: errorMessage, errorType },
    };
  }
}
