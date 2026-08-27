import { invokeWithOrchestration } from "./aiOrchestrator";
import { ENV } from "../_core/env";

type OcrDependency = typeof invokeWithOrchestration;

export type OcrResult = {
  status: "completed" | "fallback" | "skipped";
  textSnippets: string[];
  warning?: string;
};

type ExtractOcrInput = {
  photoUrls: string[];
  invoke?: OcrDependency;
  timeoutMs?: number;
};

type ExtractVinInput = {
  imageDataUrl: string;
  invoke?: OcrDependency;
  timeoutMs?: number;
  /**
   * Client-reported dimensions/byte size of the prepared ROI, for diagnostic logging only —
   * never trusted for any decision-making. The server doesn't decode images itself.
   */
  roiMetadata?: { width?: number; height?: number; byteSize?: number };
};

export type VinOcrFailureCode =
  | "OCR_NO_VIN_FOUND"
  | "OCR_PROVIDER_UNAVAILABLE"
  | "OCR_INVALID_PROVIDER_RESPONSE"
  | "OCR_TIMEOUT";

const VIN_OCR_FAILURE_MESSAGES: Record<VinOcrFailureCode, string> = {
  OCR_NO_VIN_FOUND: "Could not confidently extract a 17-character VIN from this image.",
  OCR_PROVIDER_UNAVAILABLE: "VIN scanning is temporarily unavailable. Try again or enter the VIN manually.",
  OCR_INVALID_PROVIDER_RESPONSE: "VIN scanning is temporarily unavailable. Try again or enter the VIN manually.",
  OCR_TIMEOUT: "VIN scanning took too long. Try again or enter the VIN manually.",
};

/**
 * Structured, non-image VIN OCR diagnostics: which provider/model actually handled the call,
 * the full attempt sequence (including why each was skipped/failed), whether the response was
 * real model output or the orchestrator's own synthetic fallback, the ROI size the client
 * reported preparing, the model's raw/parsed response, and how TruckFixr's own extraction
 * interpreted it. Gated behind ENV.enableVinOcrDiagnostics (opt-in, off by default) — never
 * logs the image itself.
 */
function logVinOcrDiagnostics(data: {
  provider?: string;
  model?: string;
  latencyMs?: number;
  attempts?: Array<{ provider: string; model: string; success: boolean; reason?: string }>;
  syntheticFallback?: boolean;
  roiWidth?: number;
  roiHeight?: number;
  roiByteSize?: number;
  rawModelResponse?: string;
  parsedVinCandidate?: string;
  parsedRawText?: string;
  normalizedVin?: string;
  code?: VinOcrFailureCode;
  fallbackReason?: string;
}) {
  if (!ENV.enableVinOcrDiagnostics) return;
  // eslint-disable-next-line no-console
  console.info("[VIN OCR diagnostics]", data);
}

function normalizeOcrText(value: string) {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
}

function normalizeVinCandidate(value: string) {
  const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!cleaned) return "";

  const normalized = cleaned
    .replace(/[OQ]/g, "0")
    .replace(/I/g, "1");

  return normalized;
}

function extractCandidateVin(rawText: string) {
  const normalized = normalizeVinCandidate(rawText);
  if (normalized.length < 17) return "";

  for (let index = 0; index <= normalized.length - 17; index += 1) {
    const slice = normalized.slice(index, index + 17);
    if (/^[A-HJ-NPR-Z0-9]{17}$/.test(slice)) {
      return slice;
    }
  }

  return "";
}

export async function extractPhotoEvidenceText(
  input: ExtractOcrInput
): Promise<OcrResult> {
  if (!input.photoUrls.length) {
    return {
      status: "skipped",
      textSnippets: [],
    };
  }

  const invoke = input.invoke ?? invokeWithOrchestration;

  try {
    const result = await invoke({
      feature: "ocr_photo_text",
      preferredProvider: "openrouter",
      fallbackProviders: ["openai", "gemini"],
      timeoutMs: input.timeoutMs ?? 10_000,
      maxTokens: 300,
      responseFormat: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You extract only visible text or warning labels from truck photos. Return strict JSON with {\"textSnippets\": string[]}. If no text is visible, return an empty array.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Extract dashboard, placard, or warning text from these images." },
            ...input.photoUrls.map((url) => ({
              type: "image_url" as const,
              image_url: {
                url,
                detail: "low" as const,
              },
            })),
          ],
        },
      ],
    });

    const rawContent = result.choices[0]?.message.content;
    const textContent = typeof rawContent === "string"
      ? rawContent
      : rawContent
          ?.filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("\n") ?? "";

    const parsed = JSON.parse(textContent) as { textSnippets?: unknown };
    const textSnippets = Array.isArray(parsed.textSnippets)
      ? parsed.textSnippets
          .map((value) => (typeof value === "string" ? normalizeOcrText(value) : ""))
          .filter(Boolean)
      : [];

    return {
      status: "completed",
      textSnippets,
    };
  } catch (error) {
    return {
      status: "fallback",
      textSnippets: [],
      warning:
        error instanceof Error
          ? `OCR unavailable, continuing without extracted text: ${error.message}`
          : "OCR unavailable, continuing without extracted text.",
    };
  }
}

export async function extractVinFromImage(
  input: ExtractVinInput
): Promise<{
  status: "completed" | "fallback";
  vin?: string;
  rawText?: string;
  warning?: string;
  code?: VinOcrFailureCode;
}> {
  const invoke = input.invoke ?? invokeWithOrchestration;

  try {
    const result = await invoke({
      feature: "ocr_vin",
      // Groq's Qwen3.6-27B is the primary VIN OCR vision model (free tier, during pilot).
      // GROQ_VISION_MODEL is deliberately separate from GROQ_MODEL (the text-only model used
      // by unrelated diagnosis/classification features) so this never changes their behavior.
      // OpenRouter only becomes eligible once OPENROUTER_VISION_MODEL pins a real multimodal
      // model (see aiOrchestrator.ts isImageCapableModel) — until then it's a harmless no-op
      // in the chain. OpenAI remains the last real fallback.
      preferredProvider: "groq",
      model: ENV.groqVisionModel,
      fallbackProviders: ["openrouter", "openai"],
      timeoutMs: input.timeoutMs ?? 12_000,
      maxTokens: 200,
      responseFormat: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You extract heavy-duty truck VINs from images. Return strict JSON with {\"vinCandidate\": string, \"rawText\": string}. " +
            "Rules: VINs are exactly 17 alphanumeric characters. " +
            "The VIN never contains the letters I, O, or Q — if you see what looks like one of " +
            "those letters in the VIN, it is always a misread digit: I/l→1, O→0, Q→0. Apply that " +
            "correction. " +
            "B, S, and Z ARE valid, real VIN characters — do not convert them to 8, 5, or 2. " +
            "Transcribe each character exactly as it visually appears; only report a character " +
            "you are reasonably confident about. If a character is genuinely illegible, keep your " +
            "best single guess in vinCandidate but note the uncertainty in rawText. " +
            "In vinCandidate return only the 17 characters with no spaces or dashes. " +
            "In rawText preserve exactly what you see in the image, including any uncertainty.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract the 17-character VIN from this vehicle image. The VIN label is usually on a metal plate on the door jamb, dashboard, or frame. Return only the single best VIN candidate.",
            },
            {
              type: "image_url" as const,
              image_url: {
                url: input.imageDataUrl,
                detail: "high" as const,
              },
            },
          ],
        },
      ],
    });

    const rawContent = result.choices[0]?.message.content;
    const textContent = typeof rawContent === "string"
      ? rawContent
      : rawContent
          ?.filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("\n") ?? "";

    const attempts = result.orchestration?.attempts;
    // invokeWithOrchestration always populates `attempts` (with at least one entry) in
    // production, whether a provider succeeded or every provider was skipped/failed. Treat a
    // completely absent `attempts` field (rather than an empty/all-failed one) as "no
    // orchestration info available" and proceed normally, so callers/tests that construct a
    // response without that bookkeeping aren't misclassified as a provider outage.
    const anyProviderSucceeded = attempts === undefined ? true : attempts.some((attempt) => attempt.success);
    const diagnosticsBase = {
      provider: result.orchestration?.provider,
      model: result.orchestration?.model,
      latencyMs: result.orchestration?.latencyMs,
      attempts: (attempts ?? []).map((attempt) => ({
        provider: attempt.provider,
        model: attempt.model,
        success: attempt.success,
        reason: attempt.reason,
      })),
      roiWidth: input.roiMetadata?.width,
      roiHeight: input.roiMetadata?.height,
      roiByteSize: input.roiMetadata?.byteSize,
      rawModelResponse: textContent.slice(0, 500),
    };

    // Every configured provider was skipped or failed — invokeWithOrchestration still returns
    // a well-formed response (its own synthetic "unavailable" placeholder) rather than
    // throwing. Without this check, that placeholder gets parsed as if it were a genuine
    // (empty) OCR read and reported as "no VIN found," silently masking a total provider
    // outage as an image-quality problem.
    if (!anyProviderSucceeded) {
      logVinOcrDiagnostics({
        ...diagnosticsBase,
        syntheticFallback: true,
        code: "OCR_PROVIDER_UNAVAILABLE",
        fallbackReason: attempts?.[attempts.length - 1]?.reason ?? "no_provider_attempted",
      });
      return {
        status: "fallback",
        code: "OCR_PROVIDER_UNAVAILABLE",
        warning: VIN_OCR_FAILURE_MESSAGES.OCR_PROVIDER_UNAVAILABLE,
      };
    }

    let parsed: { vinCandidate?: unknown; rawText?: unknown };
    try {
      parsed = JSON.parse(textContent);
    } catch {
      logVinOcrDiagnostics({
        ...diagnosticsBase,
        syntheticFallback: false,
        code: "OCR_INVALID_PROVIDER_RESPONSE",
        fallbackReason: "response_not_valid_json",
      });
      return {
        status: "fallback",
        code: "OCR_INVALID_PROVIDER_RESPONSE",
        warning: VIN_OCR_FAILURE_MESSAGES.OCR_INVALID_PROVIDER_RESPONSE,
      };
    }

    const hasExpectedShape =
      parsed !== null && typeof parsed === "object" && ("vinCandidate" in parsed || "rawText" in parsed);

    if (!hasExpectedShape) {
      logVinOcrDiagnostics({
        ...diagnosticsBase,
        syntheticFallback: false,
        code: "OCR_INVALID_PROVIDER_RESPONSE",
        fallbackReason: "response_missing_expected_fields",
      });
      return {
        status: "fallback",
        code: "OCR_INVALID_PROVIDER_RESPONSE",
        warning: VIN_OCR_FAILURE_MESSAGES.OCR_INVALID_PROVIDER_RESPONSE,
      };
    }

    const rawText = typeof parsed.rawText === "string" ? normalizeOcrText(parsed.rawText) : "";

    // The model returns two fields: its "corrected" vinCandidate and a verbatim rawText
    // transcription. Prefer vinCandidate, but if it's malformed (stray character, wrong
    // length, punctuation it forgot to strip) fall back to searching the verbatim rawText —
    // it's common for the raw transcription to contain a clean 17-char run even when the
    // model's own "cleaned up" candidate field doesn't.
    const vinCandidateRaw = typeof parsed.vinCandidate === "string" ? parsed.vinCandidate : "";
    const vin = extractCandidateVin(vinCandidateRaw) || extractCandidateVin(rawText);

    logVinOcrDiagnostics({
      ...diagnosticsBase,
      syntheticFallback: false,
      parsedVinCandidate: vinCandidateRaw,
      parsedRawText: rawText,
      normalizedVin: vin || undefined,
      code: vin ? undefined : "OCR_NO_VIN_FOUND",
      fallbackReason: vin ? undefined : "no_valid_17char_candidate",
    });

    if (!vin) {
      return {
        status: "fallback",
        rawText,
        code: "OCR_NO_VIN_FOUND",
        warning: VIN_OCR_FAILURE_MESSAGES.OCR_NO_VIN_FOUND,
      };
    }

    return {
      status: "completed",
      vin,
      rawText,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code: VinOcrFailureCode = /timed out|aborterror/i.test(message) ? "OCR_TIMEOUT" : "OCR_PROVIDER_UNAVAILABLE";
    logVinOcrDiagnostics({
      roiWidth: input.roiMetadata?.width,
      roiHeight: input.roiMetadata?.height,
      roiByteSize: input.roiMetadata?.byteSize,
      code,
      fallbackReason: message,
    });
    return {
      status: "fallback",
      code,
      warning: `${VIN_OCR_FAILURE_MESSAGES[code]} (${message})`,
    };
  }
}
