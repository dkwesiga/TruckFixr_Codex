export type LegacySubscriptionTier = "free" | "pilot" | "pilot_access" | "pro" | "fleet";

export type SubscriptionTier = "free" | "pilot_access" | "pro" | "fleet";

export type BillingCadence = "monthly" | "annual";

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
  activeVehicleCount: number | null;
  driverCount: number | null;
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
  publicSelectable: boolean;
  selfServeCheckout: boolean;
  requiresSalesContact: boolean;
  diagnosticsHeroLabel: string;
  monthlyPriceCad: number | null;
  annualPriceCad: number | null;
  annualDiscountPercent: number;
  monthlyPriceUsd: number;
  publicPriceAnchor: string;
  pricingUnit: "account" | "active_vehicle";
  minimumBillableVehicles: number;
  limits: PlanLimits;
  features: PlanFeatures;
};

export const PRO_MONTHLY_PER_ACTIVE_VEHICLE_CAD = 19;
export const PRO_ANNUAL_DISCOUNT_PERCENT = 15;
export const FREE_ACTIVE_VEHICLE_LIMIT = 2;
export const FREE_DRIVER_LIMIT = 2;
export const PILOT_DEFAULT_ACTIVE_VEHICLE_LIMIT = 3;
export const PRO_MINIMUM_BILLABLE_ACTIVE_VEHICLES = 5;
export const FLEET_STARTING_PRICE_CAD = 299;

function getAnnualPerVehicleCad() {
  return Math.round(
    PRO_MONTHLY_PER_ACTIVE_VEHICLE_CAD * 12 * (1 - PRO_ANNUAL_DISCOUNT_PERCENT / 100) * 100
  ) / 100;
}

export function normalizeSubscriptionTier(value: LegacySubscriptionTier | null | undefined): SubscriptionTier {
  if (value === "pilot") return "pilot_access";
  if (value === "pro" || value === "fleet" || value === "pilot_access") return value;
  return "free";
}

export const SUBSCRIPTION_PLANS: Record<SubscriptionTier, PlanDefinition> = {
  free: {
    tier: "free",
    label: "Free",
    description: "A real starting point for smaller fleets running inspections, maintenance, and core compliance.",
    publicSelectable: true,
    selfServeCheckout: false,
    requiresSalesContact: false,
    diagnosticsHeroLabel: "Core TruckFixr access",
    monthlyPriceCad: 0,
    annualPriceCad: 0,
    annualDiscountPercent: 0,
    monthlyPriceUsd: 0,
    publicPriceAnchor: "CAD $0",
    pricingUnit: "account",
    minimumBillableVehicles: 0,
    limits: {
      diagnosticsPerMonth: 10,
      activeVehicleCount: FREE_ACTIVE_VEHICLE_LIMIT,
      driverCount: FREE_DRIVER_LIMIT,
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
  pilot_access: {
    tier: "pilot_access",
    label: "Pilot Access",
    description: "Temporary code-based trial access for guided onboarding and controlled fleet pilots.",
    publicSelectable: false,
    selfServeCheckout: false,
    requiresSalesContact: false,
    diagnosticsHeroLabel: "Temporary pilot access",
    monthlyPriceCad: 0,
    annualPriceCad: 0,
    annualDiscountPercent: 0,
    monthlyPriceUsd: 0,
    publicPriceAnchor: "Code-based trial",
    pricingUnit: "account",
    minimumBillableVehicles: 0,
    limits: {
      diagnosticsPerMonth: null,
      activeVehicleCount: PILOT_DEFAULT_ACTIVE_VEHICLE_LIMIT,
      driverCount: null,
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
    description: "The self-serve plan for small fleets that need full diagnostics, compliance, and maintenance workflows.",
    publicSelectable: true,
    selfServeCheckout: true,
    requiresSalesContact: false,
    diagnosticsHeroLabel: "Diagnostics-first for small fleets",
    monthlyPriceCad: PRO_MONTHLY_PER_ACTIVE_VEHICLE_CAD,
    annualPriceCad: getAnnualPerVehicleCad(),
    annualDiscountPercent: PRO_ANNUAL_DISCOUNT_PERCENT,
    monthlyPriceUsd: PRO_MONTHLY_PER_ACTIVE_VEHICLE_CAD,
    publicPriceAnchor: "CAD $19 / active vehicle / month",
    pricingUnit: "active_vehicle",
    minimumBillableVehicles: PRO_MINIMUM_BILLABLE_ACTIVE_VEHICLES,
    limits: {
      diagnosticsPerMonth: null,
      activeVehicleCount: null,
      driverCount: null,
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
  fleet: {
    tier: "fleet",
    label: "Fleet",
    description: "For growing or operationally complex fleets that need advanced reporting, fleet visibility, and a sales-assisted rollout.",
    publicSelectable: true,
    selfServeCheckout: false,
    requiresSalesContact: true,
    diagnosticsHeroLabel: "Advanced fleet operations",
    monthlyPriceCad: FLEET_STARTING_PRICE_CAD,
    annualPriceCad: null,
    annualDiscountPercent: 0,
    monthlyPriceUsd: FLEET_STARTING_PRICE_CAD,
    publicPriceAnchor: "Starting at CAD $299/month",
    pricingUnit: "account",
    minimumBillableVehicles: 0,
    limits: {
      diagnosticsPerMonth: null,
      activeVehicleCount: null,
      driverCount: null,
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

export function isPaidTier(tier: LegacySubscriptionTier | null | undefined) {
  const normalized = normalizeSubscriptionTier(tier);
  return normalized === "pro" || normalized === "fleet";
}

export function hasPaidAccess(tier: LegacySubscriptionTier | null | undefined, billingStatus: BillingStatus) {
  const normalized = normalizeSubscriptionTier(tier);
  return (
    isPaidTier(normalized) &&
    (billingStatus === "active" || billingStatus === "trialing")
  );
}

export function getEffectiveTier(
  tier: LegacySubscriptionTier | null | undefined,
  billingStatus: BillingStatus
): SubscriptionTier {
  const normalized = normalizeSubscriptionTier(tier);
  if (normalized === "pilot_access") return "pilot_access";
  if (normalized === "free") return "free";
  return hasPaidAccess(normalized, billingStatus) ? normalized : "free";
}

export function formatCad(amount: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
}

export function getPlanRestrictionMessage(
  type: "vehicles" | "drivers" | "diagnostics" | "downgrade" | "fleet",
  tier: LegacySubscriptionTier | null | undefined
) {
  const normalized = normalizeSubscriptionTier(tier);
  switch (type) {
    case "vehicles":
      if (normalized === "free") {
        return "Free includes up to 2 active vehicles. Upgrade to Pro to add more.";
      }
      if (normalized === "pilot_access") {
        return "Pilot Access has reached its current active-vehicle limit. Upgrade to Pro to keep adding vehicles.";
      }
      return "This plan has reached its vehicle limit.";
    case "drivers":
      if (normalized === "free") {
        return "Free includes up to 2 driver accounts. Upgrade to Pro to invite more drivers.";
      }
      if (normalized === "pilot_access") {
        return "Pilot Access has reached its current driver limit. Upgrade to Pro to invite more drivers.";
      }
      return "This plan has reached its driver limit.";
    case "diagnostics":
      if (normalized === "free") {
        return "You've reached your monthly diagnostic limit. Upgrade to Pro to continue running diagnostics.";
      }
      return "Diagnostics are temporarily restricted for this plan.";
    case "downgrade":
      return "Cleanup is required before you can downgrade. Reduce active vehicles and drivers to fit the target plan first.";
    case "fleet":
      return "Fleet is best for larger or more operationally complex fleets. Request a quote to continue.";
    default:
      return "This action is restricted by your current plan.";
  }
}

export function calculateProPricing(input: {
  activeVehicleCount: number;
  cadence: BillingCadence;
}) {
  const billableVehicleCount = Math.max(
    PRO_MINIMUM_BILLABLE_ACTIVE_VEHICLES,
    Math.max(0, Math.floor(input.activeVehicleCount || 0))
  );
  const monthlyTotalCad = billableVehicleCount * PRO_MONTHLY_PER_ACTIVE_VEHICLE_CAD;
  const annualDiscountFactor = 1 - PRO_ANNUAL_DISCOUNT_PERCENT / 100;
  const annualTotalCad = Math.round(monthlyTotalCad * 12 * annualDiscountFactor * 100) / 100;
  const monthlyEquivalentCad = Math.round((annualTotalCad / 12) * 100) / 100;
  const annualSavingsCad = Math.round((monthlyTotalCad * 12 - annualTotalCad) * 100) / 100;

  return {
    cadence: input.cadence,
    activeVehicleCount: Math.max(0, Math.floor(input.activeVehicleCount || 0)),
    billableVehicleCount,
    minimumBillableVehicleCount: PRO_MINIMUM_BILLABLE_ACTIVE_VEHICLES,
    perVehicleMonthlyCad: PRO_MONTHLY_PER_ACTIVE_VEHICLE_CAD,
    monthlyTotalCad,
    annualTotalCad,
    annualSavingsCad,
    monthlyEquivalentCad,
  };
}

export function getBillingStatusLabel(status: BillingStatus) {
  switch (status) {
    case "trialing":
      return "Trialing";
    case "past_due":
      return "Past due";
    case "canceled":
      return "Canceled";
    case "incomplete":
      return "Incomplete";
    case "incomplete_expired":
      return "Incomplete expired";
    case "unpaid":
      return "Unpaid";
    default:
      return "Active";
  }
}

export function getPublicPlans() {
  return [SUBSCRIPTION_PLANS.free, SUBSCRIPTION_PLANS.pro, SUBSCRIPTION_PLANS.fleet];
}
