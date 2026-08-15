import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { vehicles } from "../../drizzle/schema";

// Minimal vehicle intake for a repair-shop tenant (§7). Deliberately separate
// from vehicles.create (server/routers/vehicles.ts) — that path is fleet
// self-service vehicle management tied to subscription seat limits and
// driver assignment. A repair shop's customer vehicles are shop history, not
// billed fleet seats, so this never touches subscription/entitlement checks.
//
// Tracks provenance per field so the case can record whether vehicle context
// came from the VIN decoder, an existing tenant record, technician input, a
// historical import, or AI extraction (§7) — the caller builds
// vehicleContextProvenanceJson from the `source` this function reports.

export type VehicleProvenanceSource =
  | "vin_decoder"
  | "tenant_record"
  | "technician_input"
  | "historical_import"
  | "ai_extraction";

export type ShopVehicleIntakeInput = {
  fleetId: number;
  vin?: string | null;
  unitNumber?: string | null;
  licensePlate?: string | null;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  engineMake?: string | null;
  assetType?: "tractor" | "straight_truck" | "trailer" | "other";
  vinSource: VehicleProvenanceSource;
  createdByUserId: number;
};

export async function ensureShopVehicle(
  input: ShopVehicleIntakeInput
): Promise<{ vehicle: typeof vehicles.$inferSelect; created: boolean; provenance: VehicleProvenanceSource }> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable.");

  const normalizedVin = input.vin?.trim().toUpperCase() || null;

  if (normalizedVin) {
    const [existing] = await db
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.fleetId, input.fleetId), eq(vehicles.vin, normalizedVin)))
      .limit(1);
    if (existing) {
      return { vehicle: existing, created: false, provenance: "tenant_record" };
    }
  }

  const [created] = await db
    .insert(vehicles)
    .values({
      id: randomUUID(),
      fleetId: input.fleetId,
      assetType: input.assetType ?? "tractor",
      vin: normalizedVin ?? "UNKNOWN00000000000".slice(0, 17),
      unitNumber: input.unitNumber ?? null,
      licensePlate: input.licensePlate ?? "UNKNOWN",
      make: input.make ?? null,
      model: input.model ?? null,
      year: input.year ?? null,
      engineMake: input.engineMake ?? null,
      assetRecordStatus: "active",
      createdByUserId: input.createdByUserId,
    })
    .returning();

  return { vehicle: created, created: true, provenance: input.vinSource };
}
