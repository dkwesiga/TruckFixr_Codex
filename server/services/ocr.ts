import { invokeWithOrchestration } from "./aiOrchestrator";

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
};

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

// ISO 3779 / SAE J853 check-digit weights and letter transliteration, used
// by North American VINs (position 9, 0-indexed 8) to catch OCR misreads.
const VIN_CHECK_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
const VIN_TRANSLITERATION: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};

function vinCheckDigit(vin: string): string | null {
  if (vin.length !== 17) return null;
  let sum = 0;
  for (let index = 0; index < 17; index += 1) {
    const char = vin[index];
    const value = /[0-9]/.test(char) ? Number(char) : VIN_TRANSLITERATION[char];
    if (value === undefined) return null;
    sum += value * VIN_CHECK_WEIGHTS[index];
  }
  const remainder = sum % 11;
  return remainder === 10 ? "X" : String(remainder);
}

export function isValidVinChecksum(vin: string): boolean {
  const expected = vinCheckDigit(vin);
  return expected !== null && expected === vin[8];
}

// Characters commonly confused by OCR that never both appear as the
// "correct" reading in the same slot — tried one at a time to see if
// flipping a single character resolves the checksum.
const VIN_OCR_CONFUSABLES: Record<string, string> = {
  "8": "B", B: "8",
  "5": "S", S: "5",
  "2": "Z", Z: "2",
  "6": "G", G: "6",
};

// If the raw candidate fails the checksum, try flipping exactly one
// commonly-confused character to see if that's the single misread that
// broke it. Only applies the fix when it's unambiguous (exactly one
// single-character flip yields a valid checksum).
function correctVinChecksum(vin: string): string | null {
  const corrections: string[] = [];
  for (let index = 0; index < vin.length; index += 1) {
    const alt = VIN_OCR_CONFUSABLES[vin[index]];
    if (!alt) continue;
    const candidate = vin.slice(0, index) + alt + vin.slice(index + 1);
    if (isValidVinChecksum(candidate)) {
      corrections.push(candidate);
    }
  }
  return corrections.length === 1 ? corrections[0] : null;
}

function extractCandidateVin(rawText: string) {
  const normalized = normalizeVinCandidate(rawText);
  if (normalized.length < 17) return "";

  const candidates: string[] = [];
  for (let index = 0; index <= normalized.length - 17; index += 1) {
    const slice = normalized.slice(index, index + 17);
    if (/^[A-HJ-NPR-Z0-9]{17}$/.test(slice)) {
      candidates.push(slice);
    }
  }

  if (!candidates.length) return "";

  // Prefer a window whose check digit already validates; otherwise fall
  // back to the first well-formed window, as before.
  return candidates.find(isValidVinChecksum) ?? candidates[0];
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
}> {
  const invoke = input.invoke ?? invokeWithOrchestration;

  try {
    const result = await invoke({
      feature: "ocr_vin",
      preferredProvider: "openrouter",
      fallbackProviders: ["openai", "gemini"],
      timeoutMs: input.timeoutMs ?? 12_000,
      maxTokens: 200,
      responseFormat: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You extract heavy-duty truck VINs from images. Return strict JSON with {\"vinCandidate\": string, \"rawText\": string}. " +
            "Rules: VINs are exactly 17 alphanumeric characters. " +
            "Common OCR errors to correct: O→0, Q→0, I→1, l→1, B→8, S→5, Z→2. " +
            "The VIN never contains letters I, O, or Q. " +
            "In vinCandidate return only the 17 corrected characters with no spaces or dashes. " +
            "In rawText preserve exactly what you see in the image.",
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

    const parsed = JSON.parse(textContent) as {
      vinCandidate?: unknown;
      rawText?: unknown;
    };

    const vin = extractCandidateVin(typeof parsed.vinCandidate === "string" ? parsed.vinCandidate : "");
    const rawText = typeof parsed.rawText === "string" ? normalizeOcrText(parsed.rawText) : "";

    if (!vin) {
      return {
        status: "fallback",
        rawText,
        warning: "Could not confidently extract a 17-character VIN from this image.",
      };
    }

    if (isValidVinChecksum(vin)) {
      return {
        status: "completed",
        vin,
        rawText,
      };
    }

    // The check digit doesn't match. A single flip of a commonly-misread
    // character (8/B, 5/S, ...) landing on a valid checksum is only a
    // guess at which character OCR got wrong — not proof, since the
    // real misread could be a different character entirely. So we never
    // apply it silently; we surface it as a suggestion and let the user
    // confirm against the plate before decoding.
    const corrected = correctVinChecksum(vin);

    return {
      status: "completed",
      vin,
      rawText,
      warning: corrected
        ? `This VIN's check digit doesn't match — did you mean ${corrected}? Double-check it against the plate before decoding.`
        : "This VIN's check digit doesn't match — double-check it against the plate before decoding.",
    };
  } catch (error) {
    return {
      status: "fallback",
      warning:
        error instanceof Error
          ? `OCR unavailable for VIN capture: ${error.message}`
          : "OCR unavailable for VIN capture.",
    };
  }
}
