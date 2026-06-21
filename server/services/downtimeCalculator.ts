import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { ENV } from "../_core/env";
import { sendEmail } from "./email";
import { downtimeCalculatorLeads } from "../../drizzle/schema";
import {
  computeDowntimeEstimate,
  formatCad,
  isMaintenanceWorkflow,
  MAINTENANCE_WORKFLOW_LABELS,
  type DowntimeCalculatorInput,
  type MaintenanceWorkflow,
} from "../../shared/calculators/downtimeCost";

export type SubmitDowntimeLeadInput = {
  // Lead details
  name: string;
  email: string;
  company: string;
  role: string;
  fleetSize: number;
  phone?: string | null;
  vehicleTypes?: string | null;
  currentMaintenanceWorkflow?: string | null;
  biggestDowntimeIssue?: string | null;
  // Calculator inputs (the server recalculates results from these)
  affectedVehiclesPerMonth: number;
  averageDowntimeDays: number;
  revenuePerVehiclePerDay: number;
  driverLabourCostPerDay: number;
  repairDecisionDelayDays: number;
  repeatRepairEventsPerMonth: number;
  calculatorWorkflow: MaintenanceWorkflow;
  // Attribution
  pagePath?: string | null;
  userAgent?: string | null;
  // Honeypot — must stay empty for real users.
  trapField?: string | null;
};

function workflowLabel(value?: string | null): string {
  if (value && isMaintenanceWorkflow(value)) {
    return MAINTENANCE_WORKFLOW_LABELS[value];
  }
  return value?.trim() || "Not provided";
}

function buildLeadNotificationText(
  input: SubmitDowntimeLeadInput,
  estimate: ReturnType<typeof computeDowntimeEstimate>,
  submittedAt: Date
) {
  return [
    `New TruckFixr downtime calculator lead - ${input.company.trim()}`,
    "",
    `Name: ${input.name.trim()}`,
    `Company: ${input.company.trim()}`,
    `Role: ${input.role.trim()}`,
    `Email: ${input.email.trim()}`,
    `Phone: ${input.phone?.trim() || "Not provided"}`,
    `Fleet size: ${input.fleetSize} vehicles`,
    `Vehicle types: ${input.vehicleTypes?.trim() || "Not provided"}`,
    `Current maintenance workflow: ${workflowLabel(
      input.currentMaintenanceWorkflow ?? input.calculatorWorkflow
    )}`,
    "",
    `Estimated monthly downtime exposure: ${formatCad(
      estimate.estimatedMonthlyDowntimeExposure
    )}`,
    `Estimated annual downtime exposure: ${formatCad(
      estimate.estimatedAnnualDowntimeExposure
    )}`,
    `Workflow risk score: ${estimate.workflowRiskScore}/100 (${estimate.workflowRiskBandLabel})`,
    "",
    `Biggest downtime issue: ${input.biggestDowntimeIssue?.trim() || "Not provided"}`,
    `Source: ${input.pagePath?.trim() || "fleet_downtime_cost_calculator"}`,
    `Submission date/time: ${submittedAt.toISOString()}`,
  ].join("\n");
}

export async function submitDowntimeCalculatorLead(
  input: SubmitDowntimeLeadInput
) {
  if (input.trapField?.trim()) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "We could not submit your request. Please try again or contact info@truckfixr.com.",
    });
  }

  const db = await getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database not available",
    });
  }

  // Recalculate server-side; never trust the client's numbers.
  const calculatorInput: DowntimeCalculatorInput = {
    fleetSize: input.fleetSize,
    affectedVehiclesPerMonth: input.affectedVehiclesPerMonth,
    averageDowntimeDays: input.averageDowntimeDays,
    revenuePerVehiclePerDay: input.revenuePerVehiclePerDay,
    driverLabourCostPerDay: input.driverLabourCostPerDay,
    repairDecisionDelayDays: input.repairDecisionDelayDays,
    repeatRepairEventsPerMonth: input.repeatRepairEventsPerMonth,
    currentMaintenanceWorkflow: input.calculatorWorkflow,
  };
  const estimate = computeDowntimeEstimate(calculatorInput);

  const now = new Date();
  const [lead] = await db
    .insert(downtimeCalculatorLeads)
    .values({
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      phone: input.phone?.trim() || null,
      company: input.company.trim(),
      role: input.role.trim(),
      fleetSize: input.fleetSize,
      vehicleTypes: input.vehicleTypes?.trim() || null,
      currentMaintenanceWorkflow:
        input.currentMaintenanceWorkflow?.trim() || input.calculatorWorkflow,
      biggestDowntimeIssue: input.biggestDowntimeIssue?.trim() || null,
      affectedVehiclesPerMonth: input.affectedVehiclesPerMonth,
      averageDowntimeDays: String(input.averageDowntimeDays),
      revenuePerVehiclePerDay: String(input.revenuePerVehiclePerDay),
      driverLabourCostPerDay: String(input.driverLabourCostPerDay),
      repairDecisionDelayDays: String(input.repairDecisionDelayDays),
      repeatRepairEventsPerMonth: input.repeatRepairEventsPerMonth,
      downtimeCostPerVehiclePerDay: String(
        estimate.downtimeCostPerVehiclePerDay
      ),
      monthlyDirectDowntimeCost: String(estimate.monthlyDirectDowntimeCost),
      decisionDelayCost: String(estimate.decisionDelayCost),
      repeatRepairRiskCost: String(estimate.repeatRepairRiskCost),
      estimatedMonthlyDowntimeExposure: String(
        estimate.estimatedMonthlyDowntimeExposure
      ),
      estimatedAnnualDowntimeExposure: String(
        estimate.estimatedAnnualDowntimeExposure
      ),
      workflowRiskScore: estimate.workflowRiskScore,
      workflowRiskBand: estimate.workflowRiskBand,
      source: "fleet_downtime_cost_calculator",
      pagePath: input.pagePath?.trim() || null,
      userAgent: input.userAgent?.trim()?.slice(0, 2048) || null,
      createdAt: now,
    })
    .returning();

  const to = (ENV.salesNotificationEmail || "info@truckfixr.com")
    .trim()
    .toLowerCase();

  try {
    await sendEmail({
      to: [to],
      subject: `New TruckFixr downtime calculator lead: ${input.company.trim()} - ${input.fleetSize} vehicles`,
      text: buildLeadNotificationText(input, estimate, now),
    });
  } catch (error) {
    console.error(
      "[DowntimeCalculator] Lead notification email failed:",
      error
    );
  }

  return { lead, estimate };
}
