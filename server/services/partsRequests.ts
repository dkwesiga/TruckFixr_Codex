// Parts concierge service (PRD v1.1 §6). Manual-first MVP: TruckFixr staff
// create the request and hand suppliers/customers signed, no-account links
// (guestTokens.ts). No automated supplier outreach dispatch yet — staff send
// the link personally (email/SMS/phone), matching the GTA concierge model.

import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { partsOffers, partsRequests } from "../../drizzle/schema";
import { generateOpaqueToken, signGuestToken, verifyGuestToken } from "./guestTokens";
import { recordObservabilityEvent } from "./observability";

const SUPPLIER_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CUSTOMER_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function requireDb(db: unknown): asserts db {
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
}

async function loadRequest(db: any, id: number) {
  const [row] = await db.select().from(partsRequests).where(eq(partsRequests.id, id)).limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Parts request not found." });
  return row;
}

async function loadRequestByPublicToken(db: any, publicToken: string) {
  const [row] = await db
    .select()
    .from(partsRequests)
    .where(eq(partsRequests.publicToken, publicToken))
    .limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Parts request not found." });
  return row;
}

export interface CreatePartsRequestInput {
  route: "case_derived" | "known_part_number";
  caseId?: number | null;
  guestCaseId?: number | null;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  vehicleIdentifier?: Record<string, unknown> | null;
  partNumber?: string | null;
  partDescription?: string | null;
  // Case-derived route (§6.1): who confirmed the requirement.
  confirmedByType?: "truckfixr_technician" | "external_technician" | "repair_shop" | "customer_declaration" | null;
  confirmedByName?: string | null;
  evidenceNotes?: string | null;
  createdByUserId: number;
}

/** Staff-created; TruckFixr already vetted eligibility per §6.1 before this call. */
export async function createPartsRequest(input: CreatePartsRequestInput) {
  const db = await getDb();
  requireDb(db);

  if (input.route === "known_part_number" && !input.partNumber?.trim()) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A part number is required for the known-part-number route.",
    });
  }
  if (input.route === "case_derived" && !input.confirmedByType) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Case-derived requests require who confirmed the requirement.",
    });
  }

  const now = new Date();
  const [row] = await db
    .insert(partsRequests)
    .values({
      publicToken: generateOpaqueToken(),
      caseId: input.caseId ?? null,
      guestCaseId: input.guestCaseId ?? null,
      route: input.route,
      status: "qualified",
      customerName: input.customerName ?? null,
      customerEmail: input.customerEmail ?? null,
      customerPhone: input.customerPhone ?? null,
      vehicleIdentifier: input.vehicleIdentifier ?? null,
      partNumber: input.partNumber ?? null,
      partDescription: input.partDescription ?? null,
      confirmedByType: input.confirmedByType ?? null,
      confirmedByName: input.confirmedByName ?? null,
      evidenceNotes: input.evidenceNotes ?? null,
      createdByUserId: input.createdByUserId,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  recordObservabilityEvent({
    category: "workflow",
    event: "parts_request_created",
    context: { partsRequestId: row.id, route: input.route },
  });

  return row;
}

export interface SubmitPublicPartsRequestInput {
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  partNumber?: string | null;
  partDescription?: string | null;
  vehicleIdentifier?: Record<string, unknown> | null;
}

/**
 * Public, self-serve intake (landing page "Find a Part"). Unlike
 * createPartsRequest, TruckFixr has not vetted this yet — it starts in
 * "draft" so staff triage it in /admin/parts before a supplier link goes out.
 */
export async function submitPublicPartsRequest(input: SubmitPublicPartsRequestInput) {
  const db = await getDb();
  requireDb(db);

  if (!input.partNumber?.trim() && !input.partDescription?.trim()) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Please provide a part number or describe what you need.",
    });
  }

  const now = new Date();
  const [row] = await db
    .insert(partsRequests)
    .values({
      publicToken: generateOpaqueToken(),
      route: "known_part_number",
      status: "draft",
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone ?? null,
      vehicleIdentifier: input.vehicleIdentifier ?? null,
      partNumber: input.partNumber ?? null,
      partDescription: input.partDescription ?? null,
      createdByUserId: null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  recordObservabilityEvent({
    category: "workflow",
    event: "parts_request_submitted_public",
    context: { partsRequestId: row.id },
  });

  return { id: row.id };
}

export async function listPartsRequests(statuses?: string[]) {
  const db = await getDb();
  requireDb(db);
  const rows = await db.select().from(partsRequests);
  if (!statuses || statuses.length === 0) return rows;
  const allowed = new Set(statuses);
  return rows.filter((r: any) => allowed.has(r.status));
}

export async function getPartsRequest(id: number) {
  const db = await getDb();
  requireDb(db);
  const row = await loadRequest(db, id);
  const offers = await db.select().from(partsOffers).where(eq(partsOffers.partsRequestId, id));
  return { request: row, offers };
}

/** Signed, expiring, no-account link a supplier uses to submit one offer. */
export async function generateSupplierLink(params: { partsRequestId: number }) {
  const db = await getDb();
  requireDb(db);
  const row = await loadRequest(db, params.partsRequestId);

  // "draft" covers public self-serve submissions staff haven't triaged yet
  // (createPartsRequest defaults staff-created requests straight to
  // "qualified" since staff already vetted them before calling it).
  if (row.status === "qualified" || row.status === "draft") {
    await db
      .update(partsRequests)
      .set({ status: "supplier_outreach", updatedAt: new Date() })
      .where(eq(partsRequests.id, row.id));
  }

  const token = signGuestToken({
    caseToken: row.publicToken,
    purpose: "supplier_offer_link",
    ttlMs: SUPPLIER_LINK_TTL_MS,
  });
  return { token, expiresInDays: SUPPLIER_LINK_TTL_MS / (24 * 60 * 60 * 1000) };
}

/** Signed, expiring link the customer uses to compare offers and pick one. */
export function generateCustomerLink(params: { publicToken: string }) {
  const token = signGuestToken({
    caseToken: params.publicToken,
    purpose: "customer_offer_view",
    ttlMs: CUSTOMER_LINK_TTL_MS,
  });
  return { token, expiresInDays: CUSTOMER_LINK_TTL_MS / (24 * 60 * 60 * 1000) };
}

export interface SubmitOfferInput {
  token: string;
  supplierName: string;
  supplierBranch?: string | null;
  respondentName?: string | null;
  respondentContact?: string | null;
  skuPartNumber: string;
  description?: string | null;
  brandManufacturer?: string | null;
  conditionType?: "new" | "remanufactured" | "used" | null;
  quantity?: number;
  supersessionNotes?: string | null;
  fitmentConfirmed: boolean;
  fitmentBasis?: string | null;
  fitmentExclusions?: string | null;
  requiredSerialOrCalibration?: string | null;
  priceCents: number;
  currency?: string;
  taxesIncluded?: boolean;
  coreChargeCents?: number | null;
  coreReturnTerms?: string | null;
  depositCents?: number | null;
  warrantyText?: string | null;
  quoteExpiresAt?: Date | null;
  stockStatus?: string | null;
  availableQuantity?: number | null;
  pickupLocation?: string | null;
  deliveryOption?: string | null;
  deliveryCostCents?: number | null;
  estimatedReadyAt?: Date | null;
}

/** A supplier's structured offer, submitted via their signed link — no account. */
export async function submitOfferViaToken(input: SubmitOfferInput) {
  const verified = verifyGuestToken(input.token, { purpose: "supplier_offer_link" });
  if (!verified.ok) {
    throw new TRPCError({ code: "FORBIDDEN", message: "This supplier link is invalid or has expired." });
  }

  const db = await getDb();
  requireDb(db);
  const request = await loadRequestByPublicToken(db, verified.caseToken);

  // §16.3: the supplier must give final fitment confirmation for the exact
  // item it sells before an offer can be shown to the customer as valid.
  if (!input.fitmentConfirmed) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Fitment confirmation is required to submit an offer.",
    });
  }

  const now = new Date();
  const [offer] = await db
    .insert(partsOffers)
    .values({
      partsRequestId: request.id,
      status: "submitted",
      supplierName: input.supplierName,
      supplierBranch: input.supplierBranch ?? null,
      respondentName: input.respondentName ?? null,
      respondentContact: input.respondentContact ?? null,
      skuPartNumber: input.skuPartNumber,
      description: input.description ?? null,
      brandManufacturer: input.brandManufacturer ?? null,
      conditionType: input.conditionType ?? null,
      quantity: input.quantity ?? 1,
      supersessionNotes: input.supersessionNotes ?? null,
      fitmentConfirmed: input.fitmentConfirmed,
      fitmentBasis: input.fitmentBasis ?? null,
      fitmentExclusions: input.fitmentExclusions ?? null,
      requiredSerialOrCalibration: input.requiredSerialOrCalibration ?? null,
      priceCents: input.priceCents,
      currency: input.currency ?? "CAD",
      taxesIncluded: input.taxesIncluded ?? false,
      coreChargeCents: input.coreChargeCents ?? null,
      coreReturnTerms: input.coreReturnTerms ?? null,
      depositCents: input.depositCents ?? null,
      warrantyText: input.warrantyText ?? null,
      quoteExpiresAt: input.quoteExpiresAt ?? null,
      stockStatus: input.stockStatus ?? null,
      availableQuantity: input.availableQuantity ?? null,
      pickupLocation: input.pickupLocation ?? null,
      deliveryOption: input.deliveryOption ?? null,
      deliveryCostCents: input.deliveryCostCents ?? null,
      estimatedReadyAt: input.estimatedReadyAt ?? null,
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (request.status === "supplier_outreach" || request.status === "qualified") {
    await db
      .update(partsRequests)
      .set({ status: "offers_available", updatedAt: now })
      .where(eq(partsRequests.id, request.id));
  }

  recordObservabilityEvent({
    category: "workflow",
    event: "parts_offer_submitted",
    context: { partsRequestId: request.id, offerId: offer.id },
  });

  return { ok: true, offerId: offer.id };
}

/** Customer-safe view: the request plus all valid (non-withdrawn) offers. */
export async function getRequestForCustomerToken(token: string) {
  const verified = verifyGuestToken(token, { purpose: "customer_offer_view" });
  if (!verified.ok) {
    throw new TRPCError({ code: "FORBIDDEN", message: "This link is invalid or has expired." });
  }

  const db = await getDb();
  requireDb(db);
  const request = await loadRequestByPublicToken(db, verified.caseToken);
  const allOffers = await db
    .select()
    .from(partsOffers)
    .where(eq(partsOffers.partsRequestId, request.id));
  // §6.4: show every valid supplier-confirmed offer — never silently suppress.
  const offers = allOffers.filter((o: any) => o.status !== "withdrawn" && o.status !== "expired");

  return {
    publicToken: request.publicToken,
    route: request.route,
    status: request.status,
    partNumber: request.partNumber,
    partDescription: request.partDescription,
    selectedOfferId: request.selectedOfferId,
    offers,
  };
}

/** Customer picks an offer; TruckFixr directs them to the supplier (§6.4). */
export async function selectOfferViaToken(params: { token: string; offerId: number }) {
  const verified = verifyGuestToken(params.token, { purpose: "customer_offer_view" });
  if (!verified.ok) {
    throw new TRPCError({ code: "FORBIDDEN", message: "This link is invalid or has expired." });
  }

  const db = await getDb();
  requireDb(db);
  const request = await loadRequestByPublicToken(db, verified.caseToken);

  const [offer] = await db
    .select()
    .from(partsOffers)
    .where(eq(partsOffers.id, params.offerId))
    .limit(1);
  if (!offer || offer.partsRequestId !== request.id) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "That offer doesn't belong to this request." });
  }

  const now = new Date();
  await db
    .update(partsOffers)
    .set({ status: "selected", updatedAt: now })
    .where(eq(partsOffers.id, offer.id));
  await db
    .update(partsRequests)
    .set({ selectedOfferId: offer.id, status: "referred_to_supplier", referredAt: now, updatedAt: now })
    .where(eq(partsRequests.id, request.id));

  recordObservabilityEvent({
    category: "workflow",
    event: "parts_offer_selected",
    context: { partsRequestId: request.id, offerId: offer.id },
  });

  // TruckFixr records the referral; it must not claim an unverified
  // transaction as completed (§6.4) — that's a separate staff confirmation.
  return {
    supplierName: offer.supplierName,
    respondentContact: offer.respondentContact,
    priceCents: offer.priceCents,
    currency: offer.currency,
  };
}

export async function markPartsTransactionStatus(params: {
  partsRequestId: number;
  transactionStatus: "completed" | "not_completed";
}) {
  const db = await getDb();
  requireDb(db);
  await loadRequest(db, params.partsRequestId);
  const now = new Date();
  await db
    .update(partsRequests)
    .set({
      transactionStatus: params.transactionStatus,
      transactionConfirmedAt: now,
      status: params.transactionStatus,
      updatedAt: now,
    })
    .where(eq(partsRequests.id, params.partsRequestId));
  return loadRequest(db, params.partsRequestId);
}
