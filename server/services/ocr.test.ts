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
    expect(result.warning).toContain("Could not confidently extract");
  });
});
