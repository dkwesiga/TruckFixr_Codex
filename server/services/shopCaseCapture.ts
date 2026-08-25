import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import { getDb } from "../db";
import { vehicles } from "../../drizzle/schema";
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
  // Exactly one of these: an existing vehicle already on file for this shop
  // (a returning customer), or intake details for a new/walk-in vehicle.
  vehicleId?: string | null;
  vehicle?: {
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

  let vehicle: typeof vehicles.$inferSelect;
  let provenance: VehicleProvenanceSource;

  if (input.vehicleId) {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const [existing] = await db
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.id, input.vehicleId), eq(vehicles.fleetId, input.fleetId)))
      .limit(1);
    if (!existing) {
      throw new TRPCError({ code: "NOT_FOUND", message: "That vehicle was not found in your shop." });
    }
    vehicle = existing;
    provenance = "tenant_record";
  } else if (input.vehicle) {
    const ensured = await ensureShopVehicle({
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
    vehicle = ensured.vehicle;
    provenance = ensured.provenance;
  } else {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Either an existing vehicleId or new vehicle details are required.",
    });
  }

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

// Vehicles this shop has already captured, for the "existing vehicle" picker
// on the new-case form. Deliberately every vehicle in the fleet, not scoped
// to the caller's own driver assignments: shop staff (Service Advisor /
// Technician) are granted the createCase capability, not per-vehicle
// assignments (those are for fleet customers' own drivers), so the
// assignment-scoped vehicles.listByFleet query would return nothing for them.
export async function listShopVehicles(input: { fleetId: number }) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(vehicles)
    .where(eq(vehicles.fleetId, input.fleetId))
    .orderBy(vehicles.createdAt);
}
