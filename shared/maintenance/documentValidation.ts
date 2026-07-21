// Pure, authoritative document validation. Server-side validation is the source
// of truth; client identifiers (filename, declared MIME) are NOT trusted — the
// content's magic bytes decide the real type.

import {
  ALLOWED_DOCUMENT_EXTENSIONS,
  ALLOWED_DOCUMENT_MIME_TYPES,
  REPAIR_DOCUMENT_LIMITS,
  type AllowedDocumentMimeType,
} from "./documentLimits";

export interface ValidationInput {
  filename: string;
  declaredMimeType: string;
  sizeBytes: number;
  // First bytes of the file for magic-byte sniffing (>= 16 recommended).
  headerBytes: Uint8Array;
}

export interface ValidationResult {
  ok: boolean;
  detectedMimeType: AllowedDocumentMimeType | null;
  errors: string[];
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : "";
}

// Sniff the real type from magic bytes. Returns null for anything not in the
// allowlist (executables, archives, SVG/HTML/scripts, etc. all fail here).
export function sniffMimeType(bytes: Uint8Array): AllowedDocumentMimeType | null {
  const b = bytes;
  // PDF: "%PDF"
  if (b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) {
    return "application/pdf";
  }
  // JPEG: FF D8 FF
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return "image/jpeg";
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    b.length >= 8 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) {
    return "image/png";
  }
  // WEBP: "RIFF"...."WEBP"
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export function validateDocument(input: ValidationInput): ValidationResult {
  const errors: string[] = [];

  if (input.sizeBytes <= 0) {
    errors.push("File is empty.");
  }
  if (input.sizeBytes > REPAIR_DOCUMENT_LIMITS.maxFileSizeBytes) {
    errors.push(
      `File exceeds the ${Math.round(REPAIR_DOCUMENT_LIMITS.maxFileSizeBytes / (1024 * 1024))} MB limit.`
    );
  }

  const ext = extensionOf(input.filename);
  if (!(ALLOWED_DOCUMENT_EXTENSIONS as readonly string[]).includes(ext)) {
    errors.push(`Extension ".${ext}" is not allowed.`);
  }

  const detected = sniffMimeType(input.headerBytes);
  if (!detected) {
    errors.push("File content is not a supported PDF or image (or is corrupted).");
  } else if (!(ALLOWED_DOCUMENT_MIME_TYPES as readonly string[]).includes(detected)) {
    errors.push("Detected file type is not allowed.");
  }

  // Forged-extension detection: the declared/extension type must be consistent
  // with the sniffed content. (jpg/jpeg both map to image/jpeg.)
  if (detected) {
    const extMap: Record<string, AllowedDocumentMimeType> = {
      pdf: "application/pdf",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
    };
    const expected = extMap[ext];
    if (expected && expected !== detected) {
      errors.push(
        `File extension ".${ext}" does not match the actual content (${detected}).`
      );
    }
  }

  return { ok: errors.length === 0, detectedMimeType: detected, errors };
}
