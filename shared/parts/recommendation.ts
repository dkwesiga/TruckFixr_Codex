// Pure recommendation-ranking logic for supplier options (Parts Intelligence
// Phase 1). No DB, no procurement — this only orders/annotates options
// already captured; see docs/architecture/parts-acquisition.md for what
// Phase 2 (real sourcing, approval workflow) will add around it.
//
// Core rule (non-negotiable): a lower-priced option must never outrank a
// substantially safer/better-confirmed fit solely because it is cheaper.
// Fitment tier is evaluated FIRST, as a hard partition — price/ETA/warranty
// only break ties WITHIN the same fitment tier, never across tiers.

import type { FitmentState } from "./fitmentEvidence";

export interface SupplierOptionForRanking {
  id: number | string;
  priceCents: number | null;
  freightCents: number | null;
  etaAt: string | Date | null;
  warrantyText: string | null;
  returnable: boolean | null;
  stockStatus: string | null;
  /** This option's own fitment tier — see resolveOptionFitmentTier. */
  fitmentState: FitmentState;
}

export interface RankedSupplierOption extends SupplierOptionForRanking {
  rank: number;
  totalCostCents: number | null;
  rationale: string[];
}

const FITMENT_TIER_ORDER: Record<FitmentState, number> = {
  confirmed: 0,
  likely: 1,
  ambiguous: 2,
  not_confirmed: 3,
};

/**
 * Rank supplier options for one part requirement. Fitment tier is the
 * primary sort key (lower tier number = better = ranked first); total
 * landed cost (price + freight, when both known) is the secondary key
 * within the same tier; presence of a warranty/returnability is a tertiary
 * tie-breaker. Options with an unknown fitment tier are never assumed safe.
 */
export function rankSupplierOptions(
  options: readonly SupplierOptionForRanking[]
): RankedSupplierOption[] {
  const withCost = options.map((option) => {
    const totalCostCents =
      option.priceCents != null
        ? option.priceCents + (option.freightCents ?? 0)
        : null;
    const rationale: string[] = [];
    rationale.push(`fitment: ${option.fitmentState}`);
    if (totalCostCents != null) rationale.push(`landed cost: ${totalCostCents} cents`);
    if (option.warrantyText) rationale.push("has warranty");
    if (option.returnable) rationale.push("returnable");
    return { ...option, totalCostCents, rationale };
  });

  const sorted = [...withCost].sort((a, b) => {
    const tierDiff = FITMENT_TIER_ORDER[a.fitmentState] - FITMENT_TIER_ORDER[b.fitmentState];
    if (tierDiff !== 0) return tierDiff;

    // Within the same fitment tier: known cost beats unknown cost; cheaper
    // known cost beats more expensive known cost.
    if (a.totalCostCents == null && b.totalCostCents != null) return 1;
    if (a.totalCostCents != null && b.totalCostCents == null) return -1;
    if (a.totalCostCents != null && b.totalCostCents != null) {
      const costDiff = a.totalCostCents - b.totalCostCents;
      if (costDiff !== 0) return costDiff;
    }

    // Tie-break: a returnable option with a stated warranty ranks slightly
    // ahead of one without, all else equal.
    const aScore = (a.returnable ? 1 : 0) + (a.warrantyText ? 1 : 0);
    const bScore = (b.returnable ? 1 : 0) + (b.warrantyText ? 1 : 0);
    return bScore - aScore;
  });

  return sorted.map((option, index) => ({ ...option, rank: index + 1 }));
}

// Documented future extension points (do not implement speculatively —
// see docs/architecture/parts-acquisition.md "Planned later"):
//   - downtime exposure (requires a reliable per-vehicle downtime-cost input;
//     TruckFixr has shared/calculators/downtimeCost.ts today, but wiring it
//     into ranking is a Phase 2+ decision, not assumed here),
//   - supplier reliability / repeat-failure rate / part-brand reliability
//     (requires a supplier-performance history this phase does not build).
