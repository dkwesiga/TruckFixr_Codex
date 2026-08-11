import { describe, expect, it } from "vitest";
import { decodeVinFromNhtsa } from "./vehicleLookupRoutes";

const VALID_VIN = "1FUJA6CK75LM12345";

function jsonResponse(body: unknown, init?: { status?: number; ok?: boolean }) {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: async () => body,
  } as Response;
}

describe("decodeVinFromNhtsa", () => {
  it("returns decoded vehicle details on success", async () => {
    const result = await decodeVinFromNhtsa(VALID_VIN, {
      fetcher: (async () =>
        jsonResponse({
          Results: [
            {
              Make: "Freightliner",
              Model: "Cascadia",
              ModelYear: "2021",
              ErrorCode: "0",
            },
          ],
        })) as unknown as typeof fetch,
    });

    expect(result.status).toBe(200);
    expect(result.body.make).toBe("Freightliner");
    expect(result.body.model).toBe("Cascadia");
    expect(result.body.year).toBe(2021);
  });

  it("times out into the manual-entry fallback instead of hanging indefinitely", async () => {
    const result = await decodeVinFromNhtsa(VALID_VIN, {
      timeoutMs: 20,
      fetcher: ((_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const error = new Error("The operation was aborted");
            error.name = "AbortError";
            reject(error);
          });
        })) as unknown as typeof fetch,
    });

    expect(result.status).toBe(504);
    expect(result.body.error).toMatch(/taking too long/i);
    expect((result.body.fallback as { allowManualEntry: boolean }).allowManualEntry).toBe(true);
  });

  it("returns a 502 fallback when NHTSA responds with a non-ok status", async () => {
    const result = await decodeVinFromNhtsa(VALID_VIN, {
      fetcher: (async () => jsonResponse({}, { ok: false, status: 503 })) as unknown as typeof fetch,
    });

    expect(result.status).toBe(502);
    expect((result.body.fallback as { allowManualEntry: boolean }).allowManualEntry).toBe(true);
  });

  it("returns a 404 fallback when NHTSA returns no results", async () => {
    const result = await decodeVinFromNhtsa(VALID_VIN, {
      fetcher: (async () => jsonResponse({ Results: [] })) as unknown as typeof fetch,
    });

    expect(result.status).toBe(404);
  });

  it("returns a 422 fallback when NHTSA reports a decode error with no usable data", async () => {
    const result = await decodeVinFromNhtsa(VALID_VIN, {
      fetcher: (async () =>
        jsonResponse({
          Results: [{ ErrorCode: "1", ErrorText: "Check digit does not calculate properly." }],
        })) as unknown as typeof fetch,
    });

    expect(result.status).toBe(422);
    expect(result.body.error).toMatch(/check digit/i);
  });

  it("returns a 500 fallback on an unexpected error (e.g. malformed JSON)", async () => {
    const result = await decodeVinFromNhtsa(VALID_VIN, {
      fetcher: (async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error("boom");
        },
      })) as unknown as typeof fetch,
    });

    expect(result.status).toBe(500);
    expect((result.body.fallback as { allowManualEntry: boolean }).allowManualEntry).toBe(true);
  });
});
