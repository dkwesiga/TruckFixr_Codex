import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { partOptionApprovals, partRequirements, partSupplierOptions } from "../../drizzle/schema";
import {
  canTransitionPartRequirement,
  type PartRequirementStatus,
} from "@shared/parts/partRequirementWorkflow";

// Human approval decisions (Parts Intelligence Phase 2 §17). Append-only —
// see drizzle/schema.ts partOptionApprovals for the full rationale.
// APPROVED_OPTION != ORDERED: this records a sourcing decision only, never a
// purchase/order event (Phase 3+).

export type ApprovalDecision = "approved" | "declined" | "needs_more_information";

async function requireRequirement(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  fleetId: number,
  partRequirementId: number
) {
  const [row] = await db
    .select()
    .from(partRequirements)
    .where(and(eq(partRequirements.id, partRequirementId), eq(partRequirements.fleetId, fleetId)))
    .limit(1);
  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Part requirement not found in this fleet." });
  }
  return row;
}

async function requireOptionInFleetOrNull(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  fleetId: number,
  optionId: number | null | undefined,
  partRequirementId: number
) {
  if (optionId == null) return null;
  const [row] = await db
    .select({ id: partSupplierOptions.id })
    .from(partSupplierOptions)
    .where(
      and(
        eq(partSupplierOptions.id, optionId),
        eq(partSupplierOptions.fleetId, fleetId),
        eq(partSupplierOptions.partRequirementId, partRequirementId)
      )
    )
    .limit(1);
  if (!row) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Supplier option not found on this part requirement in this fleet.",
    });
  }
  return row.id;
}

// Atomic compare-and-swap: only actually moves the requirement to `to` if it
// is STILL `from` at the moment of the write (single UPDATE ... WHERE status
// = from ... RETURNING). Guards the two-managers-decide-concurrently race:
// without this, two concurrent decisions on the same requirement could both
// read "awaiting_approval", both pass the allow-list check, and both insert
// a partOptionApprovals row (e.g. two different selectedOptionId values)
// even though only one decision should ever win. Returns false (no rows
// affected) when another decision already changed the status first — the
// caller must not insert an approval row in that case.
async function tryTransitionAtomically(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  fleetId: number,
  id: number,
  from: PartRequirementStatus,
  to: PartRequirementStatus
): Promise<boolean> {
  if (!canTransitionPartRequirement(from, to)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Cannot move a part requirement from ${from} to ${to}.`,
    });
  }
  const updated = await db
    .update(partRequirements)
    .set({ status: to, updatedAt: new Date() })
    .where(
      and(
        eq(partRequirements.id, id),
        eq(partRequirements.fleetId, fleetId),
        eq(partRequirements.status, from)
      )
    )
    .returning({ id: partRequirements.id });
  return updated.length > 0;
}

/**
 * Record a human approval decision. `recommendedOptionId` is a snapshot of
 * what TruckFixr was recommending at decision time — captured by the
 * caller (typically from the same compareOptions() call that produced the
 * options the human is looking at) and never recomputed or overwritten
 * later, even if a subsequent re-ranking would recommend something else.
 * `selectedOptionId` is the human's actual choice, which may differ from
 * the recommendation — both are preserved, neither overwrites the other.
 */
export async function recordApprovalDecision(input: {
  fleetId: number;
  partRequirementId: number;
  decision: ApprovalDecision;
  recommendedOptionId?: number | null;
  selectedOptionId?: number | null;
  reasonNote?: string | null;
  decidedByUserId: number;
}) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });

  const requirement = await requireRequirement(db, input.fleetId, input.partRequirementId);

  if (input.decision === "approved" && input.selectedOptionId == null) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "An approved decision must select an option." });
  }

  const recommendedOptionId = await requireOptionInFleetOrNull(
    db,
    input.fleetId,
    input.recommendedOptionId,
    input.partRequirementId
  );
  const selectedOptionId = await requireOptionInFleetOrNull(
    db,
    input.fleetId,
    input.selectedOptionId,
    input.partRequirementId
  );

  // Move into awaiting_approval first, unless a prior decision cycle
  // already left the requirement there (needs_more_information can loop
  // back through fitment/sourcing and return to awaiting_approval again).
  // Both this hop and the final decision transition below use the atomic
  // compare-and-swap: without it, two concurrent decisions could each read
  // the requirement's status before either writes, both pass every check
  // above, and both insert a partOptionApprovals row even though only one
  // decision should ever win. A CAS failure at either hop means another
  // request already changed the status first, so this request must fail
  // loudly (CONFLICT) instead of silently corrupting provenance with a
  // phantom approval row.
  const from = requirement.status as PartRequirementStatus;
  if (from !== "awaiting_approval") {
    const movedToAwaitingApproval = await tryTransitionAtomically(
      db,
      input.fleetId,
      requirement.id,
      from,
      "awaiting_approval"
    );
    if (!movedToAwaitingApproval) {
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "This part requirement's status changed before this decision could be recorded — reload and try again.",
      });
    }
  }

  const transitioned = await tryTransitionAtomically(
    db,
    input.fleetId,
    requirement.id,
    "awaiting_approval",
    input.decision
  );
  if (!transitioned) {
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "This part requirement's status changed before this decision could be recorded — reload and try again.",
    });
  }

  const [created] = await db
    .insert(partOptionApprovals)
    .values({
      fleetId: input.fleetId,
      partRequirementId: input.partRequirementId,
      decision: input.decision,
      recommendedOptionId,
      selectedOptionId,
      reasonNote: input.reasonNote ?? null,
      decidedByUserId: input.decidedByUserId,
    })
    .returning();

  return created;
}

export async function listApprovalHistory(fleetId: number, partRequirementId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(partOptionApprovals)
    .where(
      and(
        eq(partOptionApprovals.fleetId, fleetId),
        eq(partOptionApprovals.partRequirementId, partRequirementId)
      )
    )
    .orderBy(desc(partOptionApprovals.decidedAt));
}

export async function getCurrentApproval(fleetId: number, partRequirementId: number) {
  const [latest] = await listApprovalHistory(fleetId, partRequirementId);
  return latest ?? null;
}
