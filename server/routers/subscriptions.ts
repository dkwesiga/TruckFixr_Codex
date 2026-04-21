import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import {
  createStripeCheckoutSession,
  createStripeCustomer,
  createStripePortalSession,
  isStripeConfigured,
} from "../services/stripeBilling";
import {
  getAdminBillingDashboard,
  getDowngradeRequirements,
  getEntitlementState,
  ensureStripeCustomerId,
  getPlanSummary,
  getSubscriptionState,
  requestFleetQuote,
  syncSubscriptionState,
} from "../services/subscriptions";
import { recordPilotMilestone, redeemPilotAccessCode } from "../services/pilotAccess";
import { ENV } from "../_core/env";
import {
  BillingCadence,
  getPublicPlans,
  normalizeSubscriptionTier,
  SUBSCRIPTION_PLANS,
  SubscriptionTier,
} from "../../shared/billing";

function getAbsoluteUrl(path: string) {
  const base = ENV.appBaseUrl.replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

export const subscriptionsRouter = router({
  getCurrent: protectedProcedure.query(async ({ ctx }) => {
    const state = await getSubscriptionState(ctx.user.id);
    const entitlement = await getEntitlementState({
      userId: ctx.user.id,
      fleetId: state.activeFleetId,
    });
    return {
      ...getPlanSummary(state),
      availablePlans: getPublicPlans().filter((plan) => plan.publicSelectable || plan.tier === state.tier),
      entitlements: entitlement,
      stripeConfigured: isStripeConfigured(),
    };
  }),

  activateFree: protectedProcedure.mutation(async ({ ctx }) => {
    const current = await getSubscriptionState(ctx.user.id);
    await syncSubscriptionState({
      userId: ctx.user.id,
      tier: "free",
      billingCadence: current.billingCadence,
      billingStatus: "active",
      stripeCustomerId: current.stripeCustomerId,
      stripeSubscriptionId: null,
      stripePriceId: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      trialStart: null,
      trialEnd: null,
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
        tier: z.literal("pro"),
        billingCadence: z.enum(["monthly", "annual"]).default("monthly"),
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
      const entitlement = await getEntitlementState({
        userId: ctx.user.id,
        fleetId: current.activeFleetId,
      });

      if (!entitlement.canSelfServeUpgradeToPro && current.tier !== "pro") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This account cannot self-serve into Pro from its current plan.",
        });
      }

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
        tier: "pro",
        billingCadence: input.billingCadence,
        activeVehicleCount: entitlement.usage.activeVehicleCount,
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
        tier: "pilot_access",
        billingCadence: "monthly",
        billingStatus: "active",
        stripeCustomerId: current.stripeCustomerId,
        stripeSubscriptionId: current.stripeSubscriptionId,
        stripePriceId: current.stripePriceId,
        currentPeriodStart: pilotAccess.activatedAt,
        currentPeriodEnd: pilotAccess.expiresAt,
        trialStart: pilotAccess.activatedAt,
        trialEnd: pilotAccess.expiresAt,
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
    return getPublicPlans();
  }),

  validateDowngrade: protectedProcedure
    .input(
      z.object({
        targetTier: z.enum(["free", "pro", "fleet", "pilot_access"]),
      })
    )
    .query(async ({ ctx, input }) => {
      const state = await getSubscriptionState(ctx.user.id);
      return getDowngradeRequirements({
        userId: ctx.user.id,
        fleetId: state.activeFleetId,
        targetTier: normalizeSubscriptionTier(input.targetTier),
      });
    }),

  requestFleetQuote: publicProcedure
    .input(
      z.object({
        companyName: z.string().trim().min(2),
        contactName: z.string().trim().min(2),
        email: z.string().trim().email(),
        phone: z.string().trim().max(50).optional(),
        vehicleCount: z.number().int().min(1),
        driverCount: z.number().int().min(0),
        mainNeeds: z.string().trim().min(10),
        notes: z.string().trim().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const state = ctx.user ? await getSubscriptionState(ctx.user.id) : null;
      const lead = await requestFleetQuote({
        userId: ctx.user?.id ?? null,
        fleetId: state?.activeFleetId ?? null,
        ...input,
      });

      return {
        success: true,
        leadId: lead.id,
      };
    }),

  adminDashboard: protectedProcedure
    .input(
      z.object({
        query: z.string().trim().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const adminEmails = ENV.adminEmails
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
      const userEmail = ctx.user.email?.trim().toLowerCase() ?? "";

      if (!adminEmails.includes(userEmail)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This billing dashboard is available only to TruckFixr staff.",
        });
      }

      return getAdminBillingDashboard({ query: input.query });
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
