import { getDb } from "../db";
import { stripeWebhookEvents } from "../../drizzle/schema";

/**
 * Atomically claims a Stripe webhook event id for processing.
 *
 * Returns true if this is the first time the event has been seen (safe to
 * process) and false if it has already been claimed (skip processing). The
 * DB's primary key constraint on `stripeWebhookEvents.id` — not app-level
 * logic — is what makes this safe under concurrent/duplicate deliveries and
 * across multiple server instances.
 *
 * If the database is unavailable, this fails open (returns true) rather
 * than blocking webhook processing.
 */
export async function claimStripeWebhookEvent(eventId: string, eventType: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return true;

  const inserted = await db
    .insert(stripeWebhookEvents)
    .values({ id: eventId, type: eventType })
    .onConflictDoNothing({ target: stripeWebhookEvents.id })
    .returning({ id: stripeWebhookEvents.id });

  return inserted.length > 0;
}
