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
