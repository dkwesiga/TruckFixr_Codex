import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { submitDowntimeCalculatorLead } from "../services/downtimeCalculator";
import { MAINTENANCE_WORKFLOWS } from "../../shared/calculators/downtimeCost";

const workflowSchema = z.enum(MAINTENANCE_WORKFLOWS);

// Numeric inputs are bounded to keep the estimate sane and reject abuse.
const nonNegativeNumber = z.number().finite().min(0).max(1_000_000);
const nonNegativeInt = z.number().int().min(0).max(1_000_000);

export const downtimeCalculatorRouter = router({
  submit: publicProcedure
    .input(
      z.object({
        // Lead details
        name: z.string().trim().min(2).max(255),
        email: z.string().trim().email().max(320),
        company: z.string().trim().min(2).max(255),
        role: z.string().trim().min(2).max(255),
        fleetSize: z.number().int().min(1).max(1_000_000),
        phone: z.string().trim().max(50).optional().nullable(),
        vehicleTypes: z.string().trim().max(300).optional().nullable(),
        currentMaintenanceWorkflow: z
          .string()
          .trim()
          .max(64)
          .optional()
          .nullable(),
        biggestDowntimeIssue: z.string().trim().max(2000).optional().nullable(),
        // Calculator inputs
        affectedVehiclesPerMonth: nonNegativeInt,
        averageDowntimeDays: nonNegativeNumber,
        revenuePerVehiclePerDay: nonNegativeNumber,
        driverLabourCostPerDay: nonNegativeNumber,
        repairDecisionDelayDays: nonNegativeNumber,
        repeatRepairEventsPerMonth: nonNegativeInt,
        calculatorWorkflow: workflowSchema,
        // Attribution
        pagePath: z.string().trim().max(255).optional().nullable(),
        userAgent: z.string().trim().max(2048).optional().nullable(),
        // Honeypot
        trapField: z.string().trim().max(255).optional().nullable(),
      })
    )
    .mutation(async ({ input }) => {
      const { lead, estimate } = await submitDowntimeCalculatorLead(input);

      return {
        id: lead.id,
        createdAt: lead.createdAt,
        estimate,
        message:
          "Thank you. Your downtime report is ready below and the TruckFixr team has been notified.",
      };
    }),
});
