import { beforeEach, describe, expect, it, vi } from "vitest";

const insertValues = vi.fn();
const returning = vi.fn();
const insert = vi.fn(() => ({
  values: insertValues,
}));

vi.mock("./db", () => ({
  getDb: vi.fn(async () => ({
    insert,
  })),
}));

vi.mock("./services/email", () => ({
  sendEmail: vi.fn(async () => ({ delivered: true, skipped: false })),
}));

import { sendEmail } from "./services/email";
import { submitDowntimeCalculatorLead } from "./services/downtimeCalculator";

const baseInput = {
  name: "Jordan Smith",
  email: "Jordan@Example.com",
  company: "Brampton Transit Inc.",
  role: "Fleet Manager",
  fleetSize: 50,
  phone: "416-555-0101",
  vehicleTypes: "Tractors and trailers",
  currentMaintenanceWorkflow: "whatsapp_text",
  biggestDowntimeIssue: "Repeat repairs we cannot track.",
  affectedVehiclesPerMonth: 3,
  averageDowntimeDays: 2,
  revenuePerVehiclePerDay: 800,
  driverLabourCostPerDay: 250,
  repairDecisionDelayDays: 1,
  repeatRepairEventsPerMonth: 2,
  calculatorWorkflow: "whatsapp_text" as const,
  pagePath: "/fleet-downtime-cost-calculator",
  userAgent: "vitest",
  trapField: "",
};

describe("submitDowntimeCalculatorLead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertValues.mockReturnValue({ returning });
    returning.mockResolvedValue([
      { id: 7, createdAt: new Date("2026-06-20T12:00:00.000Z") },
    ]);
  });

  it("recalculates the estimate server-side and stores it", async () => {
    const result = await submitDowntimeCalculatorLead(baseInput);

    expect(result.estimate.estimatedMonthlyDowntimeExposure).toBe(11550);
    expect(result.estimate.estimatedAnnualDowntimeExposure).toBe(138600);
    expect(result.estimate.workflowRiskScore).toBe(60);

    expect(insert).toHaveBeenCalled();
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        company: "Brampton Transit Inc.",
        email: "jordan@example.com", // normalized
        fleetSize: 50,
        estimatedMonthlyDowntimeExposure: "11550",
        estimatedAnnualDowntimeExposure: "138600",
        workflowRiskScore: 60,
        workflowRiskBand: "moderate",
        source: "fleet_downtime_cost_calculator",
      })
    );
    expect(result.lead.id).toBe(7);
  });

  it("ignores client-provided result values (server is authoritative)", async () => {
    // Even if a caller tampered with derived fields, only calculator inputs matter.
    await submitDowntimeCalculatorLead({
      ...baseInput,
      affectedVehiclesPerMonth: 0,
      repeatRepairEventsPerMonth: 0,
      repairDecisionDelayDays: 0,
    });

    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        estimatedMonthlyDowntimeExposure: "0",
      })
    );
  });

  it("emails the sales recipient with the company and fleet size", async () => {
    await submitDowntimeCalculatorLead(baseInput);

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["info@truckfixr.com"],
        subject:
          "New TruckFixr downtime calculator lead: Brampton Transit Inc. - 50 vehicles",
      })
    );
  });

  it("rejects the honeypot field", async () => {
    await expect(
      submitDowntimeCalculatorLead({ ...baseInput, trapField: "filled" })
    ).rejects.toThrow("Please try again or contact info@truckfixr.com");
    expect(insert).not.toHaveBeenCalled();
  });

  it("still saves the lead if the notification email fails", async () => {
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error("mail down"));

    const result = await submitDowntimeCalculatorLead(baseInput);

    expect(result.lead.id).toBe(7);
    expect(sendEmail).toHaveBeenCalled();
  });
});
