import { getApiUrl, readApiPayload } from "@/lib/api";

export function normalizeVinInput(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/[OQ]/g, "0")
    .replace(/I/g, "1");
}

const VIN_CHECK_DIGIT_TRANSLITERATION: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
  0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9,
};

const VIN_CHECK_DIGIT_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

/**
 * Computes the North American VIN check digit (position 9) per 49 CFR 565.
 * Returns null if `vin` isn't 17 characters of the valid VIN alphabet.
 */
export function computeVinCheckDigit(vin: string): string | null {
  if (vin.length !== 17) return null;

  let sum = 0;
  for (let index = 0; index < 17; index += 1) {
    const value = VIN_CHECK_DIGIT_TRANSLITERATION[vin[index]];
    if (value === undefined) return null;
    sum += value * VIN_CHECK_DIGIT_WEIGHTS[index];
  }

  const remainder = sum % 11;
  return remainder === 10 ? "X" : String(remainder);
}

/** True when the VIN's own check digit (position 9) matches its computed value. */
export function isValidVinCheckDigit(vin: string): boolean {
  const expected = computeVinCheckDigit(vin);
  return expected !== null && expected === vin[8];
}

export type VinFormatError =
  | "VIN_INVALID_LENGTH"
  | "VIN_INVALID_CHARACTERS"
  | "VIN_CHECK_DIGIT_FAILED";

export type VinFormatValidation = { ok: true } | { ok: false; error: VinFormatError; message: string };

/**
 * Local VIN validation, independent of and run before any NHTSA call: exact length, VIN
 * alphabet (no I/O/Q), and check digit. NHTSA's own decode response is still consulted
 * separately (see decodeVin) since not all VIN check-digit edge cases are worth hard-blocking
 * on client-side alone, but this catches the common OCR/typo failures earlier and cheaper.
 */
export function validateVinFormat(vin: string): VinFormatValidation {
  if (vin.length !== 17) {
    return { ok: false, error: "VIN_INVALID_LENGTH", message: "VIN must be exactly 17 characters." };
  }
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
    return {
      ok: false,
      error: "VIN_INVALID_CHARACTERS",
      message: "VIN can only contain letters and numbers, and never I, O, or Q.",
    };
  }
  if (!isValidVinCheckDigit(vin)) {
    return {
      ok: false,
      error: "VIN_CHECK_DIGIT_FAILED",
      message: "This VIN's check digit doesn't match — double-check the characters before saving.",
    };
  }
  return { ok: true };
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
