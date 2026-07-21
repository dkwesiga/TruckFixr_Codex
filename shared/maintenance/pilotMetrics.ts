// Pure pilot-metric computation (§43). Operates on already-gathered aggregate
// inputs so it is deterministic and testable. Reports pending observation
// windows; never claims causation.

export interface CaseMetricRecord {
  caseId: number;
  severity: "stable" | "attention" | "critical" | null;
  finalAction: string | null;
  createdAtMs: number;
  firstDecisionAtMs: number | null;
  firstApprovalAtMs: number | null;
  repairCycleCount: number;
  completed: boolean;
  reopenedWithin30Days: boolean;
  // Observation window (30 days) has fully elapsed for first-time-fix eligibility.
  observationWindowElapsed: boolean;
  totalDowntimeHours: number | null;
  criticalOverride: boolean;
  // Agreement between AI recommendation and confirmed outcome, when known.
  agreement: "agree" | "partial" | "disagree" | null;
  // Any document comparison produced a high variance finding.
  documentHighVariance: boolean;
  outcomeSubmitted: boolean;
}

export interface PilotMetrics {
  caseVolume: number;
  medianTimeToDecisionHours: number | null;
  averageTimeToApprovalHours: number | null;
  totalDowntimeHours: number;
  averageDowntimeHours: number | null;
  medianDowntimeHours: number | null;
  bySeverity: Record<string, number>;
  byAction: Record<string, number>;
  criticalOverrideRatePct: number | null;
  firstTimeFixRatePct: number | null;
  repeatRepairRatePct: number | null;
  documentVarianceRatePct: number | null;
  outcomeCompletionRatePct: number | null;
  agreementRatePct: number | null;
  // Cases still inside their observation window (excluded from first-time-fix).
  pendingObservationWindow: number;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function pct(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

const MS_PER_HOUR = 1000 * 60 * 60;

export function computePilotMetrics(records: CaseMetricRecord[]): PilotMetrics {
  const bySeverity: Record<string, number> = {};
  const byAction: Record<string, number> = {};

  const decisionHours: number[] = [];
  const approvalHours: number[] = [];
  const downtimes: number[] = [];
  let totalDowntime = 0;

  let criticalCount = 0;
  let criticalOverrides = 0;
  let agreementKnown = 0;
  let agreementYes = 0;
  let docVarianceCases = 0;
  let outcomeSubmitted = 0;

  // First-time-fix (§43): resolved after exactly one cycle, not reopened within
  // 30 days, over eligible resolved cases whose observation window elapsed.
  let ftfEligible = 0;
  let ftfHits = 0;
  // Repeat-repair (§43): 2+ cycles over eligible cases with a completed cycle.
  let repeatEligible = 0;
  let repeatHits = 0;
  let pendingObservation = 0;

  for (const r of records) {
    if (r.severity) bySeverity[r.severity] = (bySeverity[r.severity] ?? 0) + 1;
    if (r.finalAction) byAction[r.finalAction] = (byAction[r.finalAction] ?? 0) + 1;

    if (r.firstDecisionAtMs != null) {
      decisionHours.push((r.firstDecisionAtMs - r.createdAtMs) / MS_PER_HOUR);
    }
    if (r.firstApprovalAtMs != null && r.firstDecisionAtMs != null) {
      approvalHours.push((r.firstApprovalAtMs - r.firstDecisionAtMs) / MS_PER_HOUR);
    }
    if (r.totalDowntimeHours != null) {
      downtimes.push(r.totalDowntimeHours);
      totalDowntime += r.totalDowntimeHours;
    }
    if (r.severity === "critical") criticalCount++;
    if (r.criticalOverride) criticalOverrides++;
    if (r.agreement != null) {
      agreementKnown++;
      if (r.agreement === "agree") agreementYes++;
    }
    if (r.documentHighVariance) docVarianceCases++;
    if (r.outcomeSubmitted) outcomeSubmitted++;

    // First-time-fix eligibility.
    if (r.completed) {
      if (r.observationWindowElapsed) {
        ftfEligible++;
        if (r.repairCycleCount === 1 && !r.reopenedWithin30Days) ftfHits++;
      } else {
        pendingObservation++;
      }
    }
    // Repeat-repair eligibility: any case with a completed repair cycle.
    if (r.repairCycleCount >= 1 && r.completed) {
      repeatEligible++;
      if (r.repairCycleCount >= 2) repeatHits++;
    }
  }

  return {
    caseVolume: records.length,
    medianTimeToDecisionHours: median(decisionHours),
    averageTimeToApprovalHours:
      approvalHours.length > 0 ? approvalHours.reduce((a, b) => a + b, 0) / approvalHours.length : null,
    totalDowntimeHours: Math.round(totalDowntime * 100) / 100,
    averageDowntimeHours:
      downtimes.length > 0 ? Math.round((totalDowntime / downtimes.length) * 100) / 100 : null,
    medianDowntimeHours: median(downtimes),
    bySeverity,
    byAction,
    criticalOverrideRatePct: pct(criticalOverrides, criticalCount),
    firstTimeFixRatePct: pct(ftfHits, ftfEligible),
    repeatRepairRatePct: pct(repeatHits, repeatEligible),
    documentVarianceRatePct: pct(docVarianceCases, records.length),
    outcomeCompletionRatePct: pct(outcomeSubmitted, records.length),
    agreementRatePct: pct(agreementYes, agreementKnown),
    pendingObservationWindow: pendingObservation,
  };
}
