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

export type DiagnosticReviewRequest = {
  evidencePackage: Record<string, unknown>;
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

function extractBalancedJsonObject(text: string) {
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
        return text.slice(start, index + 1);
      }
    }
  }

  return "";
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
  };

  return aliases[normalized] ?? "drive_to_shop";
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
  return {
    cause_id: toNullableString(record.cause_id ?? record.causeId),
    cause_name:
      toNullableString(record.cause_name ?? record.causeName ?? record.name ?? record.cause) ??
      "Unspecified cause",
    is_new_cause: toBooleanValue(record.is_new_cause ?? record.isNewCause, false),
    probability: toBoundedScore(record.probability ?? record.score, 0),
    evidence_summary: toStringArray(record.evidence_summary ?? record.evidenceSummary),
    ranking_rationale: toStringArray(record.ranking_rationale ?? record.rankingRationale),
    symptom_support_score: toBoundedScore(record.symptom_support_score ?? record.symptomSupportScore, 0),
    fault_code_support_score: toBoundedScore(record.fault_code_support_score ?? record.faultCodeSupportScore, 0),
    repair_history_support_score: toBoundedScore(record.repair_history_support_score ?? record.repairHistorySupportScore, 0),
    maintenance_history_support_score: toBoundedScore(record.maintenance_history_support_score ?? record.maintenanceHistorySupportScore, 0),
    recent_parts_support_score: toBoundedScore(record.recent_parts_support_score ?? record.recentPartsSupportScore, 0),
    recurring_failure_support_score: toBoundedScore(record.recurring_failure_support_score ?? record.recurringFailureSupportScore, 0),
    cause_library_fit_score: toBoundedScore(record.cause_library_fit_score ?? record.causeLibraryFitScore, 0),
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
  const topRankedCauses: unknown[] = Array.isArray(record.top_ranked_causes)
    ? record.top_ranked_causes
    : Array.isArray(record.topRankedCauses)
      ? record.topRankedCauses
      : [];
  const faultCodeInterpretations: unknown[] = Array.isArray(record.fault_code_interpretations)
    ? record.fault_code_interpretations
    : Array.isArray(record.faultCodeInterpretations)
      ? record.faultCodeInterpretations
      : [];
  const driverActionRecommendation =
    record.driver_action_recommendation && typeof record.driver_action_recommendation === "object"
      ? (record.driver_action_recommendation as Record<string, unknown>)
      : record.driverActionRecommendation && typeof record.driverActionRecommendation === "object"
        ? (record.driverActionRecommendation as Record<string, unknown>)
        : {};
  const repairGuidance =
    record.top_cause_repair_guidance && typeof record.top_cause_repair_guidance === "object"
      ? (record.top_cause_repair_guidance as Record<string, unknown>)
      : record.topCauseRepairGuidance && typeof record.topCauseRepairGuidance === "object"
        ? (record.topCauseRepairGuidance as Record<string, unknown>)
        : {};

  return {
    next_action: normalizeNextAction(record.next_action ?? record.nextAction),
    clarifying_question: toNullableString(record.clarifying_question ?? record.clarifyingQuestion),
    question_rationale: toNullableString(record.question_rationale ?? record.questionRationale),
    missing_evidence: toStringArray(record.missing_evidence ?? record.missingEvidence),
    ambiguity_drivers: toStringArray(record.ambiguity_drivers ?? record.ambiguityDrivers),
    top_ranked_causes: topRankedCauses.slice(0, 4).map((item) => coerceCause(item)),
    overall_confidence_score: toBoundedScore(record.overall_confidence_score ?? record.overallConfidenceScore, 0),
    confidence_rationale: toStringArray(record.confidence_rationale ?? record.confidenceRationale),
    fault_code_interpretations: faultCodeInterpretations.map((item) => coerceFaultCodeInterpretation(item)),
    driver_action_recommendation: {
      llm_driver_action: normalizeDriverAction(
        driverActionRecommendation.llm_driver_action ?? driverActionRecommendation.llmDriverAction
      ),
      driver_action_reason:
        toNullableString(
          driverActionRecommendation.driver_action_reason ?? driverActionRecommendation.driverActionReason
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
        toNullableString(repairGuidance.top_most_likely_cause ?? repairGuidance.topMostLikelyCause) ??
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

function parseDiagnosticReview(rawText: string) {
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const candidates = [cleaned, extractBalancedJsonObject(cleaned)].filter(Boolean);

  for (const candidate of candidates) {
    try {
      return validateDiagnosticReview(
        diagnosticLlmResponseSchema.parse(coerceDiagnosticReviewPayload(JSON.parse(candidate)))
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

function buildEvidencePrompt(request: DiagnosticReviewRequest) {
  return [
    "TASK",
    "Review the diagnostic evidence package and return the final ranked causes as the main authority.",
    "Use the rules-engine baseline as an audit reference, but you may override its ranking and confidence.",
    "",
    "QUALITY RULES",
    "1. Every evidence_summary item must cite a concrete case fact such as a named symptom, exact fault code, vehicle detail, repair-history clue, recently replaced part, or recurrence signal.",
    "2. Every ranking_rationale item must explain why this cause outranks a competing cause in this specific case.",
    "3. Do not use vague filler like 'symptoms align', 'issue persists', 'inspect the system', or 'monitor the vehicle' unless you also name the exact component or risk.",
    "4. If evidence is weak, ask exactly one targeted clarifying question tied to the top competing causes.",
    "5. Keep the response deterministic and operationally useful for a fleet workflow.",
    "",
    "OUTPUT RULES",
    "Return one JSON object only.",
    "Probabilities must stay between 0 and 100 and should roughly sum to 100 across top_ranked_causes.",
    "Use 2 to 4 ranked causes only.",
    "",
    "EVIDENCE PACKAGE",
    JSON.stringify(request.evidencePackage),
  ].join("\n");
}

function buildMessages(request: DiagnosticReviewRequest) {
  return [
    {
      role: "system" as const,
      content: [
        "You are TADIS, a production heavy-duty truck diagnostic review engine.",
        "OpenRouter is the main diagnostic reasoning layer for this run.",
        "Use the evidence package, candidate universe, and rule-engine baseline to produce the final ranking authority.",
        "You may introduce new likely causes if the evidence supports them.",
        "Be conservative, operationally safe, and deterministic.",
        "Return JSON only.",
        "If confidence is insufficient, ask exactly one targeted clarifying question.",
        "Do not ask multiple questions and do not add prose outside the JSON object.",
        "Probabilities must be between 0 and 100 and should roughly sum to 100 across the ranked causes.",
        "Be concrete and evidence-linked, not generic.",
        "Every evidence_summary item must quote or paraphrase a concrete case fact from the evidence package.",
        "Every ranking_rationale item must explain why this cause outranks a competing cause in this case.",
        "If the package contains an exact fault code, symptom phrase, replaced part, or history clue, use that detail directly instead of broad summaries.",
        "Avoid vague phrases like inspect the system or monitor issue unless tied to a named component or operational risk.",
        "Prefer the strongest 2-4 causes rather than a broad diluted list.",
      ].join(" "),
    },
    {
      role: "user" as const,
      content: buildEvidencePrompt(request),
    },
  ];
}

async function invokeReviewWithModel(
  request: DiagnosticReviewRequest,
  config: DiagnosticRuntimeConfig,
  model: string
) {
  return invokeWithOrchestration({
    preferredProvider: "openrouter",
    fallbackProviders: [],
    messages: buildMessages(request),
    responseFormat: { type: "json_object" },
    maxTokens: 1600,
    timeoutMs: config.timeoutMs,
    model,
    temperature: 0.05,
  });
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

    try {
      const raw = await invokeReviewWithModel(request, config, model);
      const parsed = parseDiagnosticReview(readMessageText(raw));

      return {
        status: "ok",
        fallbackUsed: index > 0,
        fallbackReason: index > 0 ? `Primary model failed; fallback model ${model} succeeded` : null,
        provider: raw.orchestration?.provider ?? "openrouter",
        model: raw.orchestration?.model ?? model,
        parsed,
        raw,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
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
