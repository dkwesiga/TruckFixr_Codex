export type SubscriptionTier = "free" | "pilot" | "pro" | "fleet";

export type BillingStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid";

export type PlanLimits = {
  diagnosticsPerMonth: number | null;
  vehicleCount: number | null;
  userCount: number | null;
};

export type PlanFeatures = {
  inspections: boolean;
  maintenance: boolean;
  complianceTracking: boolean;
  advancedDiagnosticHistory: boolean;
  enhancedMaintenance: boolean;
  fleetReporting: boolean;
};

export type PlanDefinition = {
  tier: SubscriptionTier;
  label: string;
  description: string;
  monthlyPriceUsd: number;
  publicSelectable: boolean;
  limits: PlanLimits;
  features: PlanFeatures;
};

export const SUBSCRIPTION_PLANS: Record<SubscriptionTier, PlanDefinition> = {
  free: {
    tier: "free",
    label: "Free",
    description: "Core inspections, maintenance, and compliance for smaller operations.",
    monthlyPriceUsd: 0,
    publicSelectable: true,
    limits: {
      diagnosticsPerMonth: 10,
      vehicleCount: 2,
      userCount: 1,
    },
    features: {
      inspections: true,
      maintenance: true,
      complianceTracking: true,
      advancedDiagnosticHistory: false,
      enhancedMaintenance: false,
      fleetReporting: false,
    },
  },
  pilot: {
    tier: "pilot",
    label: "Pilot Access",
    description: "Temporary guided access for pilot fleets using a valid TruckFixr access code.",
    monthlyPriceUsd: 0,
    publicSelectable: false,
    limits: {
      diagnosticsPerMonth: null,
      vehicleCount: 3,
      userCount: null,
    },
    features: {
      inspections: true,
      maintenance: true,
      complianceTracking: true,
      advancedDiagnosticHistory: true,
      enhancedMaintenance: true,
      fleetReporting: true,
    },
  },
  pro: {
    tier: "pro",
    label: "Pro",
    description: "Higher diagnostic capacity and stronger maintenance history for growing teams.",
    monthlyPriceUsd: 99,
    publicSelectable: true,
    limits: {
      diagnosticsPerMonth: 250,
      vehicleCount: 15,
      userCount: 10,
    },
    features: {
      inspections: true,
      maintenance: true,
      complianceTracking: true,
      advancedDiagnosticHistory: true,
      enhancedMaintenance: true,
      fleetReporting: false,
    },
  },
  fleet: {
    tier: "fleet",
    label: "Fleet",
    description: "Best for multi-vehicle operations with reporting and future-priority access.",
    monthlyPriceUsd: 249,
    publicSelectable: true,
    limits: {
      diagnosticsPerMonth: null,
      vehicleCount: null,
      userCount: null,
    },
    features: {
      inspections: true,
      maintenance: true,
      complianceTracking: true,
      advancedDiagnosticHistory: true,
      enhancedMaintenance: true,
      fleetReporting: true,
    },
  },
};

export function isPaidTier(tier: SubscriptionTier) {
  return tier === "pro" || tier === "fleet";
}

export function isPilotTier(tier: SubscriptionTier) {
  return tier === "pilot";
}

export function hasPaidAccess(status: BillingStatus) {
  return status === "active" || status === "trialing";
}

export function getEffectiveTier(
  tier: SubscriptionTier,
  billingStatus: BillingStatus
): SubscriptionTier {
  if (tier === "free") return "free";
  return hasPaidAccess(billingStatus) ? tier : "free";
}

export function getPlanRestrictionMessage(
  kind: "diagnostics" | "vehicles" | "users",
  tier: SubscriptionTier
) {
  if (kind === "diagnostics") {
    if (tier === "free") {
      return "You’ve reached your monthly diagnostic limit. Upgrade to Pro to continue running diagnostics.";
    }

    if (tier === "pilot") {
      return "Pilot Access diagnostics are currently restricted for this fleet. Upgrade to Pro to continue running diagnostics without pilot constraints.";
    }

    return "You’ve reached your diagnostic allowance for this plan. Upgrade to Fleet to continue running diagnostics.";
  }

  if (kind === "users") {
    if (tier === "pilot") {
      return "You’ve reached the user limit for this Pilot Access fleet. Upgrade to Fleet to enable more users.";
    }

    return "You’ve reached the user limit for this plan. Upgrade to Fleet to enable more users.";
  }

  if (tier === "free") {
    return "You’ve reached your vehicle limit. Upgrade to Pro to add more vehicles.";
  }

  if (tier === "pilot") {
    return "You’ve reached your Pilot Access vehicle limit. Upgrade to Pro to add another vehicle.";
  }

  return "You’ve reached your vehicle limit for this plan. Upgrade to Fleet to add more vehicles.";
}
