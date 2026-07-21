import { createHash } from "crypto";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { maintenanceCases, repairDocuments } from "../../drizzle/schema";
import { storageGet, storagePut } from "../storage";
import { validateDocument } from "@shared/maintenance/documentValidation";
import {
  REPAIR_DOCUMENT_LIMITS,
  type RepairDocumentType,
} from "@shared/maintenance/documentLimits";
import {
  compareEstimateToInvoice,
  type DocumentFinancials,
} from "@shared/maintenance/documentComparison";
import { logMaintenanceActivity } from "./maintenanceActivityLog";

// ---------------------------------------------------------------------------
// Provider-neutral extraction interface. Automated STRUCTURED extraction is
// BLOCKED in this release: the repo has only free-text image OCR
// (extractPhotoEvidenceText, 400-char snippets), which cannot reliably yield
// line items / totals / tax, and adding a provider solely for this feature is
// out of scope (§8.6/§35). Documents therefore land in `manual_review_only`;
// the deterministic comparison runs on manually-entered / corrected values.
// The interface is here so a real extractor can be dropped in later.
// ---------------------------------------------------------------------------
export interface DocumentExtractor {
  readonly name: string;
  extract(input: { mimeType: string; storageKey: string }): Promise<
    | { status: "extracted"; fields: DocumentFinancials; rawText?: string; confidence?: number }
    | { status: "unsupported"; reason: string }
  >;
}

export const manualExtractor: DocumentExtractor = {
  name: "manual",
  async extract() {
    return { status: "unsupported", reason: "Automated extraction is not available; enter values manually." };
  },
};

let activeExtractor: DocumentExtractor = manualExtractor;
export function setDocumentExtractor(extractor: DocumentExtractor) {
  activeExtractor = extractor;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export interface UploadResult {
  status: "uploaded" | "duplicate_in_case" | "duplicate_in_fleet" | "invalid";
  documentId?: number;
  errors?: string[];
  processingState?: string;
}

// Upload a repair document. Validates content authoritatively, computes a
// checksum, detects duplicates within the fleet, persists the original to
// private storage BEFORE any extraction, then marks it for manual review.
export async function uploadRepairDocument(input: {
  fleetId: number;
  caseId: number;
  repairCycleId?: number | null;
  documentType: RepairDocumentType;
  filename: string;
  declaredMimeType: string;
  base64Content: string;
  uploadedByUserId: number;
  consentAtUpload: boolean;
  allowFleetDuplicate?: boolean;
}): Promise<UploadResult> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });

  const bytes = Buffer.from(input.base64Content, "base64");
  const headerBytes = new Uint8Array(bytes.subarray(0, 16));

  const validation = validateDocument({
    filename: input.filename,
    declaredMimeType: input.declaredMimeType,
    sizeBytes: bytes.length,
    headerBytes,
  });
  if (!validation.ok || !validation.detectedMimeType) {
    return { status: "invalid", errors: validation.errors };
  }

  // Enforce max documents per case.
  const existingForCase = await db
    .select({ id: repairDocuments.id, checksumSha256: repairDocuments.checksumSha256 })
    .from(repairDocuments)
    .where(and(eq(repairDocuments.fleetId, input.fleetId), eq(repairDocuments.caseId, input.caseId)));
  if (existingForCase.length >= REPAIR_DOCUMENT_LIMITS.maxDocumentsPerCase) {
    return { status: "invalid", errors: [`This case already has the maximum ${REPAIR_DOCUMENT_LIMITS.maxDocumentsPerCase} documents.`] };
  }

  const checksum = sha256(bytes);

  // Duplicate within the same case: refuse unless intentionally re-uploaded.
  if (existingForCase.some((d) => d.checksumSha256 === checksum)) {
    return { status: "duplicate_in_case", errors: ["An identical file is already attached to this case."] };
  }

  // Duplicate elsewhere in the fleet: warn + require confirmation. NEVER reveal
  // cross-fleet duplicates (query is scoped to this fleet only).
  if (!input.allowFleetDuplicate) {
    const [fleetDup] = await db
      .select({ id: repairDocuments.id })
      .from(repairDocuments)
      .where(and(eq(repairDocuments.fleetId, input.fleetId), eq(repairDocuments.checksumSha256, checksum)))
      .limit(1);
    if (fleetDup) {
      return { status: "duplicate_in_fleet", errors: ["An identical file already exists elsewhere in your fleet. Confirm to upload anyway."] };
    }
  }

  // Insert first (state uploaded) so we have an id for the server-generated key.
  const [row] = await db
    .insert(repairDocuments)
    .values({
      fleetId: input.fleetId,
      caseId: input.caseId,
      repairCycleId: input.repairCycleId ?? null,
      documentType: input.documentType,
      originalFilename: input.filename,
      storageKey: "pending",
      sizeBytes: bytes.length,
      mimeType: validation.detectedMimeType,
      checksumSha256: checksum,
      uploadedByUserId: input.uploadedByUserId,
      processingState: "uploaded",
      consentAtUpload: input.consentAtUpload,
    })
    .returning();
  if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create document." });

  const safeName = input.filename.replace(/[^A-Za-z0-9._-]/g, "_");
  const storageKey = `maintenance-cases/${input.fleetId}/${input.caseId}/${row.id}/${safeName}`;

  try {
    await storagePut(storageKey, bytes, validation.detectedMimeType);
  } catch {
    await db
      .update(repairDocuments)
      .set({ processingState: "failed", updatedAt: new Date() })
      .where(eq(repairDocuments.id, row.id));
    await logMaintenanceActivity({
      fleetId: input.fleetId, userId: input.uploadedByUserId,
      action: "repair_document_processing_changed",
      entityType: "repairDocument", entityId: row.id,
      details: { state: "failed", reason: "storage_error" },
    });
    return { status: "invalid", documentId: row.id, errors: ["Upload storage failed; please retry."], processingState: "failed" };
  }

  // Original persisted. Automated extraction is unavailable => manual review.
  const extraction = await activeExtractor.extract({ mimeType: validation.detectedMimeType, storageKey });
  const processingState = extraction.status === "extracted" ? "needs_review" : "manual_review_only";

  await db
    .update(repairDocuments)
    .set({
      storageKey,
      processingState,
      extractionProvider: activeExtractor.name,
      extractionAttempts: 1,
      normalizedFieldsJson: extraction.status === "extracted" ? (extraction.fields as never) : null,
      confidence: extraction.status === "extracted" ? extraction.confidence ?? null : null,
      updatedAt: new Date(),
    })
    .where(eq(repairDocuments.id, row.id));

  await logMaintenanceActivity({
    fleetId: input.fleetId, userId: input.uploadedByUserId,
    action: "repair_document_uploaded",
    entityType: "repairDocument", entityId: row.id,
    // No signed URLs, storage keys, or raw content in the log.
    details: { documentType: input.documentType, sizeBytes: bytes.length, processingState },
  });

  return { status: "uploaded", documentId: row.id, processingState };
}

async function getDocForFleet(fleetId: number, documentId: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(repairDocuments)
    .where(and(eq(repairDocuments.id, documentId), eq(repairDocuments.fleetId, fleetId)))
    .limit(1);
  return row ?? null;
}

// Manual entry / correction of normalized financial fields. Corrections are
// appended (audit trail); the current normalized fields are replaced.
export async function saveManualFields(input: {
  fleetId: number;
  documentId: number;
  actorUserId: number;
  fields: DocumentFinancials;
  documentType?: RepairDocumentType;
  isCorrection: boolean;
}) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });

  const doc = await getDocForFleet(input.fleetId, input.documentId);
  if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "Document not found in this fleet." });

  const corrections = Array.isArray(doc.correctionsJson) ? (doc.correctionsJson as unknown[]) : [];
  if (input.isCorrection && doc.normalizedFieldsJson) {
    corrections.push({ at: new Date().toISOString(), by: input.actorUserId, previous: doc.normalizedFieldsJson });
  }

  await db
    .update(repairDocuments)
    .set({
      normalizedFieldsJson: input.fields as never,
      documentType: input.documentType ?? doc.documentType,
      correctionsJson: corrections as never,
      processingState: "completed",
      updatedAt: new Date(),
    })
    .where(eq(repairDocuments.id, doc.id));

  await logMaintenanceActivity({
    fleetId: input.fleetId, userId: input.actorUserId,
    action: input.isCorrection ? "repair_document_corrected" : "repair_document_processing_changed",
    entityType: "repairDocument", entityId: doc.id,
    details: { state: "completed", correction: input.isCorrection },
  });

  return { ok: true };
}

// Manual retry / internal recovery: reset a failed document for another attempt.
export async function retryDocumentProcessing(input: {
  fleetId: number;
  documentId: number;
  actorUserId: number;
}) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
  const doc = await getDocForFleet(input.fleetId, input.documentId);
  if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "Document not found in this fleet." });
  if (doc.extractionAttempts >= REPAIR_DOCUMENT_LIMITS.maxExtractionAttempts) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Maximum extraction attempts reached; enter values manually." });
  }
  await db
    .update(repairDocuments)
    .set({ processingState: "manual_review_only", extractionAttempts: doc.extractionAttempts + 1, updatedAt: new Date() })
    .where(eq(repairDocuments.id, doc.id));
  return { ok: true };
}

// Signed URL for private access. Never logged.
export async function getDocumentDownloadUrl(input: { fleetId: number; documentId: number }) {
  const doc = await getDocForFleet(input.fleetId, input.documentId);
  if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "Document not found in this fleet." });
  if (doc.storageKey === "pending" || doc.processingState === "failed") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Document is not available." });
  }
  const { url } = await storageGet(doc.storageKey);
  return { url };
}

export async function listCaseDocuments(fleetId: number, caseId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: repairDocuments.id,
      documentType: repairDocuments.documentType,
      originalFilename: repairDocuments.originalFilename,
      sizeBytes: repairDocuments.sizeBytes,
      mimeType: repairDocuments.mimeType,
      processingState: repairDocuments.processingState,
      normalizedFieldsJson: repairDocuments.normalizedFieldsJson,
      isApprovedEstimate: repairDocuments.isApprovedEstimate,
      isFinalInvoice: repairDocuments.isFinalInvoice,
      createdAt: repairDocuments.createdAt,
    })
    .from(repairDocuments)
    .where(and(eq(repairDocuments.fleetId, fleetId), eq(repairDocuments.caseId, caseId)));
}

// Deterministic comparison between the approved estimate and the final invoice
// for a case. Runs only on manually-entered/corrected structured fields.
export async function compareCaseDocuments(input: {
  fleetId: number;
  caseId: number;
  actorUserId: number;
  estimateDocumentId: number;
  invoiceDocumentId: number;
}) {
  const estimate = await getDocForFleet(input.fleetId, input.estimateDocumentId);
  const invoice = await getDocForFleet(input.fleetId, input.invoiceDocumentId);
  if (!estimate || !invoice || estimate.caseId !== input.caseId || invoice.caseId !== input.caseId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Both documents must belong to this case." });
  }
  if (!estimate.normalizedFieldsJson || !invoice.normalizedFieldsJson) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Both documents need reviewed values before comparison." });
  }

  const result = compareEstimateToInvoice(
    estimate.normalizedFieldsJson as unknown as DocumentFinancials,
    invoice.normalizedFieldsJson as unknown as DocumentFinancials
  );

  await logMaintenanceActivity({
    fleetId: input.fleetId, userId: input.actorUserId,
    action: "document_comparison_finding",
    entityType: "repairDocument", entityId: invoice.id,
    details: {
      comparable: result.comparable,
      findingCount: result.findings.length,
      highVariance: result.findings.some((f) => f.severity === "high"),
    },
  });

  return result;
}
