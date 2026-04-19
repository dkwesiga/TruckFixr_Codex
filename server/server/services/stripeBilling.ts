import crypto from "crypto";
import { ENV } from "../_core/env";
import { BillingStatus, SubscriptionTier } from "../../shared/subscription";

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
  items?: {
    data?: Array<{
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
  return Boolean(ENV.stripeSecretKey);
}

export function getPriceIdForTier(tier: SubscriptionTier) {
  if (tier === "pro") return ENV.stripePriceProMonthly;
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
  successUrl: string;
  cancelUrl: string;
}) {
  const priceId = getPriceIdForTier(input.tier);
  if (!priceId) {
    throw new Error(`Stripe price is not configured for the ${input.tier} plan.`);
  }

  return stripeRequest<StripeCheckoutSession>("/v1/checkout/sessions", {
    form: {
      mode: "subscription",
      customer: input.customerId,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: input.userId,
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": 1,
      "metadata[userId]": input.userId,
      "metadata[tier]": input.tier,
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
  let tier: SubscriptionTier = "free";
  if (priceId && priceId === ENV.stripePriceFleetMonthly) {
    tier = "fleet";
  } else if (priceId && priceId === ENV.stripePriceProMonthly) {
    tier = "pro";
  } else if (subscription.metadata?.tier === "fleet" || subscription.metadata?.tier === "pro") {
    tier = subscription.metadata.tier;
  }

  return {
    tier,
    billingStatus: (subscription.status as BillingStatus) ?? "active",
    stripeCustomerId: subscription.customer ?? null,
    stripeSubscriptionId: subscription.id,
    currentPeriodStart: subscription.current_period_start
      ? new Date(subscription.current_period_start * 1000)
      : null,
    currentPeriodEnd: subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000)
      : null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
  };
}

export function isStripeInvoiceEvent(object: Record<string, unknown>): object is StripeInvoice {
  return typeof object.id === "string" && typeof object.customer === "string";
}

export function isStripeSubscriptionEvent(object: Record<string, unknown>): object is StripeSubscription {
  return typeof object.id === "string" && typeof object.customer === "string" && typeof object.status === "string";
}
