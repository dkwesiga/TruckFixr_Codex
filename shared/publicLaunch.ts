// Public-launch gate for the guest funnel.
//
// The `/try-one-case` funnel and the V2 homepage go PUBLIC together, and only
// when every launch precondition is satisfied. This couples the two surfaces so
// you can never end up in an incoherent state (e.g. a public homepage whose
// "Try One Vehicle Case Free" CTA lands on an invite wall).
//
// The gate is fail-safe: unless ALL of the following are true, the funnel stays
// invite-only and the current homepage is served.
//   1. `approved`           — the explicit go decision (PUBLIC_LAUNCH_APPROVED).
//   2. `signoffRecorded`    — a non-empty legal/310T/commercial sign-off record
//                             (PUBLIC_LAUNCH_SIGNOFF). Forces the sign-off to be
//                             a deliberate, auditable act, not a casual boolean.
//   3. `reviewerConfigured` — a case reviewer is configured (CASE_REVIEWER_EMAIL),
//                             a code-checkable proxy for "a staffed reviewer".
//
// Legal/safety/commercial sign-off cannot be verified in code; requiring the
// recorded sign-off string is the strongest encoding available.

export interface PublicLaunchInputs {
  approved: boolean;
  /** The recorded legal/310T/commercial sign-off (PUBLIC_LAUNCH_SIGNOFF). */
  signoff: string;
  /** Whether a case reviewer is explicitly configured (CASE_REVIEWER_EMAIL). */
  reviewerConfigured: boolean;
}

export type PublicLaunchBlocker =
  | "not_approved"
  | "no_signoff_recorded"
  | "no_reviewer_configured";

/** True only when the funnel may run in public (open, no-invite) mode. */
export function isPublicLaunchActive(inputs: PublicLaunchInputs): boolean {
  return publicLaunchBlockers(inputs).length === 0;
}

/** Returns the unmet preconditions; empty means public launch is active. */
export function publicLaunchBlockers(
  inputs: PublicLaunchInputs
): PublicLaunchBlocker[] {
  const blockers: PublicLaunchBlocker[] = [];
  if (!inputs.approved) blockers.push("not_approved");
  if (inputs.signoff.trim().length === 0) blockers.push("no_signoff_recorded");
  if (!inputs.reviewerConfigured) blockers.push("no_reviewer_configured");
  return blockers;
}
