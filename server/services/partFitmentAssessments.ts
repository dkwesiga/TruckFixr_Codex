import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { partFitmentAssessments, partRequirements } from "../../drizzle/schema";
import { assessFitment, type FitmentEvidenceInput } from "@shared/parts/fitmentEvidence";

// Append-only fitment-assessment history. Never updates an existing row —
// a new assessment (more evidence, a technician's manual confirmation) is
// always a NEW row, so the evidence trail for a requirement is never lost.
// See .claude/skills/truckfixr-parts-fitment/SKILL.md and
// docs/architecture/parts-acquisition.md.

export type FitmentAssessmentSource = "deterministic_rule" | "technician_manual" | "ai_assisted_extraction";

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

export async function recordFitmentAssessment(input: {
  fleetId: number;
  partRequirementId: number;
  partId?: number | null;
  vehicleId: string;
  evidence: FitmentEvidenceInput;
  source: FitmentAssessmentSource;
  assessedByUserId?: number | null;
}) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });

  await requireRequirementInFleet(db, input.fleetId, input.partRequirementId);

  // AI may only ever supply evidence for the deterministic rule below to
  // evaluate — it must never set `state` itself. `assessFitment` is the
  // ONLY thing that determines the resulting state; a caller cannot pass a
  // pre-decided state in.
  const result = assessFitment(input.evidence);

  const [created] = await db
    .insert(partFitmentAssessments)
    .values({
      fleetId: input.fleetId,
      partRequirementId: input.partRequirementId,
      partId: input.partId ?? null,
      vehicleId: input.vehicleId,
      state: result.state,
      evidenceJson: input.evidence as never,
      missingEvidenceJson: result.missingEvidence as never,
      conflictsJson: result.conflicts as never,
      source: input.source,
      assessedByUserId: input.assessedByUserId ?? null,
    })
    .returning();

  return { assessment: created, result };
}

export async function getCurrentFitmentAssessment(fleetId: number, partRequirementId: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(partFitmentAssessments)
    .where(
      and(
        eq(partFitmentAssessments.fleetId, fleetId),
        eq(partFitmentAssessments.partRequirementId, partRequirementId)
      )
    )
    .orderBy(desc(partFitmentAssessments.createdAt))
    .limit(1);
  return row ?? null;
}

export async function listFitmentAssessments(fleetId: number, partRequirementId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(partFitmentAssessments)
    .where(
      and(
        eq(partFitmentAssessments.fleetId, fleetId),
        eq(partFitmentAssessments.partRequirementId, partRequirementId)
      )
    )
    .orderBy(desc(partFitmentAssessments.createdAt));
}
