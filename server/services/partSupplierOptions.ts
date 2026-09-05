import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { partRequirements, partSupplierOptions } from "../../drizzle/schema";
import {
  compareOptions,
  type AvailabilityState,
  type ComparisonResult,
  type EtaType,
  type PartCondition,
  type SupplierOptionForRanking,
} from "@shared/parts/recommendation";
import { getCurrentFitmentAssessment } from "./partFitmentAssessments";
import type { FitmentState } from "@shared/parts/fitmentEvidence";

// Represents a candidate sourcing option only — no ordering, no supplier
// contact, no procurement (Phase 3+). `fitmentClaim` is the SUPPLIER's own,
// unverified statement; it is never copied into or treated as a
// partFitmentAssessments row. See docs/architecture/parts-acquisition.md.

async function requireRequirementInFleet(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  fleetId: number,
  partRequirementId: number
) {
  const [row] = await db
    .select({ id: partRequirements.id })
    .from(partRequirements)
    .where(and(eq(partRequirements.id, partRequirementId), eq(partRequirements.fleetId, fleetId)))
    .limit(1);
  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Part requirement not found in this fleet." });
  }
}

export interface AddSupplierOptionInput {
  fleetId: number;
  partRequirementId: number;
  partId?: number | null;
  supplierName: string;
  supplierContact?: string | null;
  supplierLocation?: string | null;
  externalSupplierId?: string | null;
  quotedPartNumber?: string | null;
  conditionType?: PartCondition | null;
  priceCents?: number | null;
  currency?: string;
  freightCents?: number | null;
  coreChargeCents?: number | null;
  stockStatus?: string | null;
  availabilityState?: AvailabilityState | null;
  etaType?: EtaType | null;
  etaAt?: Date | null;
  etaLeadTimeDays?: number | null;
  warrantyText?: string | null;
  returnable?: boolean | null;
  quoteReference?: string | null;
  quoteExpiresAt?: Date | null;
  fitmentClaim?: string | null;
  notes?: string | null;
  capturedByUserId: number;
}

/**
 * Record one sourcing option. This is the "manual entry" implementation of
 * the sourcing abstraction (see shared/parts/optionSourcing.ts) — a real
 * future supplier-API adapter would normalize its results into the exact
 * same shape and call this same function, not a parallel write path.
 */
export async function addSupplierOption(input: AddSupplierOptionInput) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });

  await requireRequirementInFleet(db, input.fleetId, input.partRequirementId);

  const [created] = await db
    .insert(partSupplierOptions)
    .values({
      fleetId: input.fleetId,
      partRequirementId: input.partRequirementId,
      partId: input.partId ?? null,
      supplierName: input.supplierName,
      supplierContact: input.supplierContact ?? null,
      supplierLocation: input.supplierLocation ?? null,
      externalSupplierId: input.externalSupplierId ?? null,
      quotedPartNumber: input.quotedPartNumber ?? null,
      conditionType: input.conditionType ?? null,
      priceCents: input.priceCents ?? null,
      currency: input.currency ?? "CAD",
      freightCents: input.freightCents ?? null,
      coreChargeCents: input.coreChargeCents ?? null,
      stockStatus: input.stockStatus ?? null,
      availabilityState: input.availabilityState ?? null,
      etaType: input.etaType ?? null,
      etaAt: input.etaAt ?? null,
      etaLeadTimeDays: input.etaLeadTimeDays ?? null,
      warrantyText: input.warrantyText ?? null,
      returnable: input.returnable ?? null,
      quoteReference: input.quoteReference ?? null,
      quoteExpiresAt: input.quoteExpiresAt ?? null,
      source: "manual_entry",
      fitmentClaim: input.fitmentClaim ?? null,
      notes: input.notes ?? null,
      capturedByUserId: input.capturedByUserId,
    })
    .returning();

  return created;
}

export async function listSupplierOptionsForRequirement(fleetId: number, partRequirementId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(partSupplierOptions)
    .where(
      and(
        eq(partSupplierOptions.fleetId, fleetId),
        eq(partSupplierOptions.partRequirementId, partRequirementId)
      )
    );
}

export async function getSupplierOption(fleetId: number, id: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(partSupplierOptions)
    .where(and(eq(partSupplierOptions.id, id), eq(partSupplierOptions.fleetId, fleetId)))
    .limit(1);
  return row ?? null;
}

// partSupplierOptions.id is a global (not per-fleet) serial primary key, so
// its owning fleet can be looked up directly — same pattern as
// getCaseFleetId/getPartRequirementFleetId — needed by router endpoints
// keyed by a supplier option id alone.
export async function getSupplierOptionFleetId(id: number): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select({ fleetId: partSupplierOptions.fleetId })
    .from(partSupplierOptions)
    .where(eq(partSupplierOptions.id, id))
    .limit(1);
  return row?.fleetId ?? null;
}

/**
 * Compare a requirement's captured options using TruckFixr's OWN current
 * fitment assessment (never the supplier's fitmentClaim) as the primary
 * sort key. A requirement with no assessment yet treats every option at the
 * least-safe tier (`not_confirmed`) — absence of evidence is never treated
 * as a safe default, and a not_confirmed/ambiguous tier is hard-gated (see
 * shared/parts/recommendation.ts), so it never becomes "the recommendation"
 * by default either.
 */
export async function getRecommendedOptions(
  fleetId: number,
  partRequirementId: number,
  now: Date = new Date()
): Promise<ComparisonResult> {
  const [options, currentAssessment] = await Promise.all([
    listSupplierOptionsForRequirement(fleetId, partRequirementId),
    getCurrentFitmentAssessment(fleetId, partRequirementId),
  ]);

  const fitmentState: FitmentState = (currentAssessment?.state as FitmentState) ?? "not_confirmed";

  const forRanking: SupplierOptionForRanking[] = options.map((option) => ({
    id: option.id,
    currency: option.currency,
    priceCents: option.priceCents,
    freightCents: option.freightCents,
    coreChargeCents: option.coreChargeCents,
    condition: option.conditionType as PartCondition | null,
    availabilityState: option.availabilityState as AvailabilityState | null,
    etaType: option.etaType as EtaType | null,
    etaAt: option.etaAt,
    etaLeadTimeDays: option.etaLeadTimeDays,
    warrantyText: option.warrantyText,
    returnable: option.returnable,
    quoteExpiresAt: option.quoteExpiresAt,
    fitmentState,
  }));

  return compareOptions(forRanking, now);
}
