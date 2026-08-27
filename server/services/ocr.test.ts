import { describe, expect, it } from "vitest";
import { extractPhotoEvidenceText, extractVinFromImage } from "./ocr";

describe("OCR fallback handling", () => {
  it("falls back without blocking diagnostics when OCR fails", async () => {
    const result = await extractPhotoEvidenceText({
      photoUrls: ["data:image/png;base64,abc123"],
      invoke: async () => {
        throw new Error("vision timeout");
      },
    });

    expect(result.status).toBe("fallback");
    expect(result.textSnippets).toEqual([]);
    expect(result.warning).toContain("vision timeout");
  });

  it("extracts and normalizes a VIN candidate from OCR JSON", async () => {
    const result = await extractVinFromImage({
      imageDataUrl: "data:image/png;base64,abc123",
      invoke: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                vinCandidate: "1HTMMAAPO5H1559I3",
                rawText: "1HTMMAAPO5H1559I3",
              }),
            },
          },
        ],
      }),
    });

    expect(result.status).toBe("completed");
    expect(result.vin).toBe("1HTMMAAP05H155913");
  });

  it("falls back to rawText when vinCandidate is malformed but rawText has a clean 17-char run", async () => {
    const result = await extractVinFromImage({
      imageDataUrl: "data:image/png;base64,abc123",
      invoke: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                // vinCandidate is one character short (the model dropped a digit while
                // "cleaning" it up), but rawText's verbatim transcription has the full VIN.
                vinCandidate: "1HTMMAAP05H15591",
                rawText: "1HTMMAAP05H155913",
              }),
            },
          },
        ],
      }),
    });

    expect(result.status).toBe("completed");
    expect(result.vin).toBe("1HTMMAAP05H155913");
  });

  it("does not instruct the model to destructively substitute valid VIN letters B/S/Z", async () => {
    let capturedSystemPrompt = "";
    await extractVinFromImage({
      imageDataUrl: "data:image/png;base64,abc123",
      invoke: async (input) => {
        capturedSystemPrompt =
          input.messages.find((m) => m.role === "system")?.content as string;
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({ vinCandidate: "1HTMMAAP05H155913", rawText: "1HTMMAAP05H155913" }),
              },
            },
          ],
        };
      },
    });

    // B, S, Z are valid VIN characters — the model should not be told to blindly convert
    // them to 8/5/2. I, O, Q are genuinely invalid in a VIN, so correcting those is still fine.
    expect(capturedSystemPrompt).not.toMatch(/B\s*→\s*8/);
    expect(capturedSystemPrompt).not.toMatch(/S\s*→\s*5/);
    expect(capturedSystemPrompt).not.toMatch(/Z\s*→\s*2/);
    expect(capturedSystemPrompt).toContain("valid, real VIN characters");
    expect(capturedSystemPrompt).toMatch(/I\/l\s*→\s*1/);
  });

  it("returns a fallback warning when OCR cannot find a full VIN", async () => {
    const result = await extractVinFromImage({
      imageDataUrl: "data:image/png;base64,abc123",
      invoke: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                vinCandidate: "TOO-SHORT",
                rawText: "TOO-SHORT",
              }),
            },
          },
        ],
      }),
    });

    expect(result.status).toBe("fallback");
    expect(result.code).toBe("OCR_NO_VIN_FOUND");
    expect(result.warning).toContain("Could not confidently extract");
  });
});

// Regression coverage for the production bug where a total provider outage was silently
// reported as "no VIN found": invokeWithOrchestration doesn't throw when every configured
// provider is skipped/fails — it returns its own synthetic "unavailable" placeholder, which
// happens to be valid JSON and was being parsed as if it were a genuine (empty) OCR read.
describe("VIN OCR failure taxonomy", () => {
  it("Test A: accepts a valid OCR response as a genuine completed read", async () => {
    const result = await extractVinFromImage({
      imageDataUrl: "data:image/png;base64,abc123",
      invoke: async () => ({
        orchestration: {
          provider: "openai",
          model: "gpt-4.1-mini",
          latencyMs: 500,
          estimatedCostUsd: 0.001,
          attempts: [{ provider: "openai", model: "gpt-4.1-mini", latencyMs: 500, success: true }],
        },
        choices: [
          {
            message: {
              content: JSON.stringify({ vinCandidate: "1HTMMAAP05H155913", rawText: "1HTMMAAP05H155913" }),
            },
          },
        ],
      }),
    });

    expect(result.status).toBe("completed");
    expect(result.vin).toBe("1HTMMAAP05H155913");
  });

  it("Test B: recovers a VIN present only in rawText when a provider genuinely succeeded", async () => {
    const result = await extractVinFromImage({
      imageDataUrl: "data:image/png;base64,abc123",
      invoke: async () => ({
        orchestration: {
          provider: "openai",
          model: "gpt-4.1-mini",
          latencyMs: 500,
          estimatedCostUsd: 0.001,
          attempts: [{ provider: "openai", model: "gpt-4.1-mini", latencyMs: 500, success: true }],
        },
        choices: [
          {
            message: {
              content: JSON.stringify({ vinCandidate: "", rawText: "1HTMMAAP05H155913" }),
            },
          },
        ],
      }),
    });

    expect(result.status).toBe("completed");
    expect(result.vin).toBe("1HTMMAAP05H155913");
  });

  it("Test C: a generic diagnosis-style fallback with zero successful attempts is a provider failure, not \"no VIN found\"", async () => {
    const result = await extractVinFromImage({
      imageDataUrl: "data:image/png;base64,abc123",
      invoke: async () => ({
        orchestration: {
          provider: "gemini",
          model: "gemini-2.5-flash",
          latencyMs: 1697,
          estimatedCostUsd: null,
          attempts: [
            { provider: "openrouter", model: "deepseek/deepseek-v4-flash", latencyMs: 0, success: false, reason: "image_inputs_not_supported" },
            { provider: "openai", model: "gpt-4.1-mini", latencyMs: 0, success: false, reason: "provider_not_configured" },
            { provider: "gemini", model: "gemini-2.5-flash", latencyMs: 0, success: false, reason: "image_inputs_not_supported" },
          ],
        },
        choices: [
          {
            message: {
              content: JSON.stringify({
                status: "unavailable",
                message:
                  "AI analysis is temporarily unavailable. Please retry safely, review the fault codes and inspection findings, and contact maintenance if the issue is safety-critical.",
              }),
            },
          },
        ],
      }),
    });

    expect(result.status).toBe("fallback");
    expect(result.code).toBe("OCR_PROVIDER_UNAVAILABLE");
    expect(result.warning).not.toContain("Could not confidently extract");
    expect(result.warning).toContain("temporarily unavailable");
  });

  it("Test D: falls through to provider 2 when provider 1 returns an invalid OCR schema", async () => {
    // This is exercised at the orchestrator level (aiOrchestrator.ts continues to the next
    // eligible provider on failure/incompatibility) — extractVinFromImage only ever sees the
    // final orchestration result. Simulate provider 1 having failed structurally and provider
    // 2 having actually produced the OCR-shaped response.
    const result = await extractVinFromImage({
      imageDataUrl: "data:image/png;base64,abc123",
      invoke: async () => ({
        orchestration: {
          provider: "openai",
          model: "gpt-4.1-mini",
          latencyMs: 900,
          estimatedCostUsd: 0.001,
          attempts: [
            { provider: "openrouter", model: "deepseek/deepseek-v4-flash", latencyMs: 0, success: false, reason: "image_inputs_not_supported" },
            { provider: "openai", model: "gpt-4.1-mini", latencyMs: 900, success: true },
          ],
        },
        choices: [
          {
            message: {
              content: JSON.stringify({ vinCandidate: "1HTMMAAP05H155913", rawText: "1HTMMAAP05H155913" }),
            },
          },
        ],
      }),
    });

    expect(result.status).toBe("completed");
    expect(result.vin).toBe("1HTMMAAP05H155913");
  });

  it("flags a provider response missing the expected OCR schema as an invalid response, not a real empty read", async () => {
    const result = await extractVinFromImage({
      imageDataUrl: "data:image/png;base64,abc123",
      invoke: async () => ({
        orchestration: {
          provider: "openai",
          model: "gpt-4.1-mini",
          latencyMs: 500,
          estimatedCostUsd: 0.001,
          attempts: [{ provider: "openai", model: "gpt-4.1-mini", latencyMs: 500, success: true }],
        },
        choices: [
          {
            // A provider "succeeded" per orchestration bookkeeping but returned an unrelated
            // schema (e.g. a diagnosis-shaped response) instead of {vinCandidate, rawText}.
            message: { content: JSON.stringify({ status: "unavailable", message: "unrelated payload" }) },
          },
        ],
      }),
    });

    expect(result.status).toBe("fallback");
    expect(result.code).toBe("OCR_INVALID_PROVIDER_RESPONSE");
  });

});
