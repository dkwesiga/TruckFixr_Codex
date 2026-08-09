// Paid ($99 CAD) technician-reviewed Resolution report service (PRD v1.1 §5).
// Payment alone never starts the SLA clock — the clock only begins once a
// technician confirms the case is Review Ready (required evidence present).

import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import {
  guestCaseContacts,
  guestCases,
  technicianReviewReminders,
  technicianReviews,
} from "../../drizzle/schema";
import {
  canTransitionTechnicianReview,
  MISSING_EVIDENCE_AUTO_REFUND_OFFSET_MS,
  MISSING_EVIDENCE_REMINDER_STAGES,
  TECHNICIAN_REVIEW_PRICE_CAD_CENTS,
  type TechnicianReviewState,
} from "../../shared/maintenance/technicianReviewState";
import { computePaidReviewSlaTarget } from "../../shared/maintenance/technicianReviewSla";
import { nextDueFollowUp } from "../../shared/maintenance/followUps";
import {
  createTechnicianReviewCheckoutSession,
  refundStripePayment,
} from "./stripeBilling";
import { sendEmail } from "./email";
import { recordObservabilityEvent } from "./observability";

function requireDb(db: unknown): asserts db {
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
}

async function load(db: any, id: number) {
  const [row] = await db.select().from(technicianReviews).where(eq(technicianReviews.id, id)).limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Technician review not found." });
  return row;
}

async function transition(
  db: any,
  id: number,
  to: TechnicianReviewState,
  extra: Record<string, unknown> = {}
) {
  const row = await load(db, id);
  if (!canTransitionTechnicianReview(row.status as TechnicianReviewState, to)) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `Cannot move technician review from ${row.status} to ${to}.`,
    });
  }
  await db
    .update(technicianReviews)
    .set({ status: to, updatedAt: new Date(), ...extra })
    .where(eq(technicianReviews.id, id));
  return load(db, id);
}

/** Create the review record for a guest case (does not charge yet). */
export async function createReviewForGuestCase(publicToken: string) {
  const db = await getDb();
  requireDb(db);
  const [guestCase] = await db
    .select()
    .from(guestCases)
    .where(eq(guestCases.publicToken, publicToken))
    .limit(1);
  if (!guestCase) throw new TRPCError({ code: "NOT_FOUND", message: "Case not found." });

  const [existing] = await db
    .select()
    .from(technicianReviews)
    .where(
      and(
        eq(technicianReviews.guestCaseId, guestCase.id),
        eq(technicianReviews.status, "payment_pending")
      )
    )
    .limit(1);
  if (existing) return existing;

  const [row] = await db
    .insert(technicianReviews)
    .values({
      caseId: guestCase.caseId ?? null,
      guestCaseId: guestCase.id,
      status: "payment_pending",
      priceCents: TECHNICIAN_REVIEW_PRICE_CAD_CENTS,
      currency: "CAD",
    })
    .returning();
  return row;
}

/** Start Stripe Checkout for a review. Requires a verified guest contact email. */
export async function beginTechnicianReviewCheckout(params: {
  technicianReviewId: number;
  successUrl: string;
  cancelUrl: string;
}) {
  const db = await getDb();
  requireDb(db);
  const review = await load(db, params.technicianReviewId);
  if (!review.guestCaseId) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Review has no linked case." });
  }
  const [contact] = await db
    .select()
    .from(guestCaseContacts)
    .where(eq(guestCaseContacts.guestCaseId, review.guestCaseId))
    .limit(1);
  if (!contact?.email) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "A verified contact email is required before starting checkout.",
    });
  }

  const session = await createTechnicianReviewCheckoutSession({
    customerEmail: contact.email,
    successUrl: params.successUrl,
    cancelUrl: params.cancelUrl,
    technicianReviewId: review.id,
  });

  await db
    .update(technicianReviews)
    .set({ stripeCheckoutSessionId: session.id, updatedAt: new Date() })
    .where(eq(technicianReviews.id, review.id));

  return { checkoutUrl: session.url };
}

/** Webhook-driven: mark paid. Idempotent. Does NOT start the SLA clock. */
export async function markTechnicianReviewPaid(params: {
  technicianReviewId: number;
  paymentRef: string;
}) {
  const db = await getDb();
  requireDb(db);
  const review = await load(db, params.technicianReviewId);
  if (review.status !== "payment_pending") {
    return review; // already paid or beyond (idempotent)
  }
  const updated = await transition(db, params.technicianReviewId, "paid", {
    paidAt: new Date(),
    stripePaymentRef: params.paymentRef,
  });

  if (review.guestCaseId) {
    const [contact] = await db
      .select()
      .from(guestCaseContacts)
      .where(eq(guestCaseContacts.guestCaseId, review.guestCaseId))
      .limit(1);
    if (contact?.email) {
      await sendEmail({
        to: [contact.email],
        subject: "TruckFixr — payment received for your technician review",
        text: "We've received your payment. A TruckFixr technician will confirm your evidence is complete and begin the two-business-hour review clock once your case is Review Ready.",
      }).catch((error) => console.error("[TechnicianReviews] paid email failed:", error));
    }
  }

  recordObservabilityEvent({
    category: "workflow",
    event: "technician_review_paid",
    context: { technicianReviewId: params.technicianReviewId },
  });

  return updated;
}

/** Technician flags specific missing evidence; pauses the (not-yet-started) SLA. */
export async function requestMissingEvidence(params: {
  technicianReviewId: number;
  notes: string;
}) {
  const db = await getDb();
  requireDb(db);
  const review = await load(db, params.technicianReviewId);
  const to = review.status === "call_proposed" ? "call_proposed" : "missing_evidence";
  const updated =
    review.status === "missing_evidence"
      ? await (async () => {
          await db
            .update(technicianReviews)
            .set({ missingEvidenceNotes: params.notes, updatedAt: new Date() })
            .where(eq(technicianReviews.id, review.id));
          return load(db, review.id);
        })()
      : await transition(db, params.technicianReviewId, "missing_evidence", {
          missingEvidenceNotes: params.notes,
        });
  return updated;
}

/** Propose the included up-to-15-minute evidence-completion call. */
export async function proposeEvidenceCall(params: { technicianReviewId: number }) {
  const db = await getDb();
  requireDb(db);
  return transition(db, params.technicianReviewId, "call_proposed", {
    callProposedAt: new Date(),
  });
}

/** Technician confirms the case is Review Ready — this starts the SLA clock. */
export async function markReviewReady(params: { technicianReviewId: number; now?: Date }) {
  const db = await getDb();
  requireDb(db);
  const now = params.now ?? new Date();
  const target = computePaidReviewSlaTarget(now);
  const updated = await transition(db, params.technicianReviewId, "review_ready", {
    reviewReadyAt: now,
    slaDueAt: target.slaDueAt,
    afterHours: target.afterHours,
  });

  const review = updated;
  if (review.guestCaseId) {
    const [contact] = await db
      .select()
      .from(guestCaseContacts)
      .where(eq(guestCaseContacts.guestCaseId, review.guestCaseId))
      .limit(1);
    if (contact?.email) {
      const dueEastern = target.slaDueAt.toLocaleString("en-US", {
        timeZone: "America/Toronto",
        dateStyle: "medium",
        timeStyle: "short",
      });
      await sendEmail({
        to: [contact.email],
        subject: "TruckFixr — your technician review is underway",
        text: `Your case is now Review Ready. Your review is due by ${dueEastern} Eastern.`,
      }).catch((error) => console.error("[TechnicianReviews] review-ready email failed:", error));
    }
  }

  recordObservabilityEvent({
    category: "workflow",
    event: "technician_review_ready",
    context: { technicianReviewId: params.technicianReviewId, afterHours: target.afterHours },
  });

  return updated;
}

export async function claimTechnicianReview(params: {
  technicianReviewId: number;
  reviewerUserId: number;
}) {
  const db = await getDb();
  requireDb(db);
  return transition(db, params.technicianReviewId, "under_review", {
    reviewerUserId: params.reviewerUserId,
    reviewStartedAt: new Date(),
  });
}

export interface TechnicianReviewFindings {
  technicianRisk?: string;
  likelyCauses?: unknown[];
  testsRecommended?: unknown[];
  repairsRecommended?: unknown[];
  partsRequirements?: unknown[];
}

/** Complete the written review. Every AI override must carry a reason (§10.4). */
export async function completeTechnicianReview(params: {
  technicianReviewId: number;
  findings: TechnicianReviewFindings;
  aiOverrides?: Array<{ field: string; original: unknown; revised: unknown; reason: string }>;
  limitationsText: string;
  customerMessage?: string;
  now?: Date;
}) {
  const db = await getDb();
  requireDb(db);
  const now = params.now ?? new Date();
  const review = await load(db, params.technicianReviewId);
  const dueAt = review.slaRevisedDueAt ?? review.slaDueAt;
  const slaMet = dueAt ? now.getTime() <= new Date(dueAt).getTime() : null;

  return transition(db, params.technicianReviewId, "reviewed", {
    findingsJson: params.findings,
    aiOverridesJson: params.aiOverrides ?? [],
    limitationsText: params.limitationsText,
    customerMessage: params.customerMessage ?? null,
    slaMet,
  });
}

export async function deliverTechnicianReview(params: { technicianReviewId: number }) {
  const db = await getDb();
  requireDb(db);
  const updated = await transition(db, params.technicianReviewId, "delivered", {
    deliveredAt: new Date(),
  });

  if (updated.guestCaseId) {
    const [contact] = await db
      .select()
      .from(guestCaseContacts)
      .where(eq(guestCaseContacts.guestCaseId, updated.guestCaseId))
      .limit(1);
    if (contact?.email) {
      await sendEmail({
        to: [contact.email],
        subject: "TruckFixr — your technician review is ready",
        text: "Your technician-reviewed report is ready to view in your case.",
      }).catch((error) => console.error("[TechnicianReviews] delivered email failed:", error));
    }
  }

  recordObservabilityEvent({
    category: "workflow",
    event: "technician_review_delivered",
    context: { technicianReviewId: params.technicianReviewId },
  });

  return updated;
}

/** Notify before an SLA miss and offer full refund or a revised delivery time (§5.4). */
export async function notifySlaAtRisk(params: {
  technicianReviewId: number;
  revisedDueAt?: Date;
}) {
  const db = await getDb();
  requireDb(db);
  await db
    .update(technicianReviews)
    .set({
      slaBreachNotifiedAt: new Date(),
      slaRevisedDueAt: params.revisedDueAt ?? null,
      updatedAt: new Date(),
    })
    .where(eq(technicianReviews.id, params.technicianReviewId));
  return load(db, params.technicianReviewId);
}

export async function recordSlaRemedyChoice(params: {
  technicianReviewId: number;
  choice: "refund" | "revised_time";
}) {
  const db = await getDb();
  requireDb(db);
  await db
    .update(technicianReviews)
    .set({ slaRemedyChoice: params.choice, updatedAt: new Date() })
    .where(eq(technicianReviews.id, params.technicianReviewId));
  if (params.choice === "refund") {
    return refundTechnicianReview({ technicianReviewId: params.technicianReviewId, reason: "sla_miss" });
  }
  return load(db, params.technicianReviewId);
}

export async function refundTechnicianReview(params: {
  technicianReviewId: number;
  reason: string;
}) {
  const db = await getDb();
  requireDb(db);
  const review = await load(db, params.technicianReviewId);
  if (review.stripePaymentRef) {
    try {
      await refundStripePayment({
        paymentIntentId: review.stripePaymentRef,
        reason: "requested_by_customer",
      });
    } catch (error) {
      console.error("[TechnicianReviews] Stripe refund failed:", error);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Refund failed. Try again or refund manually in Stripe." });
    }
  }
  const updated = await transition(db, params.technicianReviewId, "refunded", {
    refundedAt: new Date(),
    refundReason: params.reason,
  });

  recordObservabilityEvent({
    category: "workflow",
    event: "technician_review_refunded",
    context: { technicianReviewId: params.technicianReviewId, reason: params.reason },
  });

  return updated;
}

/**
 * Missing-evidence reminder runner (§5.3): 24h/72h/day6 reminders while a
 * review is paid-but-not-yet-ready; day 7 triggers a full refund and closes
 * the paid review. Intended to run on a schedule alongside processDueFollowUps.
 */
export async function processDueTechnicianReviewReminders(now: Date = new Date()) {
  const db = await getDb();
  requireDb(db);

  const pending = await db
    .select()
    .from(technicianReviews)
    .where(eq(technicianReviews.status, "missing_evidence"));

  let sent = 0;
  let refunded = 0;

  for (const review of pending) {
    const sinceMissingEvidence = review.updatedAt as Date;
    const autoRefundAt =
      new Date(sinceMissingEvidence).getTime() + MISSING_EVIDENCE_AUTO_REFUND_OFFSET_MS;
    if (now.getTime() >= autoRefundAt) {
      await refundTechnicianReview({
        technicianReviewId: review.id,
        reason: "unresponsive_customer_day7",
      });
      refunded += 1;
      continue;
    }

    const reminderRows = await db
      .select()
      .from(technicianReviewReminders)
      .where(eq(technicianReviewReminders.technicianReviewId, review.id));
    const sentStages = reminderRows
      .filter((r: any) => r.status === "sent")
      .map((r: any) => r.stage);

    const due = nextDueFollowUp({
      createdAt: sinceMissingEvidence,
      sentStages,
      now,
      stages: MISSING_EVIDENCE_REMINDER_STAGES,
    });
    if (!due) continue;

    let contactEmail: string | null = null;
    if (review.guestCaseId) {
      const [contact] = await db
        .select()
        .from(guestCaseContacts)
        .where(eq(guestCaseContacts.guestCaseId, review.guestCaseId))
        .limit(1);
      contactEmail = contact?.email ?? null;
    }

    let status: "sent" | "skipped" | "failed" = "skipped";
    if (contactEmail) {
      try {
        await sendEmail({
          to: [contactEmail],
          subject: "TruckFixr — we still need evidence for your paid review",
          text: `${review.missingEvidenceNotes ?? "Please provide the requested evidence"} so we can begin your two-business-hour review clock. If we don't hear back within 7 days of the request, we'll issue a full refund.`,
        });
        status = "sent";
        sent += 1;
      } catch (error) {
        status = "failed";
        console.error("[TechnicianReviews] reminder send failed:", error);
      }
    }

    await db.insert(technicianReviewReminders).values({
      technicianReviewId: review.id,
      stage: due.stage,
      scheduledFor: due.scheduledFor,
      channel: contactEmail ? "email" : null,
      status,
      sentAt: status === "sent" ? now : null,
      createdAt: now,
    });
  }

  recordObservabilityEvent({
    category: "workflow",
    event: "technician_review_reminders_processed",
    context: { processed: pending.length, sent, refunded },
  });

  return { processed: pending.length, sent, refunded };
}

export async function listTechnicianReviewQueue(statuses?: TechnicianReviewState[]) {
  const db = await getDb();
  requireDb(db);
  const rows = await db.select().from(technicianReviews);
  if (!statuses || statuses.length === 0) return rows;
  const allowed = new Set(statuses);
  return rows.filter((r: any) => allowed.has(r.status));
}

export async function getTechnicianReview(technicianReviewId: number) {
  const db = await getDb();
  requireDb(db);
  return load(db, technicianReviewId);
}
