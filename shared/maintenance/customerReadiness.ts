// Customer-facing readiness taxonomy: Ready / Monitor / Service Soon / Stop.
//
// This is a thin PRESENTATION mapping over the existing internal signals. It is
// derived deterministically from either:
//   (a) a maintenance decision — (internal severity, operating action), or
//   (b) a vehicle's attention-score classification (+ total, for the attention band split).
//
// It is NOT a new source of truth: internal severity (stable/attention/critical)
// and the operating actions remain authoritative. Pure function, no DB, client-safe.

import {
  isCriticalAction,
  type MaintenanceAction,
  type MaintenanceSeverity,
} from "./caseWorkflow";
import {
  classifyAttentionScore,
  type AttentionClassification,
} from "./attentionScore";

export const CUSTOMER_READINESS = [
  "ready",
  "monitor",
  "service_soon",
  "stop",
] as const;

export type CustomerReadiness = (typeof CUSTOMER_READINESS)[number];

export interface CustomerReadinessMeta {
  /** Customer-facing label. */
  label: string;
  /** One-line operating recommendation (safety-aware, decision-support framed). */
  operatingRecommendation: string;
  /** Presentation tone key; the client maps this to a color. Never rely on color alone. */
  tone: CustomerReadiness;
  /** Severity order, ascending (ready lowest, stop highest). */
  order: number;
}

export const CUSTOMER_READINESS_META: Record<
  CustomerReadiness,
  CustomerReadinessMeta
> = {
  ready: {
    label: "Ready",
    operatingRecommendation:
      "No action indicated. Continue normal operation and routine monitoring.",
    tone: "ready",
    order: 0,
  },
  monitor: {
    label: "Monitor",
    operatingRecommendation:
      "Keep operating, but watch this vehicle and re-check if the concern changes.",
    tone: "monitor",
    order: 1,
  },
  service_soon: {
    label: "Service Soon",
    operatingRecommendation:
      "Limit operation and arrange an inspection or service promptly.",
    tone: "service_soon",
    order: 2,
  },
  stop: {
    label: "Stop",
    operatingRecommendation:
      "Do not operate until a qualified person has assessed the vehicle.",
    tone: "stop",
    order: 3,
  },
};

/**
 * Customer readiness from a maintenance decision.
 *
 * Rules (deterministic):
 *  - Critical severity OR a critical action (pull_from_service/roadside/tow) => Stop (safety floor).
 *  - Otherwise the operating action drives readiness, with attention severity nudging up:
 *      schedule_service                     => Service Soon
 *      complete_trip_then_inspect           => Service Soon if attention, else Monitor
 *      continue_monitor                     => Monitor if attention, else Ready
 */
export function readinessFromDecision(
  severity: MaintenanceSeverity,
  action: MaintenanceAction
): CustomerReadiness {
  // Safety floor: critical severity or any critical action can never present as
  // anything softer than Stop.
  if (severity === "critical" || isCriticalAction(action)) {
    return "stop";
  }

  switch (action) {
    case "schedule_service":
      return "service_soon";
    case "complete_trip_then_inspect":
      return severity === "attention" ? "service_soon" : "monitor";
    case "continue_monitor":
      return severity === "attention" ? "monitor" : "ready";
    // Critical actions are handled by the safety floor above; listed for exhaustiveness.
    case "pull_from_service":
    case "roadside_assistance":
    case "tow":
      return "stop";
  }
}

// Attention band that splits the internal "attention" classification into the
// two middle customer states. At/above this total, an attention vehicle reads as
// Service Soon rather than Monitor.
export const SERVICE_SOON_ATTENTION_THRESHOLD = 60;

/**
 * Customer readiness for a vehicle from its attention score, when there is no
 * single decision to map (e.g. the Fleet Health dashboard rows).
 *  - stable   => Ready
 *  - attention => Monitor (< threshold) or Service Soon (>= threshold)
 *  - critical => Stop
 */
export function readinessFromAttentionScore(total: number): CustomerReadiness {
  return readinessFromClassification(classifyAttentionScore(total), total);
}

export function readinessFromClassification(
  classification: AttentionClassification,
  total?: number
): CustomerReadiness {
  switch (classification) {
    case "stable":
      return "ready";
    case "attention":
      return typeof total === "number" &&
        total >= SERVICE_SOON_ATTENTION_THRESHOLD
        ? "service_soon"
        : "monitor";
    case "critical":
      return "stop";
  }
}

export function customerReadinessMeta(
  readiness: CustomerReadiness
): CustomerReadinessMeta {
  return CUSTOMER_READINESS_META[readiness];
}
