// Gate 3: guest-case follow-up runner. Intended to be invoked on a schedule
// (cron / task). Finds cases with a due follow-up, sends on the operational
// channel (email via Resend for v1), records delivery, and never duplicates a
// stage or messages a confirmed case. Operational comms are kept separate from
// marketing consent (§26).

import { eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { guestCaseContacts, guestCaseFollowUps, guestCases } from "../../drizzle/schema";
import { nextDueFollowUp, type FollowUpStage } from "../../shared/maintenance/followUps";
import { sendEmail } from "./email";
import { recordObservabilityEvent } from "./observability";

const ACTIVE_STATUSES = ["preliminary", "contacted", "decided"];

function followUpText(stage: FollowUpStage): string {
  const intro =
    stage === "30d"
      ? "It's been about a month since your TruckFixr vehicle case."
      : "We're following up on your recent TruckFixr vehicle case.";
  return [
    intro,
    "",
    "If the issue is resolved, let us know the outcome so we can close it out.",
    "If it came back or is still open, reply and we'll help you decide the next step.",
    "",
    "— TruckFixr",
  ].join("\n");
}

export interface FollowUpRunResult {
  processed: number;
  sent: number;
  skipped: number;
}

export async function processDueFollowUps(now: Date = new Date()): Promise<FollowUpRunResult> {
  const db = await getDb();
  if (!db) return { processed: 0, sent: 0, skipped: 0 };

  const cases = await db
    .select()
    .from(guestCases)
    .where(inArray(guestCases.status, ACTIVE_STATUSES));

  let sent = 0;
  let skipped = 0;

  for (const c of cases) {
    if (c.outcomeConfirmedAt) continue;

    const sentRows = await db
      .select()
      .from(guestCaseFollowUps)
      .where(eq(guestCaseFollowUps.guestCaseId, c.id));
    const sentStages = sentRows.filter((r: any) => r.status === "sent").map((r: any) => r.stage);

    const due = nextDueFollowUp({
      createdAt: c.createdAt,
      outcomeConfirmed: Boolean(c.confirmedRepair),
      sentStages,
      now,
    });
    if (!due) continue;

    const [contact] = await db
      .select()
      .from(guestCaseContacts)
      .where(eq(guestCaseContacts.guestCaseId, c.id))
      .limit(1);

    // Operational channel only (email in v1). SMS/WhatsApp are link-only for now.
    const canEmail = Boolean(contact?.consentEmail && contact?.email);
    let status: "sent" | "skipped" | "failed" = "skipped";
    const channel = canEmail ? "email" : null;

    if (canEmail) {
      try {
        await sendEmail({
          to: [contact.email as string],
          subject: "TruckFixr — following up on your vehicle case",
          text: followUpText(due.stage),
        });
        status = "sent";
        sent++;
      } catch (error) {
        status = "failed";
        console.error("[FollowUps] send failed:", error);
      }
    } else {
      skipped++;
    }

    await db.insert(guestCaseFollowUps).values({
      guestCaseId: c.id,
      stage: due.stage,
      scheduledFor: due.scheduledFor,
      channel,
      status,
      sentAt: status === "sent" ? now : null,
      createdAt: now,
    });

    if (status === "sent") {
      await db
        .update(guestCases)
        .set({ lastFollowUpStage: due.stage, lastFollowUpAt: now, updatedAt: now })
        .where(eq(guestCases.id, c.id));
    }
  }

  recordObservabilityEvent({
    category: "workflow",
    event: "guest_followups_processed",
    context: { processed: cases.length, sent, skipped },
  });

  return { processed: cases.length, sent, skipped };
}
