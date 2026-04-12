import { ENV } from "./env";
import type { Express, Request, Response } from "express";

type VinDecodeResult = {
  Make?: string;
  Model?: string;
  ModelYear?: string;
  ErrorCode?: string;
  ErrorText?: string;
};

function normalizeVin(vin: string) {
  return vin.trim().toUpperCase();
}

export function registerVehicleLookupRoutes(app: Express) {
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
      const currentYear = new Date().getFullYear();
      const endpoint = new URL(
        `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${encodeURIComponent(vin)}`
      );

      endpoint.searchParams.set("format", "json");
      endpoint.searchParams.set("modelyear", String(currentYear));

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
      const hasDecodeError = errorCode && errorCode !== "0";

      if (hasDecodeError && !result.Make && !result.Model) {
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
