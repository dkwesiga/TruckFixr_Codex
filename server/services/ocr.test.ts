import { describe, expect, it } from "vitest";
import { extractPhotoEvidenceText } from "./ocr";

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
});
