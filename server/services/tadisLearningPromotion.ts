import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import {
  fleets,
  maintenanceCases,
  maintenanceDecisions,
  partnerProfiles,
  repairOutcomes,
  tadisLearningRecords,
  vehicles,
} from "../../drizzle/schema";
import { RESOLVED_OUTCOME_STATES, type OutcomeState } from "@shared/tadis/outcomeLifecycle";
import { classifyCaseEligibility, type TadisEligibilityState } from "@shared/tadis/eligibility";
import { isKnownCaseType, type CaseType } from "@shared/tadis/caseTypes";
import { detectLikelyPii } from "./partnerKnowledge";
import { logMaintenanceActivity } from "./maintenanceActivityLog";

// Automatic bridge: whenever an Outcome reaches a resolved state, re-evaluate
// TADIS eligibility and keep a de-identified `tadisLearningRecords` candidate
// row in sync (§12/§13). This never publishes anything outside the tenant on
// its own — a candidate still requires an explicit promoteCandidate action to
// influence retrieval broadly, mirroring the existing needs_review gate used
// by faultCodeReferences (see partnerKnowledge.ts / partner.ts).
export async function evaluateAndUpsertCandidate(input: { fleetId: number; outcomeId: number }) {
  const db = await getDb();
  if (!db) return null;

  const [outcome] = await db
    .select()
    .from(repairOutcomes)
    .where(and(eq(repairOutcomes.id, input.outcomeId), eq(repairOutcomes.fleetId, input.fleetId)))
    .limit(1);
  if (!outcome) return null;

  const [fleet] = await db
    .select({ id: fleets.id, isPartner: fleets.isPartner })
    .from(fleets)
    .where(eq(fleets.id, input.fleetId))
    .limit(1);
  if (!fleet?.isPartner) return null;

  const [profile] = await db
    .select({ contributionPolicy: partnerProfiles.contributionPolicy })
    .from(partnerProfiles)
    .where(eq(partnerProfiles.fleetId, input.fleetId))
    .limit(1);
  const contributionPolicy = profile?.contributionPolicy ?? "private_only";
  if (contributionPolicy === "private_only") return null;

  const caseRow = outcome.maintenanceCaseId
    ? (
        await db
          .select()
          .from(maintenanceCases)
          .where(eq(maintenanceCases.id, outcome.maintenanceCaseId))
          .limit(1)
      )[0]
    : null;
  if (!caseRow) return null;

  const decision = caseRow.currentDecisionId
    ? (
        await db
          .select()
          .from(maintenanceDecisions)
          .where(eq(maintenanceDecisions.id, caseRow.currentDecisionId))
          .limit(1)
      )[0]
    : null;

  const [vehicle] = await db
    .select()
    .from(vehicles)
    .where(eq(vehicles.id, outcome.vehicleId))
    .limit(1);

  const caseType: CaseType = isKnownCaseType(caseRow.caseType ?? "")
    ? (caseRow.caseType as CaseType)
    : "other";

  const eligibility = classifyCaseEligibility({
    caseType,
    outcomeState: (outcome.outcomeState as OutcomeState) ?? "unknown",
    qualityTier: (outcome.evidenceQualityTier as never) ?? null,
    hasRootCauseDocumented: Boolean(outcome.confirmedFault?.trim()),
    hasResolution: Boolean(decision),
  });

  // Persist the suggestion onto the case UNLESS a human already overrode it.
  if (!caseRow.tadisEligibilityOverriddenAt) {
    await db
      .update(maintenanceCases)
      .set({
        tadisEligibility: eligibility.suggested,
        tadisEligibilityReason: eligibility.reason,
        updatedAt: new Date(),
      })
      .where(eq(maintenanceCases.id, caseRow.id));
  }

  const effectiveEligibility: TadisEligibilityState = caseRow.tadisEligibilityOverriddenAt
    ? (caseRow.tadisEligibility as TadisEligibilityState)
    : eligibility.suggested;

  if (effectiveEligibility === "operational_record" || effectiveEligibility === "not_assessed") {
    return null;
  }
  if (!RESOLVED_OUTCOME_STATES.includes((outcome.outcomeState as OutcomeState) ?? "unknown")) {
    return null;
  }

  // De-identification: only generalizable fields cross the boundary. No
  // customer name/phone/email/invoice/pricing/private notes/fleet identity.
  const piiScanTargets = [outcome.confirmedFault, outcome.repairPerformed, decision?.rationale ?? ""]
    .filter(Boolean)
    .join(" \n ");
  const piiKinds = detectLikelyPii(piiScanTargets);

  const [existing] = await db
    .select({ id: tadisLearningRecords.id, eligibilityStatus: tadisLearningRecords.eligibilityStatus })
    .from(tadisLearningRecords)
    .where(eq(tadisLearningRecords.sourceOutcomeId, outcome.id))
    .limit(1);

  // A record a platform admin has already excluded stays excluded — an
  // automatic re-evaluation must never silently un-exclude it.
  if (existing?.eligibilityStatus === "excluded") return existing;

  const values = {
    sourceOutcomeId: outcome.id,
    sourceMaintenanceCaseId: caseRow.id,
    originFleetId: input.fleetId,
    make: vehicle?.make ?? null,
    model: vehicle?.model ?? null,
    modelYear: vehicle?.year ?? null,
    engineMake: vehicle?.engineMake ?? null,
    engineModel: null,
    assetType: vehicle?.assetType ?? null,
    symptomsJson: (decision?.likelyCausesJson ?? null) as never,
    faultCodesJson: outcome.confirmedFaultCode ? ([outcome.confirmedFaultCode] as never) : null,
    affectedSystem: outcome.systemCategory ?? null,
    affectedSubsystem: outcome.componentCategory ?? null,
    diagnosticFindings: piiKinds.length === 0 ? decision?.rationale ?? null : null,
    rootCause: piiKinds.length === 0 ? outcome.confirmedFault : "[withheld pending PII review]",
    resolutionCategory: decision?.resolutionCategory ?? null,
    repairAction: piiKinds.length === 0 ? outcome.repairPerformed : "[withheld pending PII review]",
    partsReplacedJson: (outcome.partsReplaced ?? null) as never,
    verificationMethod: outcome.verificationMethod ?? null,
    outcomeState: outcome.outcomeState,
    evidenceQualityScore: outcome.evidenceQualityScore ?? 0,
    evidenceQualityTier: outcome.evidenceQualityTier ?? "low",
    caseType,
    repairCategory: outcome.systemCategory ?? null,
    recordOrigin: caseRow.recordOrigin ?? "live",
    eligibilityStatus: "candidate" as const,
    updatedAt: new Date(),
  };

  if (existing) {
    const [updated] = await db
      .update(tadisLearningRecords)
      .set(values)
      .where(eq(tadisLearningRecords.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db.insert(tadisLearningRecords).values(values).returning();
  await logMaintenanceActivity({
    fleetId: input.fleetId,
    userId: outcome.verifiedByUserId ?? outcome.recordedByUserId,
    action: "tadis_candidate_created",
    entityType: "tadisLearningRecord",
    entityId: created?.id ?? null,
    details: { sourceOutcomeId: outcome.id, eligibility: effectiveEligibility },
  });
  return created;
}

// Promote a candidate into a fully de-identified, actively-ranked learning
// record. Requires no detected PII in the withheld fields. Router gates this
// to the partner fleet's owner/manager (their own data) or TruckFixr staff.
export async function promoteCandidate(input: {
  learningRecordId: number;
  actorUserId: number;
}) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });

  const [record] = await db
    .select()
    .from(tadisLearningRecords)
    .where(eq(tadisLearningRecords.id, input.learningRecordId))
    .limit(1);
  if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "Learning record not found." });

  if (record.rootCause === "[withheld pending PII review]" || record.repairAction === "[withheld pending PII review]") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This candidate still has withheld fields pending PII review and cannot be promoted yet.",
    });
  }

  const [updated] = await db
    .update(tadisLearningRecords)
    .set({
      eligibilityStatus: "promoted",
      promotedByUserId: input.actorUserId,
      promotedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(tadisLearningRecords.id, record.id))
    .returning();

  await logMaintenanceActivity({
    fleetId: record.originFleetId,
    userId: input.actorUserId,
    action: "tadis_record_promoted",
    entityType: "tadisLearningRecord",
    entityId: record.id,
    details: {},
  });

  return updated;
}

// Flag/exclude a learning record from TADIS retrieval (§4, Platform Admin
// capability). Router gates this to TruckFixr staff only.
export async function excludeLearningRecord(input: {
  learningRecordId: number;
  actorUserId: number;
  reason: string;
}) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });

  const [record] = await db
    .select({ id: tadisLearningRecords.id, originFleetId: tadisLearningRecords.originFleetId })
    .from(tadisLearningRecords)
    .where(eq(tadisLearningRecords.id, input.learningRecordId))
    .limit(1);
  if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "Learning record not found." });
  if (!input.reason?.trim()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "A reason is required to exclude a learning record." });
  }

  const [updated] = await db
    .update(tadisLearningRecords)
    .set({
      eligibilityStatus: "excluded",
      excludedReason: input.reason,
      excludedByUserId: input.actorUserId,
      excludedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(tadisLearningRecords.id, record.id))
    .returning();

  await logMaintenanceActivity({
    fleetId: record.originFleetId,
    userId: input.actorUserId,
    action: "tadis_record_excluded",
    entityType: "tadisLearningRecord",
    entityId: record.id,
    details: { reason: input.reason },
  });

  return updated;
}
