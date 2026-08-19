/**
 * Read-only schema-drift check for everything server/routers/defects.ts's
 * getById procedure queries.
 *
 * Context: this project's migrations (drizzle/*.sql) are applied by hand
 * against production rather than through an automated runner — the commit
 * that added 0053_restore_defect_actions.sql found that "defectActions" was
 * declared in drizzle/schema.ts and queried by getById, but its CREATE TABLE
 * had never actually landed in production, so every /defect/:id request
 * threw a 42P01 ("relation does not exist") that the client showed as a
 * generic "We couldn't load this issue" error. Migrations 0052 and 0054 were
 * also left "pending — not yet applied" as of that fix.
 *
 * This script checks the same class of drift for every table getById reads
 * (tadisAlerts, aiTriageRecords, defectActions, repairOutcomes,
 * maintenanceLogs, earlyWarningFlags, defects) against whatever DATABASE_URL
 * points to: does the table exist, does every column drizzle/schema.ts
 * expects exist, and are the 0052/0054 foreign keys present. Pure SELECTs
 * against information_schema / pg_constraint — never writes.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/admin/check-defect-detail-schema.ts
 */

import "dotenv/config";
import { Pool } from "pg";
import { classifyDatabaseTarget } from "../verify/db-target-guard.ts";

type ExpectedColumn = { name: string; nullable: boolean };
type ExpectedTable = { table: string; columns: ExpectedColumn[] };

// Mirrors drizzle/schema.ts for exactly the tables defects.getById touches.
const EXPECTED: ExpectedTable[] = [
  {
    table: "defects",
    columns: [
      { name: "id", nullable: false },
      { name: "fleetId", nullable: false },
      { name: "vehicleId", nullable: false },
      { name: "driverId", nullable: false },
      { name: "title", nullable: false },
      { name: "description", nullable: true },
      { name: "symptoms", nullable: true },
      { name: "faultCodes", nullable: true },
    ],
  },
  {
    table: "tadisAlerts",
    columns: [
      { name: "id", nullable: false },
      { name: "fleetId", nullable: false },
      { name: "defectId", nullable: false },
      { name: "urgency", nullable: false },
      { name: "recommendedAction", nullable: false },
      { name: "likelyCause", nullable: true },
      { name: "reasoning", nullable: true },
      { name: "createdAt", nullable: false },
    ],
  },
  {
    table: "aiTriageRecords",
    columns: [
      { name: "id", nullable: false },
      { name: "fleetId", nullable: false },
      { name: "vehicleId", nullable: false },
      { name: "defectId", nullable: true },
      { name: "mostLikelyCause", nullable: true },
      { name: "severity", nullable: false },
      { name: "confidenceScore", nullable: false },
      { name: "recommendedAction", nullable: false },
      { name: "driverMessage", nullable: true },
      { name: "managerSummary", nullable: true },
      { name: "clarifyingQuestions", nullable: true },
      { name: "safetyWarning", nullable: true },
      { name: "suggestedNextSteps", nullable: true },
      { name: "rawResult", nullable: true },
      { name: "createdAt", nullable: false },
    ],
  },
  {
    table: "defectActions",
    columns: [
      { name: "id", nullable: false },
      { name: "defectId", nullable: true },
      { name: "createdAt", nullable: false },
    ],
  },
  {
    table: "repairOutcomes",
    columns: [
      { name: "id", nullable: false },
      { name: "defectId", nullable: false },
      { name: "confirmedFault", nullable: false },
      { name: "repairPerformed", nullable: false },
      { name: "createdAt", nullable: false },
    ],
  },
  {
    table: "maintenanceLogs",
    columns: [
      { name: "id", nullable: false },
      { name: "defectId", nullable: true },
      { name: "createdAt", nullable: false },
    ],
  },
  {
    table: "earlyWarningFlags",
    columns: [
      { name: "id", nullable: false },
      { name: "fleetId", nullable: false },
      { name: "vehicleId", nullable: false },
      { name: "defectId", nullable: true },
      { name: "warningType", nullable: false },
      { name: "warningReason", nullable: false },
      { name: "isActive", nullable: false },
      { name: "createdAt", nullable: false },
    ],
  },
];

// Foreign keys migrations 0052 + 0054 are supposed to have added.
const EXPECTED_DEFECT_FKS = [
  "inAppAlerts_defectId_defects_id_fk",
  "defectActions_defectId_defects_id_fk",
  "inspectionReviewQueueItems_defectId_defects_id_fk",
  "inspectionReviewActions_defectId_defects_id_fk",
  "aiTriageRecords_defectId_defects_id_fk",
  "repairOutcomes_defectId_defects_id_fk",
  "maintenanceLogs_defectId_defects_id_fk",
  "earlyWarningFlags_defectId_defects_id_fk",
  "tadisAlerts_defectId_defects_id_fk",
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  assert(databaseUrl, "DATABASE_URL is required.");

  const target = classifyDatabaseTarget(databaseUrl);
  console.log(`Target database: ${target.kind} (${target.host})\n`);

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: /supabase\.com/i.test(databaseUrl) ? { rejectUnauthorized: false } : undefined,
  });

  let problems = 0;

  try {
    for (const expected of EXPECTED) {
      const existingColumns = await pool.query<{ column_name: string; is_nullable: string }>(
        `SELECT column_name, is_nullable
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1`,
        [expected.table]
      );

      if (existingColumns.rowCount === 0) {
        console.log(`FAIL  "${expected.table}" does not exist in this database.`);
        problems += 1;
        continue;
      }

      const byName = new Map(existingColumns.rows.map((row) => [row.column_name, row.is_nullable === "YES"]));
      const missing = expected.columns.filter((col) => !byName.has(col.name));
      const nullabilityMismatches = expected.columns.filter(
        (col) => byName.has(col.name) && byName.get(col.name) !== col.nullable && !col.nullable
      );

      if (missing.length === 0 && nullabilityMismatches.length === 0) {
        console.log(`OK    "${expected.table}" — all expected columns present.`);
        continue;
      }

      problems += 1;
      if (missing.length > 0) {
        console.log(`FAIL  "${expected.table}" is missing column(s): ${missing.map((c) => c.name).join(", ")}`);
      }
      if (nullabilityMismatches.length > 0) {
        console.log(
          `WARN  "${expected.table}" has column(s) nullable in the DB but NOT NULL in schema.ts: ${nullabilityMismatches
            .map((c) => c.name)
            .join(", ")}`
        );
      }
    }

    console.log("");
    const fkRows = await pool.query<{ conname: string }>(
      `SELECT conname FROM pg_constraint WHERE conname = ANY($1::text[])`,
      [EXPECTED_DEFECT_FKS]
    );
    const presentFks = new Set(fkRows.rows.map((row) => row.conname));
    const missingFks = EXPECTED_DEFECT_FKS.filter((name) => !presentFks.has(name));
    if (missingFks.length === 0) {
      console.log("OK    All defectId foreign keys from migrations 0052/0054 are present.");
    } else {
      console.log(
        `INFO  ${missingFks.length}/${EXPECTED_DEFECT_FKS.length} defectId foreign key(s) from migrations 0052/0054 are not yet applied:\n` +
          missingFks.map((name) => `      - ${name}`).join("\n") +
          "\n      (Not required for getById to work — these only harden delete behavior — but worth applying.)"
      );
    }

    console.log(
      problems === 0
        ? "\nNo schema drift found for the tables defects.getById reads."
        : `\n${problems} table(s) have drift against drizzle/schema.ts — this is a plausible cause of "We couldn't load this issue" on /defect/:id.`
    );
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
