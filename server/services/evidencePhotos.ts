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

export const EVIDENCE_BUCKET_IDS = [
  "inspection-evidence",
  "diagnostic-evidence",
] as const;

export type EvidenceBucketId = (typeof EVIDENCE_BUCKET_IDS)[number];

export type ParsedEvidenceStorageKey = {
  bucketId: EvidenceBucketId;
  fleetId: number;
  inspectionId: string | null;
  vehicleId: string;
  kind: EvidencePhotoKind;
};

/**
 * Parse a tenant-scoped evidence storage key back into its fleet/vehicle context.
 *
 * This is the read-side counterpart to `buildEvidencePhotoStorageKey`. It lets an
 * authorized read endpoint re-derive the owning fleet + vehicle from the key alone,
 * so access can be re-checked at read time regardless of the underlying storage
 * backend (forge proxy today, Supabase private buckets later). Returns null for any
 * key that does not match the exact tenant-scoped shape.
 *
 * Expected shape:
 *   {bucket}/company-{fleetId}/inspections/{inspectionId|unlinked}/vehicle-{vehicleId}/{kind}/{uuid}.{ext}
 */
export function parseEvidenceStorageKey(key: string): ParsedEvidenceStorageKey | null {
  const normalized = String(key ?? "").trim().replace(/^\/+/, "");
  if (!normalized) return null;

  const parts = normalized.split("/");
  if (parts.length !== 7) return null;

  const [bucketId, companySeg, inspectionsSeg, inspectionSeg, vehicleSeg, kindSeg, fileSeg] = parts;

  if (!(EVIDENCE_BUCKET_IDS as readonly string[]).includes(bucketId)) return null;

  const fleetMatch = /^company-(\d+)$/.exec(companySeg);
  if (!fleetMatch) return null;
  const fleetId = Number(fleetMatch[1]);
  if (!Number.isInteger(fleetId) || fleetId <= 0) return null;

  if (inspectionsSeg !== "inspections") return null;

  const inspectionId = inspectionSeg === "unlinked" ? null : inspectionSeg;
  if (inspectionId !== null && inspectionId.trim().length === 0) return null;

  if (!vehicleSeg.startsWith("vehicle-")) return null;
  const vehicleId = vehicleSeg.slice("vehicle-".length).trim();
  if (!vehicleId) return null;

  if (kindSeg !== "defect" && kindSeg !== "proof") return null;

  // Randomized filename + extension only (no traversal, no nested paths).
  if (!/^[0-9a-f-]+\.[a-z0-9]+$/i.test(fileSeg)) return null;

  return {
    bucketId: bucketId as EvidenceBucketId,
    fleetId,
    inspectionId,
    vehicleId,
    kind: kindSeg,
  };
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

