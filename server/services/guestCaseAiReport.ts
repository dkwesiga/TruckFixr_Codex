// AI-generated "likely causes" for the free guest Resolution report (PRD v1.1
// §4.6). Strictly additive: this NEVER decides safety/readiness — that stays
// fully governed by the deterministic assessGuestCase()/detectCriticalTrigger
// gate. It only adds hypothesis-level cause content on top, using the cheap
// OpenRouter path (analyzeDiagnosticWithAi → simple mode, e.g.
// deepseek/deepseek-v4-flash) rather than the paid-review's fuller pipeline.
// Any failure degrades to no causes shown (the existing suppressed state) —
// it must never block or alter the deterministic result.

import { analyzeDiagnosticWithAi } from "./tadisCore";
import { recordObservabilityEvent } from "./observability";
import type { GuestCaseInput } from "../../shared/maintenance/guestCaseFlow";

export interface GuestLikelyCause {
  label: string;
  confidenceBand: "low" | "medium" | "high";
  supportingEvidence: string[];
  // PRD §4.6: cause labels are restricted to hypothesis|probable|confirmed.
  // A free, no-media, unverified guest report can only ever produce a
  // hypothesis — "confirmed" requires the evidence standard in §10.3.
  status: "hypothesis";
}

function confidenceBand(probability: number): "low" | "medium" | "high" {
  if (probability >= 70) return "high";
  if (probability >= 40) return "medium";
  return "low";
}

export async function generateGuestLikelyCauses(params: {
  guestCaseId: number;
  input: GuestCaseInput;
  answers: Record<string, string>;
}): Promise<GuestLikelyCause[]> {
  try {
    const symptoms = [
      params.input.concernText,
      ...Object.entries(params.answers).map(([question, answer]) => `${question}: ${answer}`),
    ].filter((s) => s.trim().length > 0);

    const output = await analyzeDiagnosticWithAi({
      vehicleId: `guest_${params.guestCaseId}`,
      symptoms,
      faultCodes: params.input.faultCodes ?? [],
    });

    if (!output.ai_response_available) {
      recordObservabilityEvent({
        category: "ai_provider",
        event: "guest_case_ai_causes_unavailable",
        severity: "warning",
        message: "analyzeDiagnosticWithAi returned ai_response_available: false",
        context: { guestCaseId: params.guestCaseId },
      });
      return [];
    }

    return [...output.ranked_likely_causes]
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 3)
      .map((cause) => ({
        label: cause.cause_name,
        confidenceBand: confidenceBand(cause.probability),
        supportingEvidence: cause.evidence_summary.slice(0, 3),
        status: "hypothesis" as const,
      }));
  } catch (error) {
    console.error("[GuestCaseAiReport] AI likely-causes generation failed; showing none:", error);
    recordObservabilityEvent({
      category: "ai_provider",
      event: "guest_case_ai_causes_failed",
      severity: "warning",
      message: error instanceof Error ? error.message : String(error),
      context: { guestCaseId: params.guestCaseId },
    });
    return [];
  }
}
