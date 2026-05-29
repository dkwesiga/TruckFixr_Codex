/**
 * Read-only probe to confirm why the diagnosis pipeline is returning static
 * fallback responses. Pulls evidence from two independent sources:
 *
 *   1. Production `aiRequestLogs` — the last N diagnosis attempts grouped by
 *      status / errorCode / provider. This is exactly what the server saw
 *      when it gave up and used the rule-engine baseline.
 *
 *   2. OpenRouter API — the configured key's credit balance + label, and
 *      whether the default model slug actually exists in their catalog.
 *      Optionally runs a 1-token test inference to confirm end-to-end.
 *
 * No writes. Safe against production. Intended to answer the single
 * question: "Is this an OpenRouter key / credit issue?"
 *
 * Usage:
 *   TFX_DATABASE_TARGET=production \
 *   DATABASE_URL=... \
 *   OPENROUTER_API_KEY=... \
 *   npx tsx scripts/admin/probe-diagnosis-ai-health.ts
 *
 * Optional flags:
 *   --hours=N     How far back to scan aiRequestLogs (default 24)
 *   --limit=N     Sample size to print verbatim (default 10)
 *   --no-probe    Skip the live test inference (auth/key + models still queried)
 *   --model=SLUG  Override the model to probe (defaults to deepseek/deepseek-v4-flash)
 */

import "dotenv/config";
import { Pool } from "pg";
import { classifyDatabaseTarget } from "../verify/db-target-guard";

type Args = {
  hours: number;
  limit: number;
  runProbe: boolean;
  modelOverride: string | null;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { hours: 24, limit: 10, runProbe: true, modelOverride: null };
  for (const token of argv) {
    if (token.startsWith("--hours=")) args.hours = Math.max(1, Number(token.slice(8)) || 24);
    else if (token.startsWith("--limit=")) args.limit = Math.max(1, Number(token.slice(8)) || 10);
    else if (token === "--no-probe") args.runProbe = false;
    else if (token.startsWith("--model=")) args.modelOverride = token.slice(8).trim() || null;
  }
  return args;
}

function fmt(value: unknown) {
  if (value == null) return "(null)";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

async function probeAiRequestLogs(pool: Pool, hours: number, limit: number) {
  console.log(`\n=== aiRequestLogs over last ${hours}h ===`);

  // Aggregate: status + errorCode + provider + model + count + last seen
  const aggregate = await pool.query(
    `SELECT
       "status",
       "errorCode",
       "provider",
       "model",
       "fallbackUsed",
       COUNT(*) AS attempts,
       MAX("createdAt") AS last_seen
     FROM "aiRequestLogs"
     WHERE "createdAt" >= NOW() - ($1::int * INTERVAL '1 hour')
     GROUP BY 1, 2, 3, 4, 5
     ORDER BY last_seen DESC NULLS LAST`,
    [hours]
  );

  if (aggregate.rowCount === 0) {
    console.log("  (no diagnosis attempts in this window)");
  } else {
    console.table(
      aggregate.rows.map((row) => ({
        status: row.status,
        errorCode: row.errorCode ?? "",
        provider: row.provider ?? "",
        model: row.model ?? "",
        fallback: row.fallbackUsed,
        attempts: Number(row.attempts),
        last_seen: row.last_seen instanceof Date ? row.last_seen.toISOString() : String(row.last_seen),
      }))
    );
  }

  // Verbatim sample of recent FAILED / FALLBACK rows with the full error message
  const sample = await pool.query(
    `SELECT
       "id",
       "createdAt",
       "callType",
       "provider",
       "model",
       "status",
       "errorCode",
       "errorMessage",
       "fallbackUsed",
       "simpleTadisMode"
     FROM "aiRequestLogs"
     WHERE "createdAt" >= NOW() - ($1::int * INTERVAL '1 hour')
       AND ("status" <> 'success' OR "fallbackUsed" = true)
     ORDER BY "createdAt" DESC
     LIMIT $2`,
    [hours, limit]
  );

  console.log(`\n--- Sample of last ${sample.rowCount} failed/fallback rows ---`);
  if (sample.rowCount === 0) {
    console.log("  (no failed/fallback attempts — diagnosis pipeline may not be in use, or all calls succeeded)");
  } else {
    for (const row of sample.rows) {
      console.log(
        `[${row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt}] ` +
          `#${row.id} ${row.callType} provider=${fmt(row.provider)} model=${fmt(row.model)} ` +
          `status=${row.status} errorCode=${fmt(row.errorCode)} fallback=${row.fallbackUsed}`
      );
      if (row.errorMessage) {
        console.log(`    ↳ errorMessage: ${String(row.errorMessage).slice(0, 500)}`);
      }
    }
  }
}

async function probeOpenRouterKey(apiKey: string) {
  console.log(`\n=== OpenRouter /auth/key ===`);
  try {
    const response = await fetch("https://openrouter.ai/api/v1/auth/key", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const body = await response.text();
    console.log(`  HTTP ${response.status} ${response.statusText}`);
    try {
      const json = JSON.parse(body);
      console.log(`  ${JSON.stringify(json, null, 2)}`);
      // Common shape: { data: { label, usage, limit, is_free_tier, rate_limit } }
      const data = json?.data ?? json;
      if (data?.limit != null && data?.usage != null) {
        const remaining = Number(data.limit) - Number(data.usage);
        console.log(`  ⇒ credits remaining: ${remaining.toFixed(4)} (limit ${data.limit}, usage ${data.usage})`);
        if (remaining <= 0) {
          console.log(`  ⚠️  CREDITS EXHAUSTED — this is your root cause.`);
        }
      }
      if (data?.is_free_tier === true) {
        console.log(`  ⇒ key is on free tier; rate limits / daily caps apply.`);
      }
    } catch {
      console.log(`  (body not JSON):\n  ${body.slice(0, 400)}`);
    }
  } catch (error) {
    console.log(`  ERROR contacting OpenRouter: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function probeOpenRouterModel(apiKey: string, modelSlug: string) {
  console.log(`\n=== OpenRouter /models lookup for "${modelSlug}" ===`);
  try {
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) {
      console.log(`  HTTP ${response.status} — could not load model catalog`);
      return;
    }
    const json = await response.json() as { data?: Array<{ id: string; name?: string; pricing?: Record<string, string> }> };
    const models = json.data ?? [];
    const exact = models.find((m) => m.id === modelSlug);
    if (exact) {
      console.log(`  ✓ model exists: ${exact.id} (${exact.name ?? ""})`);
      if (exact.pricing) console.log(`    pricing: ${JSON.stringify(exact.pricing)}`);
    } else {
      console.log(`  ✗ model "${modelSlug}" NOT FOUND in OpenRouter catalog (this would 404 every call).`);
      const family = modelSlug.split("/")[0];
      const cousins = models
        .filter((m) => m.id.startsWith(`${family}/`))
        .slice(0, 8)
        .map((m) => m.id);
      if (cousins.length > 0) {
        console.log(`    closest available "${family}/*" models:`);
        for (const id of cousins) console.log(`      - ${id}`);
      }
    }
  } catch (error) {
    console.log(`  ERROR contacting OpenRouter: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function probeLiveInference(apiKey: string, modelSlug: string) {
  console.log(`\n=== Live test inference against "${modelSlug}" ===`);
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://truckfixr.com",
        "X-Title": "TruckFixr Diagnosis Probe",
      },
      body: JSON.stringify({
        model: modelSlug,
        messages: [{ role: "user", content: "Reply with the single word 'pong'." }],
        max_tokens: 10,
        temperature: 0,
      }),
    });
    const body = await response.text();
    console.log(`  HTTP ${response.status} ${response.statusText}`);
    if (response.ok) {
      try {
        const json = JSON.parse(body);
        const content = json?.choices?.[0]?.message?.content;
        console.log(`  ⇒ reply: ${typeof content === "string" ? content : JSON.stringify(content)}`);
        console.log(`  ⇒ usage: ${JSON.stringify(json?.usage ?? {})}`);
      } catch {
        console.log(`  (body):\n  ${body.slice(0, 400)}`);
      }
    } else {
      console.log(`  body: ${body.slice(0, 600)}`);
    }
  } catch (error) {
    console.log(`  ERROR: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const openRouterApiKey = process.env.OPENROUTER_API_KEY?.trim();
  const modelToProbe =
    args.modelOverride ||
    process.env.OPENROUTER_MODEL?.trim() ||
    "deepseek/deepseek-v4-flash";
  const fallbackModelToProbe =
    process.env.OPENROUTER_FALLBACK_MODEL?.trim() || "google/gemini-2.5-flash";

  console.log("== diagnosis-ai-health probe ==");
  console.log(`  hours=${args.hours} limit=${args.limit} runProbe=${args.runProbe}`);
  console.log(`  primary model: ${modelToProbe}`);
  console.log(`  fallback model: ${fallbackModelToProbe}`);
  console.log(`  database configured: ${Boolean(databaseUrl)}`);
  console.log(`  openrouter key configured: ${Boolean(openRouterApiKey)}`);

  if (databaseUrl) {
    const target = classifyDatabaseTarget(databaseUrl);
    console.log(`  database target: kind=${target.kind} host=${target.host}`);
    const pool = new Pool({
      connectionString: databaseUrl,
      ssl: /supabase\.com/i.test(databaseUrl) ? { rejectUnauthorized: false } : undefined,
    });
    try {
      await probeAiRequestLogs(pool, args.hours, args.limit);
    } catch (error) {
      console.log(`\n  ERROR reading aiRequestLogs: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await pool.end();
    }
  } else {
    console.log("\n  (skipping DB probe — DATABASE_URL not set)");
  }

  if (openRouterApiKey) {
    await probeOpenRouterKey(openRouterApiKey);
    await probeOpenRouterModel(openRouterApiKey, modelToProbe);
    if (modelToProbe !== fallbackModelToProbe) {
      await probeOpenRouterModel(openRouterApiKey, fallbackModelToProbe);
    }
    if (args.runProbe) {
      await probeLiveInference(openRouterApiKey, modelToProbe);
    }
  } else {
    console.log("\n  (skipping OpenRouter probe — OPENROUTER_API_KEY not set)");
  }

  console.log("\n== probe complete ==");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
