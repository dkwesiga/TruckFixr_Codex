import { ENV } from "../_core/env";

const DEFAULT_CONFIDENCE_THRESHOLD = 75;
const DEFAULT_NEW_CAUSE_MIN_CONFIDENCE = 62;
const DEFAULT_TIMEOUT_MS = 35_000;
const DEFAULT_OPENROUTER_MODEL = "xiaomi/mimo-v2-flash";
const MIN_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 60_000;

function parseNumber(rawValue: string, fallback: number) {
  const value = Number(rawValue);
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function resolveOpenRouterModel(rawModel: string) {
  const normalized = rawModel.trim().toLowerCase();
  if (!normalized || normalized === "openrouter/free") {
    return DEFAULT_OPENROUTER_MODEL;
  }

  return rawModel.trim();
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

  return {
    confidenceThreshold,
    newCauseMinConfidence,
    timeoutMs,
    openRouterModel: resolveOpenRouterModel(ENV.openRouterModel),
    openRouterFallbackModel: ENV.openRouterFallbackModel || "",
  };
}

export type DiagnosticRuntimeConfig = ReturnType<typeof getDiagnosticRuntimeConfig>;
