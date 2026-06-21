// Fleet Downtime Cost Calculator — shared logic.
//
// This module is imported by both the client (instant on-screen estimate) and
// the server (authoritative recalculation before a lead is stored), so the two
// can never disagree. Keep it free of React/Node-specific imports.
//
// IMPORTANT: The output is a decision-risk estimate for planning and workflow
// review. It is not an accounting figure and must not be presented as
// guaranteed savings, guaranteed downtime reduction, or guaranteed compliance.

export const MAINTENANCE_WORKFLOWS = [
  "spreadsheets",
  "whatsapp_text",
  "paper_forms",
  "repair_invoices",
  "telematics_alerts",
  "fleet_software",
  "memory_verbal",
  "mixed_disconnected",
] as const;

export type MaintenanceWorkflow = (typeof MAINTENANCE_WORKFLOWS)[number];

export const MAINTENANCE_WORKFLOW_LABELS: Record<MaintenanceWorkflow, string> =
  {
    spreadsheets: "Spreadsheets",
    whatsapp_text: "WhatsApp / text messages",
    paper_forms: "Paper forms",
    repair_invoices: "Repair invoices",
    telematics_alerts: "Telematics alerts",
    fleet_software: "Fleet software",
    memory_verbal: "Memory / verbal updates",
    mixed_disconnected: "Mixed / disconnected workflow",
  };

// Workflows where maintenance signals tend to live in disconnected places and
// are easy to lose between people. Used to nudge the risk score upward.
const DISCONNECTED_WORKFLOWS: ReadonlySet<MaintenanceWorkflow> =
  new Set<MaintenanceWorkflow>([
    "spreadsheets",
    "whatsapp_text",
    "paper_forms",
    "repair_invoices",
    "memory_verbal",
    "mixed_disconnected",
  ]);

export type DowntimeCalculatorInput = {
  fleetSize: number;
  affectedVehiclesPerMonth: number;
  averageDowntimeDays: number;
  revenuePerVehiclePerDay: number;
  driverLabourCostPerDay: number;
  repairDecisionDelayDays: number;
  repeatRepairEventsPerMonth: number;
  currentMaintenanceWorkflow: MaintenanceWorkflow;
};

export type RiskBand = "low" | "moderate" | "high" | "critical";

export type DowntimeEstimate = {
  downtimeCostPerVehiclePerDay: number;
  monthlyDirectDowntimeCost: number;
  decisionDelayCost: number;
  repeatRepairRiskCost: number;
  estimatedMonthlyDowntimeExposure: number;
  estimatedAnnualDowntimeExposure: number;
  workflowRiskScore: number;
  workflowRiskBand: RiskBand;
  workflowRiskBandLabel: string;
};

export const RISK_BAND_LABELS: Record<RiskBand, string> = {
  low: "Low visible downtime risk",
  moderate: "Moderate downtime workflow risk",
  high: "High downtime workflow risk",
  critical: "Critical downtime workflow risk",
};

export function isMaintenanceWorkflow(
  value: unknown
): value is MaintenanceWorkflow {
  return (
    typeof value === "string" &&
    (MAINTENANCE_WORKFLOWS as readonly string[]).includes(value)
  );
}

// Coerce arbitrary client input to a safe, non-negative finite number.
function toNonNegativeNumber(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function computeWorkflowRiskScore(
  input: DowntimeCalculatorInput
): number {
  const averageDowntimeDays = toNonNegativeNumber(input.averageDowntimeDays);
  const repairDecisionDelayDays = toNonNegativeNumber(
    input.repairDecisionDelayDays
  );
  const repeatRepairEventsPerMonth = toNonNegativeNumber(
    input.repeatRepairEventsPerMonth
  );

  let score = 0;

  // High downtime days.
  if (averageDowntimeDays > 1) score += 20;
  if (averageDowntimeDays > 3) score += 10;

  // High decision delay.
  if (repairDecisionDelayDays > 1) score += 20;
  if (repairDecisionDelayDays > 3) score += 10;

  // Repeat repair events.
  if (repeatRepairEventsPerMonth > 0) score += 15;
  if (repeatRepairEventsPerMonth > 3) score += 10;

  // Disconnected maintenance workflow.
  if (DISCONNECTED_WORKFLOWS.has(input.currentMaintenanceWorkflow)) {
    score += 25;
  } else if (input.currentMaintenanceWorkflow === "telematics_alerts") {
    score += 5;
  }
  // "fleet_software" adds nothing — it is the most connected workflow.

  return Math.min(100, score);
}

export function riskBandForScore(score: number): RiskBand {
  if (score <= 30) return "low";
  if (score <= 60) return "moderate";
  if (score <= 80) return "high";
  return "critical";
}

export function computeDowntimeEstimate(
  input: DowntimeCalculatorInput
): DowntimeEstimate {
  const affectedVehiclesPerMonth = toNonNegativeNumber(
    input.affectedVehiclesPerMonth
  );
  const averageDowntimeDays = toNonNegativeNumber(input.averageDowntimeDays);
  const revenuePerVehiclePerDay = toNonNegativeNumber(
    input.revenuePerVehiclePerDay
  );
  const driverLabourCostPerDay = toNonNegativeNumber(
    input.driverLabourCostPerDay
  );
  const repairDecisionDelayDays = toNonNegativeNumber(
    input.repairDecisionDelayDays
  );
  const repeatRepairEventsPerMonth = toNonNegativeNumber(
    input.repeatRepairEventsPerMonth
  );

  const downtimeCostPerVehiclePerDay =
    revenuePerVehiclePerDay + driverLabourCostPerDay;

  const monthlyDirectDowntimeCost =
    affectedVehiclesPerMonth *
    averageDowntimeDays *
    downtimeCostPerVehiclePerDay;

  const decisionDelayCost =
    affectedVehiclesPerMonth *
    repairDecisionDelayDays *
    downtimeCostPerVehiclePerDay;

  const repeatRepairRiskCost =
    repeatRepairEventsPerMonth * downtimeCostPerVehiclePerDay;

  const estimatedMonthlyDowntimeExposure =
    monthlyDirectDowntimeCost + decisionDelayCost + repeatRepairRiskCost;

  const estimatedAnnualDowntimeExposure = estimatedMonthlyDowntimeExposure * 12;

  const workflowRiskScore = computeWorkflowRiskScore(input);
  const workflowRiskBand = riskBandForScore(workflowRiskScore);

  return {
    downtimeCostPerVehiclePerDay: round2(downtimeCostPerVehiclePerDay),
    monthlyDirectDowntimeCost: round2(monthlyDirectDowntimeCost),
    decisionDelayCost: round2(decisionDelayCost),
    repeatRepairRiskCost: round2(repeatRepairRiskCost),
    estimatedMonthlyDowntimeExposure: round2(estimatedMonthlyDowntimeExposure),
    estimatedAnnualDowntimeExposure: round2(estimatedAnnualDowntimeExposure),
    workflowRiskScore,
    workflowRiskBand,
    workflowRiskBandLabel: RISK_BAND_LABELS[workflowRiskBand],
  };
}

const CAD_FORMATTER = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

// Canadian dollar formatting, whole dollars (this is an estimate, not invoicing).
export function formatCad(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return CAD_FORMATTER.format(safe);
}
