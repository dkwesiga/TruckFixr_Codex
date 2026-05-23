import { z } from "zod";

export type IssueReportSubmission = {
  fleetId: number;
  vehicleId: string | number;
  title: string;
  description?: string;
  category?: string;
  severity: "low" | "medium" | "high" | "critical";
  photoUrls: string[];
  localDraftId?: string;
};

type QueuedIssueReport = {
  id: string;
  vehicleId: string | number;
  fleetId: number;
  queuedAt: string;
  submission: IssueReportSubmission;
};

type LocalStorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const QUEUE_KEY = "truckfixr:issue-queue:v1";

const issueReportSubmissionSchema: z.ZodType<IssueReportSubmission> = z.object({
  fleetId: z.number().int().positive(),
  vehicleId: z.union([z.number(), z.string().trim().min(1)]),
  title: z.string().trim().min(1),
  description: z.string().optional(),
  category: z.string().optional(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  photoUrls: z.array(z.string()),
  localDraftId: z.string().optional(),
});

const queuedIssueReportSchema: z.ZodType<QueuedIssueReport> = z.object({
  id: z.string(),
  vehicleId: z.union([z.number(), z.string()]),
  fleetId: z.number(),
  queuedAt: z.string(),
  submission: issueReportSubmissionSchema,
});

const queuedIssueReportListSchema = z.array(queuedIssueReportSchema);

function parseQueue(raw: string | null) {
  if (!raw) return [];

  try {
    return queuedIssueReportListSchema.parse(JSON.parse(raw));
  } catch {
    return [];
  }
}

function setQueuedIssueReports(
  storage: LocalStorageLike | null,
  entries: QueuedIssueReport[]
) {
  if (!storage) return;
  storage.setItem(QUEUE_KEY, JSON.stringify(entries));
}

export function getQueuedIssueReports(storage: LocalStorageLike | null) {
  if (!storage) return [];
  return parseQueue(storage.getItem(QUEUE_KEY));
}

export function enqueueIssueReport(
  storage: LocalStorageLike | null,
  submission: IssueReportSubmission
) {
  if (!storage) return null;

  const queued: QueuedIssueReport = {
    id: submission.localDraftId ?? `issue-${submission.vehicleId}-${Date.now()}`,
    vehicleId: submission.vehicleId,
    fleetId: submission.fleetId,
    queuedAt: new Date().toISOString(),
    submission,
  };

  const current = getQueuedIssueReports(storage);
  const nextQueue = submission.localDraftId
    ? [
        ...current.filter((entry) => entry.id !== queued.id),
        queued,
      ]
    : [...current, queued];

  setQueuedIssueReports(storage, nextQueue);
  return queued;
}

export async function flushQueuedIssueReports(
  storage: LocalStorageLike | null,
  submitter: (submission: IssueReportSubmission) => Promise<unknown>
) {
  if (!storage) {
    return { flushedCount: 0, remainingCount: 0 };
  }

  const current = getQueuedIssueReports(storage);
  const remaining: QueuedIssueReport[] = [];
  let flushedCount = 0;

  for (const entry of current) {
    try {
      await submitter(entry.submission);
      flushedCount += 1;
    } catch {
      remaining.push(entry);
    }
  }

  setQueuedIssueReports(storage, remaining);

  return {
    flushedCount,
    remainingCount: remaining.length,
  };
}
