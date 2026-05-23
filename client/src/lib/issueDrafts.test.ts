import { describe, expect, it } from "vitest";
import {
  enqueueIssueReport,
  flushQueuedIssueReports,
  getQueuedIssueReports,
} from "./issueDrafts";

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

describe("issue report queue", () => {
  it("queues offline issue reports and flushes successful submissions", async () => {
    const storage = createMemoryStorage();

    enqueueIssueReport(storage, {
      vehicleId: 42,
      fleetId: 1,
      title: "Air leak at gladhand",
      description: "Audible leak during pre-trip.",
      category: "air_system",
      severity: "critical",
      photoUrls: ["data:image/jpeg;base64,abc"],
      localDraftId: "issue-42-test",
    });

    expect(getQueuedIssueReports(storage)).toHaveLength(1);

    const flushed = await flushQueuedIssueReports(storage, async () => {
      return { ok: true };
    });

    expect(flushed).toEqual({
      flushedCount: 1,
      remainingCount: 0,
    });
    expect(getQueuedIssueReports(storage)).toHaveLength(0);
  });

  it("keeps failed issue submissions queued for retry", async () => {
    const storage = createMemoryStorage();

    enqueueIssueReport(storage, {
      vehicleId: 42,
      fleetId: 1,
      title: "Marker light out",
      severity: "medium",
      photoUrls: [],
    });

    const flushed = await flushQueuedIssueReports(storage, async () => {
      throw new Error("offline");
    });

    expect(flushed).toEqual({
      flushedCount: 0,
      remainingCount: 1,
    });
    expect(getQueuedIssueReports(storage)[0]?.title).toBeUndefined();
    expect(getQueuedIssueReports(storage)[0]?.submission.title).toBe("Marker light out");
  });

  it("replaces queued issue reports when the same local draft is saved again", () => {
    const storage = createMemoryStorage();

    enqueueIssueReport(storage, {
      vehicleId: 42,
      fleetId: 1,
      title: "Marker light out",
      severity: "medium",
      photoUrls: [],
      localDraftId: "issue-42-same",
    });

    enqueueIssueReport(storage, {
      vehicleId: 42,
      fleetId: 1,
      title: "Marker light still out",
      severity: "high",
      photoUrls: ["data:image/jpeg;base64,abc"],
      localDraftId: "issue-42-same",
    });

    expect(getQueuedIssueReports(storage)).toHaveLength(1);
    expect(getQueuedIssueReports(storage)[0]?.submission.title).toBe(
      "Marker light still out"
    );
  });
});
