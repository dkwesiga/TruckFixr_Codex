import { describe, expect, it } from "vitest";
import {
  computeDowntimeEstimate,
  computeWorkflowRiskScore,
  formatCad,
  riskBandForScore,
  type DowntimeCalculatorInput,
} from "./downtimeCost";

const sampleInput: DowntimeCalculatorInput = {
  fleetSize: 50,
  affectedVehiclesPerMonth: 3,
  averageDowntimeDays: 2,
  revenuePerVehiclePerDay: 800,
  driverLabourCostPerDay: 250,
  repairDecisionDelayDays: 1,
  repeatRepairEventsPerMonth: 2,
  currentMaintenanceWorkflow: "whatsapp_text",
};

describe("computeDowntimeEstimate", () => {
  it("matches the documented sample calculation", () => {
    const result = computeDowntimeEstimate(sampleInput);

    expect(result.downtimeCostPerVehiclePerDay).toBe(1050);
    expect(result.monthlyDirectDowntimeCost).toBe(6300);
    expect(result.decisionDelayCost).toBe(3150);
    expect(result.repeatRepairRiskCost).toBe(2100);
    expect(result.estimatedMonthlyDowntimeExposure).toBe(11550);
    expect(result.estimatedAnnualDowntimeExposure).toBe(138600);
  });

  it("clamps negative and non-finite inputs to zero", () => {
    const result = computeDowntimeEstimate({
      ...sampleInput,
      affectedVehiclesPerMonth: -5,
      averageDowntimeDays: Number.NaN,
      revenuePerVehiclePerDay: Number.POSITIVE_INFINITY,
    });

    expect(result.monthlyDirectDowntimeCost).toBe(0);
    expect(result.decisionDelayCost).toBe(0);
    // repeatRepairRiskCost still uses driver labour (250) since revenue clamps to 0.
    expect(result.repeatRepairRiskCost).toBe(500);
    expect(Number.isFinite(result.estimatedAnnualDowntimeExposure)).toBe(true);
  });
});

describe("computeWorkflowRiskScore", () => {
  it("scores the sample fleet in the moderate band", () => {
    // downtime>1 (+20), delay not >1 (0), repeat>0 (+15), disconnected workflow (+25) = 60
    const score = computeWorkflowRiskScore(sampleInput);
    expect(score).toBe(60);
    expect(riskBandForScore(score)).toBe("moderate");
  });

  it("caps at 100 and rates the most connected workflow lowest", () => {
    const critical = computeWorkflowRiskScore({
      ...sampleInput,
      averageDowntimeDays: 5,
      repairDecisionDelayDays: 5,
      repeatRepairEventsPerMonth: 6,
      currentMaintenanceWorkflow: "mixed_disconnected",
    });
    expect(critical).toBe(100);
    expect(riskBandForScore(critical)).toBe("critical");

    const connected = computeWorkflowRiskScore({
      ...sampleInput,
      averageDowntimeDays: 0.5,
      repairDecisionDelayDays: 0,
      repeatRepairEventsPerMonth: 0,
      currentMaintenanceWorkflow: "fleet_software",
    });
    expect(connected).toBe(0);
    expect(riskBandForScore(connected)).toBe("low");
  });
});

describe("riskBandForScore", () => {
  it("maps band boundaries", () => {
    expect(riskBandForScore(0)).toBe("low");
    expect(riskBandForScore(30)).toBe("low");
    expect(riskBandForScore(31)).toBe("moderate");
    expect(riskBandForScore(60)).toBe("moderate");
    expect(riskBandForScore(61)).toBe("high");
    expect(riskBandForScore(80)).toBe("high");
    expect(riskBandForScore(81)).toBe("critical");
    expect(riskBandForScore(100)).toBe("critical");
  });
});

describe("formatCad", () => {
  it("formats whole Canadian dollars", () => {
    expect(formatCad(11550)).toBe("$11,550");
    expect(formatCad(Number.NaN)).toBe("$0");
  });
});
