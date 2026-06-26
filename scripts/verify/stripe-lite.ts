import "dotenv/config";
import { Pool } from "pg";

type StripeVerifyMode = "live" | "mock";

function parseMode(): StripeVerifyMode {
  const modeArg = process.argv.find((value) => value.startsWith("--mode="));
  const mode = modeArg?.split("=", 2)[1]?.trim().toLowerCase();
  return mode === "mock" ? "mock" : "live";
}

function isStripeTestSecretKey(value: string | undefined | null) {
  return typeof value === "string" && /^sk_test_/i.test(value);
}

function isStripeWebhookSecret(value: string | undefined | null) {
  return typeof value === "string" && /^whsec_/i.test(value);
}

async function main() {
  const mode = parseMode();
  const warnings: string[] = [];

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    warnings.push("Missing DATABASE_URL (cannot validate DB connectivity).");
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (mode === "live") {
    if (!isStripeTestSecretKey(stripeSecret)) {
      warnings.push("Missing/invalid STRIPE_SECRET_KEY (expected sk_test_* for test-mode verification).");
    }
    if (!isStripeWebhookSecret(webhookSecret)) {
      warnings.push("Missing/invalid STRIPE_WEBHOOK_SECRET (expected whsec_*).");
    }
  } else {
    if (!stripeSecret) warnings.push("STRIPE_SECRET_KEY not set (ok in mock mode).");
    if (!webhookSecret) warnings.push("STRIPE_WEBHOOK_SECRET not set (ok in mock mode).");
  }

  if (databaseUrl) {
    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    try {
      await pool.query("select 1 as ok");
    } catch (error) {
      warnings.push(`DB connectivity check failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await pool.end().catch(() => undefined);
    }
  }

  const ok = warnings.length === 0;
  const result = {
    ok,
    mode,
    warnings,
    note:
      "stripe-lite is a spawn-safe verification fallback (does not run the full Stripe readiness + webhook simulation).",
  };

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(result, null, 2));

  if (!ok) {
    if (process.env.CI || process.env.TFX_REQUIRE_STRIPE_FULL === "true") {
      process.exit(1);
    }
  }
}

await main();

