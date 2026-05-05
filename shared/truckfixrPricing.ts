export type PlanKey =
  | "free_trial"
  | "owner_operator"
  | "small_fleet"
  | "fleet_growth"
  | "fleet_pro"
  | "custom_fleet";

export type BillingInterval = "trial" | "monthly" | "annual" | "pilot" | "custom";

export type BillingStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "expired"
  | "custom";

export type AssetCategory = "powered_vehicle" | "trailer";

export type TrailerLinkStatus = "linked" | "unlinked_active" | "inactive_draft";

export type TruckFixrPlan = {
  name: string;
  planKey: PlanKey;
  billingInterval: BillingInterval;
  priceCadMonthly: number | null;
  priceCadAnnual: number | null;
  poweredVehicleLimit: number | null;
  includedTrailerLimit: number | null;
  extraTrailerPriceCadMonthly: number | null;
  aiDiagnosticSessionLimit: number | null;
  aiSessionLimitType: "total" | "monthly" | "custom";
  creditCardRequired: boolean;
  unlimitedInspections: boolean;
  unlimitedUsers: boolean;
  managerAccess: boolean;
  driverAssignments: "basic" | boolean;
  fleetDashboard: "basic" | "full" | "advanced" | "custom";
  reports: "basic" | "full" | "advanced" | "custom";
  csvExport: boolean;
  prioritySupport: boolean;
  publicSelectable: boolean;
  recommended?: boolean;
  description: string;
  publicNote: string;
  cta: string;
};

export const TRUCKFIXR_PLANS: Record<PlanKey, TruckFixrPlan> = {
  free_trial: {
    name: "14-Day Free Trial",
    planKey: "free_trial",
    billingInterval: "trial",
    priceCadMonthly: 0,
    priceCadAnnual: null,
    poweredVehicleLimit: 2,
    includedTrailerLimit: 2,
    extraTrailerPriceCadMonthly: 5,
    aiDiagnosticSessionLimit: 10,
    aiSessionLimitType: "total",
    creditCardRequired: false,
    unlimitedInspections: true,
    unlimitedUsers: true,
    managerAccess: true,
    driverAssignments: true,
    fleetDashboard: "basic",
    reports: "basic",
    csvExport: false,
    prioritySupport: false,
    publicSelectable: true,
    description: "A no-card trial for getting your first powered vehicles and trailers into daily workflow.",
    publicNote: "Start with 2 powered vehicles, 2 active trailers, and 10 total AI diagnostic sessions.",
    cta: "Start Free Trial",
  },
  owner_operator: {
    name: "Owner-Operator",
    planKey: "owner_operator",
    billingInterval: "monthly",
    priceCadMonthly: 19,
    priceCadAnnual: 190,
    poweredVehicleLimit: 1,
    includedTrailerLimit: 1,
    extraTrailerPriceCadMonthly: 5,
    aiDiagnosticSessionLimit: 20,
    aiSessionLimitType: "monthly",
    creditCardRequired: false,
    unlimitedInspections: true,
    unlimitedUsers: true,
    managerAccess: false,
    driverAssignments: "basic",
    fleetDashboard: "basic",
    reports: "basic",
    csvExport: false,
    prioritySupport: false,
    publicSelectable: true,
    description: "Best for a single operator who wants structured inspections and AI triage without extra seats.",
    publicNote: "Includes 1 powered vehicle, 1 active trailer, and 20 AI diagnostic sessions per month.",
    cta: "Choose Plan",
  },
  small_fleet: {
    name: "Small Fleet",
    planKey: "small_fleet",
    billingInterval: "monthly",
    priceCadMonthly: 49,
    priceCadAnnual: 490,
    poweredVehicleLimit: 5,
    includedTrailerLimit: 5,
    extraTrailerPriceCadMonthly: 5,
    aiDiagnosticSessionLimit: 75,
    aiSessionLimitType: "monthly",
    creditCardRequired: true,
    unlimitedInspections: true,
    unlimitedUsers: true,
    managerAccess: true,
    driverAssignments: true,
    fleetDashboard: "basic",
    reports: "basic",
    csvExport: false,
    prioritySupport: false,
    publicSelectable: true,
    description: "For small fleets that need dependable inspections, diagnostics, and vehicle uptime visibility.",
    publicNote: "Includes up to 5 powered vehicles, 5 active trailers, and 75 AI diagnostic sessions per month.",
    cta: "Choose Plan",
  },
  fleet_growth: {
    name: "Fleet Growth",
    planKey: "fleet_growth",
    billingInterval: "monthly",
    priceCadMonthly: 99,
    priceCadAnnual: 990,
    poweredVehicleLimit: 10,
    includedTrailerLimit: 10,
    extraTrailerPriceCadMonthly: 5,
    aiDiagnosticSessionLimit: 150,
    aiSessionLimitType: "monthly",
    creditCardRequired: true,
    unlimitedInspections: true,
    unlimitedUsers: true,
    managerAccess: true,
    driverAssignments: true,
    fleetDashboard: "full",
    reports: "full",
    csvExport: true,
    prioritySupport: false,
    publicSelectable: true,
    recommended: true,
    description: "Recommended for growing fleets that want full operational coverage and more AI room.",
    publicNote: "Includes up to 10 powered vehicles, 10 active trailers, and 150 AI diagnostic sessions per month.",
    cta: "Start 30-Day Fleet Pilot",
  },
  fleet_pro: {
    name: "Fleet Pro",
    planKey: "fleet_pro",
    billingInterval: "monthly",
    priceCadMonthly: 199,
    priceCadAnnual: 1990,
    poweredVehicleLimit: 20,
    includedTrailerLimit: 20,
    extraTrailerPriceCadMonthly: 5,
    aiDiagnosticSessionLimit: 300,
    aiSessionLimitType: "monthly",
    creditCardRequired: true,
    unlimitedInspections: true,
    unlimitedUsers: true,
    managerAccess: true,
    driverAssignments: true,
    fleetDashboard: "advanced",
    reports: "advanced",
    csvExport: true,
    prioritySupport: true,
    publicSelectable: true,
    description: "For larger small-fleet operations that need the highest included capacity in the MVP lineup.",
    publicNote: "Includes up to 20 powered vehicles, 20 active trailers, and 300 AI diagnostic sessions per month.",
    cta: "Choose Plan",
  },
  custom_fleet: {
    name: "Custom Fleet",
    planKey: "custom_fleet",
    billingInterval: "custom",
    priceCadMonthly: null,
    priceCadAnnual: null,
    poweredVehicleLimit: null,
    includedTrailerLimit: null,
    extraTrailerPriceCadMonthly: null,
    aiDiagnosticSessionLimit: null,
    aiSessionLimitType: "custom",
    creditCardRequired: false,
    unlimitedInspections: true,
    unlimitedUsers: true,
    managerAccess: true,
    driverAssignments: true,
    fleetDashboard: "custom",
    reports: "custom",
    csvExport: true,
    prioritySupport: true,
    publicSelectable: true,
    description: "For 21+ powered vehicles or trailer-heavy fleets that need a custom setup.",
    publicNote: "Custom pricing and limits based on your operation.",
    cta: "Contact Sales",
  },
};

export const PUBLIC_PLAN_ORDER: PlanKey[] = [
  "free_trial",
  "owner_operator",
  "small_fleet",
  "fleet_growth",
  "fleet_pro",
  "custom_fleet",
];

export function getTruckFixrPlan(planKey: PlanKey) {
  return TRUCKFIXR_PLANS[planKey];
}

export function getTruckFixrPlanPrice(planKey: PlanKey, billingInterval: "monthly" | "annual") {
  const plan = TRUCKFIXR_PLANS[planKey];
  return billingInterval === "annual" ? plan.priceCadAnnual : plan.priceCadMonthly;
}

export function formatTruckFixrCad(amount: number | null) {
  if (amount === null) return "Custom";

  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
}

export function getPublicTruckFixrPlans() {
  return PUBLIC_PLAN_ORDER.map((planKey) => TRUCKFIXR_PLANS[planKey]).filter((plan) => plan.publicSelectable);
}

export function getTruckFixrPlanLimits(planKey: PlanKey) {
  const plan = TRUCKFIXR_PLANS[planKey];
  return {
    poweredVehicleLimit: plan.poweredVehicleLimit,
    includedTrailerLimit: plan.includedTrailerLimit,
    totalActiveTrailerLimit: plan.includedTrailerLimit,
    aiDiagnosticSessionLimit: plan.aiDiagnosticSessionLimit,
  };
}
