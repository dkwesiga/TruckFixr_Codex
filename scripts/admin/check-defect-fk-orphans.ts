/**
 * Read-only pre-flight check before applying 0052/0054 (defect FK hardening
 * migrations). Reports how many rows per table have a defectId pointing at a
 * defect that no longer exists — this is exactly what those migrations would
 * null out (or, for tadisAlerts, delete) before adding the FK constraint.
 *
 * No writes. Safe against production.
 *
 * Usage:
 *   npx tsx scripts/admin/check-defect-fk-orphans.ts
 */
import "dotenv/config";
import { Pool } from "pg";

const TABLES = [
  "inAppAlerts",
  "defectActions",
  "inspectionReviewQueueItems",
  "inspectionReviewActions",
  "aiTriageRecords",
  "repairOutcomes",
  "maintenanceLogs",
  "earlyWarningFlags",
  "tadisAlerts",
];

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL not set");
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: /supabase\.com/i.test(databaseUrl) ? { rejectUnauthorized: false } : undefined,
  });
  try {
    for (const table of TABLES) {
      const existsCheck = await pool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name = 'defectId'`,
        [table]
      );
      if (existsCheck.rowCount === 0) {
        console.log(`${table}: (no defectId column found — skip)`);
        continue;
      }
      const totalRes = await pool.query(`SELECT COUNT(*)::int AS n FROM "${table}" WHERE "defectId" IS NOT NULL`);
      const orphanRes = await pool.query(
        `SELECT COUNT(*)::int AS n FROM "${table}" a WHERE a."defectId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "defects" d WHERE d."id" = a."defectId")`
      );
      console.log(`${table}: total_with_defectId=${totalRes.rows[0].n} orphaned=${orphanRes.rows[0].n}`);
    }

    const constraintRes = await pool.query(
      `SELECT conname FROM pg_constraint WHERE conname LIKE '%_defectId_defects_id_fk'`
    );
    console.log("\nExisting defectId FK constraints already on prod:", constraintRes.rows.map((r) => r.conname));
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
