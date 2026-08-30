import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ENV } from "../_core/env";

describe("createTruckFixrCheckoutSession ACSS Debit gating", () => {
  const originalPriceEnv = process.env.STRIPE_PRICE_OWNER_OPERATOR_MONTHLY;
  const originalSecretKey = ENV.stripeSecretKey;
  const originalEnableAcssDebit = ENV.enableAcssDebit;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.STRIPE_PRICE_OWNER_OPERATOR_MONTHLY = "price_test_owner_operator_monthly";
    ENV.stripeSecretKey = "sk_test_dummy";

    fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: "cs_test_123", url: "https://checkout.stripe.com/test" }), {
        status: 200,
      })
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    process.env.STRIPE_PRICE_OWNER_OPERATOR_MONTHLY = originalPriceEnv;
    ENV.stripeSecretKey = originalSecretKey;
    ENV.enableAcssDebit = originalEnableAcssDebit;
    vi.unstubAllGlobals();
  });

  const baseInput = {
    customerId: "cus_test_123",
    companyId: 1,
    planKey: "owner_operator" as const,
    billingInterval: "monthly" as const,
    successUrl: "https://truckfixr.com/success",
    cancelUrl: "https://truckfixr.com/cancel",
  };

  it("omits acss_debit fields when the flag is off", async () => {
    ENV.enableAcssDebit = false;
    const { createTruckFixrCheckoutSession } = await import("./stripeBilling");

    await createTruckFixrCheckoutSession(baseInput);

    const [, requestInit] = fetchMock.mock.calls[0];
    const body = String(requestInit.body);
    expect(body).not.toContain("payment_method_types");
    expect(body).not.toContain("acss_debit");
  });

  it("adds card + acss_debit payment method fields when the flag is on", async () => {
    ENV.enableAcssDebit = true;
    const { createTruckFixrCheckoutSession } = await import("./stripeBilling");

    await createTruckFixrCheckoutSession(baseInput);

    const [, requestInit] = fetchMock.mock.calls[0];
    const params = new URLSearchParams(String(requestInit.body));
    expect(params.get("payment_method_types[0]")).toBe("card");
    expect(params.get("payment_method_types[1]")).toBe("acss_debit");
    expect(params.get("payment_method_options[acss_debit][currency]")).toBe("cad");
    expect(params.get("payment_method_options[acss_debit][mandate_options][payment_schedule]")).toBe(
      "combined"
    );
    expect(params.get("payment_method_options[acss_debit][mandate_options][transaction_type]")).toBe(
      "business"
    );
    expect(params.get("payment_method_options[acss_debit][verification_method]")).toBe("automatic");
  });
});
