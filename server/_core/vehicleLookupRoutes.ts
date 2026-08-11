import { ENV } from "./env";
import type { Express, Request, Response } from "express";
import { extractVinFromImage } from "../services/ocr";
import type { VehicleTypeValue } from "../../shared/vehicleTypes";

type VinDecodeResult = {
  Make?: string;
  Model?: string;
  ModelYear?: string;
  EngineManufacturer?: string;
  EngineModel?: string;
  FuelTypePrimary?: string;
  DisplacementL?: string;
  VehicleType?: string;
  BodyClass?: string;
  TrailerType?: string;
  SuggestedVIN?: string;
  ErrorCode?: string;
  ErrorText?: string;
};

function normalizeVin(vin: string) {
  return vin.trim().toUpperCase();
}

// NHTSA's vPIC API has no published SLA and is occasionally slow; this bounds
// how long a guest waits on the "Decode" button before falling back to
// manual entry.
const VIN_DECODE_TIMEOUT_MS = 8_000;

const VIN_MODEL_YEAR_MAP: Record<string, number> = {
  A: 1980,
  B: 1981,
  C: 1982,
  D: 1983,
  E: 1984,
  F: 1985,
  G: 1986,
  H: 1987,
  J: 1988,
  K: 1989,
  L: 1990,
  M: 1991,
  N: 1992,
  P: 1993,
  R: 1994,
  S: 1995,
  T: 1996,
  V: 1997,
  W: 1998,
  X: 1999,
  Y: 2000,
  "1": 2001,
  "2": 2002,
  "3": 2003,
  "4": 2004,
  "5": 2005,
  "6": 2006,
  "7": 2007,
  "8": 2008,
  "9": 2009,
};

function inferModelYearFromVin(vin: string) {
  const code = vin[9];
  const baseYear = code ? VIN_MODEL_YEAR_MAP[code] : undefined;
  if (!baseYear) return null;

  const latestReasonableYear = new Date().getFullYear() + 1;
  const candidates = [baseYear, baseYear + 30].filter((year) => year <= latestReasonableYear);
  return candidates.length > 0 ? Math.max(...candidates) : baseYear;
}

function buildEngineDescription(result: VinDecodeResult) {
  return [
    result.EngineManufacturer,
    result.EngineModel,
    result.FuelTypePrimary,
    result.DisplacementL ? `${result.DisplacementL}L` : undefined,
  ]
    .filter((value): value is string => Boolean(value && value.trim()))
    .map((value) => value.trim())
    .join(" | ");
}

function inferEngineMake(result: VinDecodeResult) {
  const engineModel = result.EngineModel?.trim() || "";
  if (engineModel) {
    return engineModel;
  }

  const explicitManufacturer = result.EngineManufacturer?.trim();
  if (explicitManufacturer) {
    return explicitManufacturer;
  }

  return "";
}

function inferVehicleType(result: VinDecodeResult): VehicleTypeValue {
  const haystack = [
    result.VehicleType,
    result.BodyClass,
    result.TrailerType,
    result.Make,
    result.Model,
  ]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(" | ")
    .toLowerCase();

  if (haystack.includes("reefer") || haystack.includes("refrigerated")) {
    return "reefer_trailer";
  }

  if (haystack.includes("flatbed")) {
    return "flatbed_trailer";
  }

  if (
    (haystack.includes("dry van") || haystack.includes("cargo van body")) &&
    haystack.includes("trailer")
  ) {
    return "dry_van_trailer";
  }

  if (
    haystack.includes("truck-tractor") ||
    haystack.includes("truck tractor") ||
    haystack.includes("road tractor") ||
    haystack.includes("tractor")
  ) {
    return "tractor";
  }

  if (haystack.includes("trailer")) {
    return "trailer";
  }

  if (haystack.includes("bus")) {
    return "bus";
  }

  if (
    (haystack.includes("cargo van") || haystack.includes("delivery van")) &&
    !haystack.includes("trailer")
  ) {
    return "van";
  }

  if (
    haystack.includes("straight truck") ||
    haystack.includes("single-unit truck") ||
    haystack.includes("single unit truck") ||
    haystack.includes("incomplete vehicle") ||
    haystack.includes("multipurpose passenger vehicle") ||
    haystack.includes("truck")
  ) {
    return "straight_truck";
  }

  // For anything else on this platform (heavy-duty commercial vehicles), default to straight_truck.
  // The user can correct this on the review screen.
  return "straight_truck";
}

type DecodeVinResult = {
  status: number;
  body: Record<string, unknown>;
};

/**
 * Core VIN decode logic against NHTSA, independent of Express — takes an
 * injectable fetcher/timeout so it's directly unit-testable (see
 * vehicleLookupRoutes.test.ts) without a request/response harness. The route
 * handler below just forwards { status, body } as-is.
 */
export async function decodeVinFromNhtsa(
  vin: string,
  options?: { fetcher?: typeof fetch; timeoutMs?: number }
): Promise<DecodeVinResult> {
  const fetcher = options?.fetcher ?? fetch;
  const timeoutMs = options?.timeoutMs ?? VIN_DECODE_TIMEOUT_MS;

  try {
    const endpoint = new URL(
      `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${encodeURIComponent(vin)}`
    );

    endpoint.searchParams.set("format", "json");
    const inferredModelYear = inferModelYearFromVin(vin);
    if (inferredModelYear) {
      endpoint.searchParams.set("modelyear", String(inferredModelYear));
    }

    // NHTSA's official vPIC decoder is public. If a team-level key is provided for a proxy
    // or allowlist setup, we forward it as a best-effort query parameter.
    if (ENV.nhtsaApiKey) {
      endpoint.searchParams.set("api_key", ENV.nhtsaApiKey);
    }

    // NHTSA's public API has no SLA and can stall for well beyond what a
    // guest will wait on a "Decode" button — bound it so a slow/hanging
    // response fails fast into the existing manual-entry fallback instead
    // of leaving the client spinner running indefinitely.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response: globalThis.Response;
    try {
      response = await fetcher(endpoint, {
        headers: {
          Accept: "application/json",
        },
        signal: controller.signal,
      });
    } catch (fetchError) {
      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        return {
          status: 504,
          body: {
            error: "The VIN decoder is taking too long to respond. Try again, or enter the vehicle details manually.",
            fallback: {
              allowManualEntry: true,
              vin,
            },
          },
        };
      }
      throw fetchError;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      return {
        status: 502,
        body: {
          error: "Unable to decode VIN right now",
          fallback: {
            allowManualEntry: true,
            vin,
          },
        },
      };
    }

    const payload = (await response.json()) as { Results?: VinDecodeResult[] };
    const result = payload.Results?.[0];

    if (!result) {
      return {
        status: 404,
        body: {
          error: "No VIN data returned",
          fallback: {
            allowManualEntry: true,
            vin,
          },
        },
      };
    }

    const errorCode = result.ErrorCode?.trim();
    const hasDecodeError = Boolean(errorCode && errorCode !== "0");
    const hasUsefulDecodedData = Boolean(
      result.Make?.trim() ||
        result.Model?.trim() ||
        result.ModelYear?.trim() ||
        result.EngineManufacturer?.trim() ||
        result.EngineModel?.trim()
    );

    if (hasDecodeError && !hasUsefulDecodedData) {
      return {
        status: 422,
        body: {
          error: result.ErrorText || "VIN could not be decoded",
          fallback: {
            allowManualEntry: true,
            vin,
          },
        },
      };
    }

    return {
      status: 200,
      body: {
        vin,
        make: result.Make?.trim() || "",
        model: result.Model?.trim() || "",
        year: Number(result.ModelYear) || null,
        engineMake: inferEngineMake(result),
        vehicleType: inferVehicleType(result),
        decodedVehicleType: result.VehicleType?.trim() || "",
        bodyClass: result.BodyClass?.trim() || "",
        engineModel: result.EngineModel?.trim() || "",
        engineDescription: buildEngineDescription(result),
        warnings: hasDecodeError ? result.ErrorText?.trim() || "" : "",
        suggestedVin: result.SuggestedVIN?.trim() || "",
      },
    };
  } catch (error) {
    console.error("[VIN Decode] Failed to decode VIN", error);
    return {
      status: 500,
      body: {
        error: "VIN decoding failed",
        fallback: {
          allowManualEntry: true,
          vin,
        },
      },
    };
  }
}

export function registerVehicleLookupRoutes(app: Express) {
  app.post("/api/vehicles/extract-vin", async (req: Request, res: Response) => {
    const imageDataUrl = String(req.body?.imageDataUrl ?? "").trim();

    if (!imageDataUrl) {
      res.status(400).json({
        error: "VIN image is required",
      });
      return;
    }

    const result = await extractVinFromImage({
      imageDataUrl,
    });

    if (result.status !== "completed" || !result.vin) {
      res.status(422).json({
        error: "Couldn't read VIN clearly.",
        warning: result.warning,
        rawText: result.rawText ?? "",
      });
      return;
    }

    res.json({
      vin: result.vin,
      rawText: result.rawText ?? "",
      warning: result.warning,
    });
  });

  app.get("/api/vehicles/decode-vin/:vin", async (req: Request, res: Response) => {
    const vin = normalizeVin(req.params.vin ?? "");

    if (vin.length !== 17) {
      res.status(400).json({
        error: "VIN must be 17 characters",
        fallback: {
          allowManualEntry: true,
          vin,
        },
      });
      return;
    }

    const { status, body } = await decodeVinFromNhtsa(vin);
    res.status(status).json(body);
  });
}
