import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ENV } from "../_core/env";
import {
  invokeWithOrchestration,
  type AiProvider,
  type InvokeResult,
} from "./aiOrchestrator";
import { getDiagnosticRuntimeConfig } from "./diagnosticConfig";
import {
  lookupFaultCodeReferences,
  preprocessDiagnosticInput,
  type DiagnosticPreprocessingResult,
  type FaultCodeReferenceContext,
  type FaultCodeReferenceMatchStatus,
} from "./faultCodeReferences";

const MAX_CLARIFICATION_QUESTIONS = 3;
const CONFIDENCE_CLARIFICATION_THRESHOLD = 80;
const PRIMARY_PROVIDER_MAX_ATTEMPTS = 2;

export const safetyComplexitySchema = z.enum([
  "normal",
  "safety_critical",
  "complex_high_risk",
]);
export type SafetyComplexity = z.infer<typeof safetyComplexitySchema>;

export const safeToDriveDecisionSchema = z.enum([
  "safe_to_drive",
  "drive_with_caution",
  "stop_and_inspect",
  "tow_or_repair_immediately",
]);

export const diagnosisStatusSchema = z.enum(["clarification_needed", "final"]);

export const riskLevelSchema = z.enum(["low", "medium", "high", "critical"]);
export const complianceImpactSchema = z.enum(["none", "warning", "critical"]);
const likelihoodSchema = z.enum(["high", "medium", "low"]);
const diagnosticCaseTypeSchema = z.enum(["normal", "fault_code", "safety_critical", "complex"]);
const diagnosticIssueTypeSchema = z.enum(["symptom_only", "fault_code", "mixed"]);
const diagnosticCodeTypeSchema = z.enum([
  "SPN_FMI",
  "MID_PID_SID_FMI",
  "OBD_DTC",
  "ABS",
  "transmission",
  "aftertreatment",
  "unknown",
  "none",
]);
const modelTierSchema = z.enum(["low_cost", "advanced"]);
const referenceMatchStatusSchema = z.enum([
  "none",
  "approved_match",
  "needs_review_internal",
  "no_match",
]);

export const minimalDiagnosisContextSchema = z.object({
  vehicle: z.object({
    make: z.string().default(""),
    model: z.string().default(""),
    year: z.union([z.string(), z.number()]).optional().default(""),
    engine: z.string().optional().default(""),
  }),
  user_report: z.object({
    symptoms: z.string().min(1),
    fault_codes: z.array(z.string()).default([]),
  }),
  maintenance_history: z
    .array(
      z.object({
        date: z.string().default(""),
        summary: z.string().default(""),
        odometer: z.union([z.string(), z.number()]).optional().default(""),
      })
    )
    .max(3)
    .default([]),
  last_daily_inspection: z
    .object({
      date: z.string().default(""),
      status: z.enum(["passed", "failed"]).default("passed"),
      defects: z.array(z.string()).default([]),
    })
    .nullable()
    .default(null),
  clarification_history: z
    .array(
      z.object({
        question: z.string().default(""),
        answer: z.string().default(""),
      })
    )
    .max(3)
    .default([]),
  fault_code_reference: z
    .object({
      match_status: referenceMatchStatusSchema.default("none"),
      references: z
        .array(
          z.object({
            id: z.number(),
            code: z.string(),
            code_system: z.string(),
            category: z.string(),
            title: z.string(),
            summary: z.string(),
            recommended_checks: z.array(z.string()).default([]),
            risk_level: z.string().default("medium"),
            review_status: z.string().default("approved"),
            source_id: z.number().nullable().default(null),
          })
        )
        .default([]),
    })
    .default({ match_status: "none", references: [] }),
  confirmed_outcome_references: z
    .array(
      z.object({
        date: z.string().default(""),
        summary: z.string().default(""),
      })
    )
    .max(3)
    .optional(),
});

export type MinimalDiagnosisContext = z.infer<typeof minimalDiagnosisContextSchema>;

export const clarificationTurnSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
});
export type DiagnosisClarificationTurn = z.infer<typeof clarificationTurnSchema>;

export const diagnosisOutputSchema = z.object({
  case_id: z.string().min(1),
  vehicle_id: z.string().min(1),
  status: diagnosisStatusSchema,
  issue_summary: z.string().default(""),
  systems_affected: z.array(z.string()).default([]),
  likely_causes: z
    .array(
      z.object({
        cause: z.string().min(1),
        likelihood: likelihoodSchema,
        probability: z.number().min(0).max(100),
        reasoning: z.string().default(""),
      })
    )
    .default([]),
  confidence_score: z.number().min(0).max(100),
  clarifying_question: z.string().default(""),
  clarification_reason: z.string().default(""),
  recommended_tests: z.array(z.string()).default([]),
  likely_parts: z.array(z.string()).default([]),
  safe_to_drive_decision: safeToDriveDecisionSchema,
  risk_level: riskLevelSchema,
  maintenance_recommendation: z.string().default(""),
  compliance_impact: complianceImpactSchema,
  driver_friendly_explanation: z.string().default(""),
  manager_summary: z.string().default(""),
  advanced_ai_review_used: z.boolean().default(false),
  model_used: z.string().default(""),
  fallback_used: z.boolean().default(false),
});

export type DiagnosisOutput = z.infer<typeof diagnosisOutputSchema>;

export type RunDiagnosisWorkflowInput = {
  caseId?: string;
  vehicleId: string;
  context: MinimalDiagnosisContext;
  clarificationHistory?: DiagnosisClarificationTurn[];
  planType?: "free" | "pilot" | "pilot_access" | "pro" | "fleet";
  includeInternalReferences?: boolean;
};

export type RunDiagnosisWorkflowResult = {
  diagnosis: DiagnosisOutput;
  classification: SafetyComplexity;
  routing: DiagnosticRoutingClassification;
  preprocessing: DiagnosticPreprocessingResult;
  referenceLookup: FaultCodeReferenceContext;
  aiCallHistory: AiCallHistoryEntry[];
  promptContext: MinimalDiagnosisContext;
  providerErrors: Array<{
    provider: AiProvider;
    model: string;
    message: string;
  }>;
};

export const diagnosticRoutingClassificationSchema = z.object({
  case_type: diagnosticCaseTypeSchema,
  issue_type: diagnosticIssueTypeSchema,
  code_type: diagnosticCodeTypeSchema,
  risk_level: riskLevelSchema,
  reference_lookup_required: z.boolean(),
  reference_match_quality: referenceMatchStatusSchema,
  needs_clarification: z.boolean(),
  clarifying_question: z.string().default(""),
  clarification_reason: z.string().default(""),
  confidence_score: z.number().min(0).max(100),
  recommended_model_tier: modelTierSchema,
  escalation_required: z.boolean(),
  reason_for_escalation: z.string().default(""),
  extracted_fault_codes: z.array(z.string()).default([]),
  normalized_symptoms: z.array(z.string()).default([]),
});
export type DiagnosticRoutingClassification = z.infer<
  typeof diagnosticRoutingClassificationSchema
>;

export type AiCallHistoryEntry = {
  callType:
    | "classifier"
    | "classification_repair"
    | "clarification"
    | "diagnosis"
    | "json_repair"
    | "fallback";
  provider: string | null;
  model: string | null;
  fallbackUsed: boolean;
  status: "success" | "failed" | "fallback";
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number | null;
  latencyMs: number | null;
  errorMessage?: string;
};

type ModelCandidate = {
  provider: AiProvider;
  model: string | undefined;
  label: string;
  tier?: "low_cost" | "advanced";
};

const SAFETY_KEYWORDS = [
  /\bbrakes?\b/i,
  /\bbrake pedal\b/i,
  /\bsteer(?:ing)?\b/i,
  /\boverheat(?:ing)?\b/i,
  /\boil pressure\b/i,
  /\bcoolant\b.*\boil\b/i,
  /\boil\b.*\bcoolant\b/i,
  /\bfuel leak\b/i,
  /\bsmoke\b/i,
  /\bfire\b/i,
  /\bburning smell\b/i,
  /\btire\b.*\b(severe|blowout|separat|flat)\b/i,
  /\bwheel\b.*\b(loose|severe|bearing|separat)\b/i,
  /\belectrical smoke\b/i,
  /\bdef\b/i,
  /\bdpf\b/i,
  /\bderate\b/i,
  /\bshutdown countdown\b/i,
  /\bno[- ]?start\b/i,
  /\bengine runaway\b/i,
  /\bloss of power\b.*\bderate\b/i,
  /\bair pressure\b/i,
  /\bsuspension\b.*\b(fail|collapse|major)\b/i,
  /\bunsafe\b/i,
];

const COMPLEX_HIGH_RISK_KEYWORDS = [
  /\bcoolant\b.*\boil\b/i,
  /\boil\b.*\bcoolant\b/i,
  /\bmilky oil\b/i,
  /\bengine runaway\b/i,
  /\bshutdown countdown\b/i,
  /\bactive derate\b/i,
  /\bno[- ]?start\b/i,
];

const FALLBACK_CLARIFICATION_QUESTION_BANK = [
  {
    id: "load_pattern",
    question: "Does the symptom happen only under load, on a hill, or during hard acceleration?",
    reason: "Load-related behavior helps separate powertrain restriction from an intermittent sensor or warning event.",
  },
  {
    id: "recent_change",
    question: "Did this start right after fueling, a recent repair, or a filter/DEF service?",
    reason: "A recent change can quickly narrow the likely system and reduce unnecessary part swapping.",
  },
  {
    id: "restart_pattern",
    question: "If you shut the truck off and restart it, does the warning or symptom return right away?",
    reason: "Restart behavior helps distinguish an active hard fault from a temporary or conditional event.",
  },
] as const;

function normalizeQuestion(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function compactString(value: unknown, maxLength = 180) {
  const text = typeof value === "string" ? value : String(value ?? "");
  return text.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? "");
}

export function normalizeFaultCodes(values: string[] = []) {
  return values
    .flatMap((value) => value.split(/[,;\n]+/))
    .map((value) => compactString(value.toUpperCase(), 64))
    .filter(Boolean);
}

export function summarizeMaintenanceRecord(input: {
  date?: Date | string | null;
  summary?: string | null;
  odometer?: string | number | null;
}) {
  return {
    date:
      input.date instanceof Date
        ? input.date.toISOString().slice(0, 10)
        : compactString(input.date, 24),
    summary: compactString(input.summary, 180),
    odometer: input.odometer == null ? "" : compactString(input.odometer, 24),
  };
}

export function classifyDiagnosticIssue(input: {
  symptoms: string;
  faultCodes?: string[];
}): SafetyComplexity {
  const text = [input.symptoms, ...(input.faultCodes ?? [])].join(" ");

  if (COMPLEX_HIGH_RISK_KEYWORDS.some((pattern) => pattern.test(text))) {
    return "complex_high_risk";
  }

  if (SAFETY_KEYWORDS.some((pattern) => pattern.test(text))) {
    return "safety_critical";
  }

  return "normal";
}

function configured(provider: AiProvider) {
  const config = getDiagnosticRuntimeConfig();

  switch (provider) {
    case "openai":
      if (config.diagnosisDisableOpenAi) return false;
      return Boolean(ENV.openAiApiKey);
    case "anthropic":
      if (config.diagnosisDisableAnthropic) return false;
      return Boolean(ENV.anthropicApiKey);
    case "gemini":
      if (config.diagnosisDisableGemini) return false;
      return Boolean(ENV.geminiApiKey);
    case "openrouter":
      return Boolean(ENV.openRouterApiKey);
    case "groq":
      return Boolean(ENV.groqApiKey);
  }
}

function openRouterConfigured() {
  return Boolean(ENV.openRouterApiKey);
}

function dedupeCandidates(candidates: ModelCandidate[]) {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (!configured(candidate.provider)) return false;
    const key = `${candidate.provider}:${candidate.model ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildDiagnosisModelRoute(classification: SafetyComplexity): ModelCandidate[] {
  const config = getDiagnosticRuntimeConfig();
  const defaultOpenRouterModel = config.defaultDiagnosisModel;
  const safetyModel = config.safetyCriticalModel || config.advancedDiagnosisModel || undefined;
  const fallback1 = config.fallbackModel1 || undefined;
  const fallback2 = config.fallbackModel2 || undefined;

  if (classification === "normal") {
    return dedupeCandidates([
      { provider: "openrouter", model: defaultOpenRouterModel, label: "default", tier: "low_cost" },
      { provider: "openrouter", model: fallback1, label: "fallback_1", tier: "low_cost" },
      { provider: "openrouter", model: fallback2, label: "fallback_2", tier: "low_cost" },
      { provider: "openai", model: ENV.openAiModel || undefined, label: "direct_openai_fallback", tier: "advanced" },
    ]);
  }

  return dedupeCandidates([
    { provider: "openrouter", model: safetyModel, label: "advanced_openrouter", tier: "advanced" },
    { provider: "openrouter", model: fallback1, label: "fallback_1", tier: "low_cost" },
    { provider: "openrouter", model: fallback2, label: "fallback_2", tier: "low_cost" },
    { provider: "openrouter", model: defaultOpenRouterModel, label: "fallback_openrouter", tier: "low_cost" },
    { provider: "openai", model: ENV.openAiModel || undefined, label: "direct_openai_fallback", tier: "advanced" },
  ]);
}

function planAllowsAdvanced(input: {
  planType?: RunDiagnosisWorkflowInput["planType"];
  safetyCritical: boolean;
  complexOrFaultCode: boolean;
}) {
  if (input.safetyCritical) return true;
  if (input.planType === "pilot" || input.planType === "pilot_access" || input.planType === "pro" || input.planType === "fleet") {
    return input.complexOrFaultCode;
  }
  return false;
}

function buildDynamicDiagnosisModelRoute(input: {
  classification: SafetyComplexity;
  routing: DiagnosticRoutingClassification;
  planType?: RunDiagnosisWorkflowInput["planType"];
  hasApprovedReference: boolean;
}) {
  const config = getDiagnosticRuntimeConfig();
  const isSafety =
    input.routing.case_type === "safety_critical" ||
    input.routing.risk_level === "critical" ||
    input.classification === "safety_critical";
  const isComplexOrFaultCode =
    input.routing.case_type === "complex" ||
    input.routing.case_type === "fault_code" ||
    input.classification === "complex_high_risk";
  const needsAdvanced =
    input.routing.escalation_required ||
    input.routing.recommended_model_tier === "advanced" ||
    isSafety ||
    (isComplexOrFaultCode &&
      (!input.hasApprovedReference ||
        input.routing.confidence_score < config.confidenceThreshold));
  const allowAdvanced = planAllowsAdvanced({
    planType: input.planType,
    safetyCritical: isSafety,
    complexOrFaultCode: isComplexOrFaultCode,
  });

  if (needsAdvanced && allowAdvanced) {
    const advancedModel =
      isSafety ? config.safetyCriticalModel : config.complexFaultCodeModel || config.advancedDiagnosisModel;
    return dedupeCandidates([
      { provider: "openrouter", model: advancedModel, label: "advanced", tier: "advanced" },
      { provider: "openrouter", model: config.fallbackModel1, label: "fallback_1", tier: "low_cost" },
      { provider: "openrouter", model: config.fallbackModel2, label: "fallback_2", tier: "low_cost" },
      { provider: "openrouter", model: config.defaultDiagnosisModel, label: "default", tier: "low_cost" },
      { provider: "openai", model: ENV.openAiModel || undefined, label: "direct_openai_fallback", tier: "advanced" },
    ]);
  }

  const lowCostModel =
    input.routing.needs_clarification && input.routing.confidence_score < config.confidenceThreshold
      ? config.lowCostClarificationModel
      : config.defaultDiagnosisModel;

  return dedupeCandidates([
    { provider: "openrouter", model: lowCostModel, label: "low_cost", tier: "low_cost" },
    { provider: "openrouter", model: config.fallbackModel1, label: "fallback_1", tier: "low_cost" },
    { provider: "openrouter", model: config.fallbackModel2, label: "fallback_2", tier: "low_cost" },
  ]);
}

function extractMessageText(result: InvokeResult) {
  const content = result.choices[0]?.message.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => ("text" in part ? part.text : "")).join("\n");
  }
  return "";
}

function extractJsonObject(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]?.trim().startsWith("{")) return fenced[1].trim();

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

function hasSuccessfulAttempt(result: InvokeResult) {
  return (result.orchestration?.attempts ?? []).some((attempt) => attempt.success);
}

function isControlledFallbackResponse(result: InvokeResult) {
  if (hasSuccessfulAttempt(result)) return false;

  const text = extractMessageText(result);
  return (
    /"status"\s*:\s*"unavailable"/i.test(text) ||
    /ai analysis is temporarily unavailable/i.test(text)
  );
}

function ensureNonEmptyAiText(result: InvokeResult, label: string) {
  const text = extractMessageText(result);
  if (!text.trim()) {
    throw new Error(`Empty AI response returned by ${label}`);
  }
  return text;
}

function aiCallHistoryFromResult(
  callType: AiCallHistoryEntry["callType"],
  result: InvokeResult,
  fallbackUsed: boolean
): AiCallHistoryEntry[] {
  const attempts = result.orchestration?.attempts ?? [];
  if (attempts.length === 0) {
    return [
      {
        callType,
        provider: result.orchestration?.provider ?? null,
        model: result.orchestration?.model ?? result.model ?? null,
        fallbackUsed,
        status: "success",
        promptTokens: result.usage?.prompt_tokens ?? 0,
        completionTokens: result.usage?.completion_tokens ?? 0,
        totalTokens: result.usage?.total_tokens ?? 0,
        estimatedCostUsd: result.orchestration?.estimatedCostUsd ?? null,
        latencyMs: result.orchestration?.latencyMs ?? null,
      },
    ];
  }

  return attempts.map((attempt, index) => ({
    callType,
    provider: attempt.provider,
    model: attempt.model,
    fallbackUsed: fallbackUsed || index > 0,
    status: attempt.success ? "success" : "failed",
    promptTokens: attempt.promptTokens ?? 0,
    completionTokens: attempt.completionTokens ?? 0,
    totalTokens: attempt.totalTokens ?? 0,
    estimatedCostUsd: attempt.estimatedCostUsd ?? null,
    latencyMs: attempt.latencyMs,
    errorMessage: attempt.reason,
  }));
}

function failedCallHistory(input: {
  callType: AiCallHistoryEntry["callType"];
  provider: AiProvider;
  model: string | undefined;
  error: unknown;
}): AiCallHistoryEntry {
  return {
    callType: input.callType,
    provider: input.provider,
    model: input.model ?? null,
    fallbackUsed: true,
    status: "failed",
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: null,
    latencyMs: null,
    errorMessage: errorMessage(input.error),
  };
}

function shouldRetryCandidate(error: unknown) {
  const message = errorMessage(error).toLowerCase();
  return /timed out|aborterror|network|fetch failed|503|502|504|service unavailable/.test(
    message
  );
}

function buildFallbackClarification(input: {
  context: MinimalDiagnosisContext;
  clarificationHistory: DiagnosisClarificationTurn[];
}) {
  const previousQuestions = new Set(
    input.clarificationHistory.map((turn) => normalizeQuestion(turn.question))
  );
  const faultCodeQuestion =
    input.context.user_report.fault_codes.length > 0
      ? [
          {
            id: "fault_code_timing",
            question:
              "Did the fault code appear before the symptom, at the same time, or only after the truck lost power?",
            reason:
              "Code timing helps tell whether the fault is the cause of the symptom or a secondary reaction.",
          },
        ]
      : [];

  return [...faultCodeQuestion, ...FALLBACK_CLARIFICATION_QUESTION_BANK].find(
    (candidate) => !previousQuestions.has(normalizeQuestion(candidate.question))
  );
}

function parseDiagnosisJson(text: string) {
  const parsed = JSON.parse(extractJsonObject(text)) as unknown;
  return diagnosisOutputSchema.parse(parsed);
}

function parseRoutingJson(text: string) {
  const parsed = JSON.parse(extractJsonObject(text)) as unknown;
  return diagnosticRoutingClassificationSchema.parse(parsed);
}

function codeTypeFromPreprocessing(preprocessing: DiagnosticPreprocessingResult) {
  if (preprocessing.detectedPatterns.includes("SPN_FMI")) return "SPN_FMI" as const;
  if (preprocessing.detectedPatterns.includes("MID_PID_SID_FMI")) return "MID_PID_SID_FMI" as const;
  if (preprocessing.detectedPatterns.includes("OBD_DTC")) return "OBD_DTC" as const;
  if (preprocessing.detectedPatterns.includes("ABS")) return "ABS" as const;
  if (preprocessing.detectedPatterns.includes("transmission")) return "transmission" as const;
  if (preprocessing.detectedPatterns.includes("aftertreatment")) return "aftertreatment" as const;
  return preprocessing.normalizedFaultCodes.length > 0 ? "unknown" as const : "none" as const;
}

function localRoutingClassification(input: {
  context: MinimalDiagnosisContext;
  preprocessing: DiagnosticPreprocessingResult;
  referenceMatchStatus: FaultCodeReferenceMatchStatus;
}) {
  const localClassification = classifyDiagnosticIssue({
    symptoms: input.context.user_report.symptoms,
    faultCodes: input.context.user_report.fault_codes,
  });
  const safety = localClassification === "safety_critical";
  const complex = localClassification === "complex_high_risk";
  const hasCode = input.preprocessing.normalizedFaultCodes.length > 0;
  const caseType = safety
    ? "safety_critical"
    : complex
      ? "complex"
      : hasCode || input.preprocessing.referenceLookupRequired
        ? "fault_code"
        : "normal";
  const confidence = safety || complex ? 88 : hasCode ? 76 : 82;

  return diagnosticRoutingClassificationSchema.parse({
    case_type: caseType,
    issue_type:
      hasCode && input.context.user_report.symptoms ? "mixed" : hasCode ? "fault_code" : "symptom_only",
    code_type: codeTypeFromPreprocessing(input.preprocessing),
    risk_level: safety || complex ? "high" : hasCode ? "medium" : "low",
    reference_lookup_required: input.preprocessing.referenceLookupRequired,
    reference_match_quality: input.referenceMatchStatus,
    needs_clarification: confidence < CONFIDENCE_CLARIFICATION_THRESHOLD,
    clarifying_question: "",
    clarification_reason: "",
    confidence_score: confidence,
    recommended_model_tier: safety || complex ? "advanced" : "low_cost",
    escalation_required: safety || complex,
    reason_for_escalation: safety
      ? "Local safety pattern detected."
      : complex
        ? "Local complex high-risk pattern detected."
        : "",
    extracted_fault_codes: input.preprocessing.extractedFaultCodes,
    normalized_symptoms: input.context.user_report.symptoms
      .split(/[.;]+/)
      .map((value) => compactString(value, 80))
      .filter(Boolean),
  });
}

function shouldUseAiClassification(input: {
  preprocessing: DiagnosticPreprocessingResult;
  localClassification: DiagnosticRoutingClassification;
}) {
  if (!openRouterConfigured()) return false;
  if (input.preprocessing.referenceLookupRequired) return true;
  if (input.localClassification.case_type !== "normal") return true;
  if (input.localClassification.confidence_score < CONFIDENCE_CLARIFICATION_THRESHOLD) return true;
  return false;
}

function buildSystemPrompt(input: {
  classification: SafetyComplexity;
  clarificationCount: number;
}) {
  const config = getDiagnosticRuntimeConfig();
  return [
    "You are TruckFixr Fleet AI diagnosing heavy-duty trucks and trailers.",
    "Principle: AI diagnoses. TADIS only provides compact reference context.",
    "Use only the supplied compact context and clarification history. Do not invent full repair quotes.",
    `Ask at most one specific clarifying question when confidence is below ${config.confidenceThreshold} and fewer than ${config.maxClarifications} questions have already been asked.`,
    `After ${config.maxClarifications} clarification questions, produce the best final diagnosis and clearly state uncertainty.`,
    "For safety-critical or complex issues, be cautious and include temporary safety guidance immediately.",
    "Never include labor hours, labor costs, or full repair quotes. Include likely parts only.",
    `Issue classification: ${input.classification}. Clarification questions already asked: ${input.clarificationCount}.`,
    "Return only valid JSON matching the requested contract.",
  ].join("\n");
}

function buildUserPrompt(input: {
  caseId: string;
  vehicleId: string;
  classification: SafetyComplexity;
  routing: DiagnosticRoutingClassification;
  context: MinimalDiagnosisContext;
  clarificationHistory: DiagnosisClarificationTurn[];
}) {
  const config = getDiagnosticRuntimeConfig();
  const compactPromptContext = {
    vehicle: input.context.vehicle,
    user_report: input.context.user_report,
    maintenance_history: input.context.maintenance_history,
    last_daily_inspection: input.context.last_daily_inspection,
    clarification_history: input.context.clarification_history,
    fault_code_reference: input.context.fault_code_reference,
    confirmed_outcome_references: input.context.confirmed_outcome_references ?? [],
  };
  return JSON.stringify({
    required_contract: {
      case_id: input.caseId,
      vehicle_id: input.vehicleId,
      status: "clarification_needed/final",
      issue_summary: "",
      systems_affected: [],
      likely_causes: [
        {
          cause: "",
          likelihood: "high/medium/low",
          probability: 0,
          reasoning: "",
        },
      ],
      confidence_score: 0,
      clarifying_question: "",
      clarification_reason: "",
      recommended_tests: [],
      likely_parts: [],
      safe_to_drive_decision:
        "safe_to_drive/drive_with_caution/stop_and_inspect/tow_or_repair_immediately",
      risk_level: "low/medium/high/critical",
      maintenance_recommendation: "",
      compliance_impact: "none/warning/critical",
      driver_friendly_explanation: "",
      manager_summary: "",
      model_used: "",
      fallback_used: false,
    },
    rules: {
      confidence_threshold_for_question: config.confidenceThreshold,
      max_clarifying_questions: config.maxClarifications,
      if_status_clarification_needed:
        "include one clarifying_question and clarification_reason; do not present a certain final repair recommendation; include temporary safety guidance if needed",
      if_status_final:
        "clarifying_question must be empty; include final tests, safe-to-drive decision, likely parts, and maintenance recommendation",
      safe_to_drive_decision_allowed_values: safeToDriveDecisionSchema.options,
      no_labor_estimates: true,
    },
    issue_classification: input.classification,
    routing_classification: input.routing,
    compact_context: compactPromptContext,
  });
}

function buildRoutingSystemPrompt() {
  return [
    "You are TruckFixr Fleet AI's diagnostic routing classifier for heavy-duty truck and trailer issues.",
    "Classify risk, fault-code complexity, reference lookup needs, clarification needs, and whether a stronger model is justified.",
    "Do not produce a final diagnosis. Return only valid JSON matching the requested contract.",
  ].join("\n");
}

function buildRoutingUserPrompt(input: {
  context: MinimalDiagnosisContext;
  preprocessing: DiagnosticPreprocessingResult;
  referenceLookup: FaultCodeReferenceContext;
  clarificationHistory: DiagnosisClarificationTurn[];
}) {
  const compactPromptContext = {
    vehicle: input.context.vehicle,
    user_report: input.context.user_report,
    maintenance_history: input.context.maintenance_history,
    last_daily_inspection: input.context.last_daily_inspection,
    clarification_history: input.context.clarification_history,
    fault_code_reference: input.context.fault_code_reference,
    confirmed_outcome_references: input.context.confirmed_outcome_references ?? [],
  };
  return JSON.stringify({
    required_contract: {
      case_type: "normal/fault_code/safety_critical/complex",
      issue_type: "symptom_only/fault_code/mixed",
      code_type: "SPN_FMI/MID_PID_SID_FMI/OBD_DTC/ABS/transmission/aftertreatment/unknown/none",
      risk_level: "low/medium/high/critical",
      reference_lookup_required: true,
      reference_match_quality: "approved_match/no_match/needs_review_internal/none",
      needs_clarification: true,
      clarifying_question: "",
      clarification_reason: "",
      confidence_score: 0,
      recommended_model_tier: "low_cost/advanced",
      escalation_required: true,
      reason_for_escalation: "",
      extracted_fault_codes: [],
      normalized_symptoms: [],
    },
    rules: {
      ask_one_question_only: true,
      question_must_reduce_uncertainty: true,
      never_use_generic_more_details_question: true,
      escalate_for_safety_unclear_or_high_risk_codes: true,
      fault_code_reference_status: input.referenceLookup.match_status,
    },
    compact_context: compactPromptContext,
    preprocessing: input.preprocessing,
    reference_lookup_summary: {
      match_status: input.referenceLookup.match_status,
      reference_count: input.referenceLookup.references.length,
    },
    clarification_history: input.clarificationHistory.map((turn) => ({
      question: compactString(turn.question, 180),
      answer: compactString(turn.answer, 180),
    })),
  });
}

async function invokeRoutingClassification(input: {
  context: MinimalDiagnosisContext;
  preprocessing: DiagnosticPreprocessingResult;
  referenceLookup: FaultCodeReferenceContext;
  clarificationHistory: DiagnosisClarificationTurn[];
}) {
  const config = getDiagnosticRuntimeConfig();
  return invokeWithOrchestration({
    feature: "diagnosis_session_classification",
    preferredProvider: "openrouter",
    fallbackProviders: [],
    model: config.defaultClassificationModel,
    messages: [
      { role: "system", content: buildRoutingSystemPrompt() },
      { role: "user", content: buildRoutingUserPrompt(input) },
    ],
    responseFormat: { type: "json_object" },
    maxTokens: Math.min(config.diagnosisMaxTokens, 650),
    timeoutMs: config.timeoutMs,
    temperature: 0,
  });
}

async function invokeDiagnosisCandidate(input: {
  candidate: ModelCandidate;
  caseId: string;
  vehicleId: string;
  classification: SafetyComplexity;
  routing: DiagnosticRoutingClassification;
  context: MinimalDiagnosisContext;
  clarificationHistory: DiagnosisClarificationTurn[];
}) {
  const config = getDiagnosticRuntimeConfig();
  return invokeWithOrchestration({
    feature: "mvp_diagnosis",
    preferredProvider: input.candidate.provider,
    fallbackProviders: [],
    model: input.candidate.model,
    messages: [
      {
        role: "system",
        content: buildSystemPrompt({
          classification: input.classification,
          clarificationCount: input.clarificationHistory.length,
        }),
      },
      {
        role: "user",
        content: buildUserPrompt(input),
      },
    ],
    responseFormat: { type: "json_object" },
    maxTokens: config.diagnosisMaxTokens,
    timeoutMs: config.timeoutMs,
    temperature: input.classification === "normal" ? 0.08 : 0.03,
  });
}

async function repairDiagnosisJson(input: {
  candidate: ModelCandidate;
  rawText: string;
  caseId: string;
  vehicleId: string;
}) {
  const config = getDiagnosticRuntimeConfig();
  return invokeWithOrchestration({
    feature: "mvp_diagnosis_json_repair",
    preferredProvider: openRouterConfigured() ? "openrouter" : input.candidate.provider,
    fallbackProviders: [],
    model: openRouterConfigured() ? config.jsonRepairModel : input.candidate.model,
    messages: [
      {
        role: "system",
        content:
          "Convert the supplied diagnosis into only valid JSON matching the TruckFixr diagnosis contract. Do not add labor estimates.",
      },
      {
        role: "user",
        content: JSON.stringify({
          case_id: input.caseId,
          vehicle_id: input.vehicleId,
          allowed_safe_to_drive_decision_values: safeToDriveDecisionSchema.options,
          raw_text: input.rawText.slice(0, 6_000),
        }),
      },
    ],
    responseFormat: { type: "json_object" },
    maxTokens: Math.min(config.diagnosisMaxTokens, 900),
    timeoutMs: config.timeoutMs,
    temperature: 0,
  });
}

async function repairRoutingJson(input: {
  rawText: string;
  localClassification: DiagnosticRoutingClassification;
}) {
  const config = getDiagnosticRuntimeConfig();
  return invokeWithOrchestration({
    feature: "diagnosis_classification_json_repair",
    preferredProvider: "openrouter",
    fallbackProviders: [],
    model: config.jsonRepairModel,
    messages: [
      {
        role: "system",
        content:
          "Convert the supplied diagnostic routing result into only valid JSON matching the TruckFixr routing contract.",
      },
      {
        role: "user",
        content: JSON.stringify({
          fallback_contract: input.localClassification,
          raw_text: input.rawText.slice(0, 4_000),
        }),
      },
    ],
    responseFormat: { type: "json_object" },
    maxTokens: 650,
    timeoutMs: config.timeoutMs,
    temperature: 0,
  });
}

function enforceDiagnosisRules(input: {
  diagnosis: DiagnosisOutput;
  caseId: string;
  vehicleId: string;
  classification: SafetyComplexity;
  routing: DiagnosticRoutingClassification;
  context: MinimalDiagnosisContext;
  clarificationHistory: DiagnosisClarificationTurn[];
  modelUsed: string;
  fallbackUsed: boolean;
  advancedReviewUsed: boolean;
}) {
  const config = getDiagnosticRuntimeConfig();
  const previousQuestions = new Set(
    input.clarificationHistory.map((turn) => normalizeQuestion(turn.question))
  );
  const question =
    input.diagnosis.clarifying_question.trim() ||
    (input.routing.needs_clarification ? input.routing.clarifying_question.trim() : "");
  const isRepeatedQuestion = question && previousQuestions.has(normalizeQuestion(question));
  const maxClarificationsReached =
    input.clarificationHistory.length >= config.maxClarifications;
  const needsAnotherClarification =
    input.diagnosis.confidence_score < config.confidenceThreshold &&
    !maxClarificationsReached;
  const fallbackClarification =
    needsAnotherClarification && (!question || isRepeatedQuestion)
      ? buildFallbackClarification({
          context: input.context,
          clarificationHistory: input.clarificationHistory,
        })
      : null;
  const resolvedQuestion =
    !isRepeatedQuestion && question ? question : fallbackClarification?.question ?? "";
  const shouldAskQuestion =
    needsAnotherClarification && resolvedQuestion.length > 0;

  const status = shouldAskQuestion ? "clarification_needed" : "final";
  const safeDecision =
    (input.classification === "complex_high_risk" ||
      input.classification === "safety_critical" ||
      input.routing.case_type === "safety_critical" ||
      input.routing.risk_level === "critical") &&
    input.diagnosis.safe_to_drive_decision === "safe_to_drive"
      ? "stop_and_inspect"
      : input.diagnosis.safe_to_drive_decision;
  const riskLevel =
    safeDecision === "tow_or_repair_immediately"
      ? "critical"
      : safeDecision === "stop_and_inspect" && input.diagnosis.risk_level === "low"
        ? "high"
        : input.diagnosis.risk_level;
  const complianceImpact =
    riskLevel === "critical"
      ? "critical"
      : riskLevel === "high" && input.diagnosis.compliance_impact === "none"
        ? "warning"
        : input.diagnosis.compliance_impact;

  return diagnosisOutputSchema.parse({
    ...input.diagnosis,
    case_id: input.caseId,
    vehicle_id: input.vehicleId,
    status,
    clarifying_question: status === "clarification_needed" ? resolvedQuestion : "",
    clarification_reason:
      status === "clarification_needed"
        ? fallbackClarification?.reason ||
          input.diagnosis.clarification_reason ||
          input.routing.clarification_reason
        : "",
    safe_to_drive_decision: safeDecision,
    risk_level: riskLevel,
    compliance_impact: complianceImpact,
    advanced_ai_review_used: input.advancedReviewUsed,
    model_used: input.modelUsed,
    fallback_used: input.fallbackUsed,
  });
}

function buildSafeFallbackDiagnosis(input: {
  caseId: string;
  vehicleId: string;
  classification: SafetyComplexity;
  context: MinimalDiagnosisContext;
  clarificationHistory: DiagnosisClarificationTurn[];
  fallbackUsed: boolean;
  modelUsed: string;
}) {
  const config = getDiagnosticRuntimeConfig();
  const safetyCritical = input.classification !== "normal";
  const canAskForClarification =
    input.clarificationHistory.length < config.maxClarifications &&
    !safetyCritical;
  const fallbackClarification = canAskForClarification
    ? buildFallbackClarification({
        context: input.context,
        clarificationHistory: input.clarificationHistory,
      })
    : null;
  const summary = compactString(input.context.user_report.symptoms, 220);
  const faultCodes = input.context.user_report.fault_codes;
  const status = fallbackClarification ? "clarification_needed" : "final";
  const issueSummary = faultCodes.length > 0
    ? compactString(`${summary || "Diagnostic concern"} with reported code(s): ${faultCodes.join(", ")}`, 260)
    : summary || "Driver reported a diagnostic concern.";
  const recommendedTests = safetyCritical
    ? [
        "Stop operation and have a qualified technician inspect the affected safety-critical system.",
        "Record active and inactive fault codes before clearing anything.",
      ]
    : faultCodes.length > 0
      ? [
          "Record active and inactive fault codes before clearing anything.",
          "Confirm whether the code returns immediately at key-on, idle, or under load.",
          "Inspect wiring, connectors, fluid levels, and obvious leaks around the affected system.",
        ]
      : [
          "Perform a fault-code scan and inspect the system connected to the reported symptom.",
          "Note when the symptom occurs: key-on, idle, loaded, highway speed, braking, or after warm-up.",
        ];

  return diagnosisOutputSchema.parse({
    case_id: input.caseId,
    vehicle_id: input.vehicleId,
    status,
    issue_summary: issueSummary,
    systems_affected: [],
    likely_causes: [
      {
        cause: "Root cause needs technician confirmation",
        likelihood: "medium",
        probability: 45,
        reasoning:
          "TruckFixr could not verify a specific root cause from the available response, so the safest next step is targeted inspection before parts replacement.",
      },
    ],
    confidence_score: 40,
    clarifying_question: fallbackClarification?.question ?? "",
    clarification_reason: fallbackClarification?.reason ?? "",
    recommended_tests: recommendedTests,
    likely_parts: [],
    safe_to_drive_decision: safetyCritical
      ? "stop_and_inspect"
      : "drive_with_caution",
    risk_level: safetyCritical ? "high" : "medium",
    maintenance_recommendation: safetyCritical
      ? "Hold the vehicle for inspection before dispatch."
      : status === "clarification_needed"
        ? "Gather one more operating detail before approving parts replacement."
        : "Schedule inspection before extended use if the symptom continues.",
    compliance_impact: safetyCritical ? "warning" : "none",
    driver_friendly_explanation: safetyCritical
      ? "This may affect safe operation. Stop and inspect before continuing."
      : status === "clarification_needed"
        ? "TruckFixr could not confirm the cause yet. Use caution and answer one focused question."
        : "TruckFixr could not confirm the cause with enough confidence. Use caution until the truck is inspected.",
    manager_summary:
      "TruckFixr could not validate a model diagnosis for this request and returned conservative inspection guidance. Provider details are saved internally.",
    advanced_ai_review_used: false,
    model_used: input.modelUsed,
    fallback_used: input.fallbackUsed,
  });
}

export async function runDiagnosisWorkflow(
  rawInput: RunDiagnosisWorkflowInput
): Promise<RunDiagnosisWorkflowResult> {
  const caseId = rawInput.caseId || randomUUID();
  const vehicleId = rawInput.vehicleId;
  const config = getDiagnosticRuntimeConfig();
  const incomingClarificationHistory = (rawInput.clarificationHistory ?? [])
    .slice(0, config.maxClarifications)
    .map((turn) => clarificationTurnSchema.parse(turn));
  const context = minimalDiagnosisContextSchema.parse({
    ...rawInput.context,
    user_report: {
      symptoms: compactString(rawInput.context.user_report.symptoms, 800),
      fault_codes: normalizeFaultCodes(rawInput.context.user_report.fault_codes),
    },
    maintenance_history: rawInput.context.maintenance_history.slice(0, 3),
    clarification_history: incomingClarificationHistory.map((turn) => ({
      question: compactString(turn.question, 180),
      answer: compactString(turn.answer, 180),
    })),
  });
  const clarificationHistory = incomingClarificationHistory;
  const preprocessing = preprocessDiagnosticInput({
    symptoms: context.user_report.symptoms,
    faultCodes: context.user_report.fault_codes,
  });
  const referenceLookup = preprocessing.referenceLookupRequired
    ? await lookupFaultCodeReferences({
        normalizedFaultCodes: preprocessing.normalizedFaultCodes,
        includeNeedsReview: rawInput.includeInternalReferences,
      })
    : { match_status: "none" as const, references: [] };
  const promptContext = minimalDiagnosisContextSchema.parse({
    ...context,
    fault_code_reference: referenceLookup,
  });
  const localRouting = localRoutingClassification({
    context: promptContext,
    preprocessing,
    referenceMatchStatus: referenceLookup.match_status,
  });
  const aiCallHistory: AiCallHistoryEntry[] = [];
  let routing = localRouting;
  const providerErrors: RunDiagnosisWorkflowResult["providerErrors"] = [];

  const isClarificationRound = clarificationHistory.length > 0;

  if (!isClarificationRound && shouldUseAiClassification({ preprocessing, localClassification: localRouting })) {
    try {
      const rawRouting = await invokeRoutingClassification({
        context: promptContext,
        preprocessing,
        referenceLookup,
        clarificationHistory,
      });
      aiCallHistory.push(
        ...aiCallHistoryFromResult(
          "classifier",
          rawRouting,
          (rawRouting.orchestration?.attempts?.length ?? 0) > 1
        )
      );
      if (isControlledFallbackResponse(rawRouting)) {
        throw new Error("Controlled fallback returned by routing classifier");
      }
      const rawText = ensureNonEmptyAiText(rawRouting, "routing classifier");
      try {
        routing = parseRoutingJson(rawText);
      } catch (parseError) {
        const repaired = await repairRoutingJson({
          rawText,
          localClassification: localRouting,
        });
        aiCallHistory.push(
          ...aiCallHistoryFromResult("classification_repair", repaired, true)
        );
        routing = parseRoutingJson(extractMessageText(repaired));
      }
    } catch (error) {
      providerErrors.push({
        provider: "openrouter",
        model: config.defaultClassificationModel,
        message: errorMessage(error),
      });
      aiCallHistory.push(
        failedCallHistory({
          callType: "classifier",
          provider: "openrouter",
          model: config.defaultClassificationModel,
          error,
        })
      );
      if (
        localRouting.confidence_score < config.confidenceThreshold ||
        localRouting.case_type === "safety_critical"
      ) {
        routing = {
          ...localRouting,
          recommended_model_tier: "advanced",
          escalation_required: true,
          reason_for_escalation:
            localRouting.reason_for_escalation ||
            "Routing classifier unavailable; local routing requires cautious handling.",
        };
      }
    }
  }

  const classification: SafetyComplexity =
    routing.case_type === "safety_critical"
      ? "safety_critical"
      : routing.case_type === "complex"
        ? "complex_high_risk"
        : classifyDiagnosticIssue({
            symptoms: promptContext.user_report.symptoms,
            faultCodes: promptContext.user_report.fault_codes,
          });
  const route = buildDynamicDiagnosisModelRoute({
    classification,
    routing,
    planType: rawInput.planType,
    hasApprovedReference: referenceLookup.match_status === "approved_match",
  });

  if (route.length === 0) {
    return {
      diagnosis: buildSafeFallbackDiagnosis({
        caseId,
        vehicleId,
        classification,
        context: promptContext,
        clarificationHistory,
        fallbackUsed: true,
        modelUsed: "unconfigured",
      }),
      classification,
      routing,
      preprocessing,
      referenceLookup,
      aiCallHistory: [
        ...aiCallHistory,
        {
          callType: "fallback",
          provider: null,
          model: "unconfigured",
          fallbackUsed: true,
          status: "fallback",
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          estimatedCostUsd: null,
          latencyMs: null,
        },
      ],
      promptContext,
      providerErrors,
    };
  }

  for (let candidateIndex = 0; candidateIndex < route.length; candidateIndex += 1) {
    const candidate = route[candidateIndex];
    const attempts = candidateIndex === 0 ? PRIMARY_PROVIDER_MAX_ATTEMPTS : 1;

    for (let attemptIndex = 0; attemptIndex < attempts; attemptIndex += 1) {
      try {
        const raw = await invokeDiagnosisCandidate({
          candidate,
          caseId,
          vehicleId,
          classification,
          routing,
          context: promptContext,
          clarificationHistory,
        });
        aiCallHistory.push(
          ...aiCallHistoryFromResult(
            clarificationHistory.length > 0 && routing.needs_clarification
              ? "clarification"
              : "diagnosis",
            raw,
            candidateIndex > 0 ||
              attemptIndex > 0 ||
              (raw.orchestration?.attempts?.length ?? 0) > 1
          )
        );
        if (isControlledFallbackResponse(raw)) {
          throw new Error(
            `Controlled fallback returned by ${candidate.provider}:${candidate.model ?? candidate.label}`
          );
        }
        const rawText = ensureNonEmptyAiText(
          raw,
          `${candidate.provider}:${candidate.model ?? candidate.label}`
        );
        let parsed: DiagnosisOutput;
        let fallbackUsed =
          candidateIndex > 0 ||
          attemptIndex > 0 ||
          (raw.orchestration?.attempts?.length ?? 0) > 1;
        let modelUsed = raw.orchestration?.model ?? raw.model ?? candidate.model ?? candidate.label;

        try {
          parsed = parseDiagnosisJson(rawText);
        } catch (parseError) {
          const repaired = await repairDiagnosisJson({
            candidate,
            rawText,
            caseId,
            vehicleId,
          });
          aiCallHistory.push(
            ...aiCallHistoryFromResult("json_repair", repaired, true)
          );
          if (isControlledFallbackResponse(repaired)) {
            throw new Error(
              `Controlled fallback returned during JSON repair by ${candidate.provider}:${candidate.model ?? candidate.label}`
            );
          }
          parsed = parseDiagnosisJson(extractMessageText(repaired));
          fallbackUsed = true;
          modelUsed = repaired.orchestration?.model ?? repaired.model ?? modelUsed;
        }

        return {
          diagnosis: enforceDiagnosisRules({
            diagnosis: parsed,
            caseId,
            vehicleId,
            classification,
            routing,
            context: promptContext,
            clarificationHistory,
            modelUsed,
            fallbackUsed,
            advancedReviewUsed: candidate.tier === "advanced",
          }),
          classification,
          routing,
          preprocessing,
          referenceLookup,
          aiCallHistory,
          promptContext,
          providerErrors,
        };
      } catch (error) {
        aiCallHistory.push(
          failedCallHistory({
            callType:
              clarificationHistory.length > 0 && routing.needs_clarification
                ? "clarification"
                : "diagnosis",
            provider: candidate.provider,
            model: candidate.model,
            error,
          })
        );
        providerErrors.push({
          provider: candidate.provider,
          model: candidate.model ?? candidate.label,
          message: errorMessage(error),
        });
        if (!shouldRetryCandidate(error)) {
          break;
        }
      }
    }
  }

  return {
    diagnosis: buildSafeFallbackDiagnosis({
      caseId,
      vehicleId,
      classification,
      context: promptContext,
      clarificationHistory,
      fallbackUsed: true,
      modelUsed: route[route.length - 1]?.model ?? "fallback_unavailable",
    }),
    classification,
    routing,
    preprocessing,
    referenceLookup,
    aiCallHistory: [
      ...aiCallHistory,
      {
        callType: "fallback",
        provider: route[route.length - 1]?.provider ?? null,
        model: route[route.length - 1]?.model ?? "fallback_unavailable",
        fallbackUsed: true,
        status: "fallback",
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: null,
        latencyMs: null,
      },
    ],
    promptContext,
    providerErrors,
  };
}

export function toLegacyDiagnosisAliases(diagnosis: DiagnosisOutput) {
  return {
    next_action: diagnosis.status === "clarification_needed" ? "ask_question" : "proceed",
    possible_causes: diagnosis.likely_causes.map((cause) => ({
      cause: cause.cause,
      probability: cause.probability,
    })),
    top_most_likely_cause: diagnosis.likely_causes[0]?.cause ?? diagnosis.issue_summary,
    recommended_fix: diagnosis.maintenance_recommendation,
    possible_replacement_parts: diagnosis.likely_parts,
    maintenance_recommendations: diagnosis.maintenance_recommendation
      ? [diagnosis.maintenance_recommendation]
      : [],
    driver_action: diagnosis.safe_to_drive_decision,
    driver_action_reason: diagnosis.driver_friendly_explanation,
    risk_summary: diagnosis.manager_summary,
    question_rationale: diagnosis.clarification_reason,
    confidence_rationale: diagnosis.likely_causes
      .map((cause) => cause.reasoning)
      .filter(Boolean),
    llm_status: "ok" as const,
    fallback_reason: diagnosis.fallback_used ? "Fallback or retry was used for this diagnosis." : null,
  };
}
