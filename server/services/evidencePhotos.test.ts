import { describe, expect, it } from "vitest";
import {
  buildEvidencePhotoStorageKey,
  parseEvidenceImageDataUrl,
  parseEvidenceStorageKey,
} from "./evidencePhotos";

describe("evidence photo storage helpers", () => {
  it("accepts only supported base64 image data URLs and reports size", () => {
    const parsed = parseEvidenceImageDataUrl("data:image/png;base64,aGVsbG8=");

    expect(parsed.mimeType).toBe("image/png");
    expect(parsed.extension).toBe("png");
    expect(parsed.sizeBytes).toBe(5);
  });

  it("rejects non-image or malformed evidence payloads", () => {
    expect(() => parseEvidenceImageDataUrl("https://example.test/photo.png")).toThrow(
      "Invalid data URL"
    );
    expect(() => parseEvidenceImageDataUrl("data:text/plain;base64,aGVsbG8=")).toThrow(
      "Unsupported evidence MIME type"
    );
    expect(() => parseEvidenceImageDataUrl("data:image/png;base64,")).toThrow(
      "Invalid data URL"
    );
  });

  it("builds tenant-scoped inspection evidence paths that match the Supabase policy parser", () => {
    const key = buildEvidencePhotoStorageKey({
      bucketId: "inspection-evidence",
      fleetId: 42,
      vehicleId: "TRUCK-19",
      inspectionId: 123,
      kind: "defect",
      extension: ".PNG",
    });

    expect(key).toMatch(
      /^inspection-evidence\/company-42\/inspections\/123\/vehicle-TRUCK-19\/defect\/[0-9a-f-]+\.png$/
    );
  });

  it("does not build unscoped or extensionless evidence paths", () => {
    expect(() =>
      buildEvidencePhotoStorageKey({
        bucketId: "inspection-evidence",
        fleetId: 0,
        vehicleId: "TRUCK-19",
        kind: "proof",
        extension: "jpg",
      })
    ).toThrow("Invalid fleetId");

    expect(() =>
      buildEvidencePhotoStorageKey({
        bucketId: "inspection-evidence",
        fleetId: 42,
        vehicleId: "",
        kind: "proof",
        extension: "jpg",
      })
    ).toThrow("Invalid vehicleId");

    expect(() =>
      buildEvidencePhotoStorageKey({
        bucketId: "inspection-evidence",
        fleetId: 42,
        vehicleId: "TRUCK-19",
        kind: "proof",
        extension: "",
      })
    ).toThrow("Invalid extension");
  });

  it("re-derives the fleet/vehicle context from a key built by the builder", () => {
    const key = buildEvidencePhotoStorageKey({
      bucketId: "inspection-evidence",
      fleetId: 42,
      vehicleId: "TRUCK-19",
      inspectionId: 123,
      kind: "defect",
      extension: "jpg",
    });

    const parsed = parseEvidenceStorageKey(key);
    expect(parsed).toEqual({
      bucketId: "inspection-evidence",
      fleetId: 42,
      inspectionId: "123",
      vehicleId: "TRUCK-19",
      kind: "defect",
    });
  });

  it("parses unlinked (inspection-less) evidence keys", () => {
    const key = buildEvidencePhotoStorageKey({
      bucketId: "inspection-evidence",
      fleetId: 7,
      vehicleId: "9",
      inspectionId: null,
      kind: "proof",
      extension: "webp",
    });

    expect(parseEvidenceStorageKey(key)).toMatchObject({
      fleetId: 7,
      inspectionId: null,
      vehicleId: "9",
      kind: "proof",
    });
  });

  it("rejects malformed, traversal, or wrong-shape evidence keys", () => {
    expect(parseEvidenceStorageKey("")).toBeNull();
    // Unknown / public bucket prefix.
    expect(
      parseEvidenceStorageKey("public/company-1/inspections/1/vehicle-2/defect/abc.png")
    ).toBeNull();
    // Missing company- scope.
    expect(
      parseEvidenceStorageKey("inspection-evidence/1/inspections/1/vehicle-2/defect/abc.png")
    ).toBeNull();
    // Non-positive fleet id.
    expect(
      parseEvidenceStorageKey("inspection-evidence/company-0/inspections/1/vehicle-2/defect/abc.png")
    ).toBeNull();
    // Path traversal in the filename segment.
    expect(
      parseEvidenceStorageKey("inspection-evidence/company-1/inspections/1/vehicle-2/defect/..%2Fsecret.png")
    ).toBeNull();
    // Wrong kind.
    expect(
      parseEvidenceStorageKey("inspection-evidence/company-1/inspections/1/vehicle-2/other/abc.png")
    ).toBeNull();
    // Extra nested segment (too many parts).
    expect(
      parseEvidenceStorageKey("inspection-evidence/company-1/inspections/1/vehicle-2/defect/nested/abc.png")
    ).toBeNull();
  });
});
