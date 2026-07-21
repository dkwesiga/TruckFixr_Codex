// Pure repair-authorization policy (§40). Decides who may authorize a repair
// given the estimate, limits, delegation, and review state. No money moves here;
// this only classifies the required approval tier.

export type AuthorizationDecision =
  | "maintenance_can_authorize"
  | "manager_can_authorize"
  | "manager_approval_required"
  | "external_approval_required";

export interface AuthorizationInput {
  estimateCents: number;
  // Fleet default authorization limit (null = no limit configured).
  fleetLimitCents: number | null;
  // Ceiling above which an external (owner/off-platform) approval is needed.
  managerLimitCents: number | null;
  delegationEnabled: boolean;
  delegatedLimitCents: number | null;
  // Actor context.
  actorIsMaintenanceUser: boolean; // false => owner/manager
  actorIsAssigned: boolean;
  // Case / document context.
  caseIsCritical: boolean;
  valuesReviewed: boolean;
  hasUnresolvedHighVariance: boolean;
  scopeMatchesAssessment: boolean;
}

export interface AuthorizationEvaluation {
  decision: AuthorizationDecision;
  reasons: string[];
}

export function evaluateAuthorization(input: AuthorizationInput): AuthorizationEvaluation {
  const reasons: string[] = [];

  // Above the manager ceiling => external approval, regardless of actor.
  if (input.managerLimitCents != null && input.estimateCents > input.managerLimitCents) {
    return {
      decision: "external_approval_required",
      reasons: ["Estimate exceeds the manager authorization ceiling."],
    };
  }

  // A maintenance-permitted user may authorize only when ALL conditions hold.
  if (input.actorIsMaintenanceUser) {
    if (!input.delegationEnabled) reasons.push("Delegated authorization is not enabled.");
    if (!input.actorIsAssigned) reasons.push("You are not assigned to this case.");
    if (input.caseIsCritical) reasons.push("The case is critical.");
    if (!input.valuesReviewed) reasons.push("Document values have not been reviewed.");
    if (input.hasUnresolvedHighVariance) reasons.push("There is an unresolved high variance.");
    if (!input.scopeMatchesAssessment) reasons.push("Repair scope does not match the assessment.");
    const withinDelegated =
      input.delegatedLimitCents != null && input.estimateCents <= input.delegatedLimitCents;
    if (input.delegationEnabled && !withinDelegated) {
      reasons.push("Estimate exceeds the delegated authorization limit.");
    }
    if (reasons.length === 0) {
      return { decision: "maintenance_can_authorize", reasons: [] };
    }
    // Falls through to manager approval when a maintenance user cannot authorize.
    return { decision: "manager_approval_required", reasons };
  }

  // Owner/manager path. Manager approval always required when critical, over the
  // fleet limit, unreviewed values, or unresolved high variance.
  if (input.caseIsCritical) reasons.push("The case is critical.");
  if (input.fleetLimitCents != null && input.estimateCents > input.fleetLimitCents) {
    reasons.push("Estimate exceeds the fleet authorization limit.");
  }
  if (!input.valuesReviewed) reasons.push("Document values have not been reviewed.");
  if (input.hasUnresolvedHighVariance) reasons.push("There is an unresolved high variance.");

  // An owner/manager IS the approver — they can authorize, but the reasons make
  // clear when explicit manager sign-off is being exercised.
  return { decision: "manager_can_authorize", reasons };
}
