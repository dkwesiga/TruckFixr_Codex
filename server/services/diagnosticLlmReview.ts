import { z } from "zod";
import { ENV } from "../_core/env";
import {
  getEnabledProviders,
  getFallbackProviders,
  invokeWithOrchestration,
  type AiProvider,
  type InvokeResult,
} from "./aiOrchestrator";
import { type DiagnosticRuntimeConfig } from "./diagnosticConfig";

const driverActionEnum = z.enum([
  "keep_running_monitor",
  "drive_to_shop",
  "stop_and_inspect_on_site",
  "stop_and_tow",
  "derate_and_drive_short_distance",
  "do_not_operate_until_repaired",
]);

const diagnosticLlmResponseSchema = z.object({
  next_action: z.enum(["finalize", "ask_question"]),
  clarifying_question: z.string().nullable(),
  question_rationale: z.string().nullable(),
  missing_evidence: z.array(z.string()).default([]),
  ambiguity_drivers: z.array(z.string()).default([]),
  top_ranked_causes: z
    .array(
      z.object({
        cause_id: z.string().nullable(),
        cause_name: z.string().min(1),
        is_new_cause: z.boolean(),
        probability: z.number().min(0).max(100),
        evidence_summary: z.array(z.string()).default([]),
        ranking_rationale: z.array(z.string()).default([]),
        symptom_support_score: z.number().min(0).max(100),
        fault_code_support_score: z.number().min(0).max(100),
        repair_history_support_score: z.number().min(0).max(100),
        maintenance_history_support_score: z.number().min(0).max(100),
        recent_parts_support_score: z.number().min(0).max(100),
        recurring_failure_support_score: z.number().min(0).max(100),
        cause_library_fit_score: z.number().min(0).max(100),
        novel_cause_support_score: z.number().min(0).max(100).nullable(),
      })
    )
    .min(1)
    .max(4),
  overall_confidence_score: z.number().min(0).max(100),
  confidence_rationale: z.array(z.string()).default([]),
  fault_code_interpretations: z.array(
    z.object({
      code: z.string(),
      interpretation: z.string(),
      role: z.enum(["primary", "secondary", "downstream", "incidental", "uncertain"]),
      signal_strength: z.number().min(0).max(100),
    })
  ),
  driver_action_recommendation: z.object({
    llm_driver_action: driverActionEnum,
    driver_action_reason: z.string(),
    risk_summary: z.string(),
    safety_note: z.string(),
    compliance_note: z.string(),
    monitoring_instructions: z.array(z.string()).default([]),
    distance_or_time_limit: z.string().nullable(),
  }),
  top_cause_repair_guidance: z.object({
    top_most_likely_cause: z.string(),
    confirm_before_replacement: z.boolean(),
    likely_replacement_parts: z.array(z.string()).default([]),
    inspection_related_parts: z.array(z.string()).default([]),
    adjacent_parts_to_check: z.array(z.string()).default([]),
    recommended_tests: z.array(z.string()).default([]),
    diagnostic_verification_labor_hours: z.object({
      min: z.number().min(0),
      max: z.number().min(0),
    }),
    repair_labor_hours: z.object({
      min: z.number().min(0),
      max: z.number().min(0),
    }),
    total_estimated_labor_hours: z.object({
      min: z.number().min(0),
      max: z.number().min(0),
    }),
    labor_time_confidence: z.number().min(0).max(100),
    labor_time_basis: z.array(z.string()).default([]),
  }),
});

export type DiagnosticLlmResponse = z.infer<typeof diagnosticLlmResponseSchema>;

const diagnosticIntakeInterpretationSchema = z.object({
  normalized_symptoms: z.array(z.string()).default([]),
  primary_symptoms: z.array(z.string()).default([]),
  secondary_symptoms: z.array(z.string()).default([]),
  interpreted_fault_codes: z.array(
    z.object({
      code: z.string(),
      interpretation: z.string(),
      role: z.enum(["primary", "secondary", "downstream", "incidental", "uncertain"]),
      signal_strength: z.number().min(0).max(100),
    })
  ).default([]),
  inferred_systems: z.array(z.string()).default([]),
  likely_failure_modes: z.array(z.string()).default([]),
  maintenance_history_signals: z.array(z.string()).default([]),
  repair_history_signals: z.array(z.string()).default([]),
  recent_parts_signals: z.array(z.string()).default([]),
  recurrence_signals: z.array(z.string()).default([]),
  evidence_keywords: z.array(z.string()).default([]),
  candidate_cause_hints: z.array(z.string()).default([]),
  risk_flags: z.array(z.string()).default([]),
  missing_evidence: z.array(z.string()).default([]),
  ambiguity_drivers: z.array(z.string()).default([]),
  interpretation_rationale: z.array(z.string()).default([]),
});

export type DiagnosticIntakeInterpretation = z.infer<typeof diagnosticIntakeInterpretationSchema>;

export type DiagnosticReviewRequest = {
  evidencePackage: Record<string, unknown>;
};

export type DiagnosticIntakeInterpretationRequest = {
  intakePackage: Record<string, unknown>;
};

export type DiagnosticReviewResult =
  | {
      status: "ok";
      fallbackUsed: boolean;
      fallbackReason: string | null;
      provider: string;
      model: string;
      parsed: DiagnosticLlmResponse;
      raw: InvokeResult;
    }
  | {
      status: "not_configured" | "timeout" | "invalid_schema" | "error";
      fallbackUsed: boolean;
      fallbackReason: string;
      provider: string | null;
      model: string | null;
      parsed: null;
      raw: InvokeResult | null;
    };

export type DiagnosticIntakeInterpretationResult =
  | {
      status: "ok";
      fallbackUsed: boolean;
      fallbackReason: string | null;
      provider: string;
      model: string;
      parsed: DiagnosticIntakeInterpretation;
      raw: InvokeResult;
    }
  | {
      status: "not_configured" | "timeout" | "invalid_schema" | "error";
      fallbackUsed: boolean;
      fallbackReason: string;
      provider: string | null;
      model: string | null;
      parsed: null;
      raw: InvokeResult | null;
    };

const simpleCategorySchema = z.object({
  primary_category: z.enum([
    "critical_engine_internal",
    "engine_performance",
    "oil_lubrication_system",
    "cooling_system",
    "aftertreatment_dpf_def_scr",
    "electrical_battery_alternator",
    "starting_charging",
    "air_brake_system",
    "fuel_system",
    "transmission_driveline",
    "hydraulics_pto",
    "suspension_steering",
    "trailer_lighting",
    "abs_wheel_end",
    "tires_wheels",
    "unknown_triage",
  ]),
  secondary_category: z.union([
    z.enum([
      "critical_engine_internal",
      "engine_performance",
      "oil_lubrication_system",
      "cooling_system",
      "aftertreatment_dpf_def_scr",
      "electrical_battery_alternator",
      "starting_charging",
      "air_brake_system",
      "fuel_system",
      "transmission_driveline",
      "hydraulics_pto",
      "suspension_steering",
      "trailer_lighting",
      "abs_wheel_end",
      "tires_wheels",
      "unknown_triage",
    ]),
    z.null(),
  ]),
  risk_level: z.enum(["low", "medium", "high", "critical"]),
  classification_confidence: z.number().min(0).max(100),
  clarifying_question: z.string().nullable(),
});

const simpleDiagnosisSchema = z.object({
  top_likely_cause: z.string().min(1),
  confidence_score: z.number().min(0).max(100),
  clarifying_question: z.string().nullable(),
  driver_action: driverActionEnum,
  safety_note: z.string().min(1),
  shop_next_steps: z.array(z.string()).min(1).max(5),
  should_escalate_to_mechanic: z.boolean(),
});

export type SimpleDiagnosticCategoryResult = z.infer<typeof simpleCategorySchema>;
export type SimpleDiagnosticDiagnosisResult = z.infer<typeof simpleDiagnosisSchema>;

type PromptCompactLevel = 0 | 1 | 2;

type DiagnosticProviderPlan = {
  preferredProvider: AiProvider;
  fallbackProviders: AiProvider[];
  primaryModels: string[];
  defaultModel: string | null;
  providerLabel: string;
};

const MODEL_RATE_LIMIT_COOLDOWN_MS = 120_000;
const modelSkipUntil = new Map<string, number>();

function shouldTemporarilySkipModel(model: string) {
  const skipUntil = modelSkipUntil.get(model);
  if (!skipUntil) return false;
  if (Date.now() >= skipUntil) {
    modelSkipUntil.delete(model);
    return false;
  }
  return true;
}

function rememberTemporaryModelFailure(model: string, error: Error) {
  if (isOpenRouterRateLimitError(error)) {
    modelSkipUntil.set(model, Date.now() + MODEL_RATE_LIMIT_COOLDOWN_MS);
  }
}

function extractBalancedJsonObjects(text: string) {
  const objects: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (isEscaped) {
      isEscaped = false;
      continue;
    }

    if (char === "\\") {
      isEscaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        objects.push(text.slice(start, index + 1));
        start = -1;
      }
    }
  }

  return objects;
}

function readMessageText(result: InvokeResult) {
  const content = result.choices[0]?.message.content;
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => ("text" in item ? item.text : ""))
      .join("\n");
  }

  return "";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toNullableString(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  return null;
}

function toStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? [trimmed] : [];
  }

  return [];
}

function toBooleanValue(value: unknown, fallback: boolean = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "y", "1"].includes(normalized)) return true;
    if (["false", "no", "n", "0"].includes(normalized)) return false;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  return fallback;
}

function toBoundedScore(value: unknown, fallback: number = 0) {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN;

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  const normalized = numeric > 0 && numeric <= 1 ? numeric * 100 : numeric;
  return Number(clamp(normalized, 0, 100).toFixed(1));
}

function normalizeNextAction(value: unknown) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "ask_question") return "ask_question";
  if (["finalize", "proceed", "continue", "answer_ready"].includes(normalized)) return "finalize";
  return "finalize";
}

function normalizeDriverAction(value: unknown): z.infer<typeof driverActionEnum> {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  const aliases: Record<string, z.infer<typeof driverActionEnum>> = {
    keep_running_monitor: "keep_running_monitor",
    keep_running: "keep_running_monitor",
    continue_monitoring: "keep_running_monitor",
    drive_to_shop: "drive_to_shop",
    continue_to_shop: "drive_to_shop",
    stop_and_inspect_on_site: "stop_and_inspect_on_site",
    inspect_on_site: "stop_and_inspect_on_site",
    stop_and_tow: "stop_and_tow",
    tow: "stop_and_tow",
    derate_and_drive_short_distance: "derate_and_drive_short_distance",
    derate_and_drive: "derate_and_drive_short_distance",
    do_not_operate_until_repaired: "do_not_operate_until_repaired",
    do_not_operate: "do_not_operate_until_repaired",
    do_not_drive: "do_not_operate_until_repaired",
    out_of_service: "do_not_operate_until_repaired",
    stop_operation: "do_not_operate_until_repaired",
  };

  return aliases[normalized] ?? "drive_to_shop";
}

function firstArray(...values: unknown[]) {
  return values.find((value) => Array.isArray(value)) ?? [];
}

function firstObject(...values: unknown[]) {
  return (
    values.find((value) => value && typeof value === "object" && !Array.isArray(value)) ?? {}
  ) as Record<string, unknown>;
}

function firstDefined(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null);
}

function toLaborRange(value: unknown) {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return {
      min: clamp(
        typeof record.min === "number" ? record.min : Number.parseFloat(String(record.min ?? 0)),
        0,
        24
      ),
      max: clamp(
        typeof record.max === "number" ? record.max : Number.parseFloat(String(record.max ?? 0)),
        0,
        24
      ),
    };
  }

  if (typeof value === "string") {
    const match = value.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
    if (match) {
      return {
        min: clamp(Number.parseFloat(match[1] ?? "0"), 0, 24),
        max: clamp(Number.parseFloat(match[2] ?? "0"), 0, 24),
      };
    }
  }

  return { min: 0, max: 0 };
}

function coerceCause(item: unknown) {
  const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
  const scores = firstObject(record.scores, record.support_scores, record.supportScores);
  return {
    cause_id: toNullableString(record.cause_id ?? record.causeId ?? record.id),
    cause_name:
      toNullableString(record.cause_name ?? record.causeName ?? record.name ?? record.cause ?? record.title) ??
      "Unspecified cause",
    is_new_cause: toBooleanValue(record.is_new_cause ?? record.isNewCause, false),
    probability: toBoundedScore(record.probability ?? record.probability_score ?? record.likelihood ?? record.score, 0),
    evidence_summary: toStringArray(record.evidence_summary ?? record.evidenceSummary ?? record.evidence ?? record.supporting_evidence),
    ranking_rationale: toStringArray(record.ranking_rationale ?? record.rankingRationale ?? record.rationale ?? record.reasoning),
    symptom_support_score: toBoundedScore(record.symptom_support_score ?? record.symptomSupportScore ?? scores.symptoms ?? scores.symptom, 0),
    fault_code_support_score: toBoundedScore(record.fault_code_support_score ?? record.faultCodeSupportScore ?? scores.fault_codes ?? scores.faultCodes ?? scores.codes, 0),
    repair_history_support_score: toBoundedScore(record.repair_history_support_score ?? record.repairHistorySupportScore ?? scores.repair_history ?? scores.repairHistory, 0),
    maintenance_history_support_score: toBoundedScore(record.maintenance_history_support_score ?? record.maintenanceHistorySupportScore ?? scores.maintenance_history ?? scores.maintenanceHistory, 0),
    recent_parts_support_score: toBoundedScore(record.recent_parts_support_score ?? record.recentPartsSupportScore ?? scores.recent_parts ?? scores.recentParts, 0),
    recurring_failure_support_score: toBoundedScore(record.recurring_failure_support_score ?? record.recurringFailureSupportScore ?? scores.recurring_failure ?? scores.recurringFailure, 0),
    cause_library_fit_score: toBoundedScore(record.cause_library_fit_score ?? record.causeLibraryFitScore ?? scores.cause_library ?? scores.library_fit, 0),
    novel_cause_support_score:
      record.novel_cause_support_score == null && record.novelCauseSupportScore == null
        ? null
        : toBoundedScore(record.novel_cause_support_score ?? record.novelCauseSupportScore, 0),
  };
}

function coerceFaultCodeInterpretation(item: unknown) {
  const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
  const roleRaw = typeof record.role === "string" ? record.role.trim().toLowerCase() : "uncertain";
  const role = ["primary", "secondary", "downstream", "incidental", "uncertain"].includes(roleRaw)
    ? roleRaw
    : "uncertain";

  return {
    code: toNullableString(record.code) ?? "UNKNOWN",
    interpretation: toNullableString(record.interpretation) ?? "Interpretation unavailable",
    role,
    signal_strength: toBoundedScore(record.signal_strength ?? record.signalStrength, 0),
  };
}

function coerceDiagnosticReviewPayload(payload: unknown) {
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const topRankedCauses = firstArray(
    Array.isArray(payload) ? payload : undefined,
    record.top_ranked_causes,
    record.topRankedCauses,
    record.ranked_causes,
    record.rankedCauses,
    record.ranked_likely_causes,
    record.rankedLikelyCauses,
    record.final_llm_ranking,
    record.finalLlmRanking,
    record.llm_final_ranking,
    record.llmFinalRanking,
    record.likely_causes,
    record.likelyCauses,
    record.possible_causes,
    record.possibleCauses,
    record.causes,
    record.diagnoses,
    record.rankings
  ) as unknown[];
  const faultCodeInterpretations = firstArray(
    record.fault_code_interpretations,
    record.faultCodeInterpretations,
    record.code_interpretations,
    record.codeInterpretations,
    record.fault_codes,
    record.faultCodes
  ) as unknown[];
  const driverActionRecommendation = firstObject(
    record.driver_action_recommendation,
    record.driverActionRecommendation,
    record.driver_action,
    record.driverAction,
    record.operational_recommendation,
    record.operationalRecommendation
  );
  const repairGuidance = firstObject(
    record.top_cause_repair_guidance,
    record.topCauseRepairGuidance,
    record.repair_guidance,
    record.repairGuidance,
    record.parts_labor_guidance,
    record.partsLaborGuidance
  );
  const fallbackCauseName =
    toNullableString(
      record.top_most_likely_cause ??
        record.topMostLikelyCause ??
        record.recommended_fix ??
        record.recommendedFix ??
        record.diagnosis ??
        record.diagnostic_conclusion
    ) ??
    toNullableString(
      repairGuidance.top_most_likely_cause ??
        repairGuidance.topMostLikelyCause ??
        repairGuidance.cause ??
        repairGuidance.cause_name
    );
  const normalizedTopCauses =
    topRankedCauses.length > 0
      ? topRankedCauses.slice(0, 4).map((item) => coerceCause(item))
      : fallbackCauseName
        ? [
            {
              cause_id: null,
              cause_name: fallbackCauseName,
              is_new_cause: true,
              probability: toBoundedScore(
                firstDefined(
                  record.overall_confidence_score,
                  record.overallConfidenceScore,
                  record.confidence_score,
                  record.confidenceScore,
                  record.confidence
                ),
                55
              ),
              evidence_summary: toStringArray(record.evidence_summary ?? record.evidenceSummary ?? record.evidence),
              ranking_rationale: toStringArray(
                record.ranking_rationale ?? record.rankingRationale ?? record.rationale ?? record.reasoning
              ),
              symptom_support_score: 0,
              fault_code_support_score: 0,
              repair_history_support_score: 0,
              maintenance_history_support_score: 0,
              recent_parts_support_score: 0,
              recurring_failure_support_score: 0,
              cause_library_fit_score: 0,
              novel_cause_support_score: null,
            },
          ]
        : [];

  return {
    next_action: normalizeNextAction(record.next_action ?? record.nextAction ?? record.action),
    clarifying_question: toNullableString(record.clarifying_question ?? record.clarifyingQuestion ?? record.question),
    question_rationale: toNullableString(record.question_rationale ?? record.questionRationale ?? record.question_reason),
    missing_evidence: toStringArray(record.missing_evidence ?? record.missingEvidence),
    ambiguity_drivers: toStringArray(record.ambiguity_drivers ?? record.ambiguityDrivers),
    top_ranked_causes: normalizedTopCauses,
    overall_confidence_score: toBoundedScore(
      firstDefined(record.overall_confidence_score, record.overallConfidenceScore, record.confidence_score, record.confidenceScore, record.confidence),
      0
    ),
    confidence_rationale: toStringArray(record.confidence_rationale ?? record.confidenceRationale ?? record.confidence_reasoning ?? record.confidenceReasoning),
    fault_code_interpretations: faultCodeInterpretations.map((item) => coerceFaultCodeInterpretation(item)),
    driver_action_recommendation: {
      llm_driver_action: normalizeDriverAction(
        driverActionRecommendation.llm_driver_action ??
          driverActionRecommendation.llmDriverAction ??
          driverActionRecommendation.action ??
          driverActionRecommendation.recommendation
      ),
      driver_action_reason:
        toNullableString(
          driverActionRecommendation.driver_action_reason ?? driverActionRecommendation.driverActionReason ?? driverActionRecommendation.reason
        ) ?? "Route the truck to service for further diagnosis.",
      risk_summary:
        toNullableString(driverActionRecommendation.risk_summary ?? driverActionRecommendation.riskSummary) ??
        "Operational risk remains under review.",
      safety_note:
        toNullableString(driverActionRecommendation.safety_note ?? driverActionRecommendation.safetyNote) ??
        "Follow normal fleet safety escalation if symptoms worsen.",
      compliance_note:
        toNullableString(driverActionRecommendation.compliance_note ?? driverActionRecommendation.complianceNote) ??
        "Compliance impact is not yet confirmed.",
      monitoring_instructions: toStringArray(
        driverActionRecommendation.monitoring_instructions ?? driverActionRecommendation.monitoringInstructions
      ),
      distance_or_time_limit: toNullableString(
        driverActionRecommendation.distance_or_time_limit ?? driverActionRecommendation.distanceOrTimeLimit
      ),
    },
    top_cause_repair_guidance: {
      top_most_likely_cause:
        toNullableString(
          repairGuidance.top_most_likely_cause ??
            repairGuidance.topMostLikelyCause ??
            repairGuidance.cause ??
            repairGuidance.cause_name
        ) ??
        fallbackCauseName ??
        (topRankedCauses[0] && typeof topRankedCauses[0] === "object"
          ? toNullableString(
              (topRankedCauses[0] as Record<string, unknown>).cause_name ??
                (topRankedCauses[0] as Record<string, unknown>).causeName
            ) ?? "Unspecified cause"
          : "Unspecified cause"),
      confirm_before_replacement: toBooleanValue(
        repairGuidance.confirm_before_replacement ?? repairGuidance.confirmBeforeReplacement,
        true
      ),
      likely_replacement_parts: toStringArray(
        repairGuidance.likely_replacement_parts ?? repairGuidance.likelyReplacementParts
      ),
      inspection_related_parts: toStringArray(
        repairGuidance.inspection_related_parts ?? repairGuidance.inspectionRelatedParts
      ),
      adjacent_parts_to_check: toStringArray(
        repairGuidance.adjacent_parts_to_check ?? repairGuidance.adjacentPartsToCheck
      ),
      recommended_tests: toStringArray(repairGuidance.recommended_tests ?? repairGuidance.recommendedTests),
      diagnostic_verification_labor_hours: toLaborRange(
        repairGuidance.diagnostic_verification_labor_hours ?? repairGuidance.diagnosticVerificationLaborHours
      ),
      repair_labor_hours: toLaborRange(repairGuidance.repair_labor_hours ?? repairGuidance.repairLaborHours),
      total_estimated_labor_hours: toLaborRange(
        repairGuidance.total_estimated_labor_hours ?? repairGuidance.totalEstimatedLaborHours
      ),
      labor_time_confidence: toBoundedScore(
        repairGuidance.labor_time_confidence ?? repairGuidance.laborTimeConfidence,
        0
      ),
      labor_time_basis: toStringArray(repairGuidance.labor_time_basis ?? repairGuidance.laborTimeBasis),
    },
  };
}

function validateDiagnosticReview(parsed: DiagnosticLlmResponse) {
  if (parsed.top_ranked_causes.length === 0) {
    throw new Error("Diagnostic review schema invalid: no ranked causes returned");
  }

  if (parsed.overall_confidence_score <= 0) {
    throw new Error("Diagnostic review schema invalid: confidence score missing");
  }

  if (parsed.next_action === "ask_question" && !(parsed.clarifying_question ?? "").trim()) {
    throw new Error("Diagnostic review schema invalid: clarifying question missing");
  }

  return parsed;
}

function normalizeJsonLikeText(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();
}

function stripMarkdownCodeFences(value: string) {
  return value.replace(/```(?:json)?\s*([\s\S]*?)```/gi, "$1").trim();
}

function removeTrailingCommas(value: string) {
  return value.replace(/,\s*([}\]])/g, "$1");
}

function extractJsonCodeBlocks(value: string) {
  return Array.from(value.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi))
    .map((match) => match[1]?.trim() ?? "")
    .filter(Boolean);
}

function dedupeStrings(values: string[]) {
  return values.filter((value, index) => value && values.indexOf(value) === index);
}

function unwrapParsedPayload(payload: unknown, depth = 0): unknown[] {
  if (depth > 3 || payload == null) {
    return [];
  }

  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (!trimmed) {
      return [];
    }

    try {
      return [payload, ...unwrapParsedPayload(JSON.parse(trimmed), depth + 1)];
    } catch {
      return [payload];
    }
  }

  if (Array.isArray(payload)) {
    return [payload, ...payload.flatMap((item) => unwrapParsedPayload(item, depth + 1))];
  }

  if (typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const nestedKeys = [
      "result",
      "response",
      "output",
      "data",
      "json",
      "diagnosis",
      "analysis",
      "diagnostic_review",
      "diagnosticReview",
      "diagnostic_result",
      "diagnosticResult",
      "final_result",
      "finalResult",
      "tadis_result",
      "tadisResult",
      "review",
    ];
    return [
      payload,
      ...nestedKeys.flatMap((key) => unwrapParsedPayload(record[key], depth + 1)),
    ];
  }

  return [payload];
}

function parseDiagnosticReview(rawText: string) {
  const normalized = normalizeJsonLikeText(rawText);
  const stripped = stripMarkdownCodeFences(normalized);
  const candidates = dedupeStrings([
    normalized,
    stripped,
    ...extractJsonCodeBlocks(normalized),
    ...extractBalancedJsonObjects(stripped),
    ...extractBalancedJsonObjects(normalized),
  ]);

  for (const candidate of candidates) {
    const parseAttempts = dedupeStrings([candidate, removeTrailingCommas(candidate)]);

    for (const attempt of parseAttempts) {
      try {
        const parsedRoot = JSON.parse(attempt);
        const payloadCandidates = unwrapParsedPayload(parsedRoot);

        for (const payloadCandidate of payloadCandidates) {
          try {
            return validateDiagnosticReview(
              diagnosticLlmResponseSchema.parse(coerceDiagnosticReviewPayload(payloadCandidate))
            );
          } catch {
            // Try the next payload candidate.
          }
        }
      } catch {
        // Try the next parse strategy.
      }
    }
  }

  for (const candidate of candidates) {
    try {
      return validateDiagnosticReview(
        diagnosticLlmResponseSchema.parse(coerceDiagnosticReviewPayload(JSON.parse(removeTrailingCommas(candidate))))
      );
    } catch {
      // Try the next extraction strategy.
    }
  }

  throw new Error("Unable to parse diagnostic review JSON");
}

function isDiagnosticReviewParseError(error: Error) {
  return /parse diagnostic review json|Unable to parse diagnostic review json|schema invalid/i.test(
    error.message
  );
}

function normalizeStatus(error: Error): Exclude<DiagnosticReviewResult["status"], "ok"> {
  if (/timed out/i.test(error.message)) {
    return "timeout";
  }

  if (/parse diagnostic review json|Unable to parse diagnostic review json/i.test(error.message)) {
    return "invalid_schema";
  }

  if (/schema/i.test(error.message)) {
    return "invalid_schema";
  }

  return "error";
}

function normalizeIntakeInterpretationStatus(error: Error): Exclude<DiagnosticIntakeInterpretationResult["status"], "ok"> {
  if (/timed out/i.test(error.message)) {
    return "timeout";
  }

  if (/parse|json|schema/i.test(error.message)) {
    return "invalid_schema";
  }

  return "error";
}

function normalizeSimpleCategory(value: unknown) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  const allowed = new Set([
    "critical_engine_internal",
    "engine_performance",
    "oil_lubrication_system",
    "cooling_system",
    "aftertreatment_dpf_def_scr",
    "electrical_battery_alternator",
    "starting_charging",
    "air_brake_system",
    "fuel_system",
    "transmission_driveline",
    "hydraulics_pto",
    "suspension_steering",
    "trailer_lighting",
    "abs_wheel_end",
    "tires_wheels",
    "unknown_triage",
  ]);

  return allowed.has(normalized) ? normalized : "unknown_triage";
}

function normalizeSimpleRiskLevel(value: unknown) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "critical") return "critical";
  if (normalized === "high") return "high";
  if (normalized === "medium") return "medium";
  return "low";
}

function coerceSimpleCategoryPayload(payload: unknown) {
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  return {
    primary_category: normalizeSimpleCategory(record.primary_category ?? record.primaryCategory),
    secondary_category:
      record.secondary_category === null || record.secondaryCategory === null
        ? null
        : normalizeSimpleCategory(record.secondary_category ?? record.secondaryCategory),
    risk_level: normalizeSimpleRiskLevel(record.risk_level ?? record.riskLevel),
    classification_confidence: toBoundedScore(
      record.classification_confidence ?? record.classificationConfidence,
      0
    ),
    clarifying_question:
      typeof record.clarifying_question === "string"
        ? record.clarifying_question.trim() || null
        : typeof record.clarifyingQuestion === "string"
          ? record.clarifyingQuestion.trim() || null
          : null,
  };
}

function parseSimpleCategoryResponse(rawText: string) {
  const normalized = normalizeJsonLikeText(rawText);
  const stripped = stripMarkdownCodeFences(normalized);
  const candidates = dedupeStrings([
    normalized,
    stripped,
    ...extractJsonCodeBlocks(normalized),
    ...extractBalancedJsonObjects(stripped),
    ...extractBalancedJsonObjects(normalized),
  ]);

  for (const candidate of candidates) {
    const parseAttempts = dedupeStrings([candidate, removeTrailingCommas(candidate)]);
    for (const attempt of parseAttempts) {
      try {
        const parsed = simpleCategorySchema.parse(coerceSimpleCategoryPayload(JSON.parse(attempt)));
        if (parsed.classification_confidence >= 85) {
          parsed.clarifying_question = null;
        } else if (!parsed.clarifying_question) {
          throw new Error("Simple classifier schema invalid: clarifying question missing");
        }
        return parsed;
      } catch {
        // Try the next parse strategy.
      }
    }
  }

  throw new Error("Unable to parse simple classifier JSON");
}

function parseSimpleDiagnosisResponse(rawText: string) {
  const normalized = normalizeJsonLikeText(rawText);
  const stripped = stripMarkdownCodeFences(normalized);
  const candidates = dedupeStrings([
    normalized,
    stripped,
    ...extractJsonCodeBlocks(normalized),
    ...extractBalancedJsonObjects(stripped),
    ...extractBalancedJsonObjects(normalized),
  ]);

  for (const candidate of candidates) {
    const parseAttempts = dedupeStrings([candidate, removeTrailingCommas(candidate)]);
    for (const attempt of parseAttempts) {
      try {
        const parsed = simpleDiagnosisSchema.parse(JSON.parse(attempt));
        if (parsed.confidence_score >= 85) {
          parsed.clarifying_question = null;
        } else if (!parsed.clarifying_question) {
          throw new Error("Simple diagnosis schema invalid: clarifying question missing");
        }
        return parsed;
      } catch {
        // Try the next parse strategy.
      }
    }
  }

  throw new Error("Unable to parse simple diagnosis JSON");
}

function coerceFaultCodeInterpretations(value: unknown) {
  const items = Array.isArray(value) ? value : [];
  return items.map((item) => {
    const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    return {
      code: toNullableString(record.code) ?? "",
      interpretation: toNullableString(record.interpretation) ?? "No interpretation returned",
      role: ["primary", "secondary", "downstream", "incidental", "uncertain"].includes(
        String(record.role ?? "").toLowerCase()
      )
        ? (String(record.role).toLowerCase() as "primary" | "secondary" | "downstream" | "incidental" | "uncertain")
        : "uncertain",
      signal_strength: toBoundedScore(record.signal_strength ?? record.signalStrength, 0),
    };
  });
}

function coerceIntakeInterpretationPayload(payload: unknown) {
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  return {
    normalized_symptoms: toStringArray(record.normalized_symptoms ?? record.normalizedSymptoms),
    primary_symptoms: toStringArray(record.primary_symptoms ?? record.primarySymptoms),
    secondary_symptoms: toStringArray(record.secondary_symptoms ?? record.secondarySymptoms),
    interpreted_fault_codes: coerceFaultCodeInterpretations(
      record.interpreted_fault_codes ?? record.interpretedFaultCodes ?? record.fault_code_interpretations
    ),
    inferred_systems: toStringArray(record.inferred_systems ?? record.inferredSystems ?? record.systems),
    likely_failure_modes: toStringArray(record.likely_failure_modes ?? record.likelyFailureModes),
    maintenance_history_signals: toStringArray(
      record.maintenance_history_signals ?? record.maintenanceHistorySignals
    ),
    repair_history_signals: toStringArray(record.repair_history_signals ?? record.repairHistorySignals),
    recent_parts_signals: toStringArray(record.recent_parts_signals ?? record.recentPartsSignals),
    recurrence_signals: toStringArray(record.recurrence_signals ?? record.recurrenceSignals),
    evidence_keywords: toStringArray(record.evidence_keywords ?? record.evidenceKeywords),
    candidate_cause_hints: toStringArray(record.candidate_cause_hints ?? record.candidateCauseHints),
    risk_flags: toStringArray(record.risk_flags ?? record.riskFlags),
    missing_evidence: toStringArray(record.missing_evidence ?? record.missingEvidence),
    ambiguity_drivers: toStringArray(record.ambiguity_drivers ?? record.ambiguityDrivers),
    interpretation_rationale: toStringArray(record.interpretation_rationale ?? record.interpretationRationale),
  };
}

function parseDiagnosticIntakeInterpretation(rawText: string) {
  const normalized = normalizeJsonLikeText(rawText);
  const stripped = stripMarkdownCodeFences(normalized);
  const candidates = dedupeStrings([
    normalized,
    stripped,
    ...extractJsonCodeBlocks(normalized),
    ...extractBalancedJsonObjects(stripped),
    ...extractBalancedJsonObjects(normalized),
  ]);

  for (const candidate of candidates) {
    const parseAttempts = dedupeStrings([candidate, removeTrailingCommas(candidate)]);

    for (const attempt of parseAttempts) {
      try {
        const parsedRoot = JSON.parse(attempt);
        const payloadCandidates = unwrapParsedPayload(parsedRoot);

        for (const payloadCandidate of payloadCandidates) {
          try {
            return diagnosticIntakeInterpretationSchema.parse(
              coerceIntakeInterpretationPayload(payloadCandidate)
            );
          } catch {
            // Try the next payload candidate.
          }
        }
      } catch {
        // Try the next parse strategy.
      }
    }
  }

  throw new Error("Unable to parse diagnostic intake interpretation JSON");
}

function buildIntakeInterpretationPrompt(request: DiagnosticIntakeInterpretationRequest) {
  const outputTemplate = {
    normalized_symptoms: ["plain-language normalized symptom"],
    primary_symptoms: ["highest-signal symptom"],
    secondary_symptoms: ["secondary symptom if any"],
    interpreted_fault_codes: [
      {
        code: "P0000",
        interpretation: "contextual meaning on this vehicle",
        role: "primary",
        signal_strength: 70,
      },
    ],
    inferred_systems: ["engine", "cooling"],
    likely_failure_modes: ["specific failure mode or mechanism"],
    maintenance_history_signals: ["maintenance clue that changes likelihood"],
    repair_history_signals: ["repair clue that changes likelihood"],
    recent_parts_signals: ["recent replacement clue if any"],
    recurrence_signals: ["repeat pattern if any"],
    evidence_keywords: ["specific searchable phrase that the rules engine should see"],
    candidate_cause_hints: ["specific cause hint for broad candidate assembly"],
    risk_flags: ["specific operational safety flag"],
    missing_evidence: ["specific missing fact if any"],
    ambiguity_drivers: ["specific uncertainty if any"],
    interpretation_rationale: ["brief rationale tied to the raw intake"],
  };

  return [
    "TASK",
    "Interpret this raw heavy-duty truck diagnostic intake before the deterministic rules engine scores it.",
    "Your job is NOT to produce the final diagnosis. Your job is to translate symptoms, fault codes, notes, operating conditions, vehicle context, repair history, maintenance history, recent parts, and recurrence clues into structured signals for the backend scorer.",
    "",
    "IMPORTANT",
    "Do not narrow the case only to the existing maintenance history. If current symptoms or notes suggest a different mechanism, surface that mechanism explicitly.",
    "If the driver reports a high-specificity phrase such as oil in coolant, coolant in oil, milky oil, low oil pressure, brake not holding, steering free play, wheel bearing noise, fire, smoke, severe overheating, or active derate, include it in risk_flags and evidence_keywords.",
    "Return concise concrete phrases the rules engine can match. Avoid vague phrases like issue present, system problem, or inspect vehicle.",
    "",
    "OUTPUT RULES",
    "Return one JSON object only.",
    "Use the exact snake_case keys shown in the JSON template below.",
    "Do not add markdown or prose outside JSON.",
    "",
    "REQUIRED JSON TEMPLATE",
    JSON.stringify(outputTemplate),
    "",
    "RAW INTAKE PACKAGE",
    JSON.stringify(request.intakePackage),
  ].join("\n");
}

function safePromptStringify(value: unknown) {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "{}";
  }
}

function buildSimpleCategoryPrompt(request: Record<string, unknown>) {
  const template = {
    primary_category: "unknown_triage",
    secondary_category: null,
    risk_level: "medium",
    classification_confidence: 0,
    clarifying_question: null,
  };

  return [
    "Classify only. JSON only.",
    "Cats: critical_engine_internal, engine_performance, oil_lubrication_system, cooling_system, aftertreatment_dpf_def_scr, electrical_battery_alternator, starting_charging, air_brake_system, fuel_system, transmission_driveline, hydraulics_pto, suspension_steering, trailer_lighting, abs_wheel_end, tires_wheels, unknown_triage.",
    "risk: low|medium|high|critical. If unsure primary_category=unknown_triage.",
    "Oil/coolant contamination => critical_engine_internal, critical.",
    `Shape: ${JSON.stringify(template)}`,
    safePromptStringify(request),
  ].join("\n");
}

function buildSimpleDiagnosisPrompt(request: Record<string, unknown>) {
  const template = {
    top_likely_cause: "",
    confidence_score: 0,
    clarifying_question: null,
    driver_action: "stop_and_inspect_on_site",
    safety_note: "",
    shop_next_steps: ["Verify the reported symptom."],
    should_escalate_to_mechanic: true,
  };

  return [
    "Diagnose this current issue only. JSON only.",
    "No history, cases, invoices, company data, or raw records.",
    "If confidence <85 ask one specific clarifying_question. If >=85 use null.",
    "driver_action enum: keep_running_monitor, drive_to_shop, stop_and_inspect_on_site, stop_and_tow, derate_and_drive_short_distance, do_not_operate_until_repaired.",
    `Shape: ${JSON.stringify(template)}`,
    safePromptStringify(request),
  ].join("\n");
}

function buildIntakeInterpretationMessages(request: DiagnosticIntakeInterpretationRequest) {
  return [
    {
      role: "system" as const,
      content: [
        "You are TADIS Intake Interpreter, a production heavy-duty truck diagnostic evidence-normalization layer.",
        "Interpret raw diagnostic intake before deterministic scoring.",
        "Return strict JSON only.",
        "Be concrete, safety-aware, and do not overfit to prior maintenance history when current symptoms point elsewhere.",
      ].join(" "),
    },
    {
      role: "user" as const,
      content: buildIntakeInterpretationPrompt(request),
    },
  ];
}

function compactBudgetInstruction(maxTokens: number) {
  if (maxTokens > 500) {
    return "";
  }

  return [
    "",
    "COMPACT OUTPUT MODE",
    `The max completion budget is ${maxTokens} tokens.`,
    "Return minified JSON only.",
    "Use 1 or 2 ranked causes.",
    "Use short evidence strings under 12 words.",
    "Use empty arrays when no concrete evidence is needed.",
  ].join("\n");
}

function trimText(value: unknown, maxLength: number) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    return null;
  }

  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1)}…`;
}

function trimStringArray(value: unknown, limit: number, maxLength: number) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => trimText(item, maxLength))
    .filter((item): item is string => Boolean(item))
    .slice(0, limit);
}

function trimObjectArray(value: unknown, limit: number, mapper: (item: Record<string, unknown>) => Record<string, unknown>) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .slice(0, limit)
    .map((item) => (item && typeof item === "object" ? mapper(item as Record<string, unknown>) : null))
    .filter((item): item is Record<string, unknown> => Boolean(item));
}

function isPromptLimitError(error: Error) {
  return /prompt tokens limit exceeded|prompt tokens/i.test(error.message);
}

function nextPromptCompactLevel(currentLevel: PromptCompactLevel): PromptCompactLevel | null {
  return currentLevel < 2 ? ((currentLevel + 1) as PromptCompactLevel) : null;
}

function compactIntakePackageForPrompt(
  intakePackage: Record<string, unknown>,
  compactLevel: PromptCompactLevel
) {
  if (compactLevel === 0) {
    return intakePackage;
  }

  const compactLevelOne = {
    vehicle_id: intakePackage.vehicle_id ?? null,
    fleet_id: intakePackage.fleet_id ?? null,
    symptoms: trimStringArray(intakePackage.symptoms, 4, 100),
    fault_codes: trimStringArray(intakePackage.fault_codes, 6, 40),
    driver_notes: trimText(intakePackage.driver_notes, 160),
    operating_conditions: trimText(intakePackage.operating_conditions, 120),
    vehicle_context:
      intakePackage.vehicle_context && typeof intakePackage.vehicle_context === "object"
        ? {
            make: (intakePackage.vehicle_context as Record<string, unknown>).make ?? null,
            model: (intakePackage.vehicle_context as Record<string, unknown>).model ?? null,
            year: (intakePackage.vehicle_context as Record<string, unknown>).year ?? null,
            engine: (intakePackage.vehicle_context as Record<string, unknown>).engine ?? null,
            emissions_configuration:
              (intakePackage.vehicle_context as Record<string, unknown>).emissions_configuration ?? null,
          }
        : null,
    repair_history: trimObjectArray(intakePackage.repair_history, 2, (item) => ({
      summary: trimText(item.summary, 100),
      status: item.status ?? null,
    })),
    maintenance_history: trimObjectArray(intakePackage.maintenance_history, 2, (item) => ({
      summary: trimText(item.summary, 100),
      status: item.status ?? null,
    })),
    prior_diagnostics: trimObjectArray(intakePackage.prior_diagnostics, 1, (item) => ({
      summary: trimText(item.summary, 100),
      status: item.status ?? null,
    })),
    recent_parts_replaced: trimObjectArray(intakePackage.recent_parts_replaced, 2, (item) => ({
      part: trimText(item.part, 60),
      days_since_replacement: item.days_since_replacement ?? null,
      replacement_effect_direction: item.replacement_effect_direction ?? null,
    })),
    clarification_history: trimObjectArray(intakePackage.clarification_history, 2, (item) => ({
      question: trimText(item.question, 100),
      answer: trimText(item.answer, 80),
    })),
  };

  if (compactLevel === 1) {
    return compactLevelOne;
  }

  return {
    vehicle_id: compactLevelOne.vehicle_id,
    symptoms: compactLevelOne.symptoms,
    fault_codes: compactLevelOne.fault_codes,
    driver_notes: compactLevelOne.driver_notes,
    vehicle_context: compactLevelOne.vehicle_context,
    repair_history: compactLevelOne.repair_history,
    recent_parts_replaced: compactLevelOne.recent_parts_replaced,
  };
}

function compactEvidencePackageForPrompt(
  evidencePackage: Record<string, unknown>,
  compactLevel: PromptCompactLevel
) {
  if (compactLevel === 0) {
    return evidencePackage;
  }

  const compactLevelOne = {
    vehicle_id: evidencePackage.vehicle_id ?? null,
    fleet_id: evidencePackage.fleet_id ?? null,
    confidence_threshold: evidencePackage.confidence_threshold ?? null,
    llm_intake_interpretation:
      evidencePackage.llm_intake_interpretation && typeof evidencePackage.llm_intake_interpretation === "object"
        ? {
            normalized_symptoms: trimStringArray(
              (evidencePackage.llm_intake_interpretation as Record<string, unknown>).normalized_symptoms,
              4,
              80
            ),
            inferred_systems: trimStringArray(
              (evidencePackage.llm_intake_interpretation as Record<string, unknown>).inferred_systems,
              4,
              40
            ),
            likely_failure_modes: trimStringArray(
              (evidencePackage.llm_intake_interpretation as Record<string, unknown>).likely_failure_modes,
              3,
              80
            ),
            risk_flags: trimStringArray(
              (evidencePackage.llm_intake_interpretation as Record<string, unknown>).risk_flags,
              3,
              80
            ),
          }
        : null,
    normalized_symptoms: trimStringArray(evidencePackage.normalized_symptoms, 6, 80),
    raw_symptoms: trimStringArray(evidencePackage.raw_symptoms, 3, 100),
    primary_symptoms: trimStringArray(evidencePackage.primary_symptoms, 4, 80),
    fault_codes: trimStringArray(evidencePackage.fault_codes, 6, 40),
    fault_code_interpretations: trimObjectArray(evidencePackage.fault_code_interpretations, 4, (item) => ({
      code: item.code ?? null,
      interpretation: trimText(item.interpretation, 90),
      role: item.role ?? null,
      signal_strength: item.signal_strength ?? null,
    })),
    vehicle_context:
      evidencePackage.vehicle_context && typeof evidencePackage.vehicle_context === "object"
        ? {
            make: (evidencePackage.vehicle_context as Record<string, unknown>).make ?? null,
            model: (evidencePackage.vehicle_context as Record<string, unknown>).model ?? null,
            year: (evidencePackage.vehicle_context as Record<string, unknown>).year ?? null,
            engine: (evidencePackage.vehicle_context as Record<string, unknown>).engine ?? null,
            emissions_configuration:
              (evidencePackage.vehicle_context as Record<string, unknown>).emissions_configuration ?? null,
          }
        : null,
    repair_history: trimObjectArray(evidencePackage.repair_history, 2, (item) => ({
      summary: trimText(item.summary, 100),
      status: item.status ?? null,
    })),
    maintenance_history: trimObjectArray(evidencePackage.maintenance_history, 2, (item) => ({
      summary: trimText(item.summary, 100),
      status: item.status ?? null,
    })),
    recent_parts_replaced: trimObjectArray(evidencePackage.recent_parts_replaced, 2, (item) => ({
      part: trimText(item.part, 60),
      days_since_replacement: item.days_since_replacement ?? null,
      replacement_effect_direction: item.replacement_effect_direction ?? null,
      relevance_score: item.relevance_score ?? null,
    })),
    recurring_failure_patterns:
      evidencePackage.recurring_failure_patterns &&
      typeof evidencePackage.recurring_failure_patterns === "object"
        ? {
            recurring_failure_score:
              (evidencePackage.recurring_failure_patterns as Record<string, unknown>).recurring_failure_score ?? null,
            recurring_pattern_type: trimStringArray(
              (evidencePackage.recurring_failure_patterns as Record<string, unknown>).recurring_pattern_type,
              3,
              60
            ),
            suspected_unresolved_root_cause: trimText(
              (evidencePackage.recurring_failure_patterns as Record<string, unknown>).suspected_unresolved_root_cause,
              100
            ),
          }
        : null,
    cause_library_candidates: trimObjectArray(evidencePackage.cause_library_candidates, 4, (item) => ({
      cause_name: trimText(item.cause_name, 60),
      source: item.source ?? null,
      reasons: trimStringArray(item.reasons, 1, 80),
    })),
    similar_confirmed_cases: trimObjectArray(evidencePackage.similar_confirmed_cases, 2, (item) => ({
      id: item.id ?? null,
      cause_name: trimText(item.cause_name, 60),
      similarity: item.similarity ?? null,
      matched_signals: trimStringArray(item.matched_signals, 3, 60),
      confirmed_fix: trimText(item.confirmed_fix, 80),
    })),
    rules_engine_baseline:
      evidencePackage.rules_engine_baseline && typeof evidencePackage.rules_engine_baseline === "object"
        ? {
            possible_causes: trimObjectArray(
              (evidencePackage.rules_engine_baseline as Record<string, unknown>).possible_causes,
              3,
              (item) => ({
                cause: trimText(item.cause, 60),
                probability: item.probability ?? null,
              })
            ),
            confidence_score:
              (evidencePackage.rules_engine_baseline as Record<string, unknown>).confidence_score ?? null,
            next_action: (evidencePackage.rules_engine_baseline as Record<string, unknown>).next_action ?? null,
            clarifying_question: trimText(
              (evidencePackage.rules_engine_baseline as Record<string, unknown>).clarifying_question,
              100
            ),
            risk_level: (evidencePackage.rules_engine_baseline as Record<string, unknown>).risk_level ?? null,
          }
        : null,
    baseline_ranked_candidates: trimObjectArray(evidencePackage.baseline_ranked_candidates, 3, (item) => ({
      cause_name: trimText(item.cause_name, 60),
      probability: item.probability ?? null,
      evidence_summary: trimStringArray(item.evidence_summary, 2, 80),
    })),
    confidence_signals: evidencePackage.confidence_signals ?? null,
    data_gaps: trimStringArray(evidencePackage.data_gaps, 4, 80),
    ambiguities: trimStringArray(evidencePackage.ambiguities, 3, 80),
    clarification_history: trimObjectArray(evidencePackage.clarification_history, 2, (item) => ({
      question: trimText(item.question, 100),
      answer: trimText(item.answer, 80),
    })),
    diagnostic_focus: trimStringArray(evidencePackage.diagnostic_focus, 4, 100),
  };

  if (compactLevel === 1) {
    return compactLevelOne;
  }

  return {
    vehicle_id: compactLevelOne.vehicle_id,
    confidence_threshold: compactLevelOne.confidence_threshold,
    normalized_symptoms: compactLevelOne.normalized_symptoms,
    raw_symptoms: compactLevelOne.raw_symptoms,
    fault_codes: compactLevelOne.fault_codes,
    vehicle_context: compactLevelOne.vehicle_context,
    recent_parts_replaced: compactLevelOne.recent_parts_replaced,
    recurring_failure_patterns: compactLevelOne.recurring_failure_patterns,
    similar_confirmed_cases: compactLevelOne.similar_confirmed_cases,
    rules_engine_baseline: compactLevelOne.rules_engine_baseline,
    confidence_signals: compactLevelOne.confidence_signals,
    diagnostic_focus: compactLevelOne.diagnostic_focus,
  };
}

function extractAffordableMaxTokens(error: Error) {
  const match = error.message.match(/can only afford\s+(\d+)/i);
  if (!match?.[1]) {
    return null;
  }

  const value = Number(match[1]);
  return Number.isFinite(value) ? Math.floor(value) : null;
}

function isTokenBudgetError(error: Error) {
  return /402 Payment Required|more credits|fewer max_tokens|can only afford/i.test(error.message);
}

function nextAffordableTokenBudget(error: Error, requestedMaxTokens: number) {
  const affordable = extractAffordableMaxTokens(error);
  if (!affordable) {
    return null;
  }

  const safeBudget = Math.max(24, Math.min(requestedMaxTokens - 1, affordable - 8));
  return safeBudget < requestedMaxTokens ? safeBudget : null;
}

function buildDiagnosticProviderPlan(
  config: DiagnosticRuntimeConfig
): DiagnosticProviderPlan | null {
  const enabledProviders = getEnabledProviders();
  const primaryProvider: AiProvider = ENV.openRouterApiKey
    ? "openrouter"
    : enabledProviders[0] ?? "openrouter";
  const fallbackProviders = getFallbackProviders(primaryProvider);
  const primaryModel = config.openRouterModel.trim() || "deepseek/deepseek-v4-flash";

  if (enabledProviders.length > 0) {
    return {
      preferredProvider: primaryProvider,
      fallbackProviders,
      primaryModels: [primaryModel],
      defaultModel: primaryModel,
      providerLabel: primaryProvider === "openrouter" ? "OpenRouter" : primaryProvider,
    };
  }

  return null;
}

async function invokeSimpleClassificationWithModel(
  request: DiagnosticIntakeInterpretationRequest,
  config: DiagnosticRuntimeConfig,
  providerPlan: DiagnosticProviderPlan,
  model: string,
  maxTokens = 80
) {
  return invokeWithOrchestration({
    preferredProvider: providerPlan.preferredProvider,
    fallbackProviders: providerPlan.fallbackProviders,
    feature: "tadis_classification",
    messages: [
      {
        role: "user" as const,
        content: buildSimpleCategoryPrompt(request.intakePackage),
      },
    ],
    maxTokens,
    timeoutMs: config.timeoutMs,
    model,
    temperature: 0.1,
  });
}

async function invokeSimpleDiagnosisWithModel(
  request: DiagnosticReviewRequest,
  config: DiagnosticRuntimeConfig,
  providerPlan: DiagnosticProviderPlan,
  model: string,
  maxTokens = 120
) {
  return invokeWithOrchestration({
    preferredProvider: providerPlan.preferredProvider,
    fallbackProviders: providerPlan.fallbackProviders,
    feature: "tadis_diagnosis",
    messages: [
      {
        role: "user" as const,
        content: buildSimpleDiagnosisPrompt(request.evidencePackage),
      },
    ],
    maxTokens,
    timeoutMs: config.timeoutMs,
    model,
    temperature: 0.1,
  });
}

async function invokeIntakeInterpretationWithModel(
  request: DiagnosticIntakeInterpretationRequest,
  config: DiagnosticRuntimeConfig,
  providerPlan: DiagnosticProviderPlan,
  model: string,
  maxTokens = config.intakeMaxTokens,
  compactLevel: PromptCompactLevel = 0,
  useResponseFormat = true
) {
  return invokeWithOrchestration({
    preferredProvider: providerPlan.preferredProvider,
    fallbackProviders: providerPlan.fallbackProviders,
    feature: "tadis_intake_interpretation",
    messages: buildIntakeInterpretationMessages({
      intakePackage: compactIntakePackageForPrompt(request.intakePackage, compactLevel),
    }),
    responseFormat: useResponseFormat ? { type: "json_object" } : undefined,
    maxTokens,
    timeoutMs: config.timeoutMs,
    model,
    temperature: 0.05,
  });
}

function buildEvidencePrompt(
  request: DiagnosticReviewRequest,
  maxTokens: number,
  compactLevel: PromptCompactLevel = 0
) {
  const outputTemplate = {
    next_action: "finalize",
    clarifying_question: null,
    question_rationale: null,
    missing_evidence: ["specific missing fact if any"],
    ambiguity_drivers: ["specific competing-cause uncertainty if any"],
    top_ranked_causes: [
      {
        cause_id: "library_cause_id_or_null",
        cause_name: "Concrete cause name",
        is_new_cause: false,
        probability: 65,
        evidence_summary: ["Concrete symptom/code/history fact supporting this cause"],
        ranking_rationale: ["Why this outranks a named competing cause"],
        symptom_support_score: 80,
        fault_code_support_score: 70,
        repair_history_support_score: 30,
        maintenance_history_support_score: 20,
        recent_parts_support_score: 10,
        recurring_failure_support_score: 15,
        cause_library_fit_score: 85,
        novel_cause_support_score: null,
      },
    ],
    overall_confidence_score: 75,
    confidence_rationale: ["Specific reason for the confidence score"],
    fault_code_interpretations: [
      {
        code: "P0000",
        interpretation: "What this code means in this context",
        role: "primary",
        signal_strength: 70,
      },
    ],
    driver_action_recommendation: {
      llm_driver_action: "drive_to_shop",
      driver_action_reason: "Operational reason tied to the top cause",
      risk_summary: "Specific operating risk",
      safety_note: "Specific safety note",
      compliance_note: "Specific compliance note",
      monitoring_instructions: ["Specific driver monitoring instruction"],
      distance_or_time_limit: null,
    },
    top_cause_repair_guidance: {
      top_most_likely_cause: "Same as the top ranked cause",
      confirm_before_replacement: true,
      likely_replacement_parts: ["specific likely part"],
      inspection_related_parts: ["specific inspection item"],
      adjacent_parts_to_check: ["specific adjacent part"],
      recommended_tests: ["specific verification test"],
      diagnostic_verification_labor_hours: { min: 1, max: 2 },
      repair_labor_hours: { min: 2, max: 4 },
      total_estimated_labor_hours: { min: 3, max: 6 },
      labor_time_confidence: 70,
      labor_time_basis: ["specific basis for labor estimate"],
    },
  };

  const promptInstructions =
    compactLevel === 0
      ? [
          "TASK",
          "You are the PRIMARY diagnostic reasoner for this TruckFixr/TADIS issue report.",
          "Review the full structured evidence package and return the final ranked causes, confidence, tests, parts, labor, and driver action guidance.",
          "The internal detailed engine output, maintenance history, repair history, recent parts, and similar cases are evidence inputs only. They are not authority.",
          "Challenge and override weak internal-engine conclusions whenever the raw symptoms, codes, notes, operating conditions, vehicle context, history, recent parts, or similar confirmed cases support a better diagnosis.",
          "",
          "QUALITY RULES",
          "1. Every evidence_summary item must cite a concrete case fact such as a named symptom, exact fault code, vehicle detail, repair-history clue, recently replaced part, or recurrence signal.",
          "2. Every ranking_rationale item must explain why this cause outranks a competing cause in this specific case.",
          "3. Do not use vague filler like 'symptoms align', 'issue persists', 'inspect the system', or 'monitor the vehicle' unless you also name the exact component or risk.",
          "4. Synthesize all evidence together. Do not score symptoms, fault codes, history, parts, and similar cases in isolation.",
          "5. Use repair history and maintenance history separately before combining them. A prior maintenance item can support, weaken, or distract from the current issue.",
          "6. Treat recently replaced parts as special evidence for bad install, defective part, incomplete root cause repair, or adjacent/upstream/downstream failure.",
          "7. Use similar_confirmed_cases as supporting evidence only, not automatic truth. Explain when current evidence differs from a similar case.",
          "8. If confidence is below the configured threshold, ask exactly one targeted clarifying question that separates the top competing causes and does not repeat prior questions.",
          "9. Keep the response deterministic and operationally useful for a fleet workflow.",
        ]
      : compactLevel === 1
        ? [
            "TASK",
            "Return the final heavy-duty truck diagnostic ranking from this structured evidence.",
            "The rules engine and history are evidence, not authority.",
            "Use concrete symptoms, codes, vehicle context, recent parts, recurrence, and similar cases.",
            "If confidence is below threshold, ask exactly one targeted clarifying question.",
            "Return one JSON object with the exact snake_case keys from the template.",
            "Keep evidence_summary and ranking_rationale short and case-specific.",
          ]
        : [
            "TASK",
            "Return final ranked causes from the compact evidence package.",
            "Use exact template keys. JSON only.",
            "If confidence is low, ask one specific clarifying question.",
          ];

  return [
    ...promptInstructions,
    "",
    "REQUIRED JSON TEMPLATE",
    JSON.stringify(outputTemplate),
    "",
    compactLevel > 0 ? "COMPACT EVIDENCE PACKAGE" : "EVIDENCE PACKAGE",
    JSON.stringify(compactEvidencePackageForPrompt(request.evidencePackage, compactLevel)),
    compactBudgetInstruction(maxTokens),
  ].join("\n");
}

function buildMessages(
  request: DiagnosticReviewRequest,
  maxTokens: number,
  compactLevel: PromptCompactLevel = 0,
  providerLabel = "LLM"
) {
  return [
    {
      role: "system" as const,
      content:
        compactLevel === 0
          ? [
              "You are TADIS, a production heavy-duty truck diagnostic review engine.",
              `${providerLabel} is the primary diagnostic reasoning layer for this run.`,
              "Use the evidence package, candidate universe, similar confirmed cases, and internal engine baseline as structured evidence to produce the final ranking authority.",
              "The internal detailed engine and maintenance history are not authoritative; reinterpret and override them when the full evidence supports another cause.",
              "You may introduce new likely causes if the evidence supports them.",
              "Be conservative, operationally safe, and deterministic.",
              "Return JSON only.",
              "Use exactly the requested snake_case JSON keys.",
              "If confidence is insufficient, ask exactly one targeted clarifying question.",
              "Do not ask multiple questions and do not add prose outside the JSON object.",
              "Probabilities must be between 0 and 100 and should roughly sum to 100 across the ranked causes.",
              "Be concrete and evidence-linked, not generic.",
              "Every evidence_summary item must quote or paraphrase a concrete case fact from the evidence package.",
              "Every ranking_rationale item must explain why this cause outranks a competing cause in this case.",
              "If the package contains an exact fault code, symptom phrase, replaced part, or history clue, use that detail directly instead of broad summaries.",
              "Use similar confirmed cases as supporting RAG evidence, but do not copy their resolution unless the current symptoms, codes, vehicle context, and history agree.",
              "Avoid vague phrases like inspect the system or monitor issue unless tied to a named component or operational risk.",
              "Prefer the strongest 2-4 causes rather than a broad diluted list.",
            ].join(" ")
          : compactLevel === 1
            ? [
                "You are TADIS, a deterministic heavy-duty truck diagnostic reviewer.",
                "Return JSON only with the exact snake_case keys.",
                "Use concrete evidence from symptoms, codes, history, recent parts, and similar cases.",
                "One clarifying question only if confidence is below threshold.",
              ].join(" ")
            : "You are TADIS. Return strict JSON only. Use compact evidence and exact keys.",
    },
    {
      role: "user" as const,
      content: buildEvidencePrompt(request, maxTokens, compactLevel),
    },
  ];
}

function buildReviewRepairPrompt(rawText: string) {
  const outputTemplate = {
    next_action: "finalize",
    clarifying_question: null,
    question_rationale: null,
    missing_evidence: [],
    ambiguity_drivers: [],
    top_ranked_causes: [
      {
        cause_id: null,
        cause_name: "Concrete cause name",
        is_new_cause: false,
        probability: 65,
        evidence_summary: ["Concrete evidence"],
        ranking_rationale: ["Why it ranks here"],
        symptom_support_score: 80,
        fault_code_support_score: 70,
        repair_history_support_score: 30,
        maintenance_history_support_score: 20,
        recent_parts_support_score: 10,
        recurring_failure_support_score: 15,
        cause_library_fit_score: 85,
        novel_cause_support_score: null,
      },
    ],
    overall_confidence_score: 75,
    confidence_rationale: ["Reason for confidence"],
    fault_code_interpretations: [
      {
        code: "P0000",
        interpretation: "Code meaning in this case",
        role: "primary",
        signal_strength: 70,
      },
    ],
    driver_action_recommendation: {
      llm_driver_action: "drive_to_shop",
      driver_action_reason: "Operational reason",
      risk_summary: "Operational risk summary",
      safety_note: "Safety note",
      compliance_note: "Compliance note",
      monitoring_instructions: [],
      distance_or_time_limit: null,
    },
    top_cause_repair_guidance: {
      top_most_likely_cause: "Concrete cause name",
      confirm_before_replacement: true,
      likely_replacement_parts: [],
      inspection_related_parts: [],
      adjacent_parts_to_check: [],
      recommended_tests: [],
      diagnostic_verification_labor_hours: { min: 0, max: 0 },
      repair_labor_hours: { min: 0, max: 0 },
      total_estimated_labor_hours: { min: 0, max: 0 },
      labor_time_confidence: 0,
      labor_time_basis: [],
    },
  };

  return [
    "Convert the following heavy-duty truck diagnostic review into the exact required JSON schema.",
    "Preserve the original meaning. Do not invent new evidence beyond what is already stated.",
    "If a field is missing, use conservative defaults.",
    "Return one JSON object only. No markdown.",
    "",
    "REQUIRED JSON TEMPLATE",
    JSON.stringify(outputTemplate),
    "",
    "RAW REVIEW TO REPAIR",
    rawText,
  ].join("\n");
}

async function repairDiagnosticReviewWithModel(
  rawText: string,
  config: DiagnosticRuntimeConfig,
  providerPlan: DiagnosticProviderPlan,
  model: string
) {
  return invokeWithOrchestration({
    preferredProvider: providerPlan.preferredProvider,
    fallbackProviders: providerPlan.fallbackProviders,
    feature: "tadis_review_repair",
    messages: [
      {
        role: "system" as const,
        content:
          "You repair malformed diagnostic review output into strict JSON. Return JSON only with exact snake_case keys.",
      },
      {
        role: "user" as const,
        content: buildReviewRepairPrompt(rawText),
      },
    ],
    responseFormat: { type: "json_object" },
    maxTokens: Math.min(420, config.reviewMaxTokens),
    timeoutMs: config.timeoutMs,
    model,
    temperature: 0,
  });
}

async function invokeReviewWithModel(
  request: DiagnosticReviewRequest,
  config: DiagnosticRuntimeConfig,
  providerPlan: DiagnosticProviderPlan,
  model: string,
  maxTokens = config.reviewMaxTokens,
  compactLevel: PromptCompactLevel = 0,
  useResponseFormat = true
) {
  return invokeWithOrchestration({
    preferredProvider: providerPlan.preferredProvider,
    fallbackProviders: providerPlan.fallbackProviders,
    feature: "tadis_review",
    messages: buildMessages(request, maxTokens, compactLevel, providerPlan.providerLabel),
    responseFormat: useResponseFormat ? { type: "json_object" } : undefined,
    maxTokens,
    timeoutMs: config.timeoutMs,
    model,
    temperature: 0.05,
  });
}

function isRetryableReviewError(error: Error) {
  return (
    isTokenBudgetError(error) ||
    isOpenRouterProviderError(error) ||
    /timed out|429|5\d\d|temporar|rate limit|overloaded|connection reset|socket hang up/i.test(
      error.message
    )
  );
}

function isOpenRouterProviderError(error: Error) {
  return /Provider returned error|400 Bad Request/i.test(error.message);
}

function isOpenRouterEndpointMissingError(error: Error) {
  return /404 Not Found|No endpoints found|free .*?period has ended/i.test(error.message);
}

function isOpenRouterRateLimitError(error: Error) {
  return /429 Too Many Requests|rate limit|overloaded/i.test(error.message);
}

function shouldSkipFurtherRetriesForModel(error: Error) {
  return isOpenRouterEndpointMissingError(error) || isOpenRouterRateLimitError(error);
}

export async function reviewDiagnosticWithLlm(
  request: DiagnosticReviewRequest,
  config: DiagnosticRuntimeConfig
): Promise<DiagnosticReviewResult> {
  const providerPlan = buildDiagnosticProviderPlan(config);

  if (!providerPlan) {
    return {
      status: "not_configured",
      fallbackUsed: true,
      fallbackReason: "No diagnostic LLM provider is configured. Set OPENROUTER_API_KEY.",
      provider: null,
      model: null,
      parsed: null,
      raw: null,
    };
  }

  const models = providerPlan.primaryModels;
  let lastError: Error | null = null;

  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    const attemptsForModel = index === 0 ? config.retryCount + 1 : 2;
    let maxTokens = config.reviewMaxTokens;
    let compactLevel: PromptCompactLevel = 0;
    let allowResponseFormat = true;

    for (let attemptIndex = 0; attemptIndex < attemptsForModel; attemptIndex += 1) {
      try {
        const raw = await invokeReviewWithModel(
          request,
          config,
          providerPlan,
          model,
          maxTokens,
          compactLevel,
          allowResponseFormat
        );
        const rawText = readMessageText(raw);
        let parsed: DiagnosticLlmResponse;

        try {
          parsed = parseDiagnosticReview(rawText);
        } catch (parseError) {
          const normalizedParseError =
            parseError instanceof Error ? parseError : new Error(String(parseError));

          if (!rawText.trim() || !isDiagnosticReviewParseError(normalizedParseError)) {
            throw normalizedParseError;
          }

          const repairedRaw = await repairDiagnosticReviewWithModel(
            rawText,
            config,
            providerPlan,
            model
          );
          parsed = parseDiagnosticReview(readMessageText(repairedRaw));

          return {
            status: "ok",
            fallbackUsed: true,
            fallbackReason:
              index > 0
                ? `Primary model failed; fallback model ${model} succeeded after JSON repair`
                : `Primary model ${model} succeeded after JSON repair`,
            provider: repairedRaw.orchestration?.provider ?? providerPlan.preferredProvider,
            model: repairedRaw.orchestration?.model ?? model,
            parsed,
            raw: repairedRaw,
          };
        }

        const providerFallbackUsed =
          (raw.orchestration?.provider != null &&
            raw.orchestration.provider !== providerPlan.preferredProvider) ||
          (raw.orchestration?.attempts?.length ?? 0) > 1;

        return {
          status: "ok",
          fallbackUsed: index > 0 || attemptIndex > 0 || providerFallbackUsed,
          fallbackReason:
            index > 0
              ? `Primary model failed; fallback model ${model} succeeded`
              : attemptIndex > 0
                ? `Primary model ${model} succeeded after retry ${attemptIndex + 1}`
                : providerFallbackUsed
                  ? `${raw.orchestration?.provider ?? providerPlan.providerLabel} succeeded after provider fallback`
                : null,
          provider: raw.orchestration?.provider ?? providerPlan.preferredProvider,
          model: raw.orchestration?.model ?? model,
          parsed,
          raw,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const nextCompactLevel: PromptCompactLevel | null = isPromptLimitError(lastError)
          || isOpenRouterProviderError(lastError)
          ? nextPromptCompactLevel(compactLevel)
          : null;

        if (nextCompactLevel != null) {
          compactLevel = nextCompactLevel;
          continue;
        }
        const reducedMaxTokens = nextAffordableTokenBudget(lastError, maxTokens);

        if (reducedMaxTokens) {
          maxTokens = reducedMaxTokens;
          continue;
        }

        if (isOpenRouterProviderError(lastError) && allowResponseFormat) {
          allowResponseFormat = false;
          continue;
        }

        if (shouldSkipFurtherRetriesForModel(lastError)) {
          break;
        }

        if (attemptIndex < attemptsForModel - 1 && isRetryableReviewError(lastError)) {
          continue;
        }

        break;
      }
    }
  }

  const normalized = normalizeStatus(lastError ?? new Error("Diagnostic LLM review failed"));

  return {
    status: normalized,
    fallbackUsed: true,
    fallbackReason:
      lastError?.message ?? "Diagnostic LLM review failed without a recoverable response",
    provider: providerPlan.preferredProvider,
    model: models[models.length - 1] ?? providerPlan.defaultModel,
    parsed: null,
    raw: null,
  };
}

export type DiagnosticSimpleClassificationResult =
  | {
      status: "ok";
      fallbackUsed: boolean;
      fallbackReason: string | null;
      provider: string;
      model: string;
      parsed: SimpleDiagnosticCategoryResult;
      raw: InvokeResult;
    }
  | {
      status: "not_configured" | "timeout" | "invalid_schema" | "error";
      fallbackUsed: boolean;
      fallbackReason: string;
      provider: string | null;
      model: string | null;
      parsed: null;
      raw: InvokeResult | null;
    };

export type DiagnosticSimpleDiagnosisResult =
  | {
      status: "ok";
      fallbackUsed: boolean;
      fallbackReason: string | null;
      provider: string;
      model: string;
      parsed: SimpleDiagnosticDiagnosisResult;
      raw: InvokeResult;
    }
  | {
      status: "not_configured" | "timeout" | "invalid_schema" | "error";
      fallbackUsed: boolean;
      fallbackReason: string;
      provider: string | null;
      model: string | null;
      parsed: null;
      raw: InvokeResult | null;
    };

function buildSimpleProviderPlan(config: DiagnosticRuntimeConfig): DiagnosticProviderPlan | null {
  return buildDiagnosticProviderPlan(config);
}

export function buildSimpleClassificationPrompt(request: Record<string, unknown>) {
  return buildSimpleCategoryPrompt(request);
}

export function buildSimpleDiagnosisPromptMessage(request: Record<string, unknown>) {
  return buildSimpleDiagnosisPrompt(request);
}

function normalizeSimpleClassification(parsed: SimpleDiagnosticCategoryResult, symptomText: string) {
  const contaminationPattern =
    /(?:oil.*coolant|coolant.*oil|milky oil|coolant in oil pan|oil in coolant reservoir|white smoke.*coolant|combustion gas in coolant|oil\/coolant contamination|coolant mixing with oil)/i;
  if (contaminationPattern.test(symptomText)) {
    return {
      ...parsed,
      primary_category: "critical_engine_internal" as const,
      secondary_category:
        parsed.secondary_category === "oil_lubrication_system" ||
        parsed.secondary_category === "cooling_system"
          ? parsed.secondary_category
          : "oil_lubrication_system",
      risk_level: parsed.risk_level === "critical" ? parsed.risk_level : "critical",
      classification_confidence: Math.max(parsed.classification_confidence, 95),
      clarifying_question: null,
    };
  }

  return parsed;
}

function validateSimpleDiagnosis(parsed: SimpleDiagnosticDiagnosisResult) {
  if (parsed.confidence_score <= 0) {
    throw new Error("Simple diagnosis schema invalid: confidence score missing");
  }

  if (parsed.confidence_score < 85 && !(parsed.clarifying_question ?? "").trim()) {
    throw new Error("Simple diagnosis schema invalid: clarifying question missing");
  }

  if (parsed.confidence_score >= 85) {
    parsed.clarifying_question = null;
  }

  return parsed;
}

export async function classifyDiagnosticIssueWithLlm(
  request: DiagnosticIntakeInterpretationRequest,
  config: DiagnosticRuntimeConfig
): Promise<DiagnosticSimpleClassificationResult> {
  const providerPlan = buildSimpleProviderPlan(config);
  if (!providerPlan) {
    return {
      status: "not_configured",
      fallbackUsed: true,
      fallbackReason: "No diagnostic LLM provider is configured. Set OPENROUTER_API_KEY.",
      provider: null,
      model: null,
      parsed: null,
      raw: null,
    };
  }

  const models = providerPlan.primaryModels;
  let lastError: Error | null = null;

  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    if (shouldTemporarilySkipModel(model)) {
      continue;
    }
    const attemptsForModel = 2;
    let maxTokens = 80;

    for (let attemptIndex = 0; attemptIndex < attemptsForModel; attemptIndex += 1) {
      try {
        const raw = await invokeSimpleClassificationWithModel(
          request,
          config,
          providerPlan,
          model,
          maxTokens
        );
        const parsed = normalizeSimpleClassification(
          parseSimpleCategoryResponse(readMessageText(raw)),
          safePromptStringify(request.intakePackage).slice(0, 3000)
        );

        const providerFallbackUsed =
          (raw.orchestration?.provider != null &&
            raw.orchestration.provider !== providerPlan.preferredProvider) ||
          (raw.orchestration?.attempts?.length ?? 0) > 1;

        return {
          status: "ok",
          fallbackUsed: index > 0 || attemptIndex > 0 || providerFallbackUsed,
          fallbackReason:
            index > 0
              ? `Primary model failed; fallback model ${model} succeeded`
              : attemptIndex > 0
                ? `Primary model ${model} succeeded after retry ${attemptIndex + 1}`
                : providerFallbackUsed
                  ? `${raw.orchestration?.provider ?? providerPlan.providerLabel} succeeded after provider fallback`
                  : null,
          provider: raw.orchestration?.provider ?? providerPlan.preferredProvider,
          model: raw.orchestration?.model ?? model,
          parsed,
          raw,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        rememberTemporaryModelFailure(model, lastError);
        const reducedMaxTokens = nextAffordableTokenBudget(lastError, maxTokens);
        if (reducedMaxTokens) {
          maxTokens = reducedMaxTokens;
          continue;
        }

        if (shouldSkipFurtherRetriesForModel(lastError)) {
          break;
        }

        if (attemptIndex < attemptsForModel - 1 && isRetryableReviewError(lastError)) {
          continue;
        }

        break;
      }
    }
  }

  const normalized = normalizeStatus(lastError ?? new Error("Diagnostic simple classification failed"));
  return {
    status: normalized,
    fallbackUsed: true,
    fallbackReason: lastError?.message ?? "Diagnostic simple classification failed without a recoverable response",
    provider: providerPlan.preferredProvider,
    model: models[models.length - 1] ?? providerPlan.defaultModel,
    parsed: null,
    raw: null,
  };
}

export async function diagnoseDiagnosticIssueWithLlm(
  request: DiagnosticReviewRequest,
  config: DiagnosticRuntimeConfig
): Promise<DiagnosticSimpleDiagnosisResult> {
  const providerPlan = buildSimpleProviderPlan(config);
  if (!providerPlan) {
    return {
      status: "not_configured",
      fallbackUsed: true,
      fallbackReason: "No diagnostic LLM provider is configured. Set OPENROUTER_API_KEY.",
      provider: null,
      model: null,
      parsed: null,
      raw: null,
    };
  }

  const models = providerPlan.primaryModels;
  let lastError: Error | null = null;

  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    if (shouldTemporarilySkipModel(model)) {
      continue;
    }
    const attemptsForModel = 2;
    let maxTokens = 120;

    for (let attemptIndex = 0; attemptIndex < attemptsForModel; attemptIndex += 1) {
      try {
        const raw = await invokeSimpleDiagnosisWithModel(
          request,
          config,
          providerPlan,
          model,
          maxTokens
        );
        const parsed = validateSimpleDiagnosis(
          parseSimpleDiagnosisResponse(readMessageText(raw))
        );

        const providerFallbackUsed =
          (raw.orchestration?.provider != null &&
            raw.orchestration.provider !== providerPlan.preferredProvider) ||
          (raw.orchestration?.attempts?.length ?? 0) > 1;

        return {
          status: "ok",
          fallbackUsed: index > 0 || attemptIndex > 0 || providerFallbackUsed,
          fallbackReason:
            index > 0
              ? `Primary model failed; fallback model ${model} succeeded`
              : attemptIndex > 0
                ? `Primary model ${model} succeeded after retry ${attemptIndex + 1}`
                : providerFallbackUsed
                  ? `${raw.orchestration?.provider ?? providerPlan.providerLabel} succeeded after provider fallback`
                  : null,
          provider: raw.orchestration?.provider ?? providerPlan.preferredProvider,
          model: raw.orchestration?.model ?? model,
          parsed,
          raw,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        rememberTemporaryModelFailure(model, lastError);
        const reducedMaxTokens = nextAffordableTokenBudget(lastError, maxTokens);
        if (reducedMaxTokens) {
          maxTokens = reducedMaxTokens;
          continue;
        }

        if (shouldSkipFurtherRetriesForModel(lastError)) {
          break;
        }

        if (attemptIndex < attemptsForModel - 1 && isRetryableReviewError(lastError)) {
          continue;
        }

        break;
      }
    }
  }

  const normalized = normalizeStatus(lastError ?? new Error("Diagnostic simple diagnosis failed"));
  return {
    status: normalized,
    fallbackUsed: true,
    fallbackReason: lastError?.message ?? "Diagnostic simple diagnosis failed without a recoverable response",
    provider: providerPlan.preferredProvider,
    model: models[models.length - 1] ?? providerPlan.defaultModel,
    parsed: null,
    raw: null,
  };
}

export async function interpretDiagnosticIntakeWithLlm(
  request: DiagnosticIntakeInterpretationRequest,
  config: DiagnosticRuntimeConfig
): Promise<DiagnosticIntakeInterpretationResult> {
  const providerPlan = buildDiagnosticProviderPlan(config);

  if (!providerPlan) {
    return {
      status: "not_configured",
      fallbackUsed: true,
      fallbackReason: "No diagnostic LLM provider is configured. Set OPENROUTER_API_KEY.",
      provider: null,
      model: null,
      parsed: null,
      raw: null,
    };
  }

  const models = providerPlan.primaryModels;
  let lastError: Error | null = null;

  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    const attemptsForModel = index === 0 ? config.retryCount + 1 : 2;
    let maxTokens = config.intakeMaxTokens;
    let compactLevel: PromptCompactLevel = 0;
    let allowResponseFormat = true;

    for (let attemptIndex = 0; attemptIndex < attemptsForModel; attemptIndex += 1) {
      try {
        const raw = await invokeIntakeInterpretationWithModel(
          request,
          config,
          providerPlan,
          model,
          maxTokens,
          compactLevel,
          allowResponseFormat
        );
        const parsed = parseDiagnosticIntakeInterpretation(readMessageText(raw));

        const providerFallbackUsed =
          (raw.orchestration?.provider != null &&
            raw.orchestration.provider !== providerPlan.preferredProvider) ||
          (raw.orchestration?.attempts?.length ?? 0) > 1;

        return {
          status: "ok",
          fallbackUsed: index > 0 || attemptIndex > 0 || providerFallbackUsed,
          fallbackReason:
            index > 0
              ? `Primary model failed; fallback model ${model} succeeded`
              : attemptIndex > 0
                ? `Primary model ${model} succeeded after retry ${attemptIndex + 1}`
                : providerFallbackUsed
                  ? `${raw.orchestration?.provider ?? providerPlan.providerLabel} succeeded after provider fallback`
                : null,
          provider: raw.orchestration?.provider ?? providerPlan.preferredProvider,
          model: raw.orchestration?.model ?? model,
          parsed,
          raw,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const nextCompactLevel: PromptCompactLevel | null = isPromptLimitError(lastError)
          || isOpenRouterProviderError(lastError)
          ? nextPromptCompactLevel(compactLevel)
          : null;

        if (nextCompactLevel != null) {
          compactLevel = nextCompactLevel;
          continue;
        }
        const reducedMaxTokens = nextAffordableTokenBudget(lastError, maxTokens);

        if (reducedMaxTokens) {
          maxTokens = reducedMaxTokens;
          continue;
        }

        if (isOpenRouterProviderError(lastError) && allowResponseFormat) {
          allowResponseFormat = false;
          continue;
        }

        if (attemptIndex < attemptsForModel - 1 && isRetryableReviewError(lastError)) {
          continue;
        }
      }
    }
  }

  const fallbackReason = lastError?.message ?? "Diagnostic intake interpretation failed";
  return {
    status: lastError ? normalizeIntakeInterpretationStatus(lastError) : "error",
    fallbackUsed: true,
    fallbackReason,
    provider: providerPlan.preferredProvider,
    model: models[0] ?? providerPlan.defaultModel,
    parsed: null,
    raw: null,
  };
}
