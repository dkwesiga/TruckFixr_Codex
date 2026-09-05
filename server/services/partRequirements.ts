import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { maintenanceCases, partRequirements } from "../../drizzle/schema";
import {
  canTransitionPartRequirement,
  type PartRequirementStatus,
} from "@shared/parts/partRequirementWorkflow";
import { identifyPartCandidate, type IdentifyPartCandidateInput } from "./partIdentification";

// Fleet-scoped part-requirement CRUD. Tenant path: fleetId is a direct
// column on partRequirements (same convention as maintenanceDecisions/
// repairCycles/repairOutcomes), and every write/read here re-verifies the
// owning maintenanceCases row belongs to the SAME fleetId the caller
// resolved server-side (never a client-supplied fleetId trusted on its
// own) — see server/services/maintenanceTenantScope.ts, reused unchanged
// by the router. See docs/architecture/tenant-isolation-test-coverage.md.

async function requireCaseInFleet(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  fleetId: number,
  caseId: number
) {
  const [caseRow] = await db
    .select({ id: maintenanceCases.id })
    .from(maintenanceCases)
    .where(and(eq(maintenanceCases.id, caseId), eq(maintenanceCases.fleetId, fleetId)))
    .limit(1);
  if (!caseRow) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Case not found in this fleet." });
  }
}

export async function createPartRequirement(input: {
  fleetId: number;
  caseId: number;
  repairCycleId?: number | null;
  description: string;
  reasonContext?: string | null;
  quantity?: number;
  requestedByUserId: number;
}) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });

  await requireCaseInFleet(db, input.fleetId, input.caseId);

  const [created] = await db
    .insert(partRequirements)
    .values({
      fleetId: input.fleetId,
      caseId: input.caseId,
      repairCycleId: input.repairCycleId ?? null,
      description: input.description,
      reasonContext: input.reasonContext ?? null,
      quantity: input.quantity ?? 1,
      status: "part_required",
      requestedByUserId: input.requestedByUserId,
    })
    .returning();

  return created;
}

export async function listPartRequirementsForCase(fleetId: number, caseId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(partRequirements)
    .where(and(eq(partRequirements.fleetId, fleetId), eq(partRequirements.caseId, caseId)))
    .orderBy(desc(partRequirements.createdAt));
}

// partRequirements.id is a global (not per-fleet) serial primary key, so its
// owning fleet can be looked up directly — the same pattern as
// getCaseFleetId in maintenanceCases.ts — needed by router endpoints that
// take a partRequirementId but no fleetId (e.g. adding a fitment assessment
// or supplier option to an existing requirement).
export async function getPartRequirementFleetId(id: number): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select({ fleetId: partRequirements.fleetId })
    .from(partRequirements)
    .where(eq(partRequirements.id, id))
    .limit(1);
  return row?.fleetId ?? null;
}

export async function getPartRequirement(fleetId: number, id: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(partRequirements)
    .where(and(eq(partRequirements.id, id), eq(partRequirements.fleetId, fleetId)))
    .limit(1);
  return row ?? null;
}

async function requireRequirement(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  fleetId: number,
  id: number
) {
  const [row] = await db
    .select()
    .from(partRequirements)
    .where(and(eq(partRequirements.id, id), eq(partRequirements.fleetId, fleetId)))
    .limit(1);
  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Part requirement not found in this fleet." });
  }
  return row;
}

export async function transitionPartRequirementStatus(input: {
  fleetId: number;
  id: number;
  toStatus: PartRequirementStatus;
}) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });

  const current = await requireRequirement(db, input.fleetId, input.id);
  const from = current.status as PartRequirementStatus;
  if (!canTransitionPartRequirement(from, input.toStatus)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Cannot move a part requirement from ${from} to ${input.toStatus}.`,
    });
  }

  await db
    .update(partRequirements)
    .set({ status: input.toStatus, updatedAt: new Date() })
    .where(eq(partRequirements.id, input.id));

  return { ok: true, status: input.toStatus };
}

/**
 * Resolve the requirement's part identity (never fabricating a number — see
 * identifyPartCandidate) and advance status into fitment_review. An
 * unresolved candidate still moves to fitment_review: "no catalog match yet"
 * is not the same claim as "this part doesn't exist" (see
 * markPartNotFound for that explicit, separate determination).
 */
export async function identifyPartForRequirement(
  input: { fleetId: number; id: number } & IdentifyPartCandidateInput
) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });

  const current = await requireRequirement(db, input.fleetId, input.id);
  const result = await identifyPartCandidate({
    oemPartNumber: input.oemPartNumber,
    manufacturerPartNumber: input.manufacturerPartNumber,
    manufacturer: input.manufacturer,
    description: input.description,
    category: input.category,
  });

  await db
    .update(partRequirements)
    .set({ partId: result.partId, updatedAt: new Date() })
    .where(eq(partRequirements.id, input.id));

  // Advance status toward fitment_review, passing through `identifying`
  // first when starting from a fresh part_required requirement.
  let workingStatus = current.status as PartRequirementStatus;
  if (canTransitionPartRequirement(workingStatus, "identifying")) {
    await db
      .update(partRequirements)
      .set({ status: "identifying", updatedAt: new Date() })
      .where(eq(partRequirements.id, input.id));
    workingStatus = "identifying";
  }
  if (canTransitionPartRequirement(workingStatus, "fitment_review")) {
    await db
      .update(partRequirements)
      .set({ status: "fitment_review", updatedAt: new Date() })
      .where(eq(partRequirements.id, input.id));
  }

  return result;
}

export async function markPartNotFound(input: { fleetId: number; id: number }) {
  return transitionPartRequirementStatus({ fleetId: input.fleetId, id: input.id, toStatus: "part_not_found" });
}
