// Rules-first preliminary assessment for a guest "/try-one-case" submission.
//
// Per the locked Stage-1 decision, the preliminary result is DETERMINISTIC (no AI):
// it composes the shared critical-trigger detection, a small severity/action rule
// set, and the customer-readiness mapping. Real AI triage is a later, gated,
// text-only pass for eligible/reviewed cases — it is NOT invoked here.
//
// Pure: no DB, no network. Fully unit-testable (see guestCaseAssessment.test.ts).

import {
  detectCriticalTrigger,
  type GuestCaseInput,
  type CriticalTrigger,
} from "../../shared/maintenance/guestCaseFlow";
import {
  SAFETY_DISCLAIMERS,
  type MaintenanceAction,
  type MaintenanceSeverity,
} from "../../shared/maintenance/caseWorkflow";
import {
  readinessFromDecision,
  customerReadinessMeta,
  type CustomerReadiness,
} from "../../shared/maintenance/customerReadiness";

export type ReviewCategory =
  | "critical_safety"
  | "technical_uncertainty"
  | "conflicting_information"
  | "high_cost_risk"
  | "manual_reviewer_escalation";

export type ReviewStatus =
  | "review_required"
  | "review_queued"
  | "review_in_progress"
  | "review_completed"
  | "review_deferred"
  | "automated_guidance_only";

export interface GuestAssessment {
  criticalTrigger: CriticalTrigger | null;
  criticalTriggered: boolean;
  internalSeverity: MaintenanceSeverity;
  operatingAction: MaintenanceAction;
  customerReadiness: CustomerReadiness;
  /** One-line, customer-facing operating recommendation. Always one of the
   *  fixed CUSTOMER_READINESS_META strings — never AI-worded, even when the
   *  severity/action classification that picked it came from the AI path in
   *  guestCaseAi.ts (see generateGuestAssessment). */
  recommendation: string;
  /** Safety guidance to show immediately for a critical case (else null). */
  safetyGuidance: string | null;
  reviewCategory: ReviewCategory | null;
  reviewStatus: ReviewStatus;
  /** AI-generated, issue-specific explanation, additive on top of `recommendation`.
   *  Null here (the deterministic engine) — populated only by the AI path in
   *  guestCaseAi.ts when a model call succeeds. Never influences readiness/action. */
  explanation: string | null;
  /** AI-reported confidence (0-100) in the severity/action classification.
   *  Null here (the deterministic engine has no probabilistic signal) and for
   *  a critical case (confidence review doesn't apply once already critical).
   *  Set only by the AI path in guestCaseAi.ts. */
  confidence: number | null;
  /** True once confidence stayed below threshold after the confidence-driven
   *  question budget was exhausted (see CONFIDENCE_THRESHOLD /
   *  CONFIDENCE_QUESTION_CAP in guestCaseAi.ts). Always false here — decided
   *  by guestCaseService.ts, which is the only layer that knows whether
   *  another question is still coming. */
  confidenceLow: boolean;
}

type Answers = Record<string, string>;

// Answers that, on their own, escalate a non-critical report to critical (the
// safety sweep can surface danger the free-text concern did not mention).
function answersRevealCritical(answers: Answers): boolean {
  return answers.safety_sweep === "smoke_fire" || answers.safety_sweep === "brake_steer";
}

// Signals that push a stable report up to "attention".
function answersRaiseAttention(input: GuestCaseInput, answers: Answers): boolean {
  if (input.operatingStatus === "stopped" || input.operatingStatus === "reduced_power_derate") {
    return true;
  }
  if (answers.warning_light_color === "red" || answers.warning_light_color === "flashing") return true;
  if (answers.fault_code_active === "active" || answers.fault_code_active === "recurring") return true;
  if (answers.symptom_frequency === "worsening" || answers.symptom_frequency === "constant") return true;
  if (answers.defect_safety_system === "yes") return true;
  if (answers.alert_severity === "critical" || answers.alert_severity === "warning") return true;
  if (answers.leak === "leak" || answers.safety_sweep === "leak") return true;
  if (answers.service_overdue === "overdue") return true;
  return false;
}

// Once at "attention", decide whether it can keep running (monitor / finish the
// trip) or should be scheduled off the road soon.
function attentionNeedsScheduling(input: GuestCaseInput, answers: Answers): boolean {
  return (
    input.operatingStatus === "stopped" ||
    input.operatingStatus === "reduced_power_derate" ||
    answers.symptom_frequency === "worsening" ||
    answers.service_overdue === "overdue" ||
    answers.defect_safety_system === "yes"
  );
}

/**
 * Deterministically assess a guest case from its input + any adaptive answers.
 * Safety floor first: any critical trigger (from the concern text/status or a
 * safety-sweep answer) yields Stop + immediate safety guidance + review_required.
 */
export function assessGuestCase(
  input: GuestCaseInput,
  answers: Answers = {}
): GuestAssessment {
  const trigger = detectCriticalTrigger(input);

  if (trigger || answersRevealCritical(answers)) {
    const readiness: CustomerReadiness = "stop";
    return {
      criticalTrigger: trigger,
      criticalTriggered: true,
      internalSeverity: "critical",
      operatingAction: "pull_from_service",
      customerReadiness: readiness,
      recommendation: customerReadinessMeta(readiness).operatingRecommendation,
      safetyGuidance: SAFETY_DISCLAIMERS.critical,
      reviewCategory: "critical_safety",
      reviewStatus: "review_required",
      explanation: null,
      confidence: null,
      confidenceLow: false,
    };
  }

  let severity: MaintenanceSeverity = answersRaiseAttention(input, answers)
    ? "attention"
    : "stable";

  let action: MaintenanceAction;
  if (severity === "attention") {
    action = attentionNeedsScheduling(input, answers)
      ? "schedule_service"
      : "complete_trip_then_inspect";
  } else {
    action = "continue_monitor";
  }

  const readiness = readinessFromDecision(severity, action);

  return {
    criticalTrigger: null,
    criticalTriggered: false,
    internalSeverity: severity,
    operatingAction: action,
    customerReadiness: readiness,
    recommendation: customerReadinessMeta(readiness).operatingRecommendation,
    safetyGuidance: null,
    // Non-critical guest cases are automated-guidance-only unless a human later
    // pulls them into review (capacity/eligibility dependent — never promised).
    reviewCategory: null,
    reviewStatus: "automated_guidance_only",
    explanation: null,
    confidence: null,
    confidenceLow: false,
  };
}
