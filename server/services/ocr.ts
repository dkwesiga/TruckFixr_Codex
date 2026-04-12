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

function normalizeOcrText(value: string) {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
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
