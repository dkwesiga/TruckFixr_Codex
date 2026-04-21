import { and, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import {
  adminAlerts,
  aiUsageLogs,
  fleets,
  fleetQuoteRequests,
  subscriptions,
  users,
  vehicles,
} from "../../drizzle/schema";
import {
  getDefaultFleetIdForUser,
  getPilotAccessOverview,
  markPilotAccessConvertedToPaid,
  reconcilePilotAccessForUser,
  type PilotAccessOverview,
} from "./pilotAccess";
import { updateStripeSubscriptionQuantity } from "./stripeBilling";
import { sendEmail } from "./email";
import { ENV } from "../_core/env";
import {
  BillingCadence,
  BillingStatus,
  calculateProPricing,
  FREE_ACTIVE_VEHICLE_LIMIT,
  FREE_DRIVER_LIMIT,
  getEffectiveTier,
  getBillingStatusLabel,
  getPlanRestrictionMessage,
  hasPaidAccess,
  isPaidTier,
  normalizeSubscriptionTier,
  PRO_MINIMUM_BILLABLE_ACTIVE_VEHICLES,
  SUBSCRIPTION_PLANS,
  SubscriptionTier,
} from "../../shared/billing";

export type SubscriptionState = {
  tier: SubscriptionTier;
  billingStatus: BillingStatus;
  effectiveTier: SubscriptionTier;
  activeFleetId: number;
  billingCadence: BillingCadence;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  trialStart: Date | null;
  trialEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  pilotAccess: PilotAccessOverview | null;
};

function getMonthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function getDefaultSubscriptionState(): SubscriptionState {
  return {
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
  };
}

export async function getSubscriptionState(userId: number): Promise<SubscriptionState> {
  const db = await getDb();
  if (!db) {
    return getDefaultSubscriptionState();
  }

  const pilotAccess = await reconcilePilotAccessForUser(userId);

  const [userRow] = await db
    .select({
      subscriptionTier: users.subscriptionTier,
      billingCadence: users.billingCadence,
      billingStatus: users.billingStatus,
      stripeCustomerId: users.stripeCustomerId,
      stripeSubscriptionId: users.stripeSubscriptionId,
      stripePriceId: users.stripePriceId,
      currentPeriodStart: users.currentPeriodStart,
      currentPeriodEnd: users.currentPeriodEnd,
      trialStart: users.trialStart,
      trialEnd: users.trialEnd,
      cancelAtPeriodEnd: users.cancelAtPeriodEnd,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const latestSubscription = (
    await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .orderBy(desc(subscriptions.updatedAt))
      .limit(1)
  )[0];

  const tier = normalizeSubscriptionTier(latestSubscription?.tier ?? userRow?.subscriptionTier ?? "free");
  const billingCadence = (latestSubscription?.billingCadence ??
    userRow?.billingCadence ??
    "monthly") as BillingCadence;
  const billingStatus = (latestSubscription?.billingStatus ??
    userRow?.billingStatus ??
    "active") as BillingStatus;
  const stripeCustomerId = latestSubscription?.stripeCustomerId ?? userRow?.stripeCustomerId ?? null;
  const stripeSubscriptionId =
    latestSubscription?.stripeSubscriptionId ?? userRow?.stripeSubscriptionId ?? null;
  const stripePriceId = latestSubscription?.stripePriceId ?? userRow?.stripePriceId ?? null;
  const currentPeriodStart =
    latestSubscription?.currentPeriodStart ?? userRow?.currentPeriodStart ?? null;
  const currentPeriodEnd = latestSubscription?.currentPeriodEnd ?? userRow?.currentPeriodEnd ?? null;
  const trialStart = latestSubscription?.trialStart ?? userRow?.trialStart ?? null;
  const trialEnd = latestSubscription?.trialEnd ?? userRow?.trialEnd ?? null;
  const cancelAtPeriodEnd =
    latestSubscription?.cancelAtPeriodEnd ?? userRow?.cancelAtPeriodEnd ?? false;
  const activeFleetId = await getDefaultFleetIdForUser(userId);

  if (tier === "pilot_access" && pilotAccess?.status !== "active") {
    await syncSubscriptionState({
      userId,
      tier: "free",
      billingCadence,
      billingStatus: "active",
      stripeCustomerId,
      stripeSubscriptionId: null,
      stripePriceId: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      trialStart: null,
      trialEnd: null,
      cancelAtPeriodEnd: false,
    });

    return {
      ...getDefaultSubscriptionState(),
      activeFleetId,
      pilotAccess: await getPilotAccessOverview(userId),
    };
  }

  return {
    tier,
    billingStatus,
    effectiveTier: getEffectiveTier(tier, billingStatus),
    activeFleetId,
    billingCadence,
    stripeCustomerId,
    stripeSubscriptionId,
    stripePriceId,
    currentPeriodStart,
    currentPeriodEnd,
    trialStart,
    trialEnd,
    cancelAtPeriodEnd,
    pilotAccess:
      pilotAccess ?? (tier === "pilot_access" ? await getPilotAccessOverview(userId) : null),
  };
}

export async function findUserIdByStripeReference(input: {
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
}) {
  const db = await getDb();
  if (!db) return null;

  if (input.stripeSubscriptionId) {
    const match = (
      await db
        .select({ userId: subscriptions.userId })
        .from(subscriptions)
        .where(eq(subscriptions.stripeSubscriptionId, input.stripeSubscriptionId))
        .limit(1)
    )[0];
    if (match?.userId) return match.userId;
  }

  if (input.stripeCustomerId) {
    const match = (
      await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.stripeCustomerId, input.stripeCustomerId))
        .limit(1)
    )[0];
    if (match?.id) return match.id;
  }

  return null;
}

export async function syncSubscriptionState(input: {
  userId: number;
  tier: SubscriptionTier;
  billingCadence?: BillingCadence;
  billingStatus: BillingStatus;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripePriceId?: string | null;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  trialStart?: Date | null;
  trialEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
}) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const now = new Date();
  const snapshot = {
    stripeCustomerId: input.stripeCustomerId ?? null,
    stripeSubscriptionId: input.stripeSubscriptionId ?? null,
    stripePriceId: input.stripePriceId ?? null,
    tier: input.tier,
    billingCadence: input.billingCadence ?? "monthly",
    billingStatus: input.billingStatus,
    currentPeriodStart: input.currentPeriodStart ?? null,
    currentPeriodEnd: input.currentPeriodEnd ?? null,
    trialStart: input.trialStart ?? null,
    trialEnd: input.trialEnd ?? null,
    cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
    updatedAt: now,
  };

  const existing = (
    await db.select().from(subscriptions).where(eq(subscriptions.userId, input.userId)).limit(1)
  )[0];
  const currentTier = normalizeSubscriptionTier(existing?.tier ?? (
    await db
      .select({ subscriptionTier: users.subscriptionTier })
      .from(users)
      .where(eq(users.id, input.userId))
      .limit(1)
  )[0]?.subscriptionTier ?? "free");

  if (existing) {
    await db.update(subscriptions).set(snapshot).where(eq(subscriptions.id, existing.id));
  } else {
    await db.insert(subscriptions).values({
      userId: input.userId,
      ...snapshot,
      createdAt: now,
    });
  }

  await db
    .update(users)
    .set({
      subscriptionTier: input.tier,
      billingCadence: input.billingCadence ?? "monthly",
      billingStatus: input.billingStatus,
      stripeCustomerId: input.stripeCustomerId ?? null,
      stripeSubscriptionId: input.stripeSubscriptionId ?? null,
      stripePriceId: input.stripePriceId ?? null,
      currentPeriodStart: input.currentPeriodStart ?? null,
      currentPeriodEnd: input.currentPeriodEnd ?? null,
      trialStart: input.trialStart ?? null,
      trialEnd: input.trialEnd ?? null,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
      updatedAt: now,
    })
    .where(eq(users.id, input.userId));

  if (currentTier === "pilot_access" && (input.tier === "pro" || input.tier === "fleet")) {
    await markPilotAccessConvertedToPaid({
      userId: input.userId,
      nextTier: input.tier,
    });
  }
}

export async function ensureStripeCustomerId(userId: number, stripeCustomerId: string) {
  const current = await getSubscriptionState(userId);
  await syncSubscriptionState({
    userId,
    tier: current.tier,
    billingCadence: current.billingCadence,
    billingStatus: current.billingStatus,
    stripeCustomerId,
    stripeSubscriptionId: current.stripeSubscriptionId,
    stripePriceId: current.stripePriceId,
    currentPeriodStart: current.currentPeriodStart,
    currentPeriodEnd: current.currentPeriodEnd,
    trialStart: current.trialStart,
    trialEnd: current.trialEnd,
    cancelAtPeriodEnd: current.cancelAtPeriodEnd,
  });
}

export async function getUsageSummary(userId: number, fleetId?: number) {
  const db = await getDb();
  if (!db) {
    return {
      diagnosticsThisMonth: 0,
      activeVehicleCount: 0,
      billableVehicleCount: 0,
      managedDriverCount: 0,
    };
  }

  const monthStart = getMonthStart();
  const diagnosticRows = await db
    .select({ id: aiUsageLogs.id })
    .from(aiUsageLogs)
    .where(
      and(
        eq(aiUsageLogs.userId, userId),
        eq(aiUsageLogs.usageType, "diagnostic"),
        gte(aiUsageLogs.createdAt, monthStart)
      )
    );

  const activeVehicleRows = fleetId
    ? await db
        .select({ id: vehicles.id })
        .from(vehicles)
        .where(and(eq(vehicles.fleetId, fleetId), eq(vehicles.status, "active")))
    : [];

  const managedDriverRows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.managerUserId, userId));

  return {
    diagnosticsThisMonth: diagnosticRows.length,
    activeVehicleCount: activeVehicleRows.length,
    billableVehicleCount: activeVehicleRows.length,
    managedDriverCount: managedDriverRows.length,
  };
}

export async function getEntitlementState(input: { userId: number; fleetId: number }) {
  const subscription = await getSubscriptionState(input.userId);
  const plan = SUBSCRIPTION_PLANS[subscription.effectiveTier];
  const usage = await getUsageSummary(input.userId, input.fleetId);
  const activeVehicleLimit = subscription.pilotAccess?.maxVehicles ?? plan.limits.activeVehicleCount;
  const driverLimit = subscription.pilotAccess?.maxUsers ?? plan.limits.driverCount;

  const canAddVehicle =
    activeVehicleLimit === null || usage.activeVehicleCount < activeVehicleLimit;
  const canInviteDriver =
    driverLimit === null || usage.managedDriverCount < driverLimit;
  const canRunDiagnostics =
    plan.limits.diagnosticsPerMonth === null ||
    usage.diagnosticsThisMonth < plan.limits.diagnosticsPerMonth;

  const trialActive =
    subscription.billingStatus === "trialing" &&
    Boolean(subscription.trialEnd && subscription.trialEnd.getTime() > Date.now());

  return {
    subscription,
    plan,
    usage,
    activeVehicleLimit,
    driverLimit,
    billableVehicleCount:
      subscription.effectiveTier === "pro"
        ? Math.max(PRO_MINIMUM_BILLABLE_ACTIVE_VEHICLES, usage.billableVehicleCount)
        : usage.billableVehicleCount,
    canAddVehicle,
    canInviteDriver,
    canRunDiagnostics,
    canRunInspections: true,
    canAccessPaidFeatures: subscription.effectiveTier === "pro" || subscription.effectiveTier === "fleet",
    canSelfServeUpgradeToPro:
      subscription.tier === "free" || subscription.tier === "pilot_access",
    canSelfServeDowngrade: subscription.tier === "pro",
    requiresFleetContact:
      subscription.tier === "fleet" || usage.activeVehicleCount > 25,
    canRedeemPilotAccessCode:
      subscription.tier === "free" || subscription.tier === "pilot_access",
    trialActive,
  };
}

export async function assertVehicleWithinPlan(input: { userId: number; fleetId: number }) {
  const entitlement = await getEntitlementState(input);

  if (!entitlement.canAddVehicle) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: getPlanRestrictionMessage("vehicles", entitlement.subscription.effectiveTier),
    });
  }

  return entitlement;
}

export async function syncStripeQuantityForActiveVehicles(input: {
  userId: number;
  fleetId: number;
  prorationBehavior?: "create_prorations" | "always_invoice" | "none";
}) {
  const entitlement = await getEntitlementState(input);
  const state = entitlement.subscription;
  if (state.effectiveTier !== "pro" || !state.stripeSubscriptionId) {
    return entitlement;
  }

  const quantity = Math.max(PRO_MINIMUM_BILLABLE_ACTIVE_VEHICLES, entitlement.usage.billableVehicleCount);

  try {
    await updateStripeSubscriptionQuantity({
      subscriptionId: state.stripeSubscriptionId,
      quantity,
      priceId: state.stripePriceId,
      prorationBehavior: input.prorationBehavior ?? "create_prorations",
    });
  } catch (error) {
    console.error("[Billing] Failed to sync Stripe quantity from active vehicles:", error);
  }

  return entitlement;
}

export async function assertDiagnosticsWithinPlan(input: { userId: number; fleetId: number }) {
  const entitlement = await getEntitlementState(input);

  if (!entitlement.canRunDiagnostics) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: getPlanRestrictionMessage("diagnostics", entitlement.subscription.effectiveTier),
    });
  }

  return entitlement;
}

export async function assertUsersWithinPlan(input: { userId: number; fleetId: number }) {
  const entitlement = await getEntitlementState(input);

  if (!entitlement.canInviteDriver) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: getPlanRestrictionMessage("drivers", entitlement.subscription.effectiveTier),
    });
  }

  return {
    ...entitlement,
    currentUsers: entitlement.usage.managedDriverCount,
    limit: entitlement.driverLimit,
  };
}

export async function recordDiagnosticUsage(input: {
  userId: number;
  fleetId: number;
  vehicleId: number;
  provider?: string | null;
  model?: string | null;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  latencyMs?: number | null;
  estimatedCostUsd?: string | number | null;
  metadata?: Record<string, unknown>;
}) {
  const db = await getDb();
  if (!db) return;

  await db.insert(aiUsageLogs).values({
    userId: input.userId,
    fleetId: input.fleetId,
    vehicleId: input.vehicleId,
    usageType: "diagnostic",
    provider: input.provider ?? null,
    model: input.model ?? null,
    promptTokens: input.promptTokens ?? 0,
    completionTokens: input.completionTokens ?? 0,
    totalTokens: input.totalTokens ?? 0,
    latencyMs: input.latencyMs ?? null,
    estimatedCostUsd:
      input.estimatedCostUsd === null || input.estimatedCostUsd === undefined
        ? null
        : String(input.estimatedCostUsd),
    metadata: input.metadata ?? null,
  });
}

export async function getDowngradeRequirements(input: {
  userId: number;
  fleetId: number;
  targetTier: SubscriptionTier;
}) {
  const entitlement = await getEntitlementState(input);
  const targetPlan = SUBSCRIPTION_PLANS[input.targetTier];
  const requiredActions: string[] = [];

  if (input.targetTier === "free") {
    if (entitlement.usage.activeVehicleCount > FREE_ACTIVE_VEHICLE_LIMIT) {
      requiredActions.push(
        `Archive ${entitlement.usage.activeVehicleCount - FREE_ACTIVE_VEHICLE_LIMIT} active vehicle(s) to reach the Free limit of 2.`
      );
    }
    if (entitlement.usage.managedDriverCount > FREE_DRIVER_LIMIT) {
      requiredActions.push(
        `Reduce linked drivers by ${entitlement.usage.managedDriverCount - FREE_DRIVER_LIMIT} to reach the Free limit of 2.`
      );
    }
  }

  return {
    targetTier: input.targetTier,
    targetPlan,
    canDowngrade: requiredActions.length === 0,
    requiredActions,
  };
}

export async function requestFleetQuote(input: {
  userId: number | null;
  fleetId: number | null;
  companyName: string;
  contactName: string;
  email: string;
  phone?: string | null;
  vehicleCount: number;
  driverCount: number;
  mainNeeds: string;
  notes?: string | null;
}) {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database not available",
    });
  }

  const now = new Date();
  const [lead] = await db
    .insert(fleetQuoteRequests)
    .values({
      userId: input.userId,
      fleetId: input.fleetId,
      companyName: input.companyName.trim(),
      contactName: input.contactName.trim(),
      email: input.email.trim().toLowerCase(),
      phone: input.phone?.trim() || null,
      vehicleCount: input.vehicleCount,
      driverCount: input.driverCount,
      mainNeeds: input.mainNeeds.trim(),
      notes: input.notes?.trim() || null,
      status: "pending_fleet_review",
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  await db.insert(adminAlerts).values({
    userId: input.userId,
    fleetId: input.fleetId,
    type: "fleet_quote_request",
    title: `Fleet quote request from ${input.companyName.trim()}`,
    body: `${input.contactName.trim()} requested Fleet pricing for ${input.vehicleCount} vehicles and ${input.driverCount} drivers.`,
    metadata: {
      leadId: lead.id,
      email: input.email.trim().toLowerCase(),
      vehicleCount: input.vehicleCount,
      driverCount: input.driverCount,
    },
    createdAt: now,
    updatedAt: now,
  });

  const salesRecipients = [
    ENV.salesNotificationEmail.trim().toLowerCase(),
    ...ENV.adminEmails
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  ].filter(Boolean);

  try {
    if (salesRecipients.length > 0) {
      await sendEmail({
        to: Array.from(new Set(salesRecipients)),
        subject: `Fleet quote request: ${input.companyName.trim()}`,
        text: [
          `${input.contactName.trim()} requested Fleet pricing for ${input.companyName.trim()}.`,
          `Email: ${input.email.trim().toLowerCase()}`,
          `Phone: ${input.phone?.trim() || "Not provided"}`,
          `Vehicles: ${input.vehicleCount}`,
          `Drivers: ${input.driverCount}`,
          `Main needs: ${input.mainNeeds.trim()}`,
          input.notes?.trim() ? `Notes: ${input.notes.trim()}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      });
    }

    await sendEmail({
      to: [input.email.trim().toLowerCase()],
      subject: "TruckFixr Fleet quote request received",
      text: [
        `Thanks ${input.contactName.trim()},`,
        "",
        "We received your Fleet quote request and will follow up shortly.",
        `Company: ${input.companyName.trim()}`,
        `Vehicles: ${input.vehicleCount}`,
        `Drivers: ${input.driverCount}`,
      ].join("\n"),
    });
  } catch (error) {
    console.error("[Billing] Fleet quote email delivery failed:", error);
  }

  return lead;
}

export async function getAdminBillingDashboard(input: { query?: string | null }) {
  const db = await getDb();
  if (!db) {
    return {
      accounts: [],
      quoteRequests: [],
      adminAlerts: [],
    };
  }

  const subscriptionRows = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      tier: users.subscriptionTier,
      billingCadence: users.billingCadence,
      billingStatus: users.billingStatus,
      stripeCustomerId: users.stripeCustomerId,
      stripeSubscriptionId: users.stripeSubscriptionId,
      stripePriceId: users.stripePriceId,
      currentPeriodStart: users.currentPeriodStart,
      currentPeriodEnd: users.currentPeriodEnd,
      trialStart: users.trialStart,
      trialEnd: users.trialEnd,
      cancelAtPeriodEnd: users.cancelAtPeriodEnd,
      managerUserId: users.managerUserId,
    })
    .from(users);

  const fleetRows = await db.select({ id: fleets.id, ownerId: fleets.ownerId }).from(fleets);
  const uniqueFleetIds = Array.from(
    new Set(fleetRows.map((row) => row.id).filter((value): value is number => Number.isFinite(value)))
  );
  const vehicleCounts = uniqueFleetIds.length
    ? await db
        .select({
          fleetId: vehicles.fleetId,
          activeVehicleCount: sql<number>`count(*) filter (where ${vehicles.status} = 'active')::int`,
          billableVehicleCount: sql<number>`count(*) filter (where ${vehicles.status} = 'active')::int`,
        })
        .from(vehicles)
        .where(inArray(vehicles.fleetId, uniqueFleetIds))
        .groupBy(vehicles.fleetId)
    : [];

  const vehicleCountMap = new Map(
    vehicleCounts.map((row) => [row.fleetId, { activeVehicleCount: row.activeVehicleCount, billableVehicleCount: row.billableVehicleCount }])
  );
  const fleetOwnerMap = new Map(fleetRows.map((row) => [row.ownerId, row.id]));

  const filteredAccounts = subscriptionRows
    .filter((row) => {
      if (!input.query?.trim()) return true;
      const q = input.query.trim().toLowerCase();
      return [row.name, row.email, row.role, row.tier].some((value) =>
        String(value ?? "").toLowerCase().includes(q)
      );
    })
    .map((row) => {
      const fleetId = fleetOwnerMap.get(row.userId);
      const counts = (fleetId ? vehicleCountMap.get(fleetId) : null) ?? {
        activeVehicleCount: 0,
        billableVehicleCount: 0,
      };
      return {
        ...row,
        tier: normalizeSubscriptionTier(row.tier),
        billingStatusLabel: getBillingStatusLabel(row.billingStatus as BillingStatus),
        activeVehicleCount: counts.activeVehicleCount,
        billableVehicleCount: counts.billableVehicleCount,
        trialActive: Boolean(row.trialEnd && row.trialEnd.getTime() > Date.now()),
      };
    });

  const quoteRequests = await db
    .select()
    .from(fleetQuoteRequests)
    .orderBy(desc(fleetQuoteRequests.createdAt));

  const alerts = await db
    .select()
    .from(adminAlerts)
    .orderBy(desc(adminAlerts.createdAt));

  return {
    accounts: filteredAccounts,
    quoteRequests,
    adminAlerts: alerts,
  };
}

export function getPlanSummary(state: SubscriptionState) {
  const effectivePlan = SUBSCRIPTION_PLANS[state.effectiveTier];
  const selectedPlan = SUBSCRIPTION_PLANS[state.tier];
  const pricing =
    state.effectiveTier === "pro"
      ? calculateProPricing({
          activeVehicleCount: 0,
          cadence: state.billingCadence,
        })
      : null;

  return {
    ...state,
    selectedPlan,
    effectivePlan,
    pricing,
    restrictedBecauseOfBilling: state.tier !== "free" && state.effectiveTier === "free",
  };
}
