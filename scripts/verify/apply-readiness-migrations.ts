import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { assertDatabaseVerificationAllowed } from "./db-target-guard.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  assert(databaseUrl, "DATABASE_URL is required to apply readiness migrations.");
  assert(
    process.env.ALLOW_READINESS_MIGRATIONS === "true",
    "Refusing to apply readiness migrations without ALLOW_READINESS_MIGRATIONS=true."
  );
  assertDatabaseVerificationAllowed({
    databaseUrl,
    scriptName: "apply-readiness-migrations",
    risk: "migration",
  });

  const migrationPaths = process.argv.slice(2).map((value) => path.resolve(value));
  assert(migrationPaths.length > 0, "Provide at least one SQL migration file path.");

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: /supabase\.com/i.test(databaseUrl) ? { rejectUnauthorized: false } : undefined,
  });

  try {
    for (const migrationPath of migrationPaths) {
      const sqlText = await fs.readFile(migrationPath, "utf8");
      await pool.query(sqlText);
      console.log(`Applied ${path.basename(migrationPath)}`);
    }
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
