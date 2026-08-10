import { getApiUrl, readApiPayload } from "@/lib/api";

export function normalizeVinInput(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/[OQ]/g, "0")
    .replace(/I/g, "1");
}

export type DecodedVehicle = {
  vin: string;
  make: string;
  model: string;
  year: number | null;
  engineMake?: string;
  vehicleType?: string;
  warnings?: string;
};

export type VinDecodeOutcome =
  | { ok: true; vehicle: DecodedVehicle }
  | { ok: false; error: string };

// Calls the NHTSA-backed decode endpoint (server/_core/vehicleLookupRoutes.ts).
// Always resolves — network/parse failures surface as { ok: false } rather
// than throwing, so callers can fall back to manual vehicle entry.
export async function decodeVin(vinInput: string): Promise<VinDecodeOutcome> {
  const vin = normalizeVinInput(vinInput);
  if (vin.length !== 17) {
    return { ok: false, error: "VIN must be 17 characters." };
  }

  try {
    const response = await fetch(getApiUrl(`/api/vehicles/decode-vin/${encodeURIComponent(vin)}`));
    const payload = await readApiPayload<Record<string, any>>(response, {
      htmlErrorMessage: "TruckFixr couldn't reach the VIN decoder right now. Please try again.",
    });

    if (!response.ok || (!payload.make && !payload.model && !payload.year)) {
      return {
        ok: false,
        error: payload.error || "Couldn't decode this VIN. Enter the vehicle details manually.",
      };
    }

    return {
      ok: true,
      vehicle: {
        vin,
        make: payload.make || "",
        model: payload.model || "",
        year: payload.year ?? null,
        engineMake: payload.engineMake || "",
        vehicleType: payload.vehicleType || "",
        warnings: payload.warnings || "",
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Couldn't decode this VIN. Enter the vehicle details manually.",
    };
  }
}
