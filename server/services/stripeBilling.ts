import crypto from "crypto";
import { ENV } from "../_core/env";
import {
  BillingCadence,
  BillingStatus,
  PRO_MINIMUM_BILLABLE_ACTIVE_VEHICLES,
  SubscriptionTier,
} from "../../shared/billing";

type StripeCustomer = {
  id: string;
  email?: string | null;
  name?: string | null;
  metadata?: Record<string, string>;
};

type StripeCheckoutSession = {
  id: string;
  url: string | null;
  customer: string | null;
  subscription?: string | null;
  metadata?: Record<string, string>;
  client_reference_id?: string | null;
};

type StripePortalSession = {
  id: string;
  url: string;
};

type StripeSubscription = {
  id: string;
  customer: string;
  status: BillingStatus | string;
  cancel_at_period_end?: boolean;
  current_period_start?: number;
  current_period_end?: number;
  trial_start?: number | null;
  trial_end?: number | null;
  items?: {
    data?: Array<{
      id?: string;
      quantity?: number | null;
      price?: {
        id?: string;
        lookup_key?: string | null;
      };
    }>;
  };
  metadata?: Record<string, string>;
};

type StripeInvoice = {
  id: string;
  customer: string;
  subscription?: string | null;
};

type StripeEvent = {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
};

function getStripeHeaders(contentType: string) {
  if (!ENV.stripeSecretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }

  return {
    Authorization: `Bearer ${ENV.stripeSecretKey}`,
    "Content-Type": contentType,
    "Stripe-Version": "2026-02-25.clover",
  };
}

function encodeForm(data: Record<string, string | number | boolean | null | undefined>) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined || value === "") continue;
    params.append(key, String(value));
  }

  return params.toString();
}

async function stripeRequest<T>(
  path: string,
  init?: {
    method?: "GET" | "POST";
    form?: Record<string, string | number | boolean | null | undefined>;
  }
) {
  const method = init?.method ?? "POST";
  const body = method === "POST" ? encodeForm(init?.form ?? {}) : undefined;

  const response = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers: getStripeHeaders("application/x-www-form-urlencoded"),
    body,
  });

  const payloadText = await response.text();
  const payload = payloadText ? JSON.parse(payloadText) : {};

  if (!response.ok) {
    const detail =
      payload?.error?.message || `${response.status} ${response.statusText}` || "Stripe request failed";
    throw new Error(detail);
  }

  return payload as T;
}

export function isStripeConfigured() {
  return Boolean(ENV.stripeSecretKey && ENV.stripeWebhookSecret);
}

export function getPriceIdForTier(tier: SubscriptionTier, cadence: BillingCadence = "monthly") {
  if (tier === "pro") {
    return cadence === "annual" ? ENV.stripePriceProAnnual : ENV.stripePriceProMonthly;
  }
  if (tier === "fleet") return ENV.stripePriceFleetMonthly;
  return "";
}

export async function createStripeCustomer(input: {
  email: string;
  name?: string | null;
  userId: number;
}) {
  return stripeRequest<StripeCustomer>("/v1/customers", {
    form: {
      email: input.email,
      name: input.name ?? undefined,
      "metadata[userId]": input.userId,
    },
  });
}

export async function createStripeCheckoutSession(input: {
  customerId: string;
  userId: number;
  tier: SubscriptionTier;
  billingCadence: BillingCadence;
  activeVehicleCount: number;
  successUrl: string;
  cancelUrl: string;
}) {
  const priceId = getPriceIdForTier(input.tier, input.billingCadence);
  if (!priceId) {
    throw new Error(`Stripe price is not configured for the ${input.tier} plan.`);
  }

  const quantity =
    input.tier === "pro"
      ? Math.max(PRO_MINIMUM_BILLABLE_ACTIVE_VEHICLES, Math.max(0, Math.floor(input.activeVehicleCount || 0)))
      : 1;

  return stripeRequest<StripeCheckoutSession>("/v1/checkout/sessions", {
    form: {
      mode: "subscription",
      customer: input.customerId,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: input.userId,
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": quantity,
      "subscription_data[trial_period_days]": input.tier === "pro" ? 14 : undefined,
      "metadata[userId]": input.userId,
      "metadata[tier]": input.tier,
      "metadata[billingCadence]": input.billingCadence,
      "metadata[quantity]": quantity,
      allow_promotion_codes: true,
    },
  });
}

export async function createStripePortalSession(input: {
  customerId: string;
  returnUrl: string;
}) {
  return stripeRequest<StripePortalSession>("/v1/billing_portal/sessions", {
    form: {
      customer: input.customerId,
      return_url: input.returnUrl,
    },
  });
}

export async function retrieveStripeSubscription(subscriptionId: string) {
  return stripeRequest<StripeSubscription>(`/v1/subscriptions/${subscriptionId}`, {
    method: "GET",
  });
}

export async function updateStripeSubscriptionQuantity(input: {
  subscriptionId: string;
  quantity: number;
  priceId?: string | null;
  prorationBehavior?: "create_prorations" | "always_invoice" | "none";
}) {
  const subscription = await retrieveStripeSubscription(input.subscriptionId);
  const item = subscription.items?.data?.[0];
  if (!item?.id) {
    throw new Error("Stripe subscription item could not be resolved for quantity update.");
  }

  return stripeRequest<StripeSubscription>(`/v1/subscriptions/${input.subscriptionId}`, {
    form: {
      "items[0][id]": item.id,
      "items[0][price]": input.priceId ?? item.price?.id ?? undefined,
      "items[0][quantity]": input.quantity,
      proration_behavior: input.prorationBehavior ?? "create_prorations",
    },
  });
}

export async function retrieveStripeCheckoutSession(sessionId: string) {
  return stripeRequest<StripeCheckoutSession>(`/v1/checkout/sessions/${sessionId}`, {
    method: "GET",
  });
}

export async function listStripeSubscriptionsForCustomer(customerId: string) {
  const response = await stripeRequest<{ data: StripeSubscription[] }>(
    `/v1/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=5`,
    { method: "GET" }
  );
  return response.data ?? [];
}

export function verifyStripeWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined) {
  if (!ENV.stripeWebhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  }
  if (!signatureHeader) {
    throw new Error("Missing Stripe-Signature header");
  }

  const parts = signatureHeader.split(",").map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const signatures = parts
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3))
    .filter(Boolean);

  if (!timestamp || signatures.length === 0) {
    throw new Error("Invalid Stripe-Signature header");
  }

  const ageSeconds = Math.floor(Date.now() / 1000) - Number(timestamp);
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) {
    throw new Error("Stripe webhook signature timestamp is outside the tolerance window");
  }

  const payload = `${timestamp}.${rawBody.toString("utf8")}`;
  const expectedSignature = crypto
    .createHmac("sha256", ENV.stripeWebhookSecret)
    .update(payload, "utf8")
    .digest("hex");

  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  const matches = signatures.some((signature) => {
    const signatureBuffer = Buffer.from(signature, "utf8");
    return (
      signatureBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
    );
  });

  if (!matches) {
    throw new Error("Stripe webhook signature verification failed");
  }

  return JSON.parse(rawBody.toString("utf8")) as StripeEvent;
}

export function getSubscriptionSnapshotFromStripeSubscription(subscription: StripeSubscription) {
  const priceId = subscription.items?.data?.[0]?.price?.id ?? "";
  const quantity = subscription.items?.data?.[0]?.quantity ?? null;
  let tier: SubscriptionTier = "free";
  let billingCadence: BillingCadence = "monthly";
  if (priceId && priceId === ENV.stripePriceFleetMonthly) {
    tier = "fleet";
  } else if (priceId && priceId === ENV.stripePriceProAnnual) {
    tier = "pro";
    billingCadence = "annual";
  } else if (priceId && priceId === ENV.stripePriceProMonthly) {
    tier = "pro";
    billingCadence = "monthly";
  } else if (subscription.metadata?.tier === "fleet" || subscription.metadata?.tier === "pro") {
    tier = subscription.metadata.tier;
  }

  if (subscription.metadata?.billingCadence === "annual") {
    billingCadence = "annual";
  }

  return {
    tier,
    billingCadence,
    billingStatus: (subscription.status as BillingStatus) ?? "active",
    stripeCustomerId: subscription.customer ?? null,
    stripeSubscriptionId: subscription.id,
    stripePriceId: priceId || null,
    currentPeriodStart: subscription.current_period_start
      ? new Date(subscription.current_period_start * 1000)
      : null,
    currentPeriodEnd: subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000)
      : null,
    trialStart: subscription.trial_start ? new Date(subscription.trial_start * 1000) : null,
    trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
    quantity,
  };
}

export function isStripeInvoiceEvent(object: Record<string, unknown>): object is StripeInvoice {
  return typeof object.id === "string" && typeof object.customer === "string";
}

export function isStripeSubscriptionEvent(object: Record<string, unknown>): object is StripeSubscription {
  return typeof object.id === "string" && typeof object.customer === "string" && typeof object.status === "string";
}
