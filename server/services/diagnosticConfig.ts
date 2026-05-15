import { ENV } from "../_core/env";

const DEFAULT_CONFIDENCE_THRESHOLD = 80;
const DEFAULT_NEW_CAUSE_MIN_CONFIDENCE = 62;
const DEFAULT_TIMEOUT_MS = 35_000;
const DEFAULT_OPENROUTER_MODEL = "deepseek/deepseek-v4-flash";
const DEFAULT_OPENROUTER_FALLBACK_MODEL = "google/gemini-2.5-flash";
const DEFAULT_SIMPLE_OPENROUTER_MODEL = "deepseek/deepseek-v4-flash";
const DEFAULT_SIMPLE_OPENROUTER_FALLBACK_MODEL = "google/gemini-2.5-flash";
const DEFAULT_RETRY_COUNT = 2;
const DEFAULT_INTAKE_MAX_TOKENS = 320;
const DEFAULT_REVIEW_MAX_TOKENS = 380;
const DEFAULT_DIAGNOSIS_MAX_TOKENS = 900;
const DEFAULT_NORMAL_DIAGNOSIS_MODEL = "deepseek/deepseek-v4-flash";
const DEFAULT_ADVANCED_DIAGNOSIS_MODEL = "openai/gpt-4.1-mini";
const DEFAULT_SAFETY_CRITICAL_MODEL = "openai/gpt-4.1-mini";
const DEFAULT_COMPLEX_FAULT_CODE_MODEL = "google/gemini-2.5-flash";
const DEFAULT_JSON_REPAIR_MODEL = "openai/gpt-4.1-mini";
const DEFAULT_FALLBACK_MODEL_2 = "openai/gpt-4.1-mini";
const MIN_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 60_000;
const MIN_RETRY_COUNT = 1;
const MAX_RETRY_COUNT = 3;
const MIN_LLM_MAX_TOKENS = 180;
const MAX_LLM_MAX_TOKENS = 2_000;

function isGenericOpenRouterPool(model: string) {
  return /^openrouter\/free$/i.test(model.trim());
}

function isOpenAiFamilyModel(model: string) {
  const normalized = model.trim().toLowerCase();
  return (
    normalized.startsWith("openai/") ||
    normalized.startsWith("gpt-") ||
    normalized.startsWith("o1") ||
    normalized.startsWith("o3") ||
    normalized.startsWith("o4")
  );
}

function parseNumber(rawValue: string, fallback: number) {
  if (!rawValue.trim()) return fallback;
  const value = Number(rawValue);
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function resolveOpenRouterModel(rawModel: string, simpleMode: boolean) {
  const normalized = rawModel.trim().toLowerCase();
  if (!normalized) {
    return simpleMode ? DEFAULT_SIMPLE_OPENROUTER_MODEL : DEFAULT_OPENROUTER_MODEL;
  }

  if (isGenericOpenRouterPool(normalized) || isOpenAiFamilyModel(normalized)) {
    return simpleMode ? DEFAULT_SIMPLE_OPENROUTER_MODEL : DEFAULT_OPENROUTER_MODEL;
  }

  return rawModel.trim();
}

function resolveOpenRouterFallbackModel(rawModel: string, simpleMode: boolean) {
  const normalized = rawModel.trim();
  if (!normalized) {
    return simpleMode ? DEFAULT_SIMPLE_OPENROUTER_FALLBACK_MODEL : DEFAULT_OPENROUTER_FALLBACK_MODEL;
  }

  if (isGenericOpenRouterPool(normalized) || isOpenAiFamilyModel(normalized)) {
    return simpleMode ? DEFAULT_SIMPLE_OPENROUTER_FALLBACK_MODEL : DEFAULT_OPENROUTER_FALLBACK_MODEL;
  }

  return normalized;
}

function resolveOpenRouterNamespacedModel(rawModel: string) {
  const normalized = rawModel.trim();
  if (!normalized) return "";
  if (normalized.includes("/")) return normalized;

  if (/^(gpt-|o[134])/.test(normalized.toLowerCase())) {
    return `openai/${normalized}`;
  }

  if (/^gemini-/i.test(normalized)) {
    return `google/${normalized}`;
  }

  if (/^deepseek-/i.test(normalized)) {
    return `deepseek/${normalized}`;
  }

  return normalized;
}

function shouldForceSimpleTadisMode(explicitFlag: string | undefined) {
  return /^true$/i.test(explicitFlag ?? "");
}

function readBooleanFlag(rawValue: string | undefined) {
  return /^true$/i.test(rawValue ?? "");
}

export function getDiagnosticRuntimeConfig() {
  const confidenceThreshold = clamp(
    parseNumber(ENV.diagnosticConfidenceThreshold, DEFAULT_CONFIDENCE_THRESHOLD),
    0,
    100
  );
  const newCauseMinConfidence = clamp(
    parseNumber(ENV.diagnosticNewCauseMinConfidence, DEFAULT_NEW_CAUSE_MIN_CONFIDENCE),
    0,
    100
  );
  const timeoutMs = clamp(
    parseNumber(ENV.diagnosticTimeoutMs, DEFAULT_TIMEOUT_MS),
    MIN_TIMEOUT_MS,
    MAX_TIMEOUT_MS
  );
  const retryCount = clamp(
    Math.round(parseNumber(ENV.diagnosticLlmRetryCount, DEFAULT_RETRY_COUNT)),
    MIN_RETRY_COUNT,
    MAX_RETRY_COUNT
  );
  const intakeMaxTokens = clamp(
    Math.round(parseNumber(ENV.diagnosticIntakeMaxTokens, DEFAULT_INTAKE_MAX_TOKENS)),
    MIN_LLM_MAX_TOKENS,
    MAX_LLM_MAX_TOKENS
  );
  const reviewMaxTokens = clamp(
    Math.round(parseNumber(ENV.diagnosticReviewMaxTokens, DEFAULT_REVIEW_MAX_TOKENS)),
    MIN_LLM_MAX_TOKENS,
    MAX_LLM_MAX_TOKENS
  );
  const rawOpenRouterModel = resolveOpenRouterModel(ENV.openRouterModel, false);
  const rawOpenRouterFallbackModel = resolveOpenRouterFallbackModel(ENV.openRouterFallbackModel, false);
  const openRouterOpenAiModel = resolveOpenRouterNamespacedModel(ENV.openAiModel);
  const openRouterGeminiModel = resolveOpenRouterNamespacedModel(ENV.geminiModel);
  const simpleTadisMode = shouldForceSimpleTadisMode(
    ENV.simpleTadisMode
  );

  return {
    confidenceThreshold,
    newCauseMinConfidence,
    timeoutMs,
    retryCount,
    simpleTadisMode,
    intakeMaxTokens,
    reviewMaxTokens,
    openRouterModel: simpleTadisMode ? DEFAULT_SIMPLE_OPENROUTER_MODEL : rawOpenRouterModel,
    openRouterFallbackModel: simpleTadisMode
      ? DEFAULT_SIMPLE_OPENROUTER_FALLBACK_MODEL
      : rawOpenRouterFallbackModel,
    diagnosisMaxTokens: clamp(
      Math.round(parseNumber(ENV.diagnosisMaxTokens, DEFAULT_DIAGNOSIS_MAX_TOKENS)),
      MIN_LLM_MAX_TOKENS,
      MAX_LLM_MAX_TOKENS
    ),
    defaultDiagnosisModel:
      ENV.defaultDiagnosisModel ||
      ENV.openRouterModel ||
      DEFAULT_NORMAL_DIAGNOSIS_MODEL,
    defaultClassificationModel:
      ENV.defaultClassificationModel ||
      ENV.defaultDiagnosisModel ||
      ENV.openRouterModel ||
      DEFAULT_NORMAL_DIAGNOSIS_MODEL,
    lowCostClarificationModel:
      ENV.lowCostClarificationModel ||
      ENV.defaultDiagnosisModel ||
      ENV.openRouterModel ||
      DEFAULT_NORMAL_DIAGNOSIS_MODEL,
    advancedDiagnosisModel:
      ENV.advancedDiagnosisModel ||
      openRouterOpenAiModel ||
      DEFAULT_ADVANCED_DIAGNOSIS_MODEL,
    safetyCriticalModel:
      ENV.safetyCriticalModel ||
      ENV.advancedDiagnosisModel ||
      openRouterOpenAiModel ||
      DEFAULT_SAFETY_CRITICAL_MODEL,
    complexFaultCodeModel:
      ENV.complexFaultCodeModel ||
      ENV.advancedDiagnosisModel ||
      ENV.safetyCriticalModel ||
      openRouterGeminiModel ||
      DEFAULT_COMPLEX_FAULT_CODE_MODEL,
    jsonRepairModel:
      ENV.jsonRepairModel ||
      ENV.advancedDiagnosisModel ||
      ENV.safetyCriticalModel ||
      openRouterOpenAiModel ||
      DEFAULT_JSON_REPAIR_MODEL,
    fallbackModel1:
      ENV.fallbackModel1 ||
      ENV.openRouterFallbackModel ||
      DEFAULT_OPENROUTER_FALLBACK_MODEL,
    fallbackModel2:
      ENV.fallbackModel2 ||
      openRouterOpenAiModel ||
      DEFAULT_FALLBACK_MODEL_2,
    adminComparisonModel:
      ENV.adminComparisonModel ||
      ENV.advancedDiagnosisModel ||
      ENV.safetyCriticalModel ||
      DEFAULT_ADVANCED_DIAGNOSIS_MODEL,
    maxClarifications: clamp(
      Math.round(parseNumber(ENV.diagnosticMaxClarifications, 3)),
      1,
      5
    ),
    aiCostCeilingMonthlyUsd: Math.max(
      0,
      parseNumber(ENV.aiCostCeilingMonthlyUsd, 0)
    ),
    diagnosisDisableOpenAi: readBooleanFlag(ENV.diagnosisDisableOpenAi),
    diagnosisDisableGemini: readBooleanFlag(ENV.diagnosisDisableGemini),
    diagnosisDisableAnthropic: readBooleanFlag(ENV.diagnosisDisableAnthropic),
  };
}

export type DiagnosticRuntimeConfig = ReturnType<typeof getDiagnosticRuntimeConfig>;
