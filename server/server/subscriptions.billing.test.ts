import { beforeEach, describe, expect, it, vi } from "vitest";
import { SUBSCRIPTION_PLANS, getEffectiveTier, getPlanRestrictionMessage } from "../shared/subscription";
import type { TrpcContext } from "./_core/context";

const {
  getSubscriptionState,
  syncSubscriptionState,
  ensureStripeCustomerId,
  findUserIdByStripeReference,
  createStripeCustomer,
  createStripeCheckoutSession,
  createStripePortalSession,
  retrieveStripeSubscription,
  isStripeConfigured,
} = vi.hoisted(() => ({
  getSubscriptionState: vi.fn(),
  syncSubscriptionState: vi.fn(),
  ensureStripeCustomerId: vi.fn(),
  findUserIdByStripeReference: vi.fn(),
  createStripeCustomer: vi.fn(),
  createStripeCheckoutSession: vi.fn(),
  createStripePortalSession: vi.fn(),
  retrieveStripeSubscription: vi.fn(),
  isStripeConfigured: vi.fn(() => true),
}));

const { redeemPilotAccessCode, recordPilotMilestone } = vi.hoisted(() => ({
  redeemPilotAccessCode: vi.fn(),
  recordPilotMilestone: vi.fn(),
}));

vi.mock("./services/subscriptions", () => ({
  getSubscriptionState,
  syncSubscriptionState,
  ensureStripeCustomerId,
  findUserIdByStripeReference,
  getPlanSummary: (state: any) => ({
    ...state,
    selectedPlan: SUBSCRIPTION_PLANS[state.tier],
    effectivePlan: SUBSCRIPTION_PLANS[state.effectiveTier],
    restrictedBecauseOfBilling: state.tier !== "free" && state.effectiveTier === "free",
  }),
}));

vi.mock("./services/stripeBilling", () => ({
  createStripeCustomer,
  createStripeCheckoutSession,
  createStripePortalSession,
  retrieveStripeSubscription,
  isStripeConfigured,
  getSubscriptionSnapshotFromStripeSubscription: (subscription: any) => ({
    tier: subscription.metadata?.tier ?? "pro",
    billingStatus: subscription.status,
    stripeCustomerId: subscription.customer,
    stripeSubscriptionId: subscription.id,
    currentPeriodStart: subscription.current_period_start
      ? new Date(subscription.current_period_start * 1000)
      : null,
    currentPeriodEnd: subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000)
      : null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
  }),
  isStripeSubscriptionEvent: (object: any) =>
    Boolean(object && typeof object.id === "string" && typeof object.customer === "string"),
  isStripeInvoiceEvent: (object: any) =>
    Boolean(object && typeof object.id === "string" && typeof object.customer === "string"),
  verifyStripeWebhookSignature: vi.fn(),
}));

vi.mock("./services/pilotAccess", () => ({
  redeemPilotAccessCode,
  recordPilotMilestone,
  getDefaultFleetIdForUser: vi.fn(async () => 1),
  getPilotAccessOverview: vi.fn(async () => null),
  reconcilePilotAccessForUser: vi.fn(async () => null),
  markPilotAccessConvertedToPaid: vi.fn(async () => undefined),
}));

import { appRouter } from "./routers";
import { processStripeWebhookEvent } from "./_core/stripeBillingRoutes";

function createContext(): TrpcContext {
  return {
    user: {
      id: 7,
      openId: "user-7",
      email: "manager@truckfixr.com",
      name: "Manager Seven",
      loginMethod: "email",
      role: "manager",
      managerEmail: null,
      managerUserId: null,
      subscriptionTier: "free",
      billingStatus: "active",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("subscription billing flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSubscriptionState.mockResolvedValue({
      tier: "free",
      billingStatus: "active",
      effectiveTier: "free",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });
  });

  it("supports free user activation", async () => {
    const caller = appRouter.createCaller(createContext());
    const result = await caller.subscriptions.activateFree();

    expect(result).toEqual({ success: true, tier: "free" });
    expect(syncSubscriptionState).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        tier: "free",
        billingStatus: "active",
      })
    );
  });

  it("redeems Pilot Access for a free user and syncs the temporary plan", async () => {
    redeemPilotAccessCode.mockResolvedValue({
      codeId: 11,
      code: "PILOT-ALPHA",
      fleetId: 9,
      fleetName: "Pilot Fleet",
      status: "active",
      activatedAt: new Date("2026-04-15T00:00:00.000Z"),
      expiresAt: new Date("2026-04-29T00:00:00.000Z"),
      maxUsers: 2,
      maxVehicles: 3,
      usersUsed: 1,
      vehiclesUsed: 0,
      isExpiringSoon: false,
      daysRemaining: 14,
    });

    const caller = appRouter.createCaller(createContext());
    const result = await caller.subscriptions.redeemPilotAccess({
      code: "pilot-alpha",
      companyName: "Pilot Fleet",
    });

    expect(redeemPilotAccessCode).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        currentTier: "free",
        code: "pilot-alpha",
      })
    );
    expect(syncSubscriptionState).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        tier: "pilot",
        billingStatus: "active",
      })
    );
    expect(result.pilotAccess?.fleetName).toBe("Pilot Fleet");
  });

  it("does not expose Pilot Access as a normal public plan choice", async () => {
    const caller = appRouter.createCaller(createContext());
    const result = await caller.subscriptions.listPlans();

    expect(result.map((plan) => plan.tier)).toEqual(["free", "pro", "fleet"]);
  });

  it("starts paid checkout for Pro and links the Stripe customer", async () => {
    createStripeCustomer.mockResolvedValue({ id: "cus_123" });
    createStripeCheckoutSession.mockResolvedValue({ url: "https://checkout.stripe.test/session_123" });

    const caller = appRouter.createCaller(createContext());
    const result = await caller.subscriptions.createCheckoutSession({
      tier: "pro",
      successPath: "/profile?subscription=success",
      cancelPath: "/pricing?subscription=cancelled",
    });

    expect(createStripeCustomer).toHaveBeenCalled();
    expect(ensureStripeCustomerId).toHaveBeenCalledWith(7, "cus_123");
    expect(createStripeCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: "cus_123",
        tier: "pro",
        userId: 7,
      })
    );
    expect(result.checkoutUrl).toContain("checkout.stripe.test");
  });

  it("surfaces billing state and restricted paid access in settings", async () => {
    getSubscriptionState.mockResolvedValue({
      tier: "pro",
      billingStatus: "past_due",
      effectiveTier: "free",
      stripeCustomerId: "cus_123",
      stripeSubscriptionId: "sub_123",
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });

    const caller = appRouter.createCaller(createContext());
    const result = await caller.subscriptions.getCurrent();

    expect(result.billingStatus).toBe("past_due");
    expect(result.restrictedBecauseOfBilling).toBe(true);
    expect(result.effectivePlan.tier).toBe("free");
  });

  it("updates billing status when Stripe reports a payment failure", async () => {
    findUserIdByStripeReference.mockResolvedValue(7);
    getSubscriptionState.mockResolvedValue({
      tier: "pro",
      billingStatus: "active",
      effectiveTier: "pro",
      stripeCustomerId: "cus_123",
      stripeSubscriptionId: "sub_123",
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });

    await processStripeWebhookEvent({
      type: "invoice.payment_failed",
      data: {
        object: {
          id: "in_123",
          customer: "cus_123",
          subscription: "sub_123",
        },
      },
    });

    expect(syncSubscriptionState).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        tier: "pro",
        billingStatus: "past_due",
      })
    );
  });

  it("falls back to the free plan when Stripe deletes the subscription", async () => {
    findUserIdByStripeReference.mockResolvedValue(7);

    await processStripeWebhookEvent({
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_123",
          customer: "cus_123",
          status: "canceled",
          cancel_at_period_end: false,
          current_period_start: 1710000000,
          current_period_end: 1712592000,
        },
      },
    });

    expect(syncSubscriptionState).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        tier: "free",
        billingStatus: "canceled",
      })
    );
  });

  it("keeps plan restriction messaging direct and practical", () => {
    expect(getEffectiveTier("pro", "past_due")).toBe("free");
    expect(getPlanRestrictionMessage("diagnostics", "free")).toContain("monthly diagnostic limit");
    expect(getPlanRestrictionMessage("vehicles", "free")).toContain("vehicle limit");
  });
});
