import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { ENV } from "../../server/_core/env";
import { processStripeWebhookEvent } from "../../server/_core/stripeBillingRoutes";
import {
  createStripeCustomer,
  createTruckFixrCheckoutSession,
} from "../../server/services/stripeBilling";
import {
  getMockStripeSubscriptionFixture,
  getStripePriceResolutionTarget,
  getStripeReadinessReport,
  getStripeVerificationPriceConfig,
  normalizeStripeVerificationMode,
  setMockStripeSubscriptionCompanyId,
} from "../../server/services/stripeReadiness";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function encodeForm(data: Record<string, string | number | boolean | null | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined || value === "") continue;
    params.append(key, String(value));
  }
  return params.toString();
}

function parseMode() {
  const modeArg = process.argv.find((value) => value.startsWith("--mode="));
  return normalizeStripeVerificationMode(modeArg?.split("=", 2)[1]);
}

function isStripeTestSecretKey(value: string | undefined | null) {
  return typeof value === "string" && /^sk_test_/i.test(value);
}

async function stripeRequest<T>(
  path: string,
  init?: {
    method?: "GET" | "POST" | "DELETE";
    form?: Record<string, string | number | boolean | null | undefined>;
  }
) {
  assert(ENV.stripeSecretKey, "STRIPE_SECRET_KEY is required for live Stripe verification.");

  const method = init?.method ?? "POST";
  const response = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${ENV.stripeSecretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": "2026-02-25.clover",
    },
    body: method === "GET" || method === "DELETE" ? undefined : encodeForm(init?.form ?? {}),
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const detail =
      payload?.error?.message || `${response.status} ${response.statusText}` || "Stripe request failed";
    throw new Error(detail);
  }

  return payload as T;
}

async function ensureVerificationPrice(
  planKey: "owner_operator" | "small_fleet" | "fleet_growth" | "fleet_pro",
  billingInterval: "monthly" | "annual"
) {
  const target = getStripePriceResolutionTarget(planKey, billingInterval);
  if (target.priceId) {
    return target.priceId;
  }

  const existing = await stripeRequest<{ data?: Array<{ id: string }> }>(
    `/v1/prices?lookup_keys[]=${encodeURIComponent(target.lookupKey)}&active=true&limit=1`,
    { method: "GET" }
  );
  const existingPriceId = existing.data?.[0]?.id ?? null;
  if (existingPriceId) {
    return existingPriceId;
  }

  const config = getStripeVerificationPriceConfig(planKey, billingInterval);
  assert(
    typeof config.amountCad === "number" && Number.isFinite(config.amountCad),
    `No numeric plan price is defined for ${planKey} (${billingInterval}).`
  );

  const created = await stripeRequest<{ id: string }>("/v1/prices", {
    form: {
      currency: config.currency,
      unit_amount: Math.round(config.amountCad * 100),
      lookup_key: config.lookupKey,
      nickname: config.nickname,
      "recurring[interval]": config.interval,
      "recurring[interval_count]": config.intervalCount,
      "product_data[name]": `TruckFixr ${config.nickname}`,
      "product_data[metadata][product_context]": "truckfixr_fleet_ai",
      "product_data[metadata][plan_key]": planKey,
      "product_data[metadata][billing_interval]": billingInterval,
      "metadata[product_context]": "truckfixr_fleet_ai",
      "metadata[plan_key]": planKey,
      "metadata[billing_interval]": billingInterval,
    },
  });

  assert(created.id, `Failed to create verification Stripe price for ${planKey} (${billingInterval}).`);
  return created.id;
}

async function insertTemporaryBillingFixture(pool: Pool, suffix: string) {
  const email = `stripe-verify-${suffix}@truckfixr.test`;
  const openId = `stripe-verify-${suffix}`;

  const userInsert = await pool.query<{ id: number }>(
    `
      INSERT INTO "users" (
        "openId", "email", "name", "emailVerified", "role", "subscriptionTier",
        "billingCadence", "billingStatus", "createdAt", "updatedAt", "lastSignedIn"
      )
      VALUES ($1, $2, $3, true, 'owner', 'free', 'monthly', 'active', now(), now(), now())
      RETURNING "id"
    `,
    [openId, email, `Stripe Verify ${suffix}`]
  );

  const userId = userInsert.rows[0]?.id ?? null;
  assert(userId, "Failed to insert temporary Stripe verification user.");

  const fleetInsert = await pool.query<{ id: number }>(
    `
      INSERT INTO "fleets" (
        "name", "ownerId", "companyEmail", "inviteCode", "subscriptionOwnerUserId",
        "subscriptionStatus", "planName", "billingInterval", "billingStatus",
        "paidExtraTrailerQuantity", "aiSessionsUsedCurrentPeriod", "isTrial", "isPaidPilot",
        "createdAt", "updatedAt"
      )
      VALUES ($1, $2, $3, $4, $2, 'active', 'free_trial', 'trial', 'trialing', 0, 0, false, false, now(), now())
      RETURNING "id"
    `,
    [`Stripe Verify Fleet ${suffix}`, userId, `stripe-fleet-${suffix}@truckfixr.test`, `STRIPE${suffix}`]
  );

  const fleetId = fleetInsert.rows[0]?.id ?? null;
  assert(fleetId, "Failed to insert temporary Stripe verification fleet.");

  await pool.query(
    `
      INSERT INTO "companyMemberships" ("fleetId", "userId", "role", "status", "approvedByUserId", "joinedAt", "createdAt", "updatedAt")
      VALUES ($1, $2, 'owner', 'active', $2, now(), now(), now())
    `,
    [fleetId, userId]
  );

  return { userId, fleetId, email };
}

async function assertSyncedState(pool: Pool, fleetId: number) {
  const subscriptionRow = await pool.query<{
    tier: string;
    billingStatus: string;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
  }>(
    `
      SELECT "tier", "billingStatus", "stripeCustomerId", "stripeSubscriptionId"
      FROM "subscriptions"
      WHERE "fleetId" = $1
      ORDER BY "updatedAt" DESC
      LIMIT 1
    `,
    [fleetId]
  );

  const fleetRow = await pool.query<{
    planName: string;
    billingInterval: string;
    billingStatus: string;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
  }>(
    `
      SELECT "planName", "billingInterval", "billingStatus", "stripeCustomerId", "stripeSubscriptionId"
      FROM "fleets"
      WHERE "id" = $1
      LIMIT 1
    `,
    [fleetId]
  );

  const latestSubscription = subscriptionRow.rows[0];
  const latestFleet = fleetRow.rows[0];
  assert(latestSubscription, "Webhook processing did not persist a subscription row.");
  assert(latestFleet, "Webhook processing did not update the fleet row.");
  assert(latestSubscription.tier === "pro", "Expected small_fleet checkout to map to the pro tier.");
  assert(latestSubscription.billingStatus === "active", "Expected active billing status after checkout sync.");
  assert(latestFleet.planName === "small_fleet", "Expected fleet planName to sync from Stripe metadata.");
  assert(latestFleet.billingInterval === "monthly", "Expected fleet billing interval to remain monthly.");
}

async function assertPastDue(pool: Pool, fleetId: number) {
  const pastDueRow = await pool.query<{ billingStatus: string }>(
    `SELECT "billingStatus" FROM "fleets" WHERE "id" = $1 LIMIT 1`,
    [fleetId]
  );

  assert(
    pastDueRow.rows[0]?.billingStatus === "past_due",
    "Expected invoice.payment_failed to mark the fleet as past_due."
  );
}

async function runMockVerification(pool: Pool, suffix: string) {
  const fixture = await insertTemporaryBillingFixture(pool, suffix);
  const mockSubscription = setMockStripeSubscriptionCompanyId(
    getMockStripeSubscriptionFixture(),
    fixture.fleetId
  );

  await processStripeWebhookEvent(
    {
      id: `evt_checkout_mock_${suffix}`,
      type: "checkout.session.completed",
      data: {
        object: {
          customer: mockSubscription.customer,
          subscription: mockSubscription.id,
          client_reference_id: String(fixture.userId),
        },
      },
    },
    {
      loadSubscription: async (subscriptionId: string) => {
        assert(subscriptionId === mockSubscription.id, "Unexpected mock subscription lookup.");
        return mockSubscription as never;
      },
    }
  );

  await assertSyncedState(pool, fixture.fleetId);

  await processStripeWebhookEvent(
    {
      id: `evt_invoice_failed_mock_${suffix}`,
      type: "invoice.payment_failed",
      data: {
        object: {
          id: `in_failed_mock_${suffix}`,
          customer: mockSubscription.customer,
          subscription: mockSubscription.id,
        },
      },
    },
    {
      loadSubscription: async (subscriptionId: string) => {
        assert(subscriptionId === mockSubscription.id, "Unexpected mock subscription lookup.");
        return mockSubscription as never;
      },
    }
  );

  await assertPastDue(pool, fixture.fleetId);

  return {
    mode: "mock" as const,
    stripeCustomerId: mockSubscription.customer,
    stripeSubscriptionId: mockSubscription.id,
    verified: [
      "mocked webhook subscription sync",
      "mocked company billing ownership sync",
      "mocked invoice payment failure billing downgrade",
    ],
    fixture,
  };
}

async function runLiveVerification(pool: Pool, suffix: string) {
  const readiness = getStripeReadinessReport({ requireLiveVerification: true });
  assert(readiness.ok, `Stripe live verification is blocked:\n- ${readiness.errors.join("\n- ")}`);
  assert(ENV.stripeSecretKey, "STRIPE_SECRET_KEY is required for live Stripe verification.");
  assert(
    isStripeTestSecretKey(ENV.stripeSecretKey),
    "Live Stripe verification requires a Stripe test-mode secret key (`sk_test_...`). Refusing to mutate a live Stripe account."
  );
  const verificationSmallFleetMonthlyPriceId = await ensureVerificationPrice("small_fleet", "monthly");

  const fixture = await insertTemporaryBillingFixture(pool, suffix);
  let stripeCustomerId: string | null = null;
  let stripeSubscriptionId: string | null = null;
  let paymentMethodId: string | null = null;

  try {
    const customer = await createStripeCustomer({
      email: fixture.email,
      name: `Stripe Verify ${suffix}`,
      userId: fixture.userId,
    });
    stripeCustomerId = customer.id;
    assert(stripeCustomerId, "Stripe customer creation did not return an id.");

    const paymentMethod = await stripeRequest<{ id: string }>("/v1/payment_methods", {
      form: {
        type: "card",
        "card[token]": "tok_visa",
      },
    });
    paymentMethodId = paymentMethod.id;
    assert(paymentMethodId, "Stripe test payment method creation did not return an id.");

    await stripeRequest(`/v1/payment_methods/${paymentMethodId}/attach`, {
      form: {
        customer: stripeCustomerId,
      },
    });

    await stripeRequest(`/v1/customers/${stripeCustomerId}`, {
      form: {
        "invoice_settings[default_payment_method]": paymentMethodId,
      },
    });

    const checkout = await createTruckFixrCheckoutSession({
      customerId: stripeCustomerId,
      companyId: fixture.fleetId,
      planKey: "small_fleet",
      billingInterval: "monthly",
      successUrl: `${ENV.appBaseUrl}/profile?subscription=success`,
      cancelUrl: `${ENV.appBaseUrl}/pricing?subscription=cancelled`,
    });
    assert(checkout.url, "Stripe checkout session did not return a checkout URL.");

    const liveSubscription = await stripeRequest<{
      id: string;
      customer: string;
    }>("/v1/subscriptions", {
      form: {
        customer: stripeCustomerId,
        "items[0][price]": verificationSmallFleetMonthlyPriceId,
        "metadata[company_id]": fixture.fleetId,
        "metadata[plan_key]": "small_fleet",
        "metadata[billing_interval]": "monthly",
        "metadata[product_context]": "truckfixr_fleet_ai",
        "metadata[powered_vehicle_limit]": 5,
        "metadata[included_trailer_limit]": 5,
        "metadata[extra_trailer_quantity]": 0,
        collection_method: "charge_automatically",
      },
    });
    stripeSubscriptionId = liveSubscription.id;
    assert(stripeSubscriptionId, "Live Stripe test subscription did not return an id.");

    await processStripeWebhookEvent({
      id: `evt_checkout_${suffix}`,
      type: "checkout.session.completed",
      data: {
        object: {
          customer: stripeCustomerId,
          subscription: stripeSubscriptionId,
          client_reference_id: String(fixture.userId),
        },
      },
    });

    await assertSyncedState(pool, fixture.fleetId);

    await processStripeWebhookEvent({
      id: `evt_invoice_failed_${suffix}`,
      type: "invoice.payment_failed",
      data: {
        object: {
          id: `in_failed_${suffix}`,
          customer: stripeCustomerId,
          subscription: stripeSubscriptionId,
        },
      },
    });

    await assertPastDue(pool, fixture.fleetId);

    return {
      mode: "live" as const,
      checkoutUrl: checkout.url,
      stripeCustomerId,
      stripeSubscriptionId,
      verified: [
        "checkout session creation",
        "company billing ownership sync",
        "fleet plan metadata sync",
        "invoice payment failure billing downgrade",
      ],
      fixture,
    };
  } finally {
    if (stripeSubscriptionId) {
      await stripeRequest(`/v1/subscriptions/${stripeSubscriptionId}`, {
        method: "DELETE",
      }).catch(() => undefined);
    }
    if (paymentMethodId) {
      await stripeRequest(`/v1/payment_methods/${paymentMethodId}/detach`, {
        form: {},
      }).catch(() => undefined);
    }
    if (stripeCustomerId) {
      await stripeRequest(`/v1/customers/${stripeCustomerId}`, {
        method: "DELETE",
      }).catch(() => undefined);
    }
  }
}

async function cleanupFixture(pool: Pool, userId: number | null, fleetId: number | null) {
  if (fleetId) {
    await pool.query(`DELETE FROM "companyMemberships" WHERE "fleetId" = $1`, [fleetId]).catch(() => undefined);
    await pool.query(`DELETE FROM "subscriptions" WHERE "fleetId" = $1`, [fleetId]).catch(() => undefined);
    await pool.query(`DELETE FROM "fleets" WHERE "id" = $1`, [fleetId]).catch(() => undefined);
  }
  if (userId) {
    await pool.query(`DELETE FROM "users" WHERE "id" = $1`, [userId]).catch(() => undefined);
  }
}

async function main() {
  assert(ENV.databaseUrl, "DATABASE_URL is required for Stripe verification.");

  const readiness = getStripeReadinessReport({ requireLiveVerification: parseMode() === "live" });
  const mode = parseMode();
  const pool = new Pool({
    connectionString: ENV.databaseUrl,
    ssl: /supabase\.com/i.test(ENV.databaseUrl) ? { rejectUnauthorized: false } : undefined,
  });

  const suffix = randomUUID().slice(0, 8);
  let userId: number | null = null;
  let fleetId: number | null = null;

  try {
    const result =
      mode === "mock"
        ? await runMockVerification(pool, suffix)
        : await runLiveVerification(pool, suffix);

    userId = result.fixture.userId;
    fleetId = result.fixture.fleetId;

    console.log(
      JSON.stringify(
        {
          ok: true,
          mode,
          readiness: {
            ok: readiness.ok,
            errors: readiness.errors,
            warnings: readiness.warnings,
          },
          checkoutUrl: "checkoutUrl" in result ? result.checkoutUrl : undefined,
          stripeCustomerId: result.stripeCustomerId,
          stripeSubscriptionId: result.stripeSubscriptionId,
          verified: result.verified,
        },
        null,
        2
      )
    );
  } finally {
    await cleanupFixture(pool, userId, fleetId);
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
