// Optional financial/downtime impact fields (§20/§21). Pure taxonomy + a
// tiny helper. Deliberately has NO relationship to shared/tadis/qualityScore.ts
// — technical evidence quality and financial value are never merged into one
// score (§31 "separate diagnostic confidence from financial value").

export const ESTIMATE_SOURCES = ["customer_entered", "system_estimate", "actual"] as const;
export type EstimateSource = (typeof ESTIMATE_SOURCES)[number];

export const ESTIMATE_SOURCE_LABELS: Record<EstimateSource, string> = {
  customer_entered: "Customer-entered estimate",
  system_estimate: "System-generated estimate",
  actual: "Actual (measured)",
};

export type RoiImpactInput = {
  estimatedDowntimeAvoidedHours: number | null;
  estimatedTowAvoidedCents: number | null;
  estimatedRoadCallAvoidedCents: number | null;
  actualRepairCostCents: number | null;
  estimateSource: EstimateSource | null;
};

export type RoiImpactSummary = {
  estimatedValueSavedCents: number | null;
  isAuditedSaving: boolean;
  disclosure: string;
};

// Sums the avoidance fields into a single "estimated value saved" figure and
// makes explicit whether it is an audited/actual figure or an estimate — the
// UI and admin analytics must never present this as an audited saving unless
// estimateSource === "actual".
export function summarizeRoiImpact(input: RoiImpactInput): RoiImpactSummary {
  const towCents = input.estimatedTowAvoidedCents ?? 0;
  const roadCallCents = input.estimatedRoadCallAvoidedCents ?? 0;
  const hasAnyValue =
    input.estimatedTowAvoidedCents != null || input.estimatedRoadCallAvoidedCents != null;

  const estimatedValueSavedCents = hasAnyValue ? towCents + roadCallCents : null;
  const isAuditedSaving = input.estimateSource === "actual";

  return {
    estimatedValueSavedCents,
    isAuditedSaving,
    disclosure: isAuditedSaving
      ? "Actual, measured value."
      : "Estimate only — not an audited saving.",
  };
}
