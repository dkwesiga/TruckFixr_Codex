import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { partRequirements, partSupplierOptions } from "../../drizzle/schema";
import { rankSupplierOptions, type SupplierOptionForRanking } from "@shared/parts/recommendation";
import { getCurrentFitmentAssessment } from "./partFitmentAssessments";
import type { FitmentState } from "@shared/parts/fitmentEvidence";

// Represents a candidate sourcing option only — no ordering, no supplier
// contact, no procurement (Phase 2+). `fitmentClaim` is the SUPPLIER's own,
// unverified statement; it is never copied into or treated as a
// partFitmentAssessments row. See docs/architecture/parts-acquisition.md §13.

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

export async function addSupplierOption(input: {
  fleetId: number;
  partRequirementId: number;
  partId?: number | null;
  supplierName: string;
  quotedPartNumber?: string | null;
  priceCents?: number | null;
  currency?: string;
  freightCents?: number | null;
  stockStatus?: string | null;
  etaAt?: Date | null;
  warrantyText?: string | null;
  returnable?: boolean | null;
  quoteReference?: string | null;
  fitmentClaim?: string | null;
  notes?: string | null;
  capturedByUserId: number;
}) {
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
      quotedPartNumber: input.quotedPartNumber ?? null,
      priceCents: input.priceCents ?? null,
      currency: input.currency ?? "CAD",
      freightCents: input.freightCents ?? null,
      stockStatus: input.stockStatus ?? null,
      etaAt: input.etaAt ?? null,
      warrantyText: input.warrantyText ?? null,
      returnable: input.returnable ?? null,
      quoteReference: input.quoteReference ?? null,
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

/**
 * Rank a requirement's captured options using TruckFixr's OWN current
 * fitment assessment (never the supplier's fitmentClaim) as the primary
 * sort key. A requirement with no assessment yet ranks every option at the
 * least-safe tier (`not_confirmed`) — absence of evidence is never treated
 * as a safe default.
 */
export async function getRecommendedOptions(fleetId: number, partRequirementId: number) {
  const [options, currentAssessment] = await Promise.all([
    listSupplierOptionsForRequirement(fleetId, partRequirementId),
    getCurrentFitmentAssessment(fleetId, partRequirementId),
  ]);

  const fitmentState: FitmentState = (currentAssessment?.state as FitmentState) ?? "not_confirmed";

  const forRanking: SupplierOptionForRanking[] = options.map((option) => ({
    id: option.id,
    priceCents: option.priceCents,
    freightCents: option.freightCents,
    etaAt: option.etaAt,
    warrantyText: option.warrantyText,
    returnable: option.returnable,
    stockStatus: option.stockStatus,
    fitmentState,
  }));

  return rankSupplierOptions(forRanking);
}
