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
      preferredProvider: "openai",
      fallbackProviders: ["gemini"],
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
      preferredProvider: "openai",
      fallbackProviders: ["gemini"],
      timeoutMs: input.timeoutMs ?? 12_000,
      maxTokens: 200,
      responseFormat: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You extract heavy-duty truck VINs from images. Return strict JSON with {\"vinCandidate\": string, \"rawText\": string}. VINs are 17 characters. Preserve OCR uncertainty in rawText, but normalize obvious separators in vinCandidate.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Extract the VIN from this vehicle image. Return only one best VIN candidate." },
            {
              type: "image_url" as const,
              image_url: {
                url: input.imageDataUrl,
                detail: "low" as const,
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

    return {
      status: "completed",
      vin,
      rawText,
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
