// Pure option-comparison and recommendation logic for supplier options
// (Parts Intelligence). No DB, no procurement — this only orders/annotates/
// gates options already captured; see docs/architecture/parts-acquisition.md
// for what Phase 3 (order execution) will add around it.
//
// Core rule (non-negotiable): a lower-priced option must never outrank a
// substantially safer/better-confirmed fit solely because it is cheaper.
// Fitment tier is evaluated FIRST, as a hard partition — price/ETA/warranty
// only break ties WITHIN the same fitment tier, never across tiers.
//
// Phase 2 adds a second partition ABOVE fitment tier: hard eligibility gates
// (not_confirmed/ambiguous fitment, unavailable stock, an expired quote).
// A hard-gated option is never part of the normal ranked/recommended list —
// it is returned separately, for investigation only, with the reason(s) it
// was excluded. See compareOptions below.

import type { FitmentState } from "./fitmentEvidence";

export const PART_CONDITIONS = [
  "oem_new",
  "aftermarket_new",
  "remanufactured",
  "rebuilt",
  "used",
  "unknown",
] as const;
export type PartCondition = (typeof PART_CONDITIONS)[number];

export const AVAILABILITY_STATES = [
  "in_stock",
  "limited_stock",
  "orderable",
  "backordered",
  "unavailable",
  "unknown",
] as const;
export type AvailabilityState = (typeof AVAILABILITY_STATES)[number];

export const ETA_TYPES = [
  "pickup_today",
  "same_day_delivery",
  "estimated_date",
  "lead_time_days",
  "unknown",
] as const;
export type EtaType = (typeof ETA_TYPES)[number];

export interface SupplierOptionForRanking {
  id: number | string;
  currency: string;
  priceCents: number | null;
  freightCents: number | null;
  coreChargeCents: number | null;
  condition: PartCondition | null;
  availabilityState: AvailabilityState | null;
  etaType: EtaType | null;
  etaAt: string | Date | null;
  etaLeadTimeDays: number | null;
  warrantyText: string | null;
  returnable: boolean | null;
  quoteExpiresAt: string | Date | null;
  /** This option's own fitment tier — from the requirement's current fitment assessment. */
  fitmentState: FitmentState;
}

export interface RankedSupplierOption extends SupplierOptionForRanking {
  rank: number;
  /** priceCents + freightCents + coreChargeCents, when all known. Not a true landed cost (no tax model) — see §13. */
  estimatedAcquisitionCostCents: number | null;
  /** true when this option's currency differs from the comparison's chosen primary currency — its cost was not compared numerically against others. */
  currencyMismatch: boolean;
  rationale: string[];
}

export interface HardGateReason {
  code: "fitment_not_eligible" | "unavailable" | "quote_expired";
  message: string;
}

export interface HardGatedSupplierOption extends SupplierOptionForRanking {
  hardGateReasons: HardGateReason[];
}

export interface ComparisonResult {
  /** The currency prices were actually compared in (the most common currency among eligible options), or null if there's nothing to compare. */
  primaryCurrency: string | null;
  /** Eligible options, ranked best first. */
  ranked: RankedSupplierOption[];
  /** Excluded from ranking — shown for investigation only, never as a normal recommendation. */
  hardGated: HardGatedSupplierOption[];
  /** The top-ranked eligible option, or null if every option was hard-gated or none exist. */
  recommended: RankedSupplierOption | null;
}

const FITMENT_TIER_ORDER: Record<FitmentState, number> = {
  confirmed: 0,
  likely: 1,
  ambiguous: 2,
  not_confirmed: 3,
};

// Fitment states with genuinely insufficient/conflicting evidence are a hard
// gate, not just a worse rank — "ambiguous" in this codebase's fitment model
// IS "conflicting evidence" (see shared/parts/fitmentEvidence.ts), so both
// belong here per the product's own "not_confirmed, conflicting evidence"
// hard-gate examples.
const HARD_GATED_FITMENT_STATES: FitmentState[] = ["not_confirmed", "ambiguous"];

export function isOptionExpired(
  quoteExpiresAt: string | Date | null | undefined,
  now: Date = new Date()
): boolean {
  if (!quoteExpiresAt) return false;
  return new Date(quoteExpiresAt).getTime() < now.getTime();
}

function estimatedAcquisitionCostCents(option: SupplierOptionForRanking): number | null {
  if (option.priceCents == null) return null;
  return option.priceCents + (option.freightCents ?? 0) + (option.coreChargeCents ?? 0);
}

function hardGateReasons(option: SupplierOptionForRanking, now: Date): HardGateReason[] {
  const reasons: HardGateReason[] = [];
  if (HARD_GATED_FITMENT_STATES.includes(option.fitmentState)) {
    reasons.push({
      code: "fitment_not_eligible",
      message: `fitment is ${option.fitmentState} — insufficient or conflicting evidence to recommend installation`,
    });
  }
  if (option.availabilityState === "unavailable") {
    reasons.push({ code: "unavailable", message: "supplier reports this option unavailable" });
  }
  if (isOptionExpired(option.quoteExpiresAt, now)) {
    reasons.push({ code: "quote_expired", message: "quote has expired and is no longer current" });
  }
  return reasons;
}

/**
 * Choose the currency prices are actually compared in: the most common
 * currency among the options being ranked. Not an FX conversion — options in
 * a different currency are simply never numerically cost-compared (see
 * `currencyMismatch` on each ranked option); their fitment tier and non-price
 * factors still apply normally, per §27.
 */
function choosePrimaryCurrency(options: readonly SupplierOptionForRanking[]): string | null {
  const counts = new Map<string, number>();
  for (const option of options) {
    if (option.priceCents == null) continue;
    counts.set(option.currency, (counts.get(option.currency) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [currency, count] of counts) {
    if (count > bestCount) {
      best = currency;
      bestCount = count;
    }
  }
  return best;
}

function buildRationale(
  option: SupplierOptionForRanking,
  costCents: number | null,
  currencyMismatch: boolean
): string[] {
  const rationale: string[] = [`fitment: ${option.fitmentState}`];
  if (currencyMismatch) {
    rationale.push(`price in ${option.currency} not compared against other currencies`);
  } else if (costCents != null) {
    rationale.push(`estimated acquisition cost: ${costCents} cents ${option.currency}`);
  }
  if (option.availabilityState) rationale.push(`availability: ${option.availabilityState}`);
  if (option.condition) rationale.push(`condition: ${option.condition}`);
  if (option.warrantyText) rationale.push("has warranty");
  if (option.returnable) rationale.push("returnable");
  return rationale;
}

/**
 * Compare a requirement's captured options: partition into hard-gated
 * (never a normal recommendation) vs. eligible-and-ranked, then rank the
 * eligible set by fitment tier (primary), estimated acquisition cost within
 * the same currency (secondary), warranty/returnability (tertiary).
 */
export function compareOptions(
  options: readonly SupplierOptionForRanking[],
  now: Date = new Date()
): ComparisonResult {
  const hardGated: HardGatedSupplierOption[] = [];
  const eligible: SupplierOptionForRanking[] = [];

  for (const option of options) {
    const reasons = hardGateReasons(option, now);
    if (reasons.length > 0) {
      hardGated.push({ ...option, hardGateReasons: reasons });
    } else {
      eligible.push(option);
    }
  }

  const primaryCurrency = choosePrimaryCurrency(eligible);

  const withCost = eligible.map((option) => {
    const costCents = estimatedAcquisitionCostCents(option);
    const currencyMismatch = primaryCurrency != null && option.currency !== primaryCurrency;
    // A currency-mismatched option's cost is never compared numerically —
    // treat it the same as "cost unknown" for ranking purposes (still ranks
    // by fitment tier and non-price factors normally).
    const comparableCostCents = currencyMismatch ? null : costCents;
    return {
      ...option,
      estimatedAcquisitionCostCents: costCents,
      currencyMismatch,
      _comparableCostCents: comparableCostCents,
      rationale: buildRationale(option, costCents, currencyMismatch),
    };
  });

  const sorted = [...withCost].sort((a, b) => {
    const tierDiff = FITMENT_TIER_ORDER[a.fitmentState] - FITMENT_TIER_ORDER[b.fitmentState];
    if (tierDiff !== 0) return tierDiff;

    // Within the same fitment tier: known (same-currency) cost beats
    // unknown/mismatched cost; cheaper known cost beats more expensive.
    if (a._comparableCostCents == null && b._comparableCostCents != null) return 1;
    if (a._comparableCostCents != null && b._comparableCostCents == null) return -1;
    if (a._comparableCostCents != null && b._comparableCostCents != null) {
      const costDiff = a._comparableCostCents - b._comparableCostCents;
      if (costDiff !== 0) return costDiff;
    }

    // Tie-break: ETA (a concrete date, or same-day/pickup-today) beats an
    // unknown/lead-time-only estimate; a returnable option with a stated
    // warranty ranks slightly ahead of one without, all else equal.
    const etaScore = (option: (typeof withCost)[number]) =>
      option.etaType === "pickup_today" || option.etaType === "same_day_delivery"
        ? 2
        : option.etaType === "estimated_date"
          ? 1
          : 0;
    const etaDiff = etaScore(b) - etaScore(a);
    if (etaDiff !== 0) return etaDiff;

    const aScore = (a.returnable ? 1 : 0) + (a.warrantyText ? 1 : 0);
    const bScore = (b.returnable ? 1 : 0) + (b.warrantyText ? 1 : 0);
    return bScore - aScore;
  });

  const ranked: RankedSupplierOption[] = sorted.map(({ _comparableCostCents, ...option }, index) => ({
    ...option,
    rank: index + 1,
  }));

  return {
    primaryCurrency,
    ranked,
    hardGated,
    recommended: ranked[0] ?? null,
  };
}

// Documented future extension points (do not implement speculatively — see
// docs/architecture/parts-acquisition.md "Planned later"/"Future"):
//   - downtime exposure / urgency / vehicle utilization / replacement-vehicle
//     availability (requires reliable per-vehicle economic inputs wired in
//     deliberately, not assumed here — see shared/calculators/downtimeCost.ts),
//   - supplier reliability / quoted-vs-actual ETA / wrong-part rate /
//     cancellation rate / return rate / repeat-purchase success (requires a
//     supplier-performance history this phase does not build — never
//     populate a synthetic score in the meantime).
