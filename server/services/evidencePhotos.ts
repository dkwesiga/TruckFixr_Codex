import { randomUUID } from "node:crypto";

const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;

const mimeToExtension: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type EvidencePhotoKind = "defect" | "proof";

export type ParsedEvidenceDataUrl = {
  bytes: Buffer;
  mimeType: keyof typeof mimeToExtension;
  extension: string;
  sizeBytes: number;
};

export function parseEvidenceImageDataUrl(dataUrl: string): ParsedEvidenceDataUrl {
  const trimmed = String(dataUrl ?? "").trim();
  const match = trimmed.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    throw new Error("Invalid data URL (expected base64 image data URL).");
  }

  const mimeType = match[1] as ParsedEvidenceDataUrl["mimeType"];
  const base64 = match[2] ?? "";
  const extension = mimeToExtension[mimeType];
  if (!extension) {
    throw new Error(`Unsupported evidence MIME type: ${mimeType}`);
  }

  const bytes = Buffer.from(base64, "base64");
  if (bytes.length === 0) {
    throw new Error("Evidence photo was empty.");
  }
  if (bytes.length > MAX_EVIDENCE_BYTES) {
    throw new Error(
      `Evidence photo too large: ${bytes.length} bytes (max ${MAX_EVIDENCE_BYTES}).`
    );
  }

  return { bytes, mimeType, extension, sizeBytes: bytes.length };
}

export function buildEvidencePhotoStorageKey(input: {
  bucketId: "inspection-evidence";
  fleetId: number;
  vehicleId: number | string;
  inspectionId?: number | string | null;
  kind: EvidencePhotoKind;
  extension: string;
}) {
  const fleetId = Number(input.fleetId);
  if (!Number.isFinite(fleetId) || fleetId <= 0) {
    throw new Error("Invalid fleetId for evidence photo key.");
  }

  const vehicleIdText = String(input.vehicleId).trim();
  if (!vehicleIdText) {
    throw new Error("Invalid vehicleId for evidence photo key.");
  }

  const inspectionIdText = input.inspectionId ? String(input.inspectionId).trim() : "unlinked";
  const safeExtension = String(input.extension || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (!safeExtension) {
    throw new Error("Invalid extension for evidence photo key.");
  }

  const objectName = [
    `company-${fleetId}`,
    "inspections",
    inspectionIdText,
    `vehicle-${vehicleIdText}`,
    input.kind,
    `${randomUUID()}.${safeExtension}`,
  ].join("/");

  return `${input.bucketId}/${objectName}`;
}

