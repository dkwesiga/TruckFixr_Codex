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

// The server bounds its own NHTSA call to 8s (see VIN_DECODE_TIMEOUT_MS in
// server/_core/vehicleLookupRoutes.ts) and responds with a fallback either
// way — this is a backstop for whatever's between here and there (a slow
// network, a stalled server) so the "Decode" button is never stuck spinning
// indefinitely regardless of where the slowness comes from.
const DECODE_TIMEOUT_MS = 12_000;

// Calls the NHTSA-backed decode endpoint (server/_core/vehicleLookupRoutes.ts).
// Always resolves — network/parse/timeout failures surface as { ok: false }
// rather than throwing, so callers can fall back to manual vehicle entry.
export async function decodeVin(vinInput: string): Promise<VinDecodeOutcome> {
  const vin = normalizeVinInput(vinInput);
  if (vin.length !== 17) {
    return { ok: false, error: "VIN must be 17 characters." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DECODE_TIMEOUT_MS);

  try {
    const response = await fetch(getApiUrl(`/api/vehicles/decode-vin/${encodeURIComponent(vin)}`), {
      signal: controller.signal,
    });
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
    if (error instanceof Error && error.name === "AbortError") {
      return {
        ok: false,
        error: "The VIN decoder is taking too long to respond. Try again, or enter the vehicle details manually.",
      };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Couldn't decode this VIN. Enter the vehicle details manually.",
    };
  } finally {
    clearTimeout(timeout);
  }
}
