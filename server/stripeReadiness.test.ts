import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

function applyRequiredStripeEnv() {
  process.env.STRIPE_SECRET_KEY = "sk_test_example";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_example";
  process.env.APP_BASE_URL = "https://truckfixr.test";
  process.env.STRIPE_PRICE_OWNER_OPERATOR_MONTHLY = "price_owner_monthly";
  process.env.STRIPE_PRICE_OWNER_OPERATOR_ANNUAL = "price_owner_annual";
  process.env.STRIPE_PRICE_SMALL_FLEET_MONTHLY = "price_small_monthly";
  process.env.STRIPE_PRICE_SMALL_FLEET_ANNUAL = "price_small_annual";
  process.env.STRIPE_PRICE_FLEET_GROWTH_MONTHLY = "price_growth_monthly";
  process.env.STRIPE_PRICE_FLEET_GROWTH_ANNUAL = "price_growth_annual";
  process.env.STRIPE_PRICE_FLEET_PRO_MONTHLY = "price_pro_monthly";
  process.env.STRIPE_PRICE_FLEET_PRO_ANNUAL = "price_pro_annual";
}

beforeEach(() => {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV };
  process.env.NODE_ENV = "test";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("stripe readiness", () => {
  it("passes with canonical required env vars", async () => {
    applyRequiredStripeEnv();

    const { getStripeReadinessReport } = await import("./services/stripeReadiness");
    const report = getStripeReadinessReport({ requireLiveVerification: true });

    expect(report.ok).toBe(true);
    expect(report.errors).toEqual([]);
  });

  it("warns when deprecated aliases are used", async () => {
    applyRequiredStripeEnv();
    delete process.env.STRIPE_PRICE_SMALL_FLEET_MONTHLY;
    process.env.STRIPE_PRICE_PRO_MONTHLY = "price_pro_monthly";

    const { getStripeReadinessReport } = await import("./services/stripeReadiness");
    const report = getStripeReadinessReport({ requireLiveVerification: true });

    expect(report.ok).toBe(true);
    expect(report.warnings.some((warning) => warning.includes("STRIPE_PRICE_SMALL_FLEET_MONTHLY"))).toBe(true);
  });

  it("normalizes mock verification mode", async () => {
    const { normalizeStripeVerificationMode } = await import("./services/stripeReadiness");
    expect(normalizeStripeVerificationMode("mock")).toBe("mock");
    expect(normalizeStripeVerificationMode("live")).toBe("live");
    expect(normalizeStripeVerificationMode(undefined)).toBe("live");
  });

  it("falls back to canonical lookup keys when direct Stripe price ids are absent", async () => {
    applyRequiredStripeEnv();
    delete process.env.STRIPE_PRICE_SMALL_FLEET_MONTHLY;

    const { getStripePriceResolutionTarget } = await import("./services/stripeReadiness");
    const target = getStripePriceResolutionTarget("small_fleet", "monthly");

    expect(target.priceId).toBeNull();
    expect(target.lookupKey).toBe("truckfixr_small_fleet_monthly_cad");
    expect(target.source).toBe("default_lookup_key");
  });

  it("treats missing explicit price envs as lookup-key warnings instead of readiness failures", async () => {
    applyRequiredStripeEnv();
    delete process.env.STRIPE_PRICE_OWNER_OPERATOR_MONTHLY;
    delete process.env.STRIPE_PRICE_OWNER_OPERATOR_ANNUAL;
    delete process.env.STRIPE_PRICE_SMALL_FLEET_MONTHLY;
    delete process.env.STRIPE_PRICE_SMALL_FLEET_ANNUAL;
    delete process.env.STRIPE_PRICE_FLEET_GROWTH_MONTHLY;
    delete process.env.STRIPE_PRICE_FLEET_GROWTH_ANNUAL;
    delete process.env.STRIPE_PRICE_FLEET_PRO_MONTHLY;
    delete process.env.STRIPE_PRICE_FLEET_PRO_ANNUAL;

    const { getStripeReadinessReport } = await import("./services/stripeReadiness");
    const report = getStripeReadinessReport({ requireLiveVerification: true });

    expect(report.ok).toBe(true);
    expect(report.errors).toEqual([]);
    expect(
      report.warnings.some((warning) =>
        warning.includes("STRIPE_PRICE_SMALL_FLEET_MONTHLY is not explicitly configured")
      )
    ).toBe(true);
  });
});
