import { z } from "zod";
import { dailyInspectionSubmissionSchema } from "../../../shared/inspection";

export type InspectionDraftItemResponse = {
  status?: "pass" | "fail";
  classification?: "minor" | "major";
  comment?: string;
  photoUrls: string[];
};

export type InspectionChecklistSnapshot = {
  vehicle: {
    id: number;
    fleetId?: number;
    vin?: string | null;
    licensePlate?: string | null;
    make?: string | null;
    model?: string | null;
    year?: number | null;
    complianceStatus?: "green" | "yellow" | "red";
  };
  configuration: Record<string, unknown>;
  validityHours: number;
  categories: Array<{
    category: string;
    label: string;
    items: Array<{
      id: string;
      category: string;
      label: string;
      guidance: string;
    }>;
  }>;
  latestInspection: {
    submittedAt: string | Date;
    validUntil: string | Date;
    isCurrent: boolean;
    majorDefects: number;
    minorDefects: number;
    canOperate: boolean;
    complianceStatus?: "green" | "yellow" | "red";
    location: string;
    odometer: number | null;
  } | null;
};

export type InspectionDraft = {
  version: 1;
  vehicleId: number;
  fleetId: number;
  savedAt: string;
  data: {
    stepIndex: number;
    odometer: string;
    location: string;
    attested: boolean;
    signatureMode: "typed" | "drawn";
    driverSignature: string;
    drawnSignature: string;
    responses: Record<string, InspectionDraftItemResponse>;
  };
};

type QueuedInspectionSubmission = {
  id: string;
  vehicleId: number;
  fleetId: number;
  queuedAt: string;
  submission: z.infer<typeof dailyInspectionSubmissionSchema>;
};

type LocalStorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const DRAFT_PREFIX = "truckfixr:inspection-draft:v1:";
const CHECKLIST_PREFIX = "truckfixr:inspection-checklist:v1:";
const QUEUE_KEY = "truckfixr:inspection-queue:v1";

const draftSchema: z.ZodType<InspectionDraft> = z.object({
  version: z.literal(1),
  vehicleId: z.number(),
  fleetId: z.number(),
  savedAt: z.string(),
  data: z.object({
    stepIndex: z.number(),
    odometer: z.string(),
    location: z.string(),
    attested: z.boolean(),
    signatureMode: z.enum(["typed", "drawn"]),
    driverSignature: z.string(),
    drawnSignature: z.string(),
    responses: z.record(
      z.string(),
      z.object({
        status: z.enum(["pass", "fail"]).optional(),
        classification: z.enum(["minor", "major"]).optional(),
        comment: z.string().optional(),
        photoUrls: z.array(z.string()),
      })
    ),
  }),
});

const queuedSubmissionSchema: z.ZodType<QueuedInspectionSubmission> = z.object({
  id: z.string(),
  vehicleId: z.number(),
  fleetId: z.number(),
  queuedAt: z.string(),
  submission: dailyInspectionSubmissionSchema,
});

const queuedSubmissionListSchema = z.array(queuedSubmissionSchema);

function parseJson<T>(raw: string | null, schema: z.ZodType<T>) {
  if (!raw) return null;

  try {
    return schema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

function getDraftKey(vehicleId: number) {
  return `${DRAFT_PREFIX}${vehicleId}`;
}

function getChecklistKey(vehicleId: number) {
  return `${CHECKLIST_PREFIX}${vehicleId}`;
}

export function getBrowserStorage() {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function saveInspectionDraft(
  storage: LocalStorageLike | null,
  draft: InspectionDraft
) {
  if (!storage) return;
  storage.setItem(getDraftKey(draft.vehicleId), JSON.stringify(draft));
}

export function loadInspectionDraft(storage: LocalStorageLike | null, vehicleId: number) {
  if (!storage) return null;
  return parseJson(storage.getItem(getDraftKey(vehicleId)), draftSchema);
}

export function clearInspectionDraft(storage: LocalStorageLike | null, vehicleId: number) {
  if (!storage) return;
  storage.removeItem(getDraftKey(vehicleId));
}

export function saveChecklistSnapshot(
  storage: LocalStorageLike | null,
  vehicleId: number,
  snapshot: InspectionChecklistSnapshot
) {
  if (!storage) return;
  storage.setItem(getChecklistKey(vehicleId), JSON.stringify(snapshot));
}

export function loadChecklistSnapshot(
  storage: LocalStorageLike | null,
  vehicleId: number
) {
  if (!storage) return null;
  return parseJson(
    storage.getItem(getChecklistKey(vehicleId)),
    z.object({
      vehicle: z.object({
        id: z.number(),
        fleetId: z.number().optional(),
        vin: z.string().nullable().optional(),
        licensePlate: z.string().nullable().optional(),
        make: z.string().nullable().optional(),
        model: z.string().nullable().optional(),
        year: z.number().nullable().optional(),
        complianceStatus: z.enum(["green", "yellow", "red"]).optional(),
      }),
      configuration: z.record(z.string(), z.unknown()),
      validityHours: z.number(),
      categories: z.array(
        z.object({
          category: z.string(),
          label: z.string(),
          items: z.array(
            z.object({
              id: z.string(),
              category: z.string(),
              label: z.string(),
              guidance: z.string(),
            })
          ),
        })
      ),
      latestInspection: z
        .object({
          submittedAt: z.union([z.string(), z.date()]),
          validUntil: z.union([z.string(), z.date()]),
          isCurrent: z.boolean(),
          majorDefects: z.number(),
          minorDefects: z.number(),
          canOperate: z.boolean(),
          complianceStatus: z.enum(["green", "yellow", "red"]).optional(),
          location: z.string(),
          odometer: z.number().nullable(),
        })
        .nullable(),
    })
  );
}

export function getQueuedInspectionSubmissions(storage: LocalStorageLike | null) {
  if (!storage) return [];
  return parseJson(storage.getItem(QUEUE_KEY), queuedSubmissionListSchema) ?? [];
}

function setQueuedInspectionSubmissions(
  storage: LocalStorageLike | null,
  entries: QueuedInspectionSubmission[]
) {
  if (!storage) return;
  storage.setItem(QUEUE_KEY, JSON.stringify(entries));
}

export function enqueueInspectionSubmission(
  storage: LocalStorageLike | null,
  submission: z.infer<typeof dailyInspectionSubmissionSchema>
) {
  if (!storage) return null;

  const nextItem: QueuedInspectionSubmission = {
    id: `${submission.vehicleId}-${Date.now()}`,
    vehicleId: submission.vehicleId,
    fleetId: submission.fleetId,
    queuedAt: new Date().toISOString(),
    submission,
  };

  const current = getQueuedInspectionSubmissions(storage);
  setQueuedInspectionSubmissions(storage, [...current, nextItem]);
  return nextItem;
}

export async function flushQueuedInspectionSubmissions(
  storage: LocalStorageLike | null,
  submitter: (
    submission: z.infer<typeof dailyInspectionSubmissionSchema>
  ) => Promise<unknown>
) {
  if (!storage) {
    return { flushedCount: 0, remainingCount: 0 };
  }

  const current = getQueuedInspectionSubmissions(storage);
  const remaining: QueuedInspectionSubmission[] = [];
  let flushedCount = 0;

  for (const entry of current) {
    try {
      await submitter(entry.submission);
      flushedCount += 1;
      clearInspectionDraft(storage, entry.vehicleId);
    } catch {
      remaining.push(entry);
    }
  }

  setQueuedInspectionSubmissions(storage, remaining);

  return {
    flushedCount,
    remainingCount: remaining.length,
  };
}
