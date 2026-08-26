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

  it("auto-corrects a single OCR misread that breaks the VIN check digit", async () => {
    // 1HGCM82633A004352 is a valid VIN; the '8' at index 5 was misread as 'B'.
    const result = await extractVinFromImage({
      imageDataUrl: "data:image/png;base64,abc123",
      invoke: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                vinCandidate: "1HGCMB2633A004352",
                rawText: "1HGCMB2633A004352",
              }),
            },
          },
        ],
      }),
    });

    expect(result.status).toBe("completed");
    expect(result.vin).toBe("1HGCM82633A004352");
    expect(result.warning).toBeUndefined();
  });

  it("keeps the VIN but warns when the check digit doesn't validate and can't be unambiguously fixed", async () => {
    const result = await extractVinFromImage({
      imageDataUrl: "data:image/png;base64,abc123",
      invoke: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                vinCandidate: "1HGCM82633A004353",
                rawText: "1HGCM82633A004353",
              }),
            },
          },
        ],
      }),
    });

    expect(result.status).toBe("completed");
    expect(result.vin).toBe("1HGCM82633A004353");
    expect(result.warning).toContain("check digit");
  });

  it("prefers a checksum-valid 17-character window when the raw text has extra characters", async () => {
    const result = await extractVinFromImage({
      imageDataUrl: "data:image/png;base64,abc123",
      invoke: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                // Leading noise shifts a bogus 17-char window in front of the real VIN.
                vinCandidate: "XX1HGCM82633A004352",
                rawText: "XX1HGCM82633A004352",
              }),
            },
          },
        ],
      }),
    });

    expect(result.status).toBe("completed");
    expect(result.vin).toBe("1HGCM82633A004352");
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
