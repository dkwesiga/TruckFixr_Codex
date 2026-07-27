import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { assertDatabaseVerificationAllowed } from "./db-target-guard.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function setJwtContext(client: PoolClient, role: "authenticated" | "service_role", subject: string) {
  await client.query(`SET ROLE ${role}`);
  await client.query(
    `
      SELECT
        set_config('request.jwt.claim.sub', $1, false),
        set_config('request.jwt.claim.role', $2, false),
        set_config('request.jwt.claims', $3, false)
    `,
    [subject, role, JSON.stringify({ sub: subject, role })]
  );
}

async function clearJwtContext(client: PoolClient) {
  await client.query("RESET ROLE");
  await client.query(
    `
      SELECT
        set_config('request.jwt.claim.sub', '', false),
        set_config('request.jwt.claim.role', '', false),
        set_config('request.jwt.claims', '{}', false)
    `
  );
}

async function asRole<T>(
  client: PoolClient,
  role: "authenticated" | "service_role",
  subject: string,
  action: () => Promise<T>
) {
  await setJwtContext(client, role, subject);
  try {
    return await action();
  } finally {
    await clearJwtContext(client);
  }
}

async function queryCount(client: PoolClient, sqlText: string, params: unknown[] = []) {
  const result = await client.query<{ count: string }>(sqlText, params);
  return Number(result.rows[0]?.count ?? 0);
}

const POST_0012_RLS_TABLES = [
  "inspectionReviewQueueItems",
  "inspectionReviewActions",
  "combinedInspectionSessions",
  "adminFleetNotes",
  "lead_submissions",
  "guestCases",
  "guestCaseEvents",
  "guestCaseContacts",
  "freeCaseLedger",
  "caseReviewQueueItems",
  "analyticsEvents",
  "pilotApplications",
  "pilotSettings",
  "maintenanceCases",
  "maintenanceDecisions",
  "repairCycles",
  "repairDocuments",
  "repairAuthorizations",
  "partnerProfiles",
] as const;

async function assertPost0012RlsEnabled(client: PoolClient) {
  const result = await client.query<{ relname: string; relrowsecurity: boolean }>(
    `SELECT relname, relrowsecurity FROM pg_class WHERE relname = ANY($1::text[])`,
    [POST_0012_RLS_TABLES]
  );
  const status = new Map(result.rows.map((row) => [row.relname, row.relrowsecurity]));
  for (const table of POST_0012_RLS_TABLES) {
    assert(status.get(table) === true, `${table} must exist with row-level security enabled.`);
  }
}

async function expectForbidden(
  client: PoolClient,
  action: () => Promise<unknown>,
  message: string
) {
  await client.query("SAVEPOINT rls_expect_forbidden");
  try {
    await action();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (/row-level security|permission denied|violates row-level security/i.test(detail)) {
      await client.query("ROLLBACK TO SAVEPOINT rls_expect_forbidden");
      await client.query("RELEASE SAVEPOINT rls_expect_forbidden");
      return;
    }
    await client.query("ROLLBACK TO SAVEPOINT rls_expect_forbidden");
    await client.query("RELEASE SAVEPOINT rls_expect_forbidden");
    throw new Error(`${message}: expected RLS denial, got "${detail}"`);
  }

  await client.query("RELEASE SAVEPOINT rls_expect_forbidden");
  throw new Error(`${message}: query unexpectedly succeeded`);
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  assert(databaseUrl, "DATABASE_URL is required for RLS verification.");
  const target = assertDatabaseVerificationAllowed({
    databaseUrl,
    scriptName: "verify:rls",
    risk: "test_writes",
  });

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: /supabase\.com/i.test(databaseUrl) ? { rejectUnauthorized: false } : undefined,
  });
  const client = await pool.connect();

  const suffix = randomUUID().slice(0, 8);
  const ownerAOpenId = `supabase_${randomUUID()}`;
  const userAOpenId = `supabase_${randomUUID()}`;
  const ownerBOpenId = `supabase_${randomUUID()}`;
  const serviceRoleSubject = randomUUID();

  try {
    await client.query("BEGIN");
    await assertPost0012RlsEnabled(client);

    const ownerA = await client.query<{ id: number }>(
      `
        INSERT INTO "users" ("openId", "email", "name", "emailVerified", "role", "createdAt", "updatedAt", "lastSignedIn")
        VALUES ($1, $2, $3, true, 'owner', now(), now(), now())
        RETURNING "id"
      `,
      [ownerAOpenId, `rls-owner-a-${suffix}@truckfixr.test`, `RLS Owner A ${suffix}`]
    );
    const userA = await client.query<{ id: number }>(
      `
        INSERT INTO "users" ("openId", "email", "name", "emailVerified", "role", "createdAt", "updatedAt", "lastSignedIn")
        VALUES ($1, $2, $3, true, 'driver', now(), now(), now())
        RETURNING "id"
      `,
      [userAOpenId, `rls-user-a-${suffix}@truckfixr.test`, `RLS User A ${suffix}`]
    );
    const ownerB = await client.query<{ id: number }>(
      `
        INSERT INTO "users" ("openId", "email", "name", "emailVerified", "role", "createdAt", "updatedAt", "lastSignedIn")
        VALUES ($1, $2, $3, true, 'owner', now(), now(), now())
        RETURNING "id"
      `,
      [ownerBOpenId, `rls-owner-b-${suffix}@truckfixr.test`, `RLS Owner B ${suffix}`]
    );

    const ownerAId = ownerA.rows[0]?.id;
    const userAId = userA.rows[0]?.id;
    const ownerBId = ownerB.rows[0]?.id;
    assert(ownerAId && userAId && ownerBId, "Failed to insert temporary verification users.");

    const fleetA = await client.query<{ id: number }>(
      `
        INSERT INTO "fleets" (
          "name", "ownerId", "companyEmail", "inviteCode", "subscriptionStatus", "planName",
          "billingInterval", "billingStatus", "paidExtraTrailerQuantity", "aiSessionsUsedCurrentPeriod",
          "isTrial", "isPaidPilot", "createdAt", "updatedAt"
        )
        VALUES ($1, $2, $3, $4, 'active', 'free_trial', 'trial', 'trialing', 0, 0, false, false, now(), now())
        RETURNING "id"
      `,
      [`RLS Fleet A ${suffix}`, ` ${ownerAId}`.trim(), `rls-fleet-a-${suffix}@truckfixr.test`, `RLSA${suffix}`]
    );
    const fleetB = await client.query<{ id: number }>(
      `
        INSERT INTO "fleets" (
          "name", "ownerId", "companyEmail", "inviteCode", "subscriptionStatus", "planName",
          "billingInterval", "billingStatus", "paidExtraTrailerQuantity", "aiSessionsUsedCurrentPeriod",
          "isTrial", "isPaidPilot", "createdAt", "updatedAt"
        )
        VALUES ($1, $2, $3, $4, 'active', 'free_trial', 'trial', 'trialing', 0, 0, false, false, now(), now())
        RETURNING "id"
      `,
      [`RLS Fleet B ${suffix}`, ` ${ownerBId}`.trim(), `rls-fleet-b-${suffix}@truckfixr.test`, `RLSB${suffix}`]
    );

    const fleetAId = fleetA.rows[0]?.id;
    const fleetBId = fleetB.rows[0]?.id;
    assert(fleetAId && fleetBId, "Failed to insert temporary verification fleets.");

    await client.query(
      `
        INSERT INTO "companyMemberships" ("fleetId", "userId", "role", "status", "approvedByUserId", "joinedAt", "createdAt", "updatedAt")
        VALUES ($1, $2, 'driver', 'active', $3, now(), now(), now())
      `,
      [fleetAId, userAId, ownerAId]
    );

    const vehicleAId = `rls-vehicle-a-${suffix}`;
    const vehicleBId = `rls-vehicle-b-${suffix}`;
    await client.query(
      `
        INSERT INTO "vehicles" (
          "id", "fleetId", "assignedDriverId", "assetType", "assetCategory", "vehicleType", "isPoweredVehicle", "isTrailer",
          "unitNumber", "vin", "licensePlate", "make", "model", "complianceStatus", "status", "assetRecordStatus",
          "createdAt", "updatedAt"
        )
        VALUES
          ($1, $2, $3, 'tractor', 'powered_vehicle', 'tractor', true, false, $4, $5, $6, 'Volvo', 'VNL', 'green', 'active', 'active', now(), now()),
          ($7, $8, null, 'tractor', 'powered_vehicle', 'tractor', true, false, $9, $10, $11, 'Freightliner', 'Cascadia', 'green', 'active', 'active', now(), now())
      `,
      [
        vehicleAId,
        fleetAId,
        userAId,
        `RLS-A-${suffix}`,
        `1HGBH41JXMN${suffix.padStart(6, "0").slice(0, 6)}`,
        `RLA-${suffix.slice(0, 4)}`,
        vehicleBId,
        fleetBId,
        `RLS-B-${suffix}`,
        `2HGBH41JXMN${suffix.padStart(6, "0").slice(0, 6)}`,
        `RLB-${suffix.slice(0, 4)}`,
      ]
    );

    await client.query(
      `
        INSERT INTO "subscriptions" ("userId", "fleetId", "tier", "billingCadence", "billingStatus", "cancelAtPeriodEnd", "createdAt", "updatedAt")
        VALUES
          ($1, $2, 'pro', 'monthly', 'active', false, now(), now()),
          ($3, $4, 'fleet', 'monthly', 'active', false, now(), now())
      `,
      [userAId, fleetAId, ownerBId, fleetBId]
    );

    const reviewQueueA = await client.query<{ id: number }>(
      `
        INSERT INTO "inspectionReviewQueueItems" (
          "fleetId", "vehicleId", "queueType", "status", "headlineStatus", "priority",
          "highestSeverity", "managerDecisionRequired", "requiresDriverInstruction", "agingState", "createdAt", "updatedAt"
        )
        VALUES ($1, $2, 'inspection_review', 'new', 'review_needed', 'normal', 'none', false, false, 'new', now(), now())
        RETURNING "id"
      `,
      [fleetAId, vehicleAId]
    );
    const reviewQueueAId = reviewQueueA.rows[0]?.id;
    assert(reviewQueueAId, "Failed to insert temporary review queue row.");
    await client.query(
      `
        INSERT INTO "inspectionReviewActions" (
          "queueItemId", "inspectionId", "vehicleId", "managerUserId", "actionType", "createdAt"
        ) VALUES ($1, 1, $2, $3, 'reviewed', now())
      `,
      [reviewQueueAId, vehicleAId, ownerAId]
    );
    await client.query(
      `
        INSERT INTO "combinedInspectionSessions" (
          "fleetId", "inspectionSessionId", "headlineStatus", "completionState", "createdAt", "updatedAt"
        ) VALUES ($1, $2, 'review_needed', 'truck_pending_trailer_pending', now(), now())
      `,
      [fleetAId, `rls-session-${suffix}`]
    );
    await client.query(
      `
        INSERT INTO "adminFleetNotes" (
          "fleetId", "createdByUserId", "note", "noteType", "createdAt", "updatedAt"
        ) VALUES ($1, $2, 'Temporary RLS verification row', 'verification', now(), now())
      `,
      [fleetAId, ownerAId]
    );
    await client.query(
      `
        INSERT INTO "lead_submissions" (
          "full_name", "company_name", "email", "fleet_size", "biggest_maintenance_challenge", "interest_type", "createdAt", "updatedAt"
        ) VALUES ('RLS Verification', 'TruckFixr Test', $1, '25', 'Temporary verification lead only', 'book_a_demo', now(), now())
      `,
      [`rls-lead-${suffix}@truckfixr.test`]
    );

    await client.query(
      `
        INSERT INTO "supportRecoveryActions" (
          "actionType", "staffUserId", "targetFleetId", "targetUserId", "targetVehicleId", "reason", "beforeState", "afterState", "createdAt"
        )
        VALUES ($1, $2, $3, $4, $5, $6, '{}'::jsonb, '{}'::jsonb, now())
      `,
      ["rls_verification_seed", ownerAId, fleetAId, userAId, vehicleAId, "temporary verification row"]
    );

    await client.query(
      `
        INSERT INTO "earlyWarningFlags" (
          "fleetId", "vehicleId", "warningType", "warningReason", "severity", "isActive", "createdAt", "updatedAt"
        )
        VALUES ($1, $2, 'high_severity_defect', 'RLS verification warning', 'high', true, now(), now())
      `,
      [fleetAId, vehicleAId]
    );

    const userASubject = userAOpenId.replace(/^supabase_/, "");
    const ownerBSubject = ownerBOpenId.replace(/^supabase_/, "");

    const allowedVehicleCount = await asRole(client, "authenticated", userASubject, () =>
      queryCount(client, `SELECT count(*) FROM "vehicles" WHERE "id" = $1`, [vehicleAId])
    );
    assert(allowedVehicleCount === 1, "Driver-scoped user should see the assigned fleet vehicle.");

    const deniedVehicleCount = await asRole(client, "authenticated", userASubject, () =>
      queryCount(client, `SELECT count(*) FROM "vehicles" WHERE "id" = $1`, [vehicleBId])
    );
    assert(deniedVehicleCount === 0, "Driver-scoped user should not see another fleet's vehicle.");

    const ownerBVehicleCount = await asRole(client, "authenticated", ownerBSubject, () =>
      queryCount(client, `SELECT count(*) FROM "vehicles" WHERE "id" = $1`, [vehicleBId])
    );
    assert(ownerBVehicleCount === 1, "Fleet owner should see their fleet vehicle.");

    await asRole(client, "authenticated", userASubject, () =>
      expectForbidden(
        client,
        () =>
          client.query(
            `
              INSERT INTO "activityLogs" ("fleetId", "userId", "action", "entityType", "entityId", "details", "createdAt")
              VALUES ($1, $2, 'cross_fleet_insert', 'vehicle', 1, '{}'::jsonb, now())
            `,
            [fleetBId, userAId]
          ),
        "Cross-fleet activity log insert should be denied"
      )
    );

    await asRole(client, "authenticated", userASubject, async () => {
      await client.query(
        `
          INSERT INTO "activityLogs" ("fleetId", "userId", "action", "entityType", "entityId", "details", "createdAt")
          VALUES ($1, $2, 'allowed_insert', 'vehicle', 1, '{}'::jsonb, now())
        `,
        [fleetAId, userAId]
      );
    });

    const supportRecoveryReadCount = await asRole(client, "authenticated", userASubject, () =>
      queryCount(client, `SELECT count(*) FROM "supportRecoveryActions" WHERE "targetFleetId" = $1`, [fleetAId])
    );
    assert(
      supportRecoveryReadCount === 0,
      "Authenticated user should not read support recovery audit rows."
    );

    const serviceRoleReadCount = await asRole(client, "service_role", serviceRoleSubject, () =>
      queryCount(client, `SELECT count(*) FROM "supportRecoveryActions" WHERE "targetFleetId" = $1`, [fleetAId])
    );
    assert(serviceRoleReadCount === 1, "service_role should read support recovery audit rows.");

    const allowedSubscriptionCount = await asRole(client, "authenticated", userASubject, () =>
      queryCount(client, `SELECT count(*) FROM "subscriptions" WHERE "fleetId" = $1`, [fleetAId])
    );
    assert(allowedSubscriptionCount === 1, "User should read their own fleet subscription row.");

    const deniedSubscriptionCount = await asRole(client, "authenticated", userASubject, () =>
      queryCount(client, `SELECT count(*) FROM "subscriptions" WHERE "fleetId" = $1`, [fleetBId])
    );
    assert(
      deniedSubscriptionCount === 0,
      "User should not read another fleet's subscription row."
    );

    const allowedWarningCount = await asRole(client, "authenticated", userASubject, () =>
      queryCount(client, `SELECT count(*) FROM "earlyWarningFlags" WHERE "fleetId" = $1`, [fleetAId])
    );
    assert(allowedWarningCount === 1, "Fleet user should read their fleet's early-warning flags.");

    const deniedWarningCount = await asRole(client, "authenticated", ownerBSubject, () =>
      queryCount(client, `SELECT count(*) FROM "earlyWarningFlags" WHERE "fleetId" = $1`, [fleetAId])
    );
    assert(deniedWarningCount === 0, "User should not read another fleet's early-warning flags.");

    const allowedReviewQueueCount = await asRole(client, "authenticated", userASubject, () =>
      queryCount(client, `SELECT count(*) FROM "inspectionReviewQueueItems" WHERE "fleetId" = $1`, [fleetAId])
    );
    assert(allowedReviewQueueCount === 1, "Fleet user should read their own review queue row.");

    const deniedReviewQueueCount = await asRole(client, "authenticated", ownerBSubject, () =>
      queryCount(client, `SELECT count(*) FROM "inspectionReviewQueueItems" WHERE "fleetId" = $1`, [fleetAId])
    );
    assert(deniedReviewQueueCount === 0, "Cross-fleet review queue row should be hidden.");

    const allowedReviewActionCount = await asRole(client, "authenticated", userASubject, () =>
      queryCount(client, `SELECT count(*) FROM "inspectionReviewActions" WHERE "queueItemId" = $1`, [reviewQueueAId])
    );
    assert(allowedReviewActionCount === 1, "Fleet user should read their own review action row.");

    const deniedReviewActionCount = await asRole(client, "authenticated", ownerBSubject, () =>
      queryCount(client, `SELECT count(*) FROM "inspectionReviewActions" WHERE "queueItemId" = $1`, [reviewQueueAId])
    );
    assert(deniedReviewActionCount === 0, "Cross-fleet review action row should be hidden.");

    const allowedSessionCount = await asRole(client, "authenticated", userASubject, () =>
      queryCount(client, `SELECT count(*) FROM "combinedInspectionSessions" WHERE "fleetId" = $1`, [fleetAId])
    );
    assert(allowedSessionCount === 1, "Fleet user should read their own combined inspection session.");

    const deniedSessionCount = await asRole(client, "authenticated", ownerBSubject, () =>
      queryCount(client, `SELECT count(*) FROM "combinedInspectionSessions" WHERE "fleetId" = $1`, [fleetAId])
    );
    assert(deniedSessionCount === 0, "Cross-fleet combined inspection session should be hidden.");

    const allowedNoteCount = await asRole(client, "authenticated", userASubject, () =>
      queryCount(client, `SELECT count(*) FROM "adminFleetNotes" WHERE "fleetId" = $1`, [fleetAId])
    );
    assert(allowedNoteCount === 1, "Fleet user should read their own fleet note.");

    const deniedNoteCount = await asRole(client, "authenticated", ownerBSubject, () =>
      queryCount(client, `SELECT count(*) FROM "adminFleetNotes" WHERE "fleetId" = $1`, [fleetAId])
    );
    assert(deniedNoteCount === 0, "Cross-fleet admin note should be hidden.");

    const leadReadCount = await asRole(client, "authenticated", userASubject, () =>
      queryCount(client, `SELECT count(*) FROM "lead_submissions"`)
    );
    assert(leadReadCount === 0, "Authenticated users must not read lead submissions.");

    const serviceRoleLeadReadCount = await asRole(client, "service_role", serviceRoleSubject, () =>
      queryCount(client, `SELECT count(*) FROM "lead_submissions"`)
    );
    assert(serviceRoleLeadReadCount === 1, "service_role should read verification lead submissions.");

    await client.query("ROLLBACK");

    console.log(
      JSON.stringify(
        {
          ok: true,
          databaseTarget: target.kind,
          checks: [
            "assigned vehicle visible to authorized driver",
            "cross-fleet vehicle hidden",
            "cross-fleet activity log insert denied",
            "support recovery audit hidden from authenticated users",
            "support recovery audit visible to service_role",
            "subscription rows remain fleet-scoped",
            "early-warning flags remain fleet-scoped",
            "post-0012 tables have RLS enabled",
            "review queue and action rows remain fleet-scoped",
            "combined inspection sessions remain fleet-scoped",
            "admin fleet notes remain fleet-scoped",
            "lead submissions remain hidden from authenticated users",
            "lead submissions remain readable by service_role",
          ],
        },
        null,
        2
      )
    );
  } finally {
    client.release();
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
