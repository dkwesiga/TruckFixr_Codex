import { ENV } from "./env";
import type { Express, Request, Response } from "express";
import { extractVinFromImage } from "../services/ocr";

type VinDecodeResult = {
  Make?: string;
  Model?: string;
  ModelYear?: string;
  EngineManufacturer?: string;
  EngineModel?: string;
  FuelTypePrimary?: string;
  DisplacementL?: string;
  SuggestedVIN?: string;
  ErrorCode?: string;
  ErrorText?: string;
};

function normalizeVin(vin: string) {
  return vin.trim().toUpperCase();
}

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

      const response = await fetch(endpoint, {
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        res.status(502).json({
          error: "Unable to decode VIN right now",
          fallback: {
            allowManualEntry: true,
            vin,
          },
        });
        return;
      }

      const payload = await response.json() as { Results?: VinDecodeResult[] };
      const result = payload.Results?.[0];

      if (!result) {
        res.status(404).json({
          error: "No VIN data returned",
          fallback: {
            allowManualEntry: true,
            vin,
          },
        });
        return;
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
        res.status(422).json({
          error: result.ErrorText || "VIN could not be decoded",
          fallback: {
            allowManualEntry: true,
            vin,
          },
        });
        return;
      }

      res.json({
        vin,
        make: result.Make?.trim() || "",
        model: result.Model?.trim() || "",
        year: Number(result.ModelYear) || null,
        engineMake: inferEngineMake(result),
        engineModel: result.EngineModel?.trim() || "",
        engineDescription: buildEngineDescription(result),
        warnings: hasDecodeError ? result.ErrorText?.trim() || "" : "",
        suggestedVin: result.SuggestedVIN?.trim() || "",
      });
    } catch (error) {
      console.error("[VIN Decode] Failed to decode VIN", error);
      res.status(500).json({
        error: "VIN decoding failed",
        fallback: {
          allowManualEntry: true,
          vin,
        },
      });
    }
  });
}
