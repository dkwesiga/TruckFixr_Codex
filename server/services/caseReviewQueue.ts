// Human-review queue for guest / maintenance cases (§19–§21).
//
// Centralizes: enqueue (with SLA target from service-hours math + caseSlaConfig),
// reviewer alerting, claim/start, complete (SLA met/missed), and technician
// escalation. The audit trail lives in caseReviewQueueItems timestamps.

import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { ENV } from "../_core/env";
import { caseReviewQueueItems, caseSlaConfig, guestCases } from "../../drizzle/schema";
import {
  CRITICAL_SLA_TARGET_MINUTES,
  computeSlaTarget,
} from "../../shared/maintenance/serviceHours";
import type { ReviewCategory } from "./guestCaseAssessment";
import { sendEmail } from "./email";
import { recordObservabilityEvent } from "./observability";

export const REVIEW_STATUSES = [
  "review_required",
  "review_queued",
  "review_in_progress",
  "review_completed",
  "review_deferred",
  "automated_guidance_only",
] as const;
export type ReviewQueueStatus = (typeof REVIEW_STATUSES)[number];

function requireDb(db: unknown): asserts db {
  if (!db) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  }
}

async function targetMinutesFor(db: any, category: ReviewCategory): Promise<number> {
  const [cfg] = await db
    .select()
    .from(caseSlaConfig)
    .where(and(eq(caseSlaConfig.category, category), eq(caseSlaConfig.active, true)))
    .limit(1);
  return cfg?.withinServiceHoursMinutes ?? CRITICAL_SLA_TARGET_MINUTES;
}

// Resolve reviewer inboxes at call time (live env takes precedence over the
// value ENV captured at module load, so config changes and tests both work).
function reviewerEmails(): { primary: string; backup: string } {
  return {
    primary: process.env.CASE_REVIEWER_EMAIL?.trim() || ENV.caseReviewerEmail || "info@truckfixr.com",
    backup: process.env.CASE_BACKUP_REVIEWER_EMAIL?.trim() || ENV.caseBackupReviewerEmail || "",
  };
}

async function notifyReviewer(params: {
  itemId: number;
  category: ReviewCategory;
  afterHours: boolean;
  slaDueAt: Date;
  guestCaseId?: number | null;
  escalation?: boolean;
}): Promise<void> {
  const { primary, backup } = reviewerEmails();
  const to = params.escalation && backup ? backup : primary;
  if (!to) return;
  const subject = `${params.escalation ? "[ESCALATION] " : ""}TruckFixr case review — ${params.category}`;
  const text = [
    `A case requires review.`,
    `Category: ${params.category}`,
    `Queue item: #${params.itemId}`,
    params.guestCaseId ? `Guest case id: ${params.guestCaseId}` : "",
    `After hours: ${params.afterHours ? "yes" : "no"}`,
    `SLA due: ${params.slaDueAt.toISOString()}`,
    ``,
    `Review in the TruckFixr admin case-review queue.`,
  ]
    .filter(Boolean)
    .join("\n");
  try {
    await sendEmail({ to: [to], subject, text });
  } catch (error) {
    // Non-fatal — the queue item still exists and is visible in the admin UI.
    console.error("[CaseReview] reviewer alert email failed:", error);
  }
}

export interface EnqueueReviewParams {
  guestCaseId?: number | null;
  maintenanceCaseId?: number | null;
  category: ReviewCategory;
  priority?: string;
  escalationReason?: string;
  submittedAt?: Date;
  notifyReviewer?: boolean;
}

export async function enqueueReview(params: EnqueueReviewParams) {
  const db = await getDb();
  requireDb(db);
  const now = new Date();
  const submittedAt = params.submittedAt ?? now;
  const minutes = await targetMinutesFor(db, params.category);
  const { afterHours, slaDueAt } = computeSlaTarget(submittedAt, minutes);
  const notify = params.notifyReviewer !== false;

  const [item] = await db
    .insert(caseReviewQueueItems)
    .values({
      guestCaseId: params.guestCaseId ?? null,
      maintenanceCaseId: params.maintenanceCaseId ?? null,
      category: params.category,
      status: "review_required",
      priority: params.priority ?? (params.category === "critical_safety" ? "urgent" : "normal"),
      afterHours,
      escalationReason: params.escalationReason ?? null,
      slaDueAt,
      firstSeenAt: now,
      reviewerNotifiedAt: notify ? now : null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (notify) {
    await notifyReviewer({
      itemId: item.id,
      category: params.category,
      afterHours,
      slaDueAt,
      guestCaseId: params.guestCaseId,
    });
  }

  recordObservabilityEvent({
    category: "workflow",
    event: "case_review_enqueued",
    severity: params.category === "critical_safety" ? "warning" : "info",
    context: { category: params.category, afterHours },
  });

  return item;
}

export async function listReviewQueue(filter?: { status?: ReviewQueueStatus }) {
  const db = await getDb();
  requireDb(db);
  const base = db.select().from(caseReviewQueueItems);
  const rows = filter?.status
    ? await base.where(eq(caseReviewQueueItems.status, filter.status)).orderBy(desc(caseReviewQueueItems.firstSeenAt))
    : await base.orderBy(desc(caseReviewQueueItems.firstSeenAt));
  return rows;
}

async function loadItem(db: any, id: number) {
  const [item] = await db
    .select()
    .from(caseReviewQueueItems)
    .where(eq(caseReviewQueueItems.id, id))
    .limit(1);
  if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Review item not found." });
  return item;
}

export async function claimReview(params: { id: number; reviewerUserId: number }) {
  const db = await getDb();
  requireDb(db);
  await loadItem(db, params.id);
  const now = new Date();
  await db
    .update(caseReviewQueueItems)
    .set({
      status: "review_in_progress",
      reviewerUserId: params.reviewerUserId,
      reviewStartedAt: now,
      updatedAt: now,
    })
    .where(eq(caseReviewQueueItems.id, params.id));
  return loadItem(db, params.id);
}

export async function completeReview(params: {
  id: number;
  outcome: string;
  reviewerNotes?: string;
  reviewerUserId?: number;
}) {
  const db = await getDb();
  requireDb(db);
  const item = await loadItem(db, params.id);
  const now = new Date();
  const slaMet = item.slaDueAt ? now.getTime() <= new Date(item.slaDueAt).getTime() : null;
  await db
    .update(caseReviewQueueItems)
    .set({
      status: "review_completed",
      outcome: params.outcome,
      reviewerNotes: params.reviewerNotes ?? item.reviewerNotes ?? null,
      reviewerUserId: params.reviewerUserId ?? item.reviewerUserId ?? null,
      completedAt: now,
      slaMet,
      updatedAt: now,
    })
    .where(eq(caseReviewQueueItems.id, params.id));

  if (slaMet === false) {
    recordObservabilityEvent({
      category: "workflow",
      event: "case_review_sla_missed",
      severity: "warning",
      context: { itemId: params.id, category: item.category },
    });
  }
  return loadItem(db, params.id);
}

export async function escalateToTechnician(params: {
  id: number;
  backupReviewerUserId?: number;
  reason: string;
}) {
  const db = await getDb();
  requireDb(db);
  const item = await loadItem(db, params.id);
  const now = new Date();
  await db
    .update(caseReviewQueueItems)
    .set({
      priority: "urgent",
      backupReviewerUserId: params.backupReviewerUserId ?? item.backupReviewerUserId ?? null,
      escalationReason: params.reason,
      updatedAt: now,
    })
    .where(eq(caseReviewQueueItems.id, params.id));

  await notifyReviewer({
    itemId: item.id,
    category: item.category as ReviewCategory,
    afterHours: item.afterHours,
    slaDueAt: item.slaDueAt ? new Date(item.slaDueAt) : now,
    guestCaseId: item.guestCaseId,
    escalation: true,
  });
  return loadItem(db, params.id);
}
