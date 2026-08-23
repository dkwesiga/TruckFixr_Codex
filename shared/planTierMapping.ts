import type { SubscriptionTier } from "./billing";
import type { PlanKey } from "./truckfixrPricing";

// Single seam between the two live plan vocabularies: the legacy 4-tier
// entitlement/gating model (shared/billing.ts) and the 6-plan pricing/display
// model (shared/truckfixrPricing.ts). Previously reimplemented independently
// in server/services/subscriptions.ts, server/_core/stripeBillingRoutes.ts,
// and inline in syncSubscriptionState — those three had already started to
// drift apart. Entitlement gating stays on legacy SubscriptionTier; this is
// only the translation layer between the two.

export function planKeyToLegacyTier(planKey: PlanKey): SubscriptionTier {
  switch (planKey) {
    case "owner_operator":
    case "small_fleet":
    case "fleet_growth":
      return "pro";
    case "fleet_pro":
    case "custom_fleet":
      return "fleet";
    default:
      return "free";
  }
}

/**
 * Inverse default: used only when a caller has a legacy tier but no plan key
 * (e.g. a webhook branch for a subscription created before plan_key metadata
 * existed). Not a true inverse of planKeyToLegacyTier — pilot_access has no
 * PlanKey equivalent, so it defaults to fleet_growth like "pro" does.
 */
export function legacyTierToDefaultPlanKey(tier: SubscriptionTier): PlanKey {
  if (tier === "free") return "free_trial";
  if (tier === "fleet") return "custom_fleet";
  return "fleet_growth";
}
