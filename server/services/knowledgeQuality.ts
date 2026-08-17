import { and, count, eq } from "drizzle-orm";
import { getDb } from "../db";
import {
  maintenanceCases,
  maintenanceDecisions,
  repairDocuments,
  repairOutcomes,
  vehicles,
} from "../../drizzle/schema";
import {
  scoreOutcomeEvidence,
  type QualityScoreInput,
  type QualityScoreResult,
} from "@shared/tadis/qualityScore";
import type { EvidenceSource } from "@shared/tadis/outcomeLifecycle";

// Builds the evidence checklist for a repairOutcome from what is actually on
// file (case, current decision, vehicle, uploaded documents) and scores it
// via the single configurable weight table in shared/tadis/qualityScore.ts.
// Persists the result onto the outcome row so admin analytics and retrieval
// ranking read a precomputed value instead of recomputing on every query.
export async function computeOutcomeEvidenceQuality(input: {
  fleetId: number;
  outcomeId: number;
}): Promise<QualityScoreResult | null> {
  const db = await getDb();
  if (!db) return null;

  const [outcome] = await db
    .select()
    .from(repairOutcomes)
    .where(and(eq(repairOutcomes.id, input.outcomeId), eq(repairOutcomes.fleetId, input.fleetId)))
    .limit(1);
  if (!outcome) return null;

  const [vehicle] = await db
    .select()
    .from(vehicles)
    .where(eq(vehicles.id, outcome.vehicleId))
    .limit(1);

  const caseRow = outcome.maintenanceCaseId
    ? (
        await db
          .select()
          .from(maintenanceCases)
          .where(eq(maintenanceCases.id, outcome.maintenanceCaseId))
          .limit(1)
      )[0]
    : null;

  const decision = caseRow?.currentDecisionId
    ? (
        await db
          .select()
          .from(maintenanceDecisions)
          .where(eq(maintenanceDecisions.id, caseRow.currentDecisionId))
          .limit(1)
      )[0]
    : null;

  const [documentCountRow] = caseRow
    ? await db
        .select({ value: count() })
        .from(repairDocuments)
        .where(eq(repairDocuments.caseId, caseRow.id))
    : [{ value: 0 }];

  const partsReplaced = Array.isArray(outcome.partsReplaced) ? outcome.partsReplaced : [];
  const provenance =
    (caseRow?.vehicleContextProvenanceJson as Record<string, string> | null) ?? null;

  const evidenceInput: QualityScoreInput = {
    vinDecoded: provenance?.vin === "vin_decoder" || Boolean(vehicle?.vin && vehicle.vin.length === 17),
    vehicleIdentityComplete: Boolean(vehicle?.make && vehicle?.model && vehicle?.year),
    engineInfoPresent: Boolean(vehicle?.engineMake),
    complaintDocumented: Boolean(caseRow?.summary?.trim()),
    symptomsDocumented: Boolean(
      (decision?.likelyCausesJson as unknown[] | null)?.length ||
        (decision?.evidenceJson as unknown[] | null)
    ),
    faultCodesCaptured: Boolean(outcome.confirmedFaultCode),
    photoOrDocEvidencePresent: (documentCountRow?.value ?? 0) > 0,
    diagnosticFindingsDocumented: Boolean(decision?.rationale?.trim()),
    rootCauseDocumented: Boolean(outcome.confirmedFault?.trim()),
    repairPerformed: Boolean(outcome.repairPerformed?.trim()),
    partsDocumented: partsReplaced.length > 0,
    verificationMethod: (outcome.verificationMethod as QualityScoreInput["verificationMethod"]) ?? null,
    technicianVerified: outcome.verifiedByUserId != null,
    outcomeState: (outcome.outcomeState as QualityScoreInput["outcomeState"]) ?? "unknown",
    evidenceSource: (outcome.evidenceSource as EvidenceSource) ?? "unknown",
    recordOrigin: (caseRow?.recordOrigin as QualityScoreInput["recordOrigin"]) ?? "live",
    repeatFailureWithinWindow: outcome.repeatFailure ?? null,
  };

  const result = scoreOutcomeEvidence(evidenceInput);

  await db
    .update(repairOutcomes)
    .set({
      evidenceQualityScore: result.score,
      evidenceQualityTier: result.tier,
      evidenceQualityBreakdownJson: result as never,
      evidenceQualityCalculatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(repairOutcomes.id, outcome.id));

  return result;
}
