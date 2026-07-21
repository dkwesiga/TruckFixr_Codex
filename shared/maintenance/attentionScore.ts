// Deterministic, rules-based Vehicle Attention Score.
//
// This is an OPERATIONAL PRIORITY signal only. It is NOT diagnostic confidence,
// NOT diagnosis severity, and is never sent to the diagnosis system. It does not
// present a failure probability. Pure function: identical input -> identical
// output, so it is trivially testable and safe to render on the client.

export const ATTENTION_SCORE_RULES = {
  activeCriticalDefect: { key: "active_critical_defect", points: 35 },
  activeCriticalCase: { key: "active_critical_case", points: 35 },
  repeatUnresolvedDtc: { key: "repeat_unresolved_dtc_14d", points: 20 },
  pmOverdue: { key: "pm_overdue_beyond_warning", points: 15 },
  unresolvedDriverIssue: { key: "unresolved_driver_issue_7d", points: 10 },
  repeatRepairSameSystem: { key: "repeat_repair_same_system_30d", points: 10 },
  openInspectionDefect: { key: "open_inspection_defect", points: 10 },
  recentReturnRecurrence: { key: "return_to_service_recurrence", points: 10 },
  missingReadings: { key: "missing_odometer_or_engine_hours", points: 5 },
} as const;

export type AttentionClassification = "critical" | "attention" | "stable";

export interface AttentionScoreComponent {
  ruleKey: string;
  points: number;
  explanation: string;
  // Entity that triggered the rule (type + id), for drill-down in the UI.
  supportingEntityType?: string;
  supportingEntityId?: string;
  // Dedup source key so the same underlying problem never scores twice.
  sourceKey?: string;
}

export interface AttentionScoreResult {
  total: number;
  classification: AttentionClassification;
  components: AttentionScoreComponent[];
  calculatedAt: string;
  dataQualityWarnings: string[];
}

export interface AttentionScoreInput {
  // Active critical inspection defects (severity critical, not resolved).
  activeCriticalDefects?: Array<{ id: string; sourceKey?: string; label?: string }>;
  // Active critical maintenance cases. sourceKey allows dedup with a defect that
  // is the same underlying problem.
  activeCriticalCases?: Array<{ id: string; sourceKey?: string; reference?: string }>;
  // DTCs unresolved and seen again within the last 14 days.
  repeatUnresolvedDtcs?: Array<{ code: string }>;
  // PM overdue beyond its warning window (true = overdue, not merely due soon).
  pmOverdue?: boolean;
  overduePmName?: string | null;
  // Driver-reported issues open longer than 7 days.
  unresolvedDriverIssuesOlderThan7d?: Array<{ id: string }>;
  // Repeat repair for the same structured system within 30 days.
  repeatRepairSameSystemWithin30d?: Array<{ system: string }>;
  // Open inspection defects (any severity, not resolved).
  openInspectionDefects?: Array<{ id: string }>;
  // A recent return-to-service followed by a recurrence of the same issue.
  returnToServiceRecurrence?: boolean;
  // Whether a current odometer / engine-hours reading is available.
  hasCurrentOdometer?: boolean;
  hasCurrentEngineHours?: boolean;
  now?: Date;
}

const MAX_SCORE = 100;

export function classifyAttentionScore(total: number): AttentionClassification {
  if (total >= 75) return "critical";
  if (total >= 40) return "attention";
  return "stable";
}

export function calculateAttentionScore(
  input: AttentionScoreInput
): AttentionScoreResult {
  const now = input.now ?? new Date();
  const components: AttentionScoreComponent[] = [];
  const warnings: string[] = [];
  // Track which underlying problems have already scored so a critical defect and
  // a critical case describing the SAME problem do not both add points.
  const scoredSourceKeys = new Set<string>();

  const criticalDefects = input.activeCriticalDefects ?? [];
  for (const defect of criticalDefects) {
    const sourceKey = defect.sourceKey ?? `defect:${defect.id}`;
    if (scoredSourceKeys.has(sourceKey)) continue;
    scoredSourceKeys.add(sourceKey);
    components.push({
      ruleKey: ATTENTION_SCORE_RULES.activeCriticalDefect.key,
      points: ATTENTION_SCORE_RULES.activeCriticalDefect.points,
      explanation: defect.label
        ? `Active critical defect: ${defect.label}`
        : "Active critical defect on this vehicle",
      supportingEntityType: "defect",
      supportingEntityId: defect.id,
      sourceKey,
    });
  }

  // Active critical cases contribute up to +35 total, deduped against defects
  // that share a source key. We add at most one critical-case component beyond
  // any already-scored source.
  const criticalCases = input.activeCriticalCases ?? [];
  for (const c of criticalCases) {
    const sourceKey = c.sourceKey ?? `case:${c.id}`;
    if (scoredSourceKeys.has(sourceKey)) continue;
    scoredSourceKeys.add(sourceKey);
    components.push({
      ruleKey: ATTENTION_SCORE_RULES.activeCriticalCase.key,
      points: ATTENTION_SCORE_RULES.activeCriticalCase.points,
      explanation: c.reference
        ? `Active critical maintenance case ${c.reference}`
        : "Active critical maintenance case",
      supportingEntityType: "maintenanceCase",
      supportingEntityId: c.id,
      sourceKey,
    });
    // Per spec the critical-case rule caps at +35 regardless of count.
    break;
  }

  const repeatDtcs = input.repeatUnresolvedDtcs ?? [];
  if (repeatDtcs.length > 0) {
    components.push({
      ruleKey: ATTENTION_SCORE_RULES.repeatUnresolvedDtc.key,
      points: ATTENTION_SCORE_RULES.repeatUnresolvedDtc.points,
      explanation: `Repeat unresolved DTC within 14 days (${repeatDtcs
        .map((d) => d.code)
        .join(", ")})`,
    });
  }

  if (input.pmOverdue === true) {
    components.push({
      ruleKey: ATTENTION_SCORE_RULES.pmOverdue.key,
      points: ATTENTION_SCORE_RULES.pmOverdue.points,
      explanation: input.overduePmName
        ? `Preventive maintenance overdue: ${input.overduePmName}`
        : "Preventive maintenance overdue beyond warning window",
    });
  }

  const driverIssues = input.unresolvedDriverIssuesOlderThan7d ?? [];
  if (driverIssues.length > 0) {
    components.push({
      ruleKey: ATTENTION_SCORE_RULES.unresolvedDriverIssue.key,
      points: ATTENTION_SCORE_RULES.unresolvedDriverIssue.points,
      explanation: "Unresolved driver-reported issue older than 7 days",
    });
  }

  const repeatRepairs = input.repeatRepairSameSystemWithin30d ?? [];
  if (repeatRepairs.length > 0) {
    components.push({
      ruleKey: ATTENTION_SCORE_RULES.repeatRepairSameSystem.key,
      points: ATTENTION_SCORE_RULES.repeatRepairSameSystem.points,
      explanation: `Repeat repair for the same system within 30 days (${repeatRepairs
        .map((r) => r.system)
        .join(", ")})`,
    });
  }

  const openDefects = input.openInspectionDefects ?? [];
  // Only score "open inspection defect" for defects that are not already scored
  // as active critical defects (avoid double counting the same defect).
  const openNonCritical = openDefects.filter(
    (d) => !scoredSourceKeys.has(`defect:${d.id}`)
  );
  if (openNonCritical.length > 0) {
    components.push({
      ruleKey: ATTENTION_SCORE_RULES.openInspectionDefect.key,
      points: ATTENTION_SCORE_RULES.openInspectionDefect.points,
      explanation: "Open inspection defect on this vehicle",
    });
  }

  if (input.returnToServiceRecurrence === true) {
    components.push({
      ruleKey: ATTENTION_SCORE_RULES.recentReturnRecurrence.key,
      points: ATTENTION_SCORE_RULES.recentReturnRecurrence.points,
      explanation: "Recent return to service followed by a recurrence",
    });
  }

  const missingOdometer = input.hasCurrentOdometer === false;
  const missingEngineHours = input.hasCurrentEngineHours === false;
  if (missingOdometer || missingEngineHours) {
    components.push({
      ruleKey: ATTENTION_SCORE_RULES.missingReadings.key,
      points: ATTENTION_SCORE_RULES.missingReadings.points,
      explanation: "Missing a current odometer or engine-hours reading",
    });
    warnings.push(
      "Vehicle is missing a current odometer or engine-hours reading; score confidence is reduced."
    );
  }

  const rawTotal = components.reduce((sum, c) => sum + c.points, 0);
  const total = Math.min(rawTotal, MAX_SCORE);

  return {
    total,
    classification: classifyAttentionScore(total),
    components,
    calculatedAt: now.toISOString(),
    dataQualityWarnings: warnings,
  };
}
