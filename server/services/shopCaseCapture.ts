import { TRPCError } from "@trpc/server";
import { ensureShopVehicle, type VehicleProvenanceSource } from "./shopVehicleIntake";
import { createManualCase } from "./maintenanceCases";
import { addDecision } from "./maintenanceDecisions";
import type { CaseType } from "@shared/tadis/caseTypes";
import type { MaintenanceSeverity } from "@shared/maintenance/caseWorkflow";

// Fast shop case capture (§5/§6): VIN-first, progressive-disclosure intake
// that a Service Advisor or Technician can complete in under a minute.
// Composes three existing building blocks (vehicle intake, the case spine,
// and the append-only Resolution/decision log) into one call so the router
// stays thin. The first Resolution recorded is a lightweight "intake logged"
// placeholder (resolutionCategory: further_diagnostics) — the actual
// diagnosis/repair Resolution is added later via a separate addResolution
// call once a technician has looked at the vehicle.
export async function createShopCase(input: {
  fleetId: number;
  actorUserId: number;
  vehicle: {
    vin?: string | null;
    unitNumber?: string | null;
    licensePlate?: string | null;
    make?: string | null;
    model?: string | null;
    year?: number | null;
    engineMake?: string | null;
    assetType?: "tractor" | "straight_truck" | "trailer" | "other";
    vinSource: VehicleProvenanceSource;
  };
  caseType: CaseType;
  complaint: string;
  symptoms?: string[];
  faultCodes?: string[];
  severity?: MaintenanceSeverity;
}) {
  if (!input.complaint?.trim()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "A complaint or inquiry description is required." });
  }

  const { vehicle, provenance } = await ensureShopVehicle({
    fleetId: input.fleetId,
    vin: input.vehicle.vin,
    unitNumber: input.vehicle.unitNumber,
    licensePlate: input.vehicle.licensePlate,
    make: input.vehicle.make,
    model: input.vehicle.model,
    year: input.vehicle.year,
    engineMake: input.vehicle.engineMake,
    assetType: input.vehicle.assetType,
    vinSource: input.vehicle.vinSource,
    createdByUserId: input.actorUserId,
  });

  const caseRow = await createManualCase({
    fleetId: input.fleetId,
    vehicleId: vehicle.id,
    origin: "manual",
    title: input.complaint.slice(0, 120),
    summary: input.complaint,
    severity: input.severity ?? "stable",
    createdByUserId: input.actorUserId,
    caseType: input.caseType,
    recordOrigin: "live",
    vehicleContextProvenance: { vin: provenance, make: provenance, model: provenance, year: provenance },
  });

  if (!caseRow) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create case." });
  }

  const decision = await addDecision({
    fleetId: input.fleetId,
    caseId: caseRow.id,
    actorUserId: input.actorUserId,
    source: "manual",
    severity: input.severity ?? "stable",
    proposedAction: "continue_monitor",
    rationale: input.complaint,
    likelyCauses: input.symptoms ?? [],
    evidence: input.faultCodes?.length ? { faultCodes: input.faultCodes } : undefined,
    resolutionCategory: "further_diagnostics",
  });

  return { case: caseRow, vehicle, decision };
}
