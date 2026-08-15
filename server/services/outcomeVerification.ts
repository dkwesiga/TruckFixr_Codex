import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { maintenanceCases, outcomeRevisions, repairCycles, repairOutcomes } from "../../drizzle/schema";
import {
  canTransitionOutcome,
  type EvidenceSource,
  type OutcomeState,
  type VerificationMethod,
  type ConfirmationEvidenceType,
} from "@shared/tadis/outcomeLifecycle";
import { logMaintenanceActivity } from "./maintenanceActivityLog";
import { computeOutcomeEvidenceQuality } from "./knowledgeQuality";
import { evaluateAndUpsertCandidate } from "./tadisLearningPromotion";

type RepairOutcomeRow = typeof repairOutcomes.$inferSelect;

export async function listOutcomesForCase(fleetId: number, caseId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(repairOutcomes)
    .where(and(eq(repairOutcomes.fleetId, fleetId), eq(repairOutcomes.maintenanceCaseId, caseId)));
}

async function requireOutcome(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  fleetId: number,
  outcomeId: number
): Promise<RepairOutcomeRow> {
  const [row] = await db
    .select()
    .from(repairOutcomes)
    .where(and(eq(repairOutcomes.id, outcomeId), eq(repairOutcomes.fleetId, fleetId)))
    .limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Repair outcome not found in this fleet." });
  return row;
}

function assertTransition(from: string, to: OutcomeState) {
  if (!canTransitionOutcome(from as OutcomeState, to)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Cannot move an Outcome from ${from} to ${to}.`,
    });
  }
}

// After any lifecycle change: recompute the evidence-quality score and
// refresh the TADIS candidate record. Both are best-effort — a failure here
// must never roll back the outcome transition itself.
async function refreshDownstream(fleetId: number, outcomeId: number) {
  try {
    await computeOutcomeEvidenceQuality({ fleetId, outcomeId });
    await evaluateAndUpsertCandidate({ fleetId, outcomeId });
  } catch (error) {
    console.error("[outcomeVerification] downstream refresh failed", { fleetId, outcomeId, error });
  }
}

// Create or update the Reported Outcome for a repair cycle. Any staff member
// with the submitRepairOutcome capability may report what a customer/shop
// says happened — this does NOT require technician authority (§9).
export async function reportOutcome(input: {
  fleetId: number;
  caseId: number;
  repairCycleId?: number | null;
  actorUserId: number;
  confirmedFault: string;
  repairPerformed: string;
  partsReplaced?: string[];
  evidenceSource: EvidenceSource;
  vehicleId: string;
  repairNotes?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });

  const [caseRow] = await db
    .select({ id: maintenanceCases.id, reference: maintenanceCases.reference })
    .from(maintenanceCases)
    .where(and(eq(maintenanceCases.id, input.caseId), eq(maintenanceCases.fleetId, input.fleetId)))
    .limit(1);
  if (!caseRow) throw new TRPCError({ code: "NOT_FOUND", message: "Case not found in this fleet." });

  const now = new Date();
  const [created] = await db
    .insert(repairOutcomes)
    .values({
      fleetId: input.fleetId,
      vehicleId: input.vehicleId,
      maintenanceCaseId: input.caseId,
      repairCycleId: input.repairCycleId ?? null,
      recordedByUserId: input.actorUserId,
      submittedByUserId: input.actorUserId,
      confirmedFault: input.confirmedFault,
      repairPerformed: input.repairPerformed,
      partsReplaced: (input.partsReplaced ?? []) as never,
      source: "partner_shop",
      confirmationState: "reported",
      outcomeState: "reported",
      reportedAt: now,
      reportedByUserId: input.actorUserId,
      evidenceSource: input.evidenceSource,
      repairNotes: input.repairNotes ?? null,
    })
    .returning();

  if (input.repairCycleId) {
    await db
      .update(repairCycles)
      .set({ outcomeId: created.id, updatedAt: now })
      .where(and(eq(repairCycles.id, input.repairCycleId), eq(repairCycles.fleetId, input.fleetId)));
  }

  await logMaintenanceActivity({
    fleetId: input.fleetId,
    userId: input.actorUserId,
    action: "outcome_reported",
    entityType: "repairOutcome",
    entityId: created.id,
    entityRef: caseRow.reference,
    details: { evidenceSource: input.evidenceSource },
  });

  await refreshDownstream(input.fleetId, created.id);
  return created;
}

// Mark an Outcome Verified. Gated at the ROUTER by the verifyOutcome
// capability (technician-only per §4) — this function trusts the caller was
// already authorized, matching the convention of the existing maintenance
// services (addDecision, startRepairCycle, etc).
export async function verifyOutcome(input: {
  fleetId: number;
  outcomeId: number;
  actorUserId: number;
  verificationMethod: VerificationMethod;
  verificationNotes?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });

  const outcome = await requireOutcome(db, input.fleetId, input.outcomeId);
  assertTransition(outcome.outcomeState, "verified");

  const now = new Date();
  await db
    .update(repairOutcomes)
    .set({
      outcomeState: "verified",
      verifiedAt: now,
      verifiedByUserId: input.actorUserId,
      verificationMethod: input.verificationMethod,
      verificationNotes: input.verificationNotes ?? null,
      confirmationState: "manager_confirmed",
      updatedAt: now,
    })
    .where(eq(repairOutcomes.id, outcome.id));

  await logMaintenanceActivity({
    fleetId: input.fleetId,
    userId: input.actorUserId,
    action: "outcome_verified",
    entityType: "repairOutcome",
    entityId: outcome.id,
    details: { verificationMethod: input.verificationMethod },
  });

  await refreshDownstream(input.fleetId, outcome.id);
  return { ok: true, outcomeState: "verified" as const };
}

// A Verified Outcome that later gains evidence it held (§9/§10). Gated at the
// router by confirmOutcome.
export async function confirmOutcome(input: {
  fleetId: number;
  outcomeId: number;
  actorUserId: number;
  confirmationEvidenceType: ConfirmationEvidenceType;
}) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });

  const outcome = await requireOutcome(db, input.fleetId, input.outcomeId);
  assertTransition(outcome.outcomeState, "confirmed");

  const now = new Date();
  await db
    .update(repairOutcomes)
    .set({
      outcomeState: "confirmed",
      confirmedAt: now,
      confirmedByUserId: input.actorUserId,
      confirmationEvidenceType: input.confirmationEvidenceType,
      updatedAt: now,
    })
    .where(eq(repairOutcomes.id, outcome.id));

  await logMaintenanceActivity({
    fleetId: input.fleetId,
    userId: input.actorUserId,
    action: "outcome_confirmed",
    entityType: "repairOutcome",
    entityId: outcome.id,
    details: { confirmationEvidenceType: input.confirmationEvidenceType },
  });

  await refreshDownstream(input.fleetId, outcome.id);
  return { ok: true, outcomeState: "confirmed" as const };
}

// Record that a repair/resolution did NOT resolve the issue (§9, Scenario C).
// This record is never deleted — it becomes negative TADIS evidence.
export async function markOutcomeFailed(input: {
  fleetId: number;
  outcomeId: number;
  actorUserId: number;
  failureNotes: string;
}) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });

  const outcome = await requireOutcome(db, input.fleetId, input.outcomeId);
  assertTransition(outcome.outcomeState, "failed");

  const wasVerifiedOrConfirmed = outcome.outcomeState === "verified" || outcome.outcomeState === "confirmed";
  const now = new Date();
  await db
    .update(repairOutcomes)
    .set({
      outcomeState: "failed",
      failedAt: now,
      failedByUserId: input.actorUserId,
      failureNotes: input.failureNotes,
      repeatFailure: true,
      updatedAt: now,
    })
    .where(eq(repairOutcomes.id, outcome.id));

  if (wasVerifiedOrConfirmed) {
    await db.insert(outcomeRevisions).values({
      outcomeId: outcome.id,
      fleetId: input.fleetId,
      changedByUserId: input.actorUserId,
      changeType: "technical_correction",
      reason: `Comeback discovered after ${outcome.outcomeState}: ${input.failureNotes}`,
      beforeStateJson: { outcomeState: outcome.outcomeState } as never,
      afterStateJson: { outcomeState: "failed" } as never,
      requiresReVerification: false,
    });
  }

  await logMaintenanceActivity({
    fleetId: input.fleetId,
    userId: input.actorUserId,
    action: "outcome_failed",
    entityType: "repairOutcome",
    entityId: outcome.id,
    details: { previousState: outcome.outcomeState },
  });

  await refreshDownstream(input.fleetId, outcome.id);
  return { ok: true, outcomeState: "failed" as const };
}

// Optional downtime/financial impact (§20/§21). Deliberately never touches
// outcomeState, evidenceQualityScore, or any technical field — a repair can
// be expensive and technically weak, or cheap and a Confirmed strong record;
// the two must never be merged into one score (§31). Any capability that can
// report an outcome may record its impact fields.
export async function recordOutcomeImpact(input: {
  fleetId: number;
  outcomeId: number;
  actorUserId: number;
  estimatedDowntimeAvoidedHours?: number | null;
  estimatedTowAvoidedCents?: number | null;
  estimatedRoadCallAvoidedCents?: number | null;
  estimateSource: "customer_entered" | "system_estimate" | "actual";
}) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });

  const outcome = await requireOutcome(db, input.fleetId, input.outcomeId);

  await db
    .update(repairOutcomes)
    .set({
      estimatedDowntimeAvoidedHours:
        input.estimatedDowntimeAvoidedHours != null ? String(input.estimatedDowntimeAvoidedHours) : null,
      estimatedTowAvoidedCents: input.estimatedTowAvoidedCents ?? null,
      estimatedRoadCallAvoidedCents: input.estimatedRoadCallAvoidedCents ?? null,
      estimateSource: input.estimateSource,
      updatedAt: new Date(),
    })
    .where(eq(repairOutcomes.id, outcome.id));

  await logMaintenanceActivity({
    fleetId: input.fleetId,
    userId: input.actorUserId,
    action: "outcome_impact_recorded",
    entityType: "repairOutcome",
    entityId: outcome.id,
    details: { estimateSource: input.estimateSource },
  });

  return { ok: true };
}

// Correct a TECHNICAL fact (confirmedFault, repairPerformed, verification
// method, etc) on an already Verified/Confirmed outcome (§17). Never mutates
// the verified row in place: inserts a new row referencing the old one,
// supersedes the old row, and forces the new row back to "reported" pending
// re-verification by an authorized technician. Always logged to
// outcomeRevisions with before/after state. Router gates this to TruckFixr
// platform admins and fleet owners/managers — never a bare capability grant.
export async function reviseVerifiedOutcome(input: {
  fleetId: number;
  outcomeId: number;
  actorUserId: number;
  reason: string;
  patch: Partial<
    Pick<
      RepairOutcomeRow,
      "confirmedFault" | "repairPerformed" | "confirmedFaultCode" | "systemCategory" | "componentCategory"
    >
  >;
}) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });

  const outcome = await requireOutcome(db, input.fleetId, input.outcomeId);
  if (outcome.outcomeState !== "verified" && outcome.outcomeState !== "confirmed") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Only a Verified or Confirmed outcome requires the revision workflow.",
    });
  }
  if (!input.reason?.trim()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "A reason is required to revise a verified outcome." });
  }

  const now = new Date();
  const { id: _oldId, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = outcome;
  const [revised] = await db
    .insert(repairOutcomes)
    .values({
      ...rest,
      ...input.patch,
      outcomeState: "reported",
      verifiedAt: null,
      verifiedByUserId: null,
      confirmedAt: null,
      confirmedByUserId: null,
      technicalRevisionOfId: outcome.id,
      supersededAt: null,
      supersededByOutcomeId: null,
      createdAt: now,
      updatedAt: now,
    } as never)
    .returning();

  await db
    .update(repairOutcomes)
    .set({ supersededAt: now, supersededByOutcomeId: revised.id, updatedAt: now })
    .where(eq(repairOutcomes.id, outcome.id));

  await db.insert(outcomeRevisions).values({
    outcomeId: outcome.id,
    fleetId: input.fleetId,
    changedByUserId: input.actorUserId,
    changeType: "technical_correction",
    reason: input.reason,
    beforeStateJson: rest as never,
    afterStateJson: { ...rest, ...input.patch } as never,
    requiresReVerification: true,
  });

  await logMaintenanceActivity({
    fleetId: input.fleetId,
    userId: input.actorUserId,
    action: "outcome_revised",
    entityType: "repairOutcome",
    entityId: revised.id,
    details: { previousOutcomeId: outcome.id, reason: input.reason },
  });

  return revised;
}
