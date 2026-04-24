import { ENV } from "../_core/env";

const DEFAULT_CONFIDENCE_THRESHOLD = 85;
const DEFAULT_NEW_CAUSE_MIN_CONFIDENCE = 62;
const DEFAULT_TIMEOUT_MS = 35_000;
const DEFAULT_OPENROUTER_MODEL = "openrouter/free";
const DEFAULT_OPENROUTER_FALLBACK_MODEL = "openrouter/free";
const DEFAULT_RETRY_COUNT = 2;
const DEFAULT_INTAKE_MAX_TOKENS = 320;
const DEFAULT_REVIEW_MAX_TOKENS = 380;
const MIN_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 60_000;
const MIN_RETRY_COUNT = 1;
const MAX_RETRY_COUNT = 3;
const MIN_LLM_MAX_TOKENS = 180;
const MAX_LLM_MAX_TOKENS = 2_000;

function parseNumber(rawValue: string, fallback: number) {
  const value = Number(rawValue);
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function resolveOpenRouterModel(rawModel: string) {
  const normalized = rawModel.trim().toLowerCase();
  if (!normalized) {
    return DEFAULT_OPENROUTER_MODEL;
  }

  return rawModel.trim();
}

function resolveOpenRouterFallbackModel(rawModel: string) {
  const normalized = rawModel.trim();
  if (!normalized) {
    return DEFAULT_OPENROUTER_FALLBACK_MODEL;
  }

  return normalized;
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
    Math.round(parseNumber(process.env.DIAGNOSTIC_LLM_RETRY_COUNT ?? "", DEFAULT_RETRY_COUNT)),
    MIN_RETRY_COUNT,
    MAX_RETRY_COUNT
  );
  const intakeMaxTokens = clamp(
    Math.round(
      parseNumber(process.env.DIAGNOSTIC_INTAKE_MAX_TOKENS ?? "", DEFAULT_INTAKE_MAX_TOKENS)
    ),
    MIN_LLM_MAX_TOKENS,
    MAX_LLM_MAX_TOKENS
  );
  const reviewMaxTokens = clamp(
    Math.round(
      parseNumber(process.env.DIAGNOSTIC_REVIEW_MAX_TOKENS ?? "", DEFAULT_REVIEW_MAX_TOKENS)
    ),
    MIN_LLM_MAX_TOKENS,
    MAX_LLM_MAX_TOKENS
  );

  return {
    confidenceThreshold,
    newCauseMinConfidence,
    timeoutMs,
    retryCount,
    intakeMaxTokens,
    reviewMaxTokens,
    openRouterModel: resolveOpenRouterModel(ENV.openRouterModel),
    openRouterFallbackModel: resolveOpenRouterFallbackModel(ENV.openRouterFallbackModel),
  };
}

export type DiagnosticRuntimeConfig = ReturnType<typeof getDiagnosticRuntimeConfig>;
