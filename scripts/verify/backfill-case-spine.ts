import "dotenv/config";
import { Pool } from "pg";
import { assertDatabaseVerificationAllowed } from "./db-target-guard.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

// One-off, idempotent backfill: create a `cases` row for every existing
// guestCases/maintenanceCases row that doesn't have one yet, and point that
// row's new caseId FK at it. Safe to re-run — only touches rows where
// caseId IS NULL. Processes one source row at a time so each new `cases`
// row is unambiguously linked back to the row that created it.
async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  assert(databaseUrl, "DATABASE_URL is required to run the backfill.");
  assert(
    process.env.ALLOW_READINESS_MIGRATIONS === "true",
    "Refusing to backfill without ALLOW_READINESS_MIGRATIONS=true."
  );
  assertDatabaseVerificationAllowed({
    databaseUrl,
    scriptName: "backfill-case-spine",
    risk: "migration",
  });

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: /supabase\.com/i.test(databaseUrl) ? { rejectUnauthorized: false } : undefined,
  });

  try {
    const client = await pool.connect();
    let maintenanceLinked = 0;
    let guestLinked = 0;
    try {
      await client.query("BEGIN");

      const maintenanceRows = await client.query(`
        SELECT "id", "fleetId", "vehicleId", "openedAt", "updatedAt"
        FROM "maintenanceCases"
        WHERE "caseId" IS NULL
        ORDER BY "id"
      `);
      for (const row of maintenanceRows.rows) {
        const inserted = await client.query(
          `INSERT INTO "cases" ("sourceType", "status", "fleetId", "vehicleId", "createdAt", "updatedAt")
           VALUES ('resolution_fleet', 'draft', $1, $2, $3, $4)
           RETURNING id`,
          [row.fleetId, row.vehicleId, row.openedAt, row.updatedAt]
        );
        const caseId = inserted.rows[0].id;
        await client.query(`UPDATE "maintenanceCases" SET "caseId" = $1 WHERE id = $2`, [
          caseId,
          row.id,
        ]);
        maintenanceLinked += 1;
      }

      const guestRows = await client.query(`
        SELECT "id", "matchedFleetId", "createdAt", "updatedAt"
        FROM "guestCases"
        WHERE "caseId" IS NULL
        ORDER BY "id"
      `);
      for (const row of guestRows.rows) {
        const inserted = await client.query(
          `INSERT INTO "cases" ("sourceType", "status", "fleetId", "vehicleId", "createdAt", "updatedAt")
           VALUES ('resolution_guest', 'draft', $1, NULL, $2, $3)
           RETURNING id`,
          [row.matchedFleetId, row.createdAt, row.updatedAt]
        );
        const caseId = inserted.rows[0].id;
        await client.query(`UPDATE "guestCases" SET "caseId" = $1 WHERE id = $2`, [
          caseId,
          row.id,
        ]);
        guestLinked += 1;
      }

      await client.query("COMMIT");

      console.log(
        JSON.stringify(
          { ok: true, maintenanceCasesLinked: maintenanceLinked, guestCasesLinked: guestLinked },
          null,
          2
        )
      );
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const parity = await pool.query(`
      SELECT
        (SELECT count(*)::int FROM "cases") AS total_cases,
        (SELECT count(*)::int FROM "guestCases") AS total_guest_cases,
        (SELECT count(*)::int FROM "guestCases" WHERE "caseId" IS NOT NULL) AS guest_cases_linked,
        (SELECT count(*)::int FROM "maintenanceCases") AS total_maintenance_cases,
        (SELECT count(*)::int FROM "maintenanceCases" WHERE "caseId" IS NOT NULL) AS maintenance_cases_linked;
    `);
    console.log(JSON.stringify({ parity: parity.rows[0] }, null, 2));
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
