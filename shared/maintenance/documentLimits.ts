// Fixed limits and thresholds for repair-document review. NOT configurable
// (per spec §32/§39): thresholds are constants so review behavior is uniform.

export const REPAIR_DOCUMENT_LIMITS = {
  maxFileSizeBytes: 10 * 1024 * 1024,
  maxPdfPages: 20,
  maxDocumentsPerCase: 25,
  maxExtractionAttempts: 3,
} as const;

export const DOCUMENT_REVIEW_THRESHOLDS = {
  totalVariancePercent: 0.1,
  totalVarianceAmountCents: 25_000,
  highVariancePercent: 0.2,
  highVarianceAmountCents: 100_000,
  labourHoursVariance: 2,
  addedLineItemAmountCents: 10_000,
  taxToleranceCents: 200,
} as const;

// Allowed document MIME types and the extensions that may accompany them.
export const ALLOWED_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type AllowedDocumentMimeType = (typeof ALLOWED_DOCUMENT_MIME_TYPES)[number];

export const ALLOWED_DOCUMENT_EXTENSIONS = [
  "pdf",
  "jpg",
  "jpeg",
  "png",
  "webp",
] as const;

export const REPAIR_DOCUMENT_TYPES = ["estimate", "work_order", "invoice", "unknown"] as const;
export type RepairDocumentType = (typeof REPAIR_DOCUMENT_TYPES)[number];

export const DOCUMENT_PROCESSING_STATES = [
  "uploaded",
  "pending",
  "processing",
  "needs_review",
  "completed",
  "failed",
  "manual_review_only",
  "quarantined",
] as const;
export type DocumentProcessingState = (typeof DOCUMENT_PROCESSING_STATES)[number];
