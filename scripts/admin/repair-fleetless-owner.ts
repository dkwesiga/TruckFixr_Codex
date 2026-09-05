import "dotenv/config";
import { eq } from "drizzle-orm";
import { getDb } from "../../server/db";
import { fleets, users } from "../../drizzle/schema";
import { ensureCompanyMembership, ensureFleetInviteCode, getUserPrimaryFleetId } from "../../server/services/companyAccess";
import { classifyDatabaseTarget } from "../verify/db-target-guard";

/**
 * One-off repair for an account stuck in the broken state fixed by the
 * UserProfile "Skip for Now" bug (client/src/pages/UserProfile.tsx): the
 * account's role was saved as "owner" or "manager" during onboarding, but
 * the fleet-creation step was skipped, so no fleet or companyMemberships
 * row was ever created. That leaves the account permanently unable to load
 * the manager dashboard ("TruckFixr could not find a fleet for this
 * manager account yet") or manage billing.
 *
 * This script is idempotent: if the account already resolves to a fleet
 * (owned or via an active membership), it reports that and makes no
 * changes unless --force is passed.
 *
 * Usage:
 *   tsx scripts/admin/repair-fleetless-owner.ts --email kiptrans374@gmail.com --fleet-name "Kip Trans Fleet"
 *   tsx scripts/admin/repair-fleetless-owner.ts --email ... --fleet-name ... --dry-run
 */

function readBooleanEnv(name: string) {
  return /^(1|true|yes)$/i.test(process.env[name]?.trim() ?? "");
}

function assertWriteAllowed(databaseUrl: string) {
  const target = classifyDatabaseTarget(databaseUrl);

  if (target.kind === "local") {
    return target;
  }

  if (target.kind === "staging" && readBooleanEnv("ALLOW_STAGING_DB_VERIFY_WRITES")) {
    return target;
  }

  if (target.kind === "production" && readBooleanEnv("ALLOW_PRODUCTION_ADMIN_WRITE")) {
    return target;
  }

  throw new Error(
    [
      `[repair-fleetless-owner] Refusing to write against database target "${target.kind}" (${target.host}).`,
      "Set TFX_DATABASE_TARGET=production and ALLOW_PRODUCTION_ADMIN_WRITE=true only for an explicitly approved production account repair.",
    ].join(" ")
  );
}

function parseArgs(argv: string[]) {
  const args = new Map<string, string | boolean>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--dry-run") {
      args.set("dryRun", true);
      continue;
    }
    if (token === "--force") {
      args.set("force", true);
      continue;
    }

    if (token.startsWith("--")) {
      const key = token.slice(2);
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for --${key}`);
      }
      args.set(key, value);
      index += 1;
    }
  }

  return {
    email: String(args.get("email") ?? "").trim().toLowerCase(),
    fleetName: String(args.get("fleet-name") ?? "").trim(),
    dryRun: args.get("dryRun") === true,
    force: args.get("force") === true,
  };
}

async function main() {
  const { email, fleetName, dryRun, force } = parseArgs(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }
  if (!email) {
    throw new Error("Use --email <address>.");
  }

  const target = classifyDatabaseTarget(databaseUrl);
  if (!dryRun) {
    assertWriteAllowed(databaseUrl);
  }

  const db = await getDb();
  if (!db) {
    throw new Error("Could not connect to the database.");
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    throw new Error(`No user found for ${email}.`);
  }

  const existingFleetId = await getUserPrimaryFleetId(user.id);
  if (existingFleetId && !force) {
    console.log(
      JSON.stringify(
        {
          mode: "no_op",
          reason: "Account already resolves to a fleet; nothing to repair. Pass --force to recreate anyway.",
          databaseTarget: target.kind,
          user: { id: user.id, email: user.email, role: user.role },
          existingFleetId,
        },
        null,
        2
      )
    );
    return;
  }

  if (!fleetName && !dryRun) {
    throw new Error("Use --fleet-name \"<name>\" — there is no server-side record of the company name they intended (it only ever lived in client localStorage).");
  }

  const resolvedFleetName = fleetName || `${user.name || user.email}'s Fleet`;

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          mode: "dry_run",
          databaseTarget: target.kind,
          user: { id: user.id, email: user.email, role: user.role },
          existingFleetId: existingFleetId ?? null,
          plannedFleetName: resolvedFleetName,
          plannedRole: "owner",
        },
        null,
        2
      )
    );
    return;
  }

  const [fleet] = await db
    .insert(fleets)
    .values({
      name: resolvedFleetName,
      ownerId: user.id,
      subscriptionOwnerUserId: user.id,
      companyEmail: user.email,
      planId: 1,
    })
    .returning();

  if (!fleet) {
    throw new Error("Fleet insert did not return a row.");
  }

  await ensureCompanyMembership({
    fleetId: fleet.id,
    userId: user.id,
    role: "owner",
    approvedByUserId: user.id,
    status: "active",
  });

  if (user.role !== "owner") {
    await db.update(users).set({ role: "owner", updatedAt: new Date() }).where(eq(users.id, user.id));
  }

  const inviteCode = await ensureFleetInviteCode(fleet.id);

  console.log(
    JSON.stringify(
      {
        mode: "write",
        databaseTarget: target.kind,
        user: { id: user.id, email: user.email, previousRole: user.role, newRole: "owner" },
        fleet: { id: fleet.id, name: fleet.name, inviteCode },
      },
      null,
      2
    )
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
