/**
 * Repair orphaned defect/inspection references across the schema.
 *
 * Several tables reference a defect (or inspection) by a bare integer with no
 * foreign key. When the referenced row is hard-deleted — e.g. a demo re-seed
 * drops and re-inserts every defect with new serial ids — the child row
 * survives pointing at an id that no longer exists. For inAppAlerts this makes a
 * notification dead-end on "Issue not found"; for the other tables it is stale
 * data attached to a phantom defect.
 *
 * This script finds those orphans and, per table, either nulls the reference
 * (non-destructive; preserves the row) or deletes the row when the column is
 * NOT NULL and cannot be nulled (tadisAlerts). It is safe and idempotent.
 *
 * Migrations 0052 + 0054 do the same cleanup and then add ON DELETE SET NULL /
 * CASCADE foreign keys so it can't happen again. Use this script for ad-hoc
 * remediation, or as a read-only report to confirm the orphan state before
 * running the migrations.
 *
 * DRY-RUN BY DEFAULT — pass --apply to actually write.
 *
 * Usage:
 *   # report only (no writes), any target:
 *   DATABASE_URL=... npx tsx scripts/admin/cleanup-orphaned-alert-references.ts
 *
 *   # apply against production:
 *   TFX_DATABASE_TARGET=production \
 *   ALLOW_PRODUCTION_DB_VERIFY_WRITES=true \
 *   DATABASE_URL=... \
 *   npx tsx scripts/admin/cleanup-orphaned-alert-references.ts --apply
 *
 * Flags:
 *   --apply   Perform the writes. Without it, only counts orphans (read-only).
 */

import "dotenv/config";
import { Pool } from "pg";
import {
  assertDatabaseVerificationAllowed,
  classifyDatabaseTarget,
} from "../verify/db-target-guard.ts";

type Strategy = "null" | "delete";

type OrphanRef = {
  table: string;
  column: "defectId" | "inspectionId";
  referencedTable: "defects" | "inspections";
  // "null": clear the reference (nullable column, non-destructive).
  // "delete": remove the row (NOT NULL column that cannot be nulled).
  strategy: Strategy;
};

// Keep in sync with migrations 0052 + 0054.
const ORPHAN_REFS: OrphanRef[] = [
  { table: "inAppAlerts", column: "defectId", referencedTable: "defects", strategy: "null" },
  { table: "defectActions", column: "defectId", referencedTable: "defects", strategy: "null" },
  { table: "inspectionReviewQueueItems", column: "defectId", referencedTable: "defects", strategy: "null" },
  { table: "inspectionReviewActions", column: "defectId", referencedTable: "defects", strategy: "null" },
  { table: "aiTriageRecords", column: "defectId", referencedTable: "defects", strategy: "null" },
  { table: "repairOutcomes", column: "defectId", referencedTable: "defects", strategy: "null" },
  { table: "maintenanceLogs", column: "defectId", referencedTable: "defects", strategy: "null" },
  { table: "earlyWarningFlags", column: "defectId", referencedTable: "defects", strategy: "null" },
  { table: "tadisAlerts", column: "defectId", referencedTable: "defects", strategy: "delete" },
  // Bonus: inAppAlerts also references inspections loosely.
  { table: "inAppAlerts", column: "inspectionId", referencedTable: "inspections", strategy: "null" },
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function orphanPredicate(ref: OrphanRef): string {
  return `a."${ref.column}" IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM "${ref.referencedTable}" r WHERE r."id" = a."${ref.column}"
       )`;
}

async function countOrphans(pool: Pool, ref: OrphanRef): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM "${ref.table}" a
     WHERE ${orphanPredicate(ref)}`
  );
  return Number(result.rows[0]?.count ?? "0");
}

async function fixOrphans(pool: Pool, ref: OrphanRef): Promise<number> {
  const statement =
    ref.strategy === "delete"
      ? `DELETE FROM "${ref.table}" a WHERE ${orphanPredicate(ref)}`
      : `UPDATE "${ref.table}" a SET "${ref.column}" = NULL WHERE ${orphanPredicate(ref)}`;
  const result = await pool.query(statement);
  return result.rowCount ?? 0;
}

async function main() {
  const apply = process.argv.slice(2).includes("--apply");
  const databaseUrl = process.env.DATABASE_URL?.trim();
  assert(databaseUrl, "DATABASE_URL is required.");

  const target = classifyDatabaseTarget(databaseUrl);
  console.log(`Target database: ${target.kind} (${target.host})`);
  console.log(apply ? "Mode: APPLY (writes enabled)\n" : "Mode: dry-run (read-only)\n");

  if (apply) {
    // Shared write-guard: refuses production/unknown-remote writes unless
    // explicitly approved via env.
    assertDatabaseVerificationAllowed({
      databaseUrl,
      scriptName: "cleanup-orphaned-alert-references",
      risk: "migration",
    });
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: /supabase\.com/i.test(databaseUrl) ? { rejectUnauthorized: false } : undefined,
  });

  try {
    let totalOrphans = 0;
    for (const ref of ORPHAN_REFS) {
      const verb = ref.strategy === "delete" ? "delete" : "null";
      if (!apply) {
        const count = await countOrphans(pool, ref);
        totalOrphans += count;
        console.log(
          `${ref.table}.${ref.column}: ${count} orphaned reference(s) to a missing ${ref.referencedTable} row` +
            (count > 0 ? ` (would ${verb})` : "")
        );
        continue;
      }

      const affected = await fixOrphans(pool, ref);
      const pastTense = ref.strategy === "delete" ? "deleted" : "nulled";
      console.log(`${ref.table}.${ref.column}: ${pastTense} ${affected} orphaned reference(s)`);
    }

    if (!apply) {
      console.log(
        totalOrphans === 0
          ? "\nNo orphaned references found. Nothing to clean up."
          : `\nFound ${totalOrphans} orphaned reference(s). Re-run with --apply to fix them.`
      );
    } else {
      console.log("\nDone.");
    }
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
