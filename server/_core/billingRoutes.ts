import express, { type Express, type Request, type Response } from "express";
import { z } from "zod";
import { ENV } from "./env";
import { sdk } from "./sdk";
import { canManageCompanyBilling, getUserPrimaryFleetId } from "../services/companyAccess";
import { getSubscriptionState, ensureStripeCustomerId } from "../services/subscriptions";
import {
  createStripeCustomer,
  createTruckFixrCheckoutSession,
  createTruckFixrCustomerPortalSession,
  createTruckFixrPilotCheckoutSession,
  isStripeConfigured,
} from "../services/stripeBilling";

const checkoutSchema = z.object({
  companyId: z.number().int().positive(),
  planKey: z.enum(["owner_operator", "small_fleet", "fleet_growth", "fleet_pro"]),
  billingInterval: z.enum(["monthly", "annual"]),
  extraTrailerQuantity: z.number().int().min(0).optional(),
  successUrl: z.string().optional(),
  cancelUrl: z.string().optional(),
});

const pilotSchema = z.object({
  companyId: z.number().int().positive(),
  successUrl: z.string().optional(),
  cancelUrl: z.string().optional(),
});

const portalSchema = z.object({
  companyId: z.number().int().positive(),
  returnUrl: z.string().optional(),
});

function getAbsoluteUrl(path: string) {
  const base = ENV.appBaseUrl.replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

async function requireUser(req: Request) {
  return sdk.authenticateRequest(req);
}

export function registerBillingRoutes(app: Express) {
  app.post("/api/billing/create-checkout-session", express.json(), async (req: Request, res: Response) => {
    try {
      const user = await requireUser(req);
      const input = checkoutSchema.parse(req.body);

      if (!isStripeConfigured()) {
        res.status(503).json({ error: "Stripe is not configured" });
        return;
      }

      const canManage = await canManageCompanyBilling({ fleetId: input.companyId, user });
      if (!canManage) {
        res.status(403).json({ error: "Only the company owner can manage billing" });
        return;
      }

      const current = await getSubscriptionState(user.id);
      let customerId = current.stripeCustomerId;

      if (!customerId) {
        if (!user.email) {
          res.status(400).json({ error: "An email address is required before starting checkout." });
          return;
        }

        const customer = await createStripeCustomer({
          email: user.email,
          name: user.name ?? undefined,
          userId: user.id,
        });
        customerId = customer.id;
        await ensureStripeCustomerId(user.id, customer.id);
      }

      if (!customerId) {
        res.status(400).json({ error: "Unable to resolve a Stripe customer." });
        return;
      }

      const session = await createTruckFixrCheckoutSession({
        customerId,
        companyId: input.companyId,
        planKey: input.planKey,
        billingInterval: input.billingInterval,
        extraTrailerQuantity: input.extraTrailerQuantity,
        successUrl: getAbsoluteUrl(input.successUrl ?? "/profile?subscription=success"),
        cancelUrl: getAbsoluteUrl(input.cancelUrl ?? "/pricing?subscription=cancelled"),
      });

      res.json({ checkoutUrl: session.url });
    } catch (error) {
      console.error("[Billing] Checkout session creation failed", error);
      res.status(400).json({ error: error instanceof Error ? error.message : "Unable to create checkout session" });
    }
  });

  app.post("/api/billing/create-pilot-checkout-session", express.json(), async (req: Request, res: Response) => {
    try {
      const user = await requireUser(req);
      const input = pilotSchema.parse(req.body);

      if (!isStripeConfigured()) {
        res.status(503).json({ error: "Stripe is not configured" });
        return;
      }

      const canManage = await canManageCompanyBilling({ fleetId: input.companyId, user });
      if (!canManage) {
        res.status(403).json({ error: "Only the company owner can manage billing" });
        return;
      }

      const current = await getSubscriptionState(user.id);
      let customerId = current.stripeCustomerId;
      if (!customerId) {
        if (!user.email) {
          res.status(400).json({ error: "An email address is required before starting checkout." });
          return;
        }

        const customer = await createStripeCustomer({
          email: user.email,
          name: user.name ?? undefined,
          userId: user.id,
        });
        customerId = customer.id;
        await ensureStripeCustomerId(user.id, customer.id);
      }

      if (!customerId) {
        res.status(400).json({ error: "Unable to resolve a Stripe customer." });
        return;
      }

      const session = await createTruckFixrPilotCheckoutSession({
        customerId,
        companyId: input.companyId,
        successUrl: getAbsoluteUrl(input.successUrl ?? "/profile?subscription=success"),
        cancelUrl: getAbsoluteUrl(input.cancelUrl ?? "/pricing?subscription=cancelled"),
      });

      res.json({ checkoutUrl: session.url });
    } catch (error) {
      console.error("[Billing] Pilot checkout session creation failed", error);
      res.status(400).json({ error: error instanceof Error ? error.message : "Unable to create checkout session" });
    }
  });

  app.post("/api/billing/create-customer-portal-session", express.json(), async (req: Request, res: Response) => {
    try {
      const user = await requireUser(req);
      const input = portalSchema.parse(req.body);

      if (!isStripeConfigured()) {
        res.status(503).json({ error: "Stripe is not configured" });
        return;
      }

      const canManage = await canManageCompanyBilling({ fleetId: input.companyId, user });
      if (!canManage) {
        res.status(403).json({ error: "Only the company owner can access billing management" });
        return;
      }

      const current = await getSubscriptionState(user.id);
      if (!current.stripeCustomerId) {
        res.status(400).json({ error: "No Stripe customer is linked to this account yet." });
        return;
      }

      const session = await createTruckFixrCustomerPortalSession({
        customerId: current.stripeCustomerId,
        returnUrl: getAbsoluteUrl(input.returnUrl ?? "/profile"),
      });

      res.json({ portalUrl: session.url });
    } catch (error) {
      console.error("[Billing] Customer portal session creation failed", error);
      res.status(400).json({ error: error instanceof Error ? error.message : "Unable to create portal session" });
    }
  });
}
