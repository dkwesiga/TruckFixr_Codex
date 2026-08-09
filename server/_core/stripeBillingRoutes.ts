import express, { type Express, type Request, type Response } from "express";
import { ENV } from "./env";
import { sdk } from "./sdk";
import { isStaffAdminUser } from "./trpc";
import {
  getTruckFixrBillingSnapshotFromStripeSubscription,
  getSubscriptionSnapshotFromStripeSubscription,
  isStripeConfigured,
  isStripeInvoiceEvent,
  isStripeSubscriptionEvent,
  retrieveStripeSubscription,
  verifyStripeWebhookSignature,
} from "../services/stripeBilling";
import { getStripeAdminReadinessSummary } from "../services/stripeReadiness";
import { findUserIdByStripeReference, getSubscriptionState, syncSubscriptionState } from "../services/subscriptions";
import { hasPaidAccess, type BillingStatus, type SubscriptionTier } from "../../shared/billing";
import { markPilotAccessConvertedToPaid } from "../services/pilotAccess";
import { markPilotPaid } from "../services/pilotApplications";
import { markTechnicianReviewPaid } from "../services/technicianReviews";
import { recordObservabilityEvent } from "../services/observability";

const processedWebhookEventIds = new Set<string>();

function normalizeStripeBillingStatus(value: unknown): BillingStatus {
  if (value === "trialing") return "trialing";
  if (value === "past_due") return "past_due";
  if (value === "canceled") return "canceled";
  if (value === "incomplete") return "incomplete";
  if (value === "incomplete_expired") return "incomplete_expired";
  if (value === "unpaid") return "unpaid";
  return "active";
}

function getTruckFixrTierForPlan(planKey: string): SubscriptionTier {
  if (planKey === "fleet_pro" || planKey === "custom_fleet") return "fleet";
  if (planKey === "free_trial") return "free";
  return "pro";
}

async function markPilotConversionAfterPaidSync(input: {
  userId: number;
  tier: SubscriptionTier;
  billingStatus: BillingStatus;
}) {
  if (!hasPaidAccess(input.tier, input.billingStatus)) return;

  await markPilotAccessConvertedToPaid({
    userId: input.userId,
    nextTier: input.tier,
  });
}

export async function processStripeWebhookEvent(
  event: {
    id?: string;
    type: string;
    data: { object: Record<string, unknown> };
  },
  options?: {
    loadSubscription?: typeof retrieveStripeSubscription;
  }
) {
  const loadSubscription = options?.loadSubscription ?? retrieveStripeSubscription;

  if (event.id) {
    if (processedWebhookEventIds.has(event.id)) {
      return;
    }
    processedWebhookEventIds.add(event.id);
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const object = event.data.object;

      // One-time CAD $99 pilot payment (mode: "payment", no subscription).
      // Link it back to the pilotApplications row and mark it paid. Payment does
      // NOT activate the pilot — activation still requires agreement + kickoff.
      const pilotMetadata =
        ((object as { metadata?: Record<string, string> }).metadata ?? {}) as Record<
          string,
          string | undefined
        >;
      if (
        pilotMetadata.billing_interval === "pilot" &&
        pilotMetadata.pilot_application_id
      ) {
        const applicationId = Number(pilotMetadata.pilot_application_id);
        if (Number.isFinite(applicationId)) {
          try {
            await markPilotPaid({ applicationId, paymentRef: String(object.id ?? "") });
          } catch (error) {
            console.error("[stripe] markPilotPaid failed for pilot application:", error);
          }
        }
      }

      // One-time CAD $99 technician-reviewed Resolution payment (mode: "payment",
      // no subscription). Refunds are issued against the PaymentIntent, so that
      // (not the checkout session id) is what gets stored as paymentRef.
      if (
        pilotMetadata.billing_interval === "resolution_review" &&
        pilotMetadata.technician_review_id
      ) {
        const technicianReviewId = Number(pilotMetadata.technician_review_id);
        const paymentIntentId =
          typeof object.payment_intent === "string" ? object.payment_intent : String(object.id ?? "");
        if (Number.isFinite(technicianReviewId)) {
          try {
            await markTechnicianReviewPaid({ technicianReviewId, paymentRef: paymentIntentId });
          } catch (error) {
            console.error("[stripe] markTechnicianReviewPaid failed:", error);
          }
        }
      }

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
        const subscription = await loadSubscription(subscriptionId);
        const truckfixrSnapshot = getTruckFixrBillingSnapshotFromStripeSubscription(subscription);
        if (truckfixrSnapshot.companyId && truckfixrSnapshot.planKey) {
          const tier = getTruckFixrTierForPlan(truckfixrSnapshot.planKey);
          const billingStatus = normalizeStripeBillingStatus(truckfixrSnapshot.billingStatus);
          await syncSubscriptionState({
            userId,
            fleetId: truckfixrSnapshot.companyId,
            tier,
            billingCadence: truckfixrSnapshot.billingInterval === "annual" ? "annual" : "monthly",
            billingStatus,
            stripeCustomerId: truckfixrSnapshot.stripeCustomerId,
            stripeSubscriptionId: truckfixrSnapshot.stripeSubscriptionId,
            stripePriceId: truckfixrSnapshot.stripePriceId,
            currentPeriodStart: truckfixrSnapshot.subscriptionStartedAt,
            currentPeriodEnd: truckfixrSnapshot.subscriptionRenewsAt,
            trialStart: truckfixrSnapshot.trialStartedAt,
            trialEnd: truckfixrSnapshot.trialEndsAt,
            cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
            companyPlanKey: truckfixrSnapshot.planKey,
            companyBillingInterval: truckfixrSnapshot.billingInterval,
            poweredVehicleLimit: truckfixrSnapshot.poweredVehicleLimit,
            includedTrailerLimit: truckfixrSnapshot.includedTrailerLimit,
            paidExtraTrailerQuantity: truckfixrSnapshot.paidExtraTrailerQuantity,
            totalActiveTrailerLimit: truckfixrSnapshot.totalActiveTrailerLimit,
            aiSessionMonthlyLimit: truckfixrSnapshot.aiSessionMonthlyLimit,
            subscriptionStartedAt: truckfixrSnapshot.subscriptionStartedAt,
            subscriptionRenewsAt: truckfixrSnapshot.subscriptionRenewsAt,
            isTrial: truckfixrSnapshot.isTrial,
            isPaidPilot: truckfixrSnapshot.isPaidPilot,
          });
          await markPilotConversionAfterPaidSync({ userId, tier, billingStatus });
        } else {
          const snapshot = getSubscriptionSnapshotFromStripeSubscription(subscription);
          await syncSubscriptionState({
            userId,
            ...snapshot,
          });
        }
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
          const truckfixrSnapshot = getTruckFixrBillingSnapshotFromStripeSubscription(object);
          if (truckfixrSnapshot.companyId && truckfixrSnapshot.planKey) {
            const tier = getTruckFixrTierForPlan(truckfixrSnapshot.planKey);
            const billingStatus = normalizeStripeBillingStatus(truckfixrSnapshot.billingStatus);
            await syncSubscriptionState({
              userId,
              fleetId: truckfixrSnapshot.companyId,
              tier,
              billingCadence: truckfixrSnapshot.billingInterval === "annual" ? "annual" : "monthly",
              billingStatus,
              stripeCustomerId: truckfixrSnapshot.stripeCustomerId,
              stripeSubscriptionId: truckfixrSnapshot.stripeSubscriptionId,
              stripePriceId: truckfixrSnapshot.stripePriceId,
              currentPeriodStart: truckfixrSnapshot.subscriptionStartedAt,
              currentPeriodEnd: truckfixrSnapshot.subscriptionRenewsAt,
              trialStart: truckfixrSnapshot.trialStartedAt,
              trialEnd: truckfixrSnapshot.trialEndsAt,
              cancelAtPeriodEnd: object.cancel_at_period_end ?? false,
              companyPlanKey: truckfixrSnapshot.planKey,
              companyBillingInterval: truckfixrSnapshot.billingInterval,
              poweredVehicleLimit: truckfixrSnapshot.poweredVehicleLimit,
              includedTrailerLimit: truckfixrSnapshot.includedTrailerLimit,
              paidExtraTrailerQuantity: truckfixrSnapshot.paidExtraTrailerQuantity,
              totalActiveTrailerLimit: truckfixrSnapshot.totalActiveTrailerLimit,
              aiSessionMonthlyLimit: truckfixrSnapshot.aiSessionMonthlyLimit,
              subscriptionStartedAt: truckfixrSnapshot.subscriptionStartedAt,
              subscriptionRenewsAt: truckfixrSnapshot.subscriptionRenewsAt,
              isTrial: truckfixrSnapshot.isTrial,
              isPaidPilot: truckfixrSnapshot.isPaidPilot,
            });
            await markPilotConversionAfterPaidSync({ userId, tier, billingStatus });
          } else {
            const snapshot = getSubscriptionSnapshotFromStripeSubscription(object);
            await syncSubscriptionState({
              userId,
              ...snapshot,
            });
          }
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
            billingCadence: "monthly",
            billingStatus: "canceled",
            stripeCustomerId: object.customer,
            stripeSubscriptionId: object.id,
            stripePriceId: null,
            currentPeriodStart: object.current_period_start
              ? new Date(object.current_period_start * 1000)
              : null,
            currentPeriodEnd: object.current_period_end
              ? new Date(object.current_period_end * 1000)
              : null,
            trialStart: null,
            trialEnd: null,
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
          if (object.subscription) {
            const subscription = await loadSubscription(object.subscription);
            const truckfixrSnapshot = getTruckFixrBillingSnapshotFromStripeSubscription(subscription);
            if (truckfixrSnapshot.companyId && truckfixrSnapshot.planKey) {
              const tier = getTruckFixrTierForPlan(truckfixrSnapshot.planKey);
              const billingStatus = event.type === "invoice.payment_failed" ? "past_due" : "active";
              await syncSubscriptionState({
                userId,
                fleetId: truckfixrSnapshot.companyId,
                tier,
                billingCadence: truckfixrSnapshot.billingInterval === "annual" ? "annual" : "monthly",
                billingStatus,
                stripeCustomerId: object.customer,
                stripeSubscriptionId: object.subscription ?? current.stripeSubscriptionId,
                stripePriceId: truckfixrSnapshot.stripePriceId,
                currentPeriodStart: truckfixrSnapshot.subscriptionStartedAt,
                currentPeriodEnd: truckfixrSnapshot.subscriptionRenewsAt,
                trialStart: truckfixrSnapshot.trialStartedAt,
                trialEnd: truckfixrSnapshot.trialEndsAt,
                cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
                companyPlanKey: truckfixrSnapshot.planKey,
                companyBillingInterval: truckfixrSnapshot.billingInterval,
                poweredVehicleLimit: truckfixrSnapshot.poweredVehicleLimit,
                includedTrailerLimit: truckfixrSnapshot.includedTrailerLimit,
                paidExtraTrailerQuantity: truckfixrSnapshot.paidExtraTrailerQuantity,
                totalActiveTrailerLimit: truckfixrSnapshot.totalActiveTrailerLimit,
                aiSessionMonthlyLimit: truckfixrSnapshot.aiSessionMonthlyLimit,
                subscriptionStartedAt: truckfixrSnapshot.subscriptionStartedAt,
                subscriptionRenewsAt: truckfixrSnapshot.subscriptionRenewsAt,
                isTrial: truckfixrSnapshot.isTrial,
                isPaidPilot: truckfixrSnapshot.isPaidPilot,
              });
              await markPilotConversionAfterPaidSync({ userId, tier, billingStatus });
            } else {
              await syncSubscriptionState({
                userId,
                tier: current.tier,
                billingCadence: current.billingCadence,
                billingStatus: event.type === "invoice.payment_failed" ? "past_due" : "active",
                stripeCustomerId: object.customer,
                stripeSubscriptionId: object.subscription ?? current.stripeSubscriptionId,
                stripePriceId: current.stripePriceId,
                currentPeriodStart: current.currentPeriodStart,
                currentPeriodEnd: current.currentPeriodEnd,
                trialStart: current.trialStart,
                trialEnd: current.trialEnd,
                cancelAtPeriodEnd: current.cancelAtPeriodEnd,
              });
            }
          }
        }
      }
      break;
    }

    default:
      break;
  }
}

export function registerStripeBillingRoutes(app: Express) {
  app.get("/api/admin/stripe/readiness", async (req: Request, res: Response) => {
    if (!ENV.enableStripeDiagnosticsEndpoint) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    try {
      const user = await sdk.authenticateRequest(req);
      if (!user || !isStaffAdminUser(user)) {
        res.status(403).json({ error: "This action is limited to TruckFixr staff administrators." });
        return;
      }

      res.status(200).json(getStripeAdminReadinessSummary());
    } catch {
      res.status(403).json({ error: "This action is limited to TruckFixr staff administrators." });
    }
  });

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
        recordObservabilityEvent({
          category: "stripe",
          event: "stripe_webhook_failed",
          severity: "error",
          message: error instanceof Error ? error.message : String(error),
        });
        console.error("[Stripe Webhook] Failed to process event:", error);
        res.status(400).json({
          error: error instanceof Error ? error.message : "Webhook processing failed",
        });
      }
    }
  );
}
