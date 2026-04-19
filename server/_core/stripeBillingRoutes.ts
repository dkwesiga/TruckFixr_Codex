import express, { type Express, type Request, type Response } from "express";
import {
  getSubscriptionSnapshotFromStripeSubscription,
  isStripeConfigured,
  isStripeInvoiceEvent,
  isStripeSubscriptionEvent,
  retrieveStripeSubscription,
  verifyStripeWebhookSignature,
} from "../services/stripeBilling";
import { findUserIdByStripeReference, getSubscriptionState, syncSubscriptionState } from "../services/subscriptions";

export async function processStripeWebhookEvent(event: {
  type: string;
  data: { object: Record<string, unknown> };
}) {
  switch (event.type) {
    case "checkout.session.completed": {
      const object = event.data.object;
      const customerId = typeof object.customer === "string" ? object.customer : null;
      const subscriptionId = typeof object.subscription === "string" ? object.subscription : null;
      const clientReferenceId =
        typeof object.client_reference_id === "string" ? Number(object.client_reference_id) : null;

      const userId =
        clientReferenceId ||
        (await findUserIdByStripeReference({
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
        }));

      if (userId && subscriptionId) {
        const subscription = await retrieveStripeSubscription(subscriptionId);
        const snapshot = getSubscriptionSnapshotFromStripeSubscription(subscription);
        await syncSubscriptionState({
          userId,
          ...snapshot,
        });
      }
      break;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const object = event.data.object;
      if (isStripeSubscriptionEvent(object)) {
        const userId = await findUserIdByStripeReference({
          stripeCustomerId: object.customer,
          stripeSubscriptionId: object.id,
        });

        if (userId) {
          const snapshot = getSubscriptionSnapshotFromStripeSubscription(object);
          await syncSubscriptionState({
            userId,
            ...snapshot,
          });
        }
      }
      break;
    }

    case "customer.subscription.deleted": {
      const object = event.data.object;
      if (isStripeSubscriptionEvent(object)) {
        const userId = await findUserIdByStripeReference({
          stripeCustomerId: object.customer,
          stripeSubscriptionId: object.id,
        });

        if (userId) {
          await syncSubscriptionState({
            userId,
            tier: "free",
            billingStatus: "canceled",
            stripeCustomerId: object.customer,
            stripeSubscriptionId: object.id,
            currentPeriodStart: object.current_period_start
              ? new Date(object.current_period_start * 1000)
              : null,
            currentPeriodEnd: object.current_period_end
              ? new Date(object.current_period_end * 1000)
              : null,
            cancelAtPeriodEnd: object.cancel_at_period_end ?? false,
          });
        }
      }
      break;
    }

    case "invoice.payment_failed":
    case "invoice.paid": {
      const object = event.data.object;
      if (isStripeInvoiceEvent(object)) {
        const userId = await findUserIdByStripeReference({
          stripeCustomerId: object.customer,
          stripeSubscriptionId: object.subscription ?? null,
        });

        if (userId) {
          const current = await getSubscriptionState(userId);
          await syncSubscriptionState({
            userId,
            tier: current.tier,
            billingStatus: event.type === "invoice.payment_failed" ? "past_due" : "active",
            stripeCustomerId: object.customer,
            stripeSubscriptionId: object.subscription ?? current.stripeSubscriptionId,
            currentPeriodStart: current.currentPeriodStart,
            currentPeriodEnd: current.currentPeriodEnd,
            cancelAtPeriodEnd: current.cancelAtPeriodEnd,
          });
        }
      }
      break;
    }

    default:
      break;
  }
}

export function registerStripeBillingRoutes(app: Express) {
  app.post(
    "/api/stripe/webhook",
    express.raw({ type: "application/json" }),
    async (req: Request, res: Response) => {
      if (!isStripeConfigured()) {
        res.status(503).json({ error: "Stripe is not configured" });
        return;
      }

      try {
        const event = verifyStripeWebhookSignature(
          Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body ?? ""),
          req.headers["stripe-signature"] as string | undefined
        );

        await processStripeWebhookEvent(event);

        res.json({ received: true });
      } catch (error) {
        console.error("[Stripe Webhook] Failed to process event:", error);
        res.status(400).json({
          error: error instanceof Error ? error.message : "Webhook processing failed",
        });
      }
    }
  );
}
