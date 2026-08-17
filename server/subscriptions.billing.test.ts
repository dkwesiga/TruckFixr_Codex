import { beforeEach, describe, expect, it, vi } from "vitest";
import { SUBSCRIPTION_PLANS, getEffectiveTier, getPlanRestrictionMessage } from "../shared/billing";
import type { TrpcContext } from "./_core/context";

const {
  getSubscriptionState,
  getEntitlementState,
  syncSubscriptionState,
  ensureStripeCustomerId,
  findUserIdByStripeReference,
  createStripeCustomer,
  createStripeCheckoutSession,
  createStripePortalSession,
  createTruckFixrCheckoutSession,
  createTruckFixrCustomerPortalSession,
  createTruckFixrPilotCheckoutSession,
  retrieveStripeSubscription,
  getTruckFixrBillingSnapshotFromStripeSubscription,
  isStripeConfigured,
} = vi.hoisted(() => ({
  getSubscriptionState: vi.fn(),
  getEntitlementState: vi.fn(),
  syncSubscriptionState: vi.fn(),
  ensureStripeCustomerId: vi.fn(),
  findUserIdByStripeReference: vi.fn(),
  createStripeCustomer: vi.fn(),
  createStripeCheckoutSession: vi.fn(),
  createStripePortalSession: vi.fn(),
  createTruckFixrCheckoutSession: vi.fn(),
  createTruckFixrCustomerPortalSession: vi.fn(),
  createTruckFixrPilotCheckoutSession: vi.fn(),
  retrieveStripeSubscription: vi.fn(),
  getTruckFixrBillingSnapshotFromStripeSubscription: vi.fn(() => ({})),
  isStripeConfigured: vi.fn(() => true),
}));

const { redeemPilotAccessCode, recordPilotMilestone, markPilotAccessConvertedToPaid } = vi.hoisted(() => ({
  redeemPilotAccessCode: vi.fn(),
  recordPilotMilestone: vi.fn(),
  markPilotAccessConvertedToPaid: vi.fn(),
}));

vi.mock("./services/subscriptions", () => ({
  getSubscriptionState,
  getEntitlementState,
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
  createTruckFixrCheckoutSession,
  createTruckFixrCustomerPortalSession,
  createTruckFixrPilotCheckoutSession,
  retrieveStripeSubscription,
  getTruckFixrBillingSnapshotFromStripeSubscription,
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
  markPilotAccessConvertedToPaid,
}));

vi.mock("./services/companyAccess", () => ({
  canManageCompanyBilling: vi.fn(async () => true),
}));

const { getUnconsumedPilotCredit, consumePilotCredit } = vi.hoisted(() => ({
  getUnconsumedPilotCredit: vi.fn(async () => null),
  consumePilotCredit: vi.fn(async () => undefined),
}));

vi.mock("./services/pilotApplications", () => ({
  beginCheckout: vi.fn(),
  getUnconsumedPilotCredit,
  consumePilotCredit,
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
      role: "owner",
      managerEmail: null,
      managerUserId: null,
      subscriptionTier: "free",
      billingCadence: "monthly",
      billingStatus: "active",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripePriceId: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      trialStart: null,
      trialEnd: null,
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
    retrieveStripeSubscription.mockResolvedValue({
      id: "sub_123",
      customer: "cus_123",
      status: "active",
      metadata: {},
    } as any);
    getSubscriptionState.mockResolvedValue({
      tier: "free",
      billingStatus: "active",
      effectiveTier: "free",
      activeFleetId: 1,
      billingCadence: "monthly",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripePriceId: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      trialStart: null,
      trialEnd: null,
      cancelAtPeriodEnd: false,
    });
    getEntitlementState.mockResolvedValue({
      subscription: {
        tier: "free",
        billingStatus: "active",
        effectiveTier: "free",
        activeFleetId: 1,
        billingCadence: "monthly",
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        stripePriceId: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        trialStart: null,
        trialEnd: null,
        cancelAtPeriodEnd: false,
        pilotAccess: null,
      },
      plan: SUBSCRIPTION_PLANS.free,
      usage: {
        diagnosticsThisMonth: 0,
        activeVehicleCount: 2,
        billableVehicleCount: 2,
        managedDriverCount: 1,
      },
      activeVehicleLimit: 2,
      driverLimit: 2,
      billableVehicleCount: 2,
      canAddVehicle: true,
      canInviteDriver: true,
      canRunDiagnostics: true,
      canRunInspections: true,
      canAccessPaidFeatures: false,
      canSelfServeUpgradeToPro: true,
      canSelfServeDowngrade: false,
      requiresFleetContact: false,
      canRedeemPilotAccessCode: true,
      trialActive: false,
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
        tier: "pilot_access",
        billingStatus: "active",
      })
    );
    expect(result.pilotAccess?.fleetName).toBe("Pilot Fleet");
  });

  it("lists the revised TruckFixr public plans", async () => {
    const caller = appRouter.createCaller(createContext());
    const result = await caller.subscriptions.listPlans();

    expect(result.map((plan: any) => plan.planKey)).toEqual([
      "free_trial",
      "owner_operator",
      "small_fleet",
      "fleet_growth",
      "fleet_pro",
      "custom_fleet",
    ]);
  });

  it("starts paid checkout for the revised plan model and links the Stripe customer", async () => {
    createStripeCustomer.mockResolvedValue({ id: "cus_123" });
    createTruckFixrCheckoutSession.mockResolvedValue({ url: "https://checkout.stripe.test/session_123" });

    const caller = appRouter.createCaller(createContext());
    const result = await caller.subscriptions.createCheckoutSession({
      planKey: "small_fleet",
      billingInterval: "monthly",
      successPath: "/profile?subscription=success",
      cancelPath: "/pricing?subscription=cancelled",
    });

    expect(createStripeCustomer).toHaveBeenCalled();
    expect(ensureStripeCustomerId).toHaveBeenCalledWith(7, "cus_123");
    expect(createTruckFixrCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: "cus_123",
        companyId: 1,
        planKey: "small_fleet",
      })
    );
    expect(result.checkoutUrl).toContain("checkout.stripe.test");
  });

  it("applies an unconsumed pilot conversion credit to checkout and consumes it", async () => {
    createStripeCustomer.mockResolvedValue({ id: "cus_123" });
    createTruckFixrCheckoutSession.mockResolvedValue({ url: "https://checkout.stripe.test/session_456" });
    getSubscriptionState.mockResolvedValue({
      tier: "free",
      billingStatus: "active",
      effectiveTier: "free",
      activeFleetId: 1,
      billingCadence: "monthly",
      stripeCustomerId: "cus_123",
      stripeSubscriptionId: null,
      stripePriceId: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      trialStart: null,
      trialEnd: null,
      cancelAtPeriodEnd: false,
    });
    getUnconsumedPilotCredit.mockResolvedValue({ id: 42, amountCents: 9900 });

    const caller = appRouter.createCaller(createContext());
    await caller.subscriptions.createCheckoutSession({
      planKey: "fleet_growth",
      billingInterval: "monthly",
      successPath: "/profile?subscription=success",
      cancelPath: "/pricing?subscription=cancelled",
    });

    expect(createTruckFixrCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ pilotCreditCentsToApply: 9900 })
    );
    expect(consumePilotCredit).toHaveBeenCalledWith(42);
  });

  it("does not consume a pilot credit if checkout session creation fails", async () => {
    createStripeCustomer.mockResolvedValue({ id: "cus_123" });
    createTruckFixrCheckoutSession.mockRejectedValue(new Error("Stripe unavailable"));
    getSubscriptionState.mockResolvedValue({
      tier: "free",
      billingStatus: "active",
      effectiveTier: "free",
      activeFleetId: 1,
      billingCadence: "monthly",
      stripeCustomerId: "cus_123",
      stripeSubscriptionId: null,
      stripePriceId: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      trialStart: null,
      trialEnd: null,
      cancelAtPeriodEnd: false,
    });
    getUnconsumedPilotCredit.mockResolvedValue({ id: 42, amountCents: 9900 });

    const caller = appRouter.createCaller(createContext());
    await expect(
      caller.subscriptions.createCheckoutSession({
        planKey: "fleet_growth",
        billingInterval: "monthly",
        successPath: "/profile?subscription=success",
        cancelPath: "/pricing?subscription=cancelled",
      })
    ).rejects.toThrow("Stripe unavailable");

    expect(consumePilotCredit).not.toHaveBeenCalled();
  });

  it("surfaces billing state and restricted paid access in settings", async () => {
    getSubscriptionState.mockResolvedValue({
      tier: "pro",
      billingCadence: "monthly",
      billingStatus: "past_due",
      effectiveTier: "free",
      activeFleetId: 1,
      stripeCustomerId: "cus_123",
      stripeSubscriptionId: "sub_123",
      stripePriceId: "price_pro_monthly",
      currentPeriodStart: null,
      currentPeriodEnd: null,
      trialStart: null,
      trialEnd: null,
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
      activeFleetId: 1,
      billingCadence: "monthly",
      stripeCustomerId: "cus_123",
      stripeSubscriptionId: "sub_123",
      stripePriceId: "price_pro_monthly",
      currentPeriodStart: null,
      currentPeriodEnd: null,
      trialStart: null,
      trialEnd: null,
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

  it("preserves company billing ownership when Stripe completes paid checkout", async () => {
    findUserIdByStripeReference.mockResolvedValue(null);
    retrieveStripeSubscription.mockResolvedValue({
      id: "sub_company_123",
      customer: "cus_company_123",
      status: "active",
      metadata: {
        company_id: "42",
        plan_key: "small_fleet",
        billing_interval: "monthly",
      },
      items: { data: [{ price: { id: "price_small_fleet" }, quantity: 1 }] },
      current_period_start: 1_710_000_000,
      current_period_end: 1_712_592_000,
      cancel_at_period_end: false,
    } as any);
    getTruckFixrBillingSnapshotFromStripeSubscription.mockReturnValue({
      companyId: 42,
      planKey: "small_fleet",
      billingInterval: "monthly",
      billingStatus: "active",
      stripeCustomerId: "cus_company_123",
      stripeSubscriptionId: "sub_company_123",
      stripePriceId: "price_small_fleet",
      subscriptionStartedAt: new Date(1_710_000_000 * 1000),
      subscriptionRenewsAt: new Date(1_712_592_000 * 1000),
      trialStartedAt: null,
      trialEndsAt: null,
      poweredVehicleLimit: 5,
      includedTrailerLimit: 5,
      paidExtraTrailerQuantity: 0,
      totalActiveTrailerLimit: 5,
      aiSessionMonthlyLimit: 75,
      isTrial: false,
      isPaidPilot: false,
    });

    await processStripeWebhookEvent({
      id: "evt_checkout_company_123",
      type: "checkout.session.completed",
      data: {
        object: {
          customer: "cus_company_123",
          subscription: "sub_company_123",
          client_reference_id: "7",
        },
      },
    });

    expect(syncSubscriptionState).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        fleetId: 42,
        tier: "pro",
        billingStatus: "active",
        stripeCustomerId: "cus_company_123",
        stripeSubscriptionId: "sub_company_123",
        companyPlanKey: "small_fleet",
        companyBillingInterval: "monthly",
        poweredVehicleLimit: 5,
        includedTrailerLimit: 5,
        aiSessionMonthlyLimit: 75,
      })
    );
    expect(markPilotAccessConvertedToPaid).toHaveBeenCalledWith({
      userId: 7,
      nextTier: "pro",
    });
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
    expect(getPlanRestrictionMessage("vehicles", "free")).toContain("active vehicles");
  });
  it("derives pilot milestone ownership server-side and ignores a supplied fleet id", async () => {
    const caller = appRouter.createCaller(createContext());

    await caller.subscriptions.trackPilotEvent({
      eventType: "upgrade_prompt_shown",
      fleetId: 999,
      metadata: { source: "driver_dashboard" },
    } as any);

    expect(recordPilotMilestone).toHaveBeenCalledWith({
      userId: 7,
      eventType: "upgrade_prompt_shown",
      eventMetadata: { source: "driver_dashboard" },
    });
    expect(recordPilotMilestone.mock.calls[0]?.[0]).not.toHaveProperty("fleetId");
  });

  it("rejects oversized pilot milestone metadata", async () => {
    const caller = appRouter.createCaller(createContext());
    const metadata = Object.fromEntries(
      Array.from({ length: 11 }, (_, index) => [`field_${index}`, index])
    );

    await expect(
      caller.subscriptions.trackPilotEvent({
        eventType: "upgrade_prompt_shown",
        metadata,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(recordPilotMilestone).not.toHaveBeenCalled();
  });

});
