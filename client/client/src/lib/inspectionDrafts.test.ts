import { describe, expect, it } from "vitest";
import {
  clearInspectionDraft,
  enqueueInspectionSubmission,
  flushQueuedInspectionSubmissions,
  loadInspectionDraft,
  saveInspectionDraft,
} from "./inspectionDrafts";

function createMemoryStorage() {
  const values = new Map<string, string>();

  return {
    getItem(key: string) {
      return values.has(key) ? values.get(key)! : null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
  };
}

describe("inspection draft storage", () => {
  it("saves and reloads a draft without losing responses", () => {
    const storage = createMemoryStorage();

    saveInspectionDraft(storage, {
      version: 1,
      vehicleId: 42,
      fleetId: 1,
      savedAt: new Date().toISOString(),
      data: {
        stepIndex: 2,
        odometer: "245320",
        location: "Toronto yard",
        attested: false,
        signatureMode: "typed",
        driverSignature: "",
        drawnSignature: "",
        responses: {
          brakes: {
            status: "fail",
            classification: "minor",
            comment: "Slight pull to the right",
            photoUrls: [],
          },
        },
      },
    });

    expect(loadInspectionDraft(storage, 42)?.data.responses.brakes?.comment).toBe(
      "Slight pull to the right"
    );

    clearInspectionDraft(storage, 42);
    expect(loadInspectionDraft(storage, 42)).toBeNull();
  });

  it("queues offline submissions and flushes them when the submitter succeeds", async () => {
    const storage = createMemoryStorage();

    enqueueInspectionSubmission(storage, {
      vehicleId: 42,
      fleetId: 1,
      odometer: 245320,
      location: "Toronto yard",
      attested: true,
      driverPrintedName: "Driver One",
      driverSignature: "Driver One",
      driverSignatureMode: "typed",
      results: [{ itemId: "brakes-service-response", status: "pass" }],
    });

    enqueueInspectionSubmission(storage, {
      vehicleId: 43,
      fleetId: 1,
      odometer: 300100,
      location: "Ottawa yard",
      attested: true,
      driverPrintedName: "Driver Two",
      driverSignature: "Driver Two",
      driverSignatureMode: "typed",
      results: [{ itemId: "brakes-service-response", status: "pass" }],
    });

    const flushed = await flushQueuedInspectionSubmissions(storage, async () => {
      return { ok: true };
    });

    expect(flushed).toEqual({
      flushedCount: 2,
      remainingCount: 0,
    });
  });
});
