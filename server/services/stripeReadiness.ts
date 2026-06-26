import type { BillingCadence, SubscriptionTier } from "../../shared/billing";
import {
  getTruckFixrPlan,
  getTruckFixrStripeLookupKey,
  type BillingInterval,
  type PlanKey,
} from "../../shared/truckfixrPricing";
import { ENV } from "../_core/env";

type StripeEnvDescriptor = {
  canonicalName: string;
  aliases?: string[];
  description: string;
  required: boolean;
  optional?: boolean;
};

type StripeEnvResolution = StripeEnvDescriptor & {
  value: string;
  sourceName: string | null;
  aliasUsed: boolean;
  present: boolean;
};

type StripeReadinessOptions = {
  requireLiveVerification?: boolean;
};

type RequiredPlanKey =
  Extract<PlanKey, "owner_operator" | "small_fleet" | "fleet_growth" | "fleet_pro">;

export type StripeReadinessReport = {
  ok: boolean;
  environment: string;
  hasAnyConfiguredValues: boolean;
  errors: string[];
  warnings: string[];
  checks: Array<{
    key: string;
    required: boolean;
    present: boolean;
    sourceName: string | null;
    aliasUsed: boolean;
    description: string;
  }>;
};

export type StripeResolvedPriceTarget = {
  priceId: string | null;
  lookupKey: string;
  source: "env_price_id" | "env_lookup_key" | "default_lookup_key";
};

const REQUIRED_PLAN_ENV_DESCRIPTORS: Record<
  `${Extract<PlanKey, "owner_operator" | "small_fleet" | "fleet_growth" | "fleet_pro">}:${BillingCadence}`,
  StripeEnvDescriptor
> = {
  "owner_operator:monthly": {
    canonicalName: "STRIPE_PRICE_OWNER_OPERATOR_MONTHLY",
    aliases: ["STRIPE_PRICE_PRO_MONTHLY"],
    description: "Owner-Operator monthly checkout price",
    required: true,
  },
  "owner_operator:annual": {
    canonicalName: "STRIPE_PRICE_OWNER_OPERATOR_ANNUAL",
    aliases: ["STRIPE_PRICE_PRO_ANNUAL"],
    description: "Owner-Operator annual checkout price",
    required: true,
  },
  "small_fleet:monthly": {
    canonicalName: "STRIPE_PRICE_SMALL_FLEET_MONTHLY",
    aliases: ["STRIPE_PRICE_PRO_MONTHLY"],
    description: "Small Fleet monthly checkout price",
    required: true,
  },
  "small_fleet:annual": {
    canonicalName: "STRIPE_PRICE_SMALL_FLEET_ANNUAL",
    aliases: ["STRIPE_PRICE_PRO_ANNUAL"],
    description: "Small Fleet annual checkout price",
    required: true,
  },
  "fleet_growth:monthly": {
    canonicalName: "STRIPE_PRICE_FLEET_GROWTH_MONTHLY",
    aliases: ["STRIPE_PRICE_FLEET_MONTHLY"],
    description: "Fleet Growth monthly checkout price",
    required: true,
  },
  "fleet_growth:annual": {
    canonicalName: "STRIPE_PRICE_FLEET_GROWTH_ANNUAL",
    description: "Fleet Growth annual checkout price",
    required: true,
  },
  "fleet_pro:monthly": {
    canonicalName: "STRIPE_PRICE_FLEET_PRO_MONTHLY",
    aliases: ["STRIPE_PRICE_FLEET_MONTHLY"],
    description: "Fleet Pro monthly checkout price",
    required: true,
  },
  "fleet_pro:annual": {
    canonicalName: "STRIPE_PRICE_FLEET_PRO_ANNUAL",
    description: "Fleet Pro annual checkout price",
    required: true,
  },
};

const OPTIONAL_ENV_DESCRIPTORS: StripeEnvDescriptor[] = [
  {
    canonicalName: "STRIPE_PRICE_FLEET_PILOT_30_DAY",
    description: "30-day fleet pilot checkout price",
    required: false,
    optional: true,
  },
  {
    canonicalName: "STRIPE_PRICE_EXTRA_TRAILER_MONTHLY",
    description: "Extra trailer monthly add-on price",
    required: false,
    optional: true,
  },
];

const REQUIRED_PLAN_ENV_NAMES = new Set(
  Object.values(REQUIRED_PLAN_ENV_DESCRIPTORS).map((descriptor) => descriptor.canonicalName)
);

function readRawEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

function resolveEnv(descriptor: StripeEnvDescriptor): StripeEnvResolution {
  const names = [descriptor.canonicalName, ...(descriptor.aliases ?? [])];

  for (const name of names) {
    const value = readRawEnv(name);
    if (value) {
      return {
        ...descriptor,
        value,
        sourceName: name,
        aliasUsed: name !== descriptor.canonicalName,
        present: true,
      };
    }
  }

  return {
    ...descriptor,
    value: "",
    sourceName: null,
    aliasUsed: false,
    present: false,
  };
}

function looksLikeUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function looksLikeStripeSecretKey(value: string) {
  return /^sk_(test|live)_/i.test(value);
}

function looksLikeStripeWebhookSecret(value: string) {
  return /^whsec_/i.test(value);
}

function looksLikeStripePriceId(value: string) {
  return /^price_/i.test(value);
}

function looksLikeStripeLookupKey(value: string) {
  return /^(lookup:)?[a-z0-9][a-z0-9_-]*$/i.test(value);
}

export function resolveTruckFixrPrice(planKey: PlanKey, cadence: BillingCadence) {
  if (planKey === "free_trial" || planKey === "custom_fleet") {
    return {
      canonicalName: "",
      aliases: [] as string[],
      value: "",
      present: false,
      sourceName: null as string | null,
      aliasUsed: false,
    };
  }

  return resolveEnv(
    REQUIRED_PLAN_ENV_DESCRIPTORS[
      `${planKey}:${cadence}` as keyof typeof REQUIRED_PLAN_ENV_DESCRIPTORS
    ]
  );
}

export function getStripePriceResolutionTarget(
  planKey: Extract<PlanKey, "owner_operator" | "small_fleet" | "fleet_growth" | "fleet_pro">,
  billingInterval: Exclude<BillingInterval, "trial" | "pilot" | "custom">
): StripeResolvedPriceTarget {
  const resolution = resolveTruckFixrPrice(planKey, billingInterval);
  if (resolution.present) {
    const value = resolution.value.trim();
    if (looksLikeStripePriceId(value)) {
      return {
        priceId: value,
        lookupKey: getTruckFixrStripeLookupKey(planKey, billingInterval),
        source: "env_price_id",
      };
    }

    if (looksLikeStripeLookupKey(value)) {
      return {
        priceId: null,
        lookupKey: value.replace(/^lookup:/i, ""),
        source: "env_lookup_key",
      };
    }
  }

  return {
    priceId: null,
    lookupKey: getTruckFixrStripeLookupKey(planKey, billingInterval),
    source: "default_lookup_key",
  };
}

export function getStripeVerificationPriceConfig(
  planKey: Extract<PlanKey, "owner_operator" | "small_fleet" | "fleet_growth" | "fleet_pro">,
  billingInterval: Exclude<BillingInterval, "trial" | "pilot" | "custom">
) {
  const plan = getTruckFixrPlan(planKey);
  const amountCad =
    billingInterval === "annual" ? plan.priceCadAnnual : plan.priceCadMonthly;

  return {
    lookupKey: getTruckFixrStripeLookupKey(planKey, billingInterval),
    nickname: `${plan.name} ${billingInterval}`,
    amountCad,
    currency: "cad" as const,
    interval: billingInterval === "annual" ? "year" : "month",
    intervalCount: 1,
  };
}

export function resolveLegacyTierPrice(tier: SubscriptionTier, cadence: BillingCadence) {
  if (tier === "pro") {
    return resolveEnv({
      canonicalName: cadence === "annual" ? "STRIPE_PRICE_PRO_ANNUAL" : "STRIPE_PRICE_PRO_MONTHLY",
      description: `Legacy ${tier} ${cadence} price`,
      required: true,
    });
  }

  if (tier === "fleet") {
    return resolveEnv({
      canonicalName: "STRIPE_PRICE_FLEET_MONTHLY",
      aliases: ["STRIPE_PRICE_FLEET_PRO_MONTHLY"],
      description: "Legacy fleet monthly price",
      required: true,
    });
  }

  return {
    canonicalName: "",
    aliases: [] as string[],
    description: `Legacy ${tier} ${cadence} price`,
    required: false,
    value: "",
    sourceName: null as string | null,
    aliasUsed: false,
    present: false,
  };
}

export function formatMissingStripePriceMessage(label: string, resolution: { canonicalName: string; aliases?: string[] }) {
  const aliasSuffix =
    resolution.aliases && resolution.aliases.length > 0
      ? ` Legacy aliases currently accepted: ${resolution.aliases.join(", ")}.`
      : "";
  return `Stripe price is not configured for ${label}. Set ${resolution.canonicalName}.${aliasSuffix}`;
}

export function getStripeReadinessReport(
  options: StripeReadinessOptions = {}
): StripeReadinessReport {
  const environment = process.env.NODE_ENV || "development";
  const requireLiveVerification = options.requireLiveVerification ?? false;
  const errors: string[] = [];
  const warnings: string[] = [];
  const appBaseUrl = ENV.appBaseUrl;
  const explicitAppBaseUrl = readRawEnv("APP_BASE_URL");
  const explicitAppBaseUrlAlias =
    readRawEnv("VITE_APP_BASE_URL") ||
    readRawEnv("PUBLIC_APP_URL") ||
    readRawEnv("RENDER_EXTERNAL_URL");
  const hasExplicitAppBaseUrl = Boolean(explicitAppBaseUrl || explicitAppBaseUrlAlias);

  const baseChecks = [
    resolveEnv({
      canonicalName: "STRIPE_SECRET_KEY",
      description: "Stripe API secret key",
      required: true,
    }),
    resolveEnv({
      canonicalName: "STRIPE_WEBHOOK_SECRET",
      description: "Stripe webhook signing secret",
      required: environment !== "development" || requireLiveVerification,
    }),
    resolveEnv({
      canonicalName: "APP_BASE_URL",
      aliases: ["VITE_APP_BASE_URL", "PUBLIC_APP_URL", "RENDER_EXTERNAL_URL"],
      description: "Absolute application base URL for Stripe success/cancel redirects",
      required: true,
    }),
    ...Object.entries(REQUIRED_PLAN_ENV_DESCRIPTORS).map(([key, descriptor]) =>
      resolveEnv({
        ...descriptor,
        description: `${descriptor.description} (${key.replace(":", " ")})`,
      })
    ),
    ...OPTIONAL_ENV_DESCRIPTORS.map(resolveEnv),
  ];

  for (const check of baseChecks) {
    if (
      check.required &&
      !check.present &&
      !REQUIRED_PLAN_ENV_NAMES.has(check.canonicalName) &&
      !(check.canonicalName === "APP_BASE_URL" && looksLikeUrl(appBaseUrl))
    ) {
      errors.push(`${check.canonicalName} is required (${check.description}).`);
    }

    if (check.present && check.aliasUsed && check.sourceName) {
      warnings.push(
        `${check.canonicalName} is using deprecated alias ${check.sourceName}. Migrate to the canonical env name.`
      );
    }
  }

  for (const [key, descriptor] of Object.entries(REQUIRED_PLAN_ENV_DESCRIPTORS)) {
    const [planKey, cadence] = key.split(":") as [RequiredPlanKey, BillingCadence];
    const resolution = resolveTruckFixrPrice(planKey, cadence);

    if (resolution.present) {
      const value = resolution.value.trim();
      if (!looksLikeStripePriceId(value) && !looksLikeStripeLookupKey(value)) {
        errors.push(
          `${resolution.sourceName ?? descriptor.canonicalName} must be a Stripe price id (\`price_...\`) or lookup key for ${descriptor.description.toLowerCase()}.`
        );
      }
      continue;
    }

    const fallbackLookupKey = getTruckFixrStripeLookupKey(planKey, cadence);
    warnings.push(
      `${descriptor.canonicalName} is not explicitly configured; Stripe will use lookup key ${fallbackLookupKey}.`
    );
  }

  const stripeSecretKey = readRawEnv("STRIPE_SECRET_KEY");
  if (stripeSecretKey && !looksLikeStripeSecretKey(stripeSecretKey)) {
    warnings.push("STRIPE_SECRET_KEY does not look like a Stripe secret key (`sk_test_...` or `sk_live_...`).");
  }

  const stripeWebhookSecret = readRawEnv("STRIPE_WEBHOOK_SECRET");
  if (stripeWebhookSecret && !looksLikeStripeWebhookSecret(stripeWebhookSecret)) {
    warnings.push("STRIPE_WEBHOOK_SECRET does not look like a Stripe webhook secret (`whsec_...`).");
  }

  if (appBaseUrl && !looksLikeUrl(appBaseUrl)) {
    errors.push("APP_BASE_URL (or its accepted alias) must be a valid absolute http/https URL.");
  }

  if (!hasExplicitAppBaseUrl && looksLikeUrl(appBaseUrl)) {
    if (environment === "production" || requireLiveVerification) {
      if (/localhost|127\.0\.0\.1/i.test(appBaseUrl)) {
        warnings.push(
          "APP_BASE_URL is not explicitly configured; Stripe redirects are currently falling back to a localhost URL."
        );
      }
    } else {
      warnings.push(
        "APP_BASE_URL is not explicitly configured; local Stripe flows will use the derived local base URL."
      );
    }
  }

  if (!hasExplicitAppBaseUrl && environment === "production" && /localhost|127\.0\.0\.1/i.test(appBaseUrl)) {
    errors.push("APP_BASE_URL must be configured to a non-local absolute URL for live Stripe verification.");
  }

  const hasAnyConfiguredValues = [
    readRawEnv("STRIPE_SECRET_KEY"),
    readRawEnv("STRIPE_WEBHOOK_SECRET"),
    readRawEnv("STRIPE_PRICE_PRO_MONTHLY"),
    readRawEnv("STRIPE_PRICE_OWNER_OPERATOR_MONTHLY"),
    readRawEnv("STRIPE_PRICE_SMALL_FLEET_MONTHLY"),
    readRawEnv("STRIPE_PRICE_FLEET_GROWTH_MONTHLY"),
    readRawEnv("STRIPE_PRICE_FLEET_PRO_MONTHLY"),
  ].some(Boolean);

  return {
    ok: errors.length === 0,
    environment,
    hasAnyConfiguredValues,
    errors,
    warnings,
    checks: baseChecks.map((check) => ({
      key: check.canonicalName,
      required: check.required,
      present: check.present,
      sourceName: check.sourceName,
      aliasUsed: check.aliasUsed,
      description: check.description,
    })),
  };
}

export function getStripeAdminReadinessSummary() {
  const report = getStripeReadinessReport();
  return {
    ok: report.ok,
    environment: report.environment,
    errors: report.errors,
    warnings: report.warnings,
    checks: report.checks.map((check) => ({
      key: check.key,
      required: check.required,
      present: check.present,
      sourceName: check.sourceName,
      aliasUsed: check.aliasUsed,
      description: check.description,
    })),
  };
}

export function normalizeStripeVerificationMode(input: string | undefined) {
  const value = input?.trim().toLowerCase();
  return value === "mock" ? "mock" : "live";
}

export function getMockStripeSubscriptionFixture() {
  return {
    id: "sub_mock_truckfixr",
    customer: "cus_mock_truckfixr",
    status: "active",
    metadata: {
      company_id: "0",
      plan_key: "small_fleet",
      billing_interval: "monthly",
      product_context: "truckfixr_fleet_ai",
      powered_vehicle_limit: "5",
      included_trailer_limit: "5",
      extra_trailer_quantity: "0",
    },
    items: {
      data: [
        {
          price: {
            id: "price_mock_small_fleet_monthly",
          },
          quantity: 1,
        },
      ],
    },
    current_period_start: Math.floor(Date.now() / 1000),
    current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
    cancel_at_period_end: false,
    trial_start: null,
    trial_end: null,
  };
}

export function setMockStripeSubscriptionCompanyId(
  subscription: ReturnType<typeof getMockStripeSubscriptionFixture>,
  companyId: number
) {
  subscription.metadata.company_id = String(companyId);
  return subscription;
}
