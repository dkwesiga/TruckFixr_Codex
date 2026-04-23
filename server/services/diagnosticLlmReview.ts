import { z } from "zod";
import { ENV } from "../_core/env";
import { invokeWithOrchestration, type InvokeResult } from "./aiOrchestrator";
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
    record.top_ranked_causes,
    record.topRankedCauses,
    record.ranked_causes,
    record.rankedCauses,
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

  return {
    next_action: normalizeNextAction(record.next_action ?? record.nextAction ?? record.action),
    clarifying_question: toNullableString(record.clarifying_question ?? record.clarifyingQuestion ?? record.question),
    question_rationale: toNullableString(record.question_rationale ?? record.questionRationale ?? record.question_reason),
    missing_evidence: toStringArray(record.missing_evidence ?? record.missingEvidence),
    ambiguity_drivers: toStringArray(record.ambiguity_drivers ?? record.ambiguityDrivers),
    top_ranked_causes: topRankedCauses.slice(0, 4).map((item) => coerceCause(item)),
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
    const nestedKeys = ["result", "response", "output", "data", "json", "diagnosis", "analysis"];
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

  const safeBudget = Math.max(180, Math.min(requestedMaxTokens - 1, affordable - 24));
  return safeBudget < requestedMaxTokens ? safeBudget : null;
}

async function invokeIntakeInterpretationWithModel(
  request: DiagnosticIntakeInterpretationRequest,
  config: DiagnosticRuntimeConfig,
  model: string,
  maxTokens = config.intakeMaxTokens
) {
  return invokeWithOrchestration({
    preferredProvider: "openrouter",
    fallbackProviders: [],
    messages: buildIntakeInterpretationMessages(request),
    responseFormat: { type: "json_object" },
    maxTokens,
    timeoutMs: config.timeoutMs,
    model,
    temperature: 0.05,
  });
}

function buildEvidencePrompt(request: DiagnosticReviewRequest, maxTokens: number) {
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

  return [
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
    "",
    "OUTPUT RULES",
    "Return one JSON object only.",
    "Use the exact snake_case keys shown in the JSON template below.",
    "Do not rename keys, omit sections, wrap the result in another object, or add markdown.",
    "Probabilities must stay between 0 and 100 and should roughly sum to 100 across top_ranked_causes.",
    "Use 2 to 4 ranked causes only.",
    "",
    "REQUIRED JSON TEMPLATE",
    JSON.stringify(outputTemplate),
    "",
    "EVIDENCE PACKAGE",
    JSON.stringify(request.evidencePackage),
    compactBudgetInstruction(maxTokens),
  ].join("\n");
}

function buildMessages(request: DiagnosticReviewRequest, maxTokens: number) {
  return [
    {
      role: "system" as const,
      content: [
        "You are TADIS, a production heavy-duty truck diagnostic review engine.",
        "OpenRouter is the primary diagnostic reasoning layer for this run.",
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
      ].join(" "),
    },
    {
      role: "user" as const,
      content: buildEvidencePrompt(request, maxTokens),
    },
  ];
}

async function invokeReviewWithModel(
  request: DiagnosticReviewRequest,
  config: DiagnosticRuntimeConfig,
  model: string,
  maxTokens = config.reviewMaxTokens
) {
  return invokeWithOrchestration({
    preferredProvider: "openrouter",
    fallbackProviders: [],
    messages: buildMessages(request, maxTokens),
    responseFormat: { type: "json_object" },
    maxTokens,
    timeoutMs: config.timeoutMs,
    model,
    temperature: 0.05,
  });
}

function isRetryableReviewError(error: Error) {
  return (
    isTokenBudgetError(error) ||
    /timed out|429|5\d\d|temporar|rate limit|overloaded|connection reset|socket hang up/i.test(
      error.message
    )
  );
}

export async function reviewDiagnosticWithLlm(
  request: DiagnosticReviewRequest,
  config: DiagnosticRuntimeConfig
): Promise<DiagnosticReviewResult> {
  if (!ENV.openRouterApiKey) {
    return {
      status: "not_configured",
      fallbackUsed: true,
      fallbackReason: "OPENROUTER_API_KEY is not configured",
      provider: null,
      model: null,
      parsed: null,
      raw: null,
    };
  }

  const models = [config.openRouterModel, config.openRouterFallbackModel]
    .filter(Boolean)
    .filter((model, index, values) => values.indexOf(model) === index);
  let lastError: Error | null = null;

  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    const attemptsForModel = index === 0 ? config.retryCount + 1 : 2;
    let maxTokens = config.reviewMaxTokens;

    for (let attemptIndex = 0; attemptIndex < attemptsForModel; attemptIndex += 1) {
      try {
        const raw = await invokeReviewWithModel(request, config, model, maxTokens);
        const parsed = parseDiagnosticReview(readMessageText(raw));

        return {
          status: "ok",
          fallbackUsed: index > 0 || attemptIndex > 0,
          fallbackReason:
            index > 0
              ? `Primary model failed; fallback model ${model} succeeded`
              : attemptIndex > 0
                ? `Primary model ${model} succeeded after retry ${attemptIndex + 1}`
                : null,
          provider: raw.orchestration?.provider ?? "openrouter",
          model: raw.orchestration?.model ?? model,
          parsed,
          raw,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const reducedMaxTokens = nextAffordableTokenBudget(lastError, maxTokens);

        if (reducedMaxTokens) {
          maxTokens = reducedMaxTokens;
          continue;
        }

        if (attemptIndex < attemptsForModel - 1 && isRetryableReviewError(lastError)) {
          continue;
        }

        break;
      }
    }
  }

  const normalized = normalizeStatus(
    lastError ?? new Error("Diagnostic OpenRouter review failed")
  );

  return {
    status: normalized,
    fallbackUsed: true,
    fallbackReason:
      lastError?.message ??
      "Diagnostic OpenRouter review failed without a recoverable response",
    provider: "openrouter",
    model: models[models.length - 1] ?? config.openRouterModel,
    parsed: null,
    raw: null,
  };
}

export async function interpretDiagnosticIntakeWithLlm(
  request: DiagnosticIntakeInterpretationRequest,
  config: DiagnosticRuntimeConfig
): Promise<DiagnosticIntakeInterpretationResult> {
  if (!ENV.openRouterApiKey) {
    return {
      status: "not_configured",
      fallbackUsed: true,
      fallbackReason: "OPENROUTER_API_KEY is not configured",
      provider: null,
      model: null,
      parsed: null,
      raw: null,
    };
  }

  const models = [config.openRouterModel, config.openRouterFallbackModel]
    .filter(Boolean)
    .filter((model, index, values) => values.indexOf(model) === index);
  let lastError: Error | null = null;

  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    const attemptsForModel = index === 0 ? config.retryCount + 1 : 2;
    let maxTokens = config.intakeMaxTokens;

    for (let attemptIndex = 0; attemptIndex < attemptsForModel; attemptIndex += 1) {
      try {
        const raw = await invokeIntakeInterpretationWithModel(request, config, model, maxTokens);
        const parsed = parseDiagnosticIntakeInterpretation(readMessageText(raw));

        return {
          status: "ok",
          fallbackUsed: index > 0 || attemptIndex > 0,
          fallbackReason:
            index > 0
              ? `Primary model failed; fallback model ${model} succeeded`
              : attemptIndex > 0
                ? `Primary model ${model} succeeded after retry ${attemptIndex + 1}`
                : null,
          provider: raw.orchestration?.provider ?? "openrouter",
          model: raw.orchestration?.model ?? model,
          parsed,
          raw,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const reducedMaxTokens = nextAffordableTokenBudget(lastError, maxTokens);

        if (reducedMaxTokens) {
          maxTokens = reducedMaxTokens;
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
    provider: "openrouter",
    model: models[0] ?? null,
    parsed: null,
    raw: null,
  };
}
