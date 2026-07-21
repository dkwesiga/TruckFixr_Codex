import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { maintenanceCases, repairAuthorizations } from "../../drizzle/schema";
import {
  evaluateAuthorization,
  type AuthorizationDecision,
} from "@shared/maintenance/repairAuthorizationPolicy";
import { getFleetFeatureConfig } from "./fleetFeatures";
import { FLEET_MAINTENANCE_CAPABILITY_FLAGS } from "@shared/maintenance/featureKeys";
import { logMaintenanceActivity } from "./maintenanceActivityLog";

export interface FleetAuthorizationPolicy {
  currency: string;
  fleetLimitCents: number | null;
  managerLimitCents: number | null;
  delegationEnabled: boolean;
  delegatedLimitCents: number | null;
}

const DEFAULT_POLICY: FleetAuthorizationPolicy = {
  currency: "CAD",
  fleetLimitCents: null,
  managerLimitCents: null,
  delegationEnabled: false, // delegation defaults disabled (§40)
  delegatedLimitCents: null,
};

// Fleet policy is stored on the repair_document_review capability's valueJson
// (Phase 5 pilot settings can also write it). Falls back to safe defaults.
export async function getFleetAuthorizationPolicy(
  fleetId: number
): Promise<FleetAuthorizationPolicy> {
  const config = await getFleetFeatureConfig<Partial<FleetAuthorizationPolicy>>(
    fleetId,
    FLEET_MAINTENANCE_CAPABILITY_FLAGS.repairDocumentReview
  );
  return { ...DEFAULT_POLICY, ...(config ?? {}) };
}

export async function authorizeRepair(input: {
  fleetId: number;
  caseId: number;
  actor: { id: number; role: string };
  actorIsMaintenanceUser: boolean;
  estimateCents: number;
  repairCycleId?: number | null;
  valuesReviewed: boolean;
  scopeMatchesAssessment: boolean;
  hasUnresolvedHighVariance: boolean;
  note?: string | null;
}): Promise<{ decision: AuthorizationDecision; reasons: string[]; authorizationId: number | null }> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });

  const [caseRow] = await db
    .select()
    .from(maintenanceCases)
    .where(and(eq(maintenanceCases.id, input.caseId), eq(maintenanceCases.fleetId, input.fleetId)))
    .limit(1);
  if (!caseRow) throw new TRPCError({ code: "NOT_FOUND", message: "Case not found in this fleet." });

  const policy = await getFleetAuthorizationPolicy(input.fleetId);
  const caseIsCritical = caseRow.severity === "critical";
  const actorIsAssigned = input.actorIsMaintenanceUser
    ? caseRow.assignedMaintenanceUserId === input.actor.id
    : true;

  const evaluation = evaluateAuthorization({
    estimateCents: input.estimateCents,
    fleetLimitCents: policy.fleetLimitCents,
    managerLimitCents: policy.managerLimitCents,
    delegationEnabled: policy.delegationEnabled,
    delegatedLimitCents: policy.delegatedLimitCents,
    actorIsMaintenanceUser: input.actorIsMaintenanceUser,
    actorIsAssigned,
    caseIsCritical,
    valuesReviewed: input.valuesReviewed,
    hasUnresolvedHighVariance: input.hasUnresolvedHighVariance,
    scopeMatchesAssessment: input.scopeMatchesAssessment,
  });

  const authorized =
    evaluation.decision === "maintenance_can_authorize" ||
    evaluation.decision === "manager_can_authorize";

  const state =
    evaluation.decision === "external_approval_required"
      ? "external_required"
      : authorized
        ? "approved"
        : "pending";

  const [record] = await db
    .insert(repairAuthorizations)
    .values({
      fleetId: input.fleetId,
      caseId: input.caseId,
      repairCycleId: input.repairCycleId ?? null,
      limitCents: policy.fleetLimitCents,
      approvedAmountCents: authorized ? input.estimateCents : null,
      currency: policy.currency,
      state,
      approverUserId: authorized ? input.actor.id : null,
      approvedAt: authorized ? new Date() : null,
      note: input.note ?? (evaluation.reasons.join("; ") || null),
      createdByUserId: input.actor.id,
    })
    .returning({ id: repairAuthorizations.id });

  await logMaintenanceActivity({
    fleetId: input.fleetId,
    userId: input.actor.id,
    action: "repair_authorized",
    entityType: "repairAuthorization",
    entityId: record?.id ?? null,
    entityRef: caseRow.reference,
    details: {
      decision: evaluation.decision,
      state,
      estimateCents: input.estimateCents,
      reasons: evaluation.reasons,
    },
  });

  return { decision: evaluation.decision, reasons: evaluation.reasons, authorizationId: record?.id ?? null };
}
