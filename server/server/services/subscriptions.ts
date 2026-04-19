import { and, desc, eq, gte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { aiUsageLogs, subscriptions, users, vehicles } from "../../drizzle/schema";
import {
  getDefaultFleetIdForUser,
  getPilotAccessOverview,
  markPilotAccessConvertedToPaid,
  reconcilePilotAccessForUser,
  type PilotAccessOverview,
} from "./pilotAccess";
import {
  BillingStatus,
  getEffectiveTier,
  getPlanRestrictionMessage,
  hasPaidAccess,
  isPaidTier,
  SUBSCRIPTION_PLANS,
  SubscriptionTier,
} from "../../shared/subscription";

export type SubscriptionState = {
  tier: SubscriptionTier;
  billingStatus: BillingStatus;
  effectiveTier: SubscriptionTier;
  activeFleetId: number;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
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
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
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
      billingStatus: users.billingStatus,
      stripeCustomerId: users.stripeCustomerId,
      stripeSubscriptionId: users.stripeSubscriptionId,
      currentPeriodStart: users.currentPeriodStart,
      currentPeriodEnd: users.currentPeriodEnd,
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

  const tier = (latestSubscription?.tier ?? userRow?.subscriptionTier ?? "free") as SubscriptionTier;
  const billingStatus = (latestSubscription?.billingStatus ??
    userRow?.billingStatus ??
    "active") as BillingStatus;
  const stripeCustomerId = latestSubscription?.stripeCustomerId ?? userRow?.stripeCustomerId ?? null;
  const stripeSubscriptionId =
    latestSubscription?.stripeSubscriptionId ?? userRow?.stripeSubscriptionId ?? null;
  const currentPeriodStart =
    latestSubscription?.currentPeriodStart ?? userRow?.currentPeriodStart ?? null;
  const currentPeriodEnd = latestSubscription?.currentPeriodEnd ?? userRow?.currentPeriodEnd ?? null;
  const cancelAtPeriodEnd =
    latestSubscription?.cancelAtPeriodEnd ?? userRow?.cancelAtPeriodEnd ?? false;
  const activeFleetId = await getDefaultFleetIdForUser(userId);

  if (tier === "pilot" && pilotAccess?.status !== "active") {
    await syncSubscriptionState({
      userId,
      tier: "free",
      billingStatus: "active",
      stripeCustomerId,
      stripeSubscriptionId: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
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
    stripeCustomerId,
    stripeSubscriptionId,
    currentPeriodStart,
    currentPeriodEnd,
    cancelAtPeriodEnd,
    pilotAccess: pilotAccess ?? (tier === "pilot" ? await getPilotAccessOverview(userId) : null),
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
  billingStatus: BillingStatus;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
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
    tier: input.tier,
    billingStatus: input.billingStatus,
    currentPeriodStart: input.currentPeriodStart ?? null,
    currentPeriodEnd: input.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
    updatedAt: now,
  };

  const existing = (
    await db.select().from(subscriptions).where(eq(subscriptions.userId, input.userId)).limit(1)
  )[0];
  const currentTier = (existing?.tier ?? (
    await db
      .select({ subscriptionTier: users.subscriptionTier })
      .from(users)
      .where(eq(users.id, input.userId))
      .limit(1)
  )[0]?.subscriptionTier ?? "free") as SubscriptionTier;

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
      billingStatus: input.billingStatus,
      stripeCustomerId: input.stripeCustomerId ?? null,
      stripeSubscriptionId: input.stripeSubscriptionId ?? null,
      currentPeriodStart: input.currentPeriodStart ?? null,
      currentPeriodEnd: input.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
      updatedAt: now,
    })
    .where(eq(users.id, input.userId));

  if (currentTier === "pilot" && (input.tier === "pro" || input.tier === "fleet")) {
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
    billingStatus: current.billingStatus,
    stripeCustomerId,
    stripeSubscriptionId: current.stripeSubscriptionId,
    currentPeriodStart: current.currentPeriodStart,
    currentPeriodEnd: current.currentPeriodEnd,
    cancelAtPeriodEnd: current.cancelAtPeriodEnd,
  });
}

export async function getUsageSummary(userId: number, fleetId?: number) {
  const db = await getDb();
  if (!db) {
    return { diagnosticsThisMonth: 0, vehiclesInFleet: 0 };
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

  const vehicleRows = fleetId
    ? await db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.fleetId, fleetId))
    : [];

  return {
    diagnosticsThisMonth: diagnosticRows.length,
    vehiclesInFleet: vehicleRows.length,
  };
}

export async function assertVehicleWithinPlan(input: { userId: number; fleetId: number }) {
  const subscription = await getSubscriptionState(input.userId);
  const plan = SUBSCRIPTION_PLANS[subscription.effectiveTier];
  const usage = await getUsageSummary(input.userId, input.fleetId);
  const vehicleLimit = subscription.pilotAccess?.maxVehicles ?? plan.limits.vehicleCount;

  if (vehicleLimit !== null && usage.vehiclesInFleet >= vehicleLimit) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: getPlanRestrictionMessage("vehicles", subscription.effectiveTier),
    });
  }

  return {
    subscription,
    usage,
    plan,
  };
}

export async function assertDiagnosticsWithinPlan(input: { userId: number; fleetId: number }) {
  const subscription = await getSubscriptionState(input.userId);
  const plan = SUBSCRIPTION_PLANS[subscription.effectiveTier];
  const usage = await getUsageSummary(input.userId, input.fleetId);

  if (
    plan.limits.diagnosticsPerMonth !== null &&
    usage.diagnosticsThisMonth >= plan.limits.diagnosticsPerMonth
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: getPlanRestrictionMessage("diagnostics", subscription.effectiveTier),
    });
  }

  return {
    subscription,
    usage,
    plan,
  };
}

export async function assertUsersWithinPlan(input: { userId: number; fleetId: number }) {
  const subscription = await getSubscriptionState(input.userId);
  const plan = SUBSCRIPTION_PLANS[subscription.effectiveTier];
  const db = await getDb();

  const userLimit = subscription.pilotAccess?.maxUsers ?? plan.limits.userCount;
  if (userLimit === null || !db) {
    return {
      subscription,
      currentUsers: subscription.pilotAccess?.usersUsed ?? 0,
      limit: userLimit,
      plan,
    };
  }

  const managedUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.managerUserId, input.userId));

  const currentUsers = subscription.pilotAccess?.usersUsed ?? managedUsers.length + 1;

  if (currentUsers >= userLimit) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: getPlanRestrictionMessage("users", subscription.effectiveTier),
    });
  }

  return {
    subscription,
    currentUsers,
    limit: userLimit,
    plan,
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

export function getPlanSummary(state: SubscriptionState) {
  const effectivePlan = SUBSCRIPTION_PLANS[state.effectiveTier];
  const selectedPlan = SUBSCRIPTION_PLANS[state.tier];

  return {
    ...state,
    selectedPlan,
    effectivePlan,
    restrictedBecauseOfBilling: state.tier !== "free" && state.effectiveTier === "free",
  };
}
