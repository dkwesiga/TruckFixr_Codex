import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createStripeCheckoutSession,
  createStripeCustomer,
  createStripePortalSession,
  isStripeConfigured,
} from "../services/stripeBilling";
import {
  ensureStripeCustomerId,
  getPlanSummary,
  getSubscriptionState,
  syncSubscriptionState,
} from "../services/subscriptions";
import { recordPilotMilestone, redeemPilotAccessCode } from "../services/pilotAccess";
import { ENV } from "../_core/env";
import { SUBSCRIPTION_PLANS, SubscriptionTier } from "../../shared/subscription";

function normalizeTier(value: string) {
  return value as SubscriptionTier;
}

function getAbsoluteUrl(path: string) {
  const base = ENV.appBaseUrl.replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

export const subscriptionsRouter = router({
  getCurrent: protectedProcedure.query(async ({ ctx }) => {
    const state = await getSubscriptionState(ctx.user.id);
    return {
      ...getPlanSummary(state),
      availablePlans: Object.values(SUBSCRIPTION_PLANS).filter(
        (plan) => plan.publicSelectable || plan.tier === state.tier
      ),
      stripeConfigured: isStripeConfigured(),
    };
  }),

  activateFree: protectedProcedure.mutation(async ({ ctx }) => {
    const current = await getSubscriptionState(ctx.user.id);
    await syncSubscriptionState({
      userId: ctx.user.id,
      tier: "free",
      billingStatus: "active",
      stripeCustomerId: current.stripeCustomerId,
      stripeSubscriptionId: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });

    return {
      success: true,
      tier: "free" as const,
    };
  }),

  createCheckoutSession: protectedProcedure
    .input(
      z.object({
        tier: z.enum(["pro", "fleet"]),
        successPath: z.string().default("/profile?subscription=success"),
        cancelPath: z.string().default("/pricing?subscription=cancelled"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!isStripeConfigured()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Stripe is not configured yet. Add Stripe environment variables to enable paid plans.",
        });
      }

      if (!ctx.user.email) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "An email address is required before starting subscription checkout.",
        });
      }

      const current = await getSubscriptionState(ctx.user.id);
      let customerId = current.stripeCustomerId;

      if (!customerId) {
        const customer = await createStripeCustomer({
          email: ctx.user.email,
          name: ctx.user.name ?? undefined,
          userId: ctx.user.id,
        });
        customerId = customer.id;
        await ensureStripeCustomerId(ctx.user.id, customer.id);
      }

      const session = await createStripeCheckoutSession({
        customerId,
        userId: ctx.user.id,
        tier: input.tier,
        successUrl: getAbsoluteUrl(input.successPath),
        cancelUrl: getAbsoluteUrl(input.cancelPath),
      });

      return {
        checkoutUrl: session.url,
      };
    }),

  redeemPilotAccess: protectedProcedure
    .input(
      z.object({
        code: z.string().trim().min(3, "Enter a valid Pilot Access code"),
        companyName: z.string().trim().min(2, "Enter a fleet or company name").optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const current = await getSubscriptionState(ctx.user.id);
      const pilotAccess = await redeemPilotAccessCode({
        userId: ctx.user.id,
        currentTier: current.tier,
        code: input.code,
        companyName: input.companyName,
      });

      await syncSubscriptionState({
        userId: ctx.user.id,
        tier: "pilot",
        billingStatus: "active",
        stripeCustomerId: current.stripeCustomerId,
        stripeSubscriptionId: current.stripeSubscriptionId,
        currentPeriodStart: pilotAccess.activatedAt,
        currentPeriodEnd: pilotAccess.expiresAt,
        cancelAtPeriodEnd: false,
      });

      const refreshed = await getSubscriptionState(ctx.user.id);
      return {
        ...getPlanSummary(refreshed),
        pilotAccess,
      };
    }),

  createPortalSession: protectedProcedure
    .input(
      z.object({
        returnPath: z.string().default("/profile"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!isStripeConfigured()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Stripe is not configured yet.",
        });
      }

      const current = await getSubscriptionState(ctx.user.id);
      if (!current.stripeCustomerId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No Stripe customer is linked to this account yet.",
        });
      }

      const session = await createStripePortalSession({
        customerId: current.stripeCustomerId,
        returnUrl: getAbsoluteUrl(input.returnPath),
      });

      return {
        portalUrl: session.url,
      };
    }),

  listPlans: protectedProcedure.query(() => {
    return Object.values(SUBSCRIPTION_PLANS).filter((plan) => plan.publicSelectable);
  }),

  trackPilotEvent: protectedProcedure
    .input(
      z.object({
        eventType: z.literal("upgrade_prompt_shown"),
        fleetId: z.number().optional(),
        metadata: z.record(z.string(), z.any()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const state = await getSubscriptionState(ctx.user.id);
      await recordPilotMilestone({
        userId: ctx.user.id,
        fleetId: input.fleetId ?? state.activeFleetId,
        eventType: input.eventType,
        eventMetadata: input.metadata,
      });

      return { success: true };
    }),
});
