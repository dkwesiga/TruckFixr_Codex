import "dotenv/config";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { and, eq } from "drizzle-orm";
import { getDb } from "../server/db";
import { fleets, users } from "../drizzle/schema";
import { hashPassword } from "../server/_core/localUsers";
import { ensureCompanyMembership } from "../server/services/companyAccess";
import { setMaintenanceGrant } from "../server/services/maintenancePermissions";
import {
  MAINTENANCE_CAPABILITIES,
  SERVICE_ADVISOR_CAPABILITIES,
  TECHNICIAN_CAPABILITIES,
} from "../shared/maintenance/permissions";

/**
 * Seed two non-manager staff accounts for the Mr Diesel Inc partner fleet, so
 * the Service Advisor / Technician capability split (§4 of the Mr Diesel /
 * TADIS pipeline) is actually demonstrable — the owner account created by
 * `pnpm seed:partner` bypasses every capability check implicitly and so
 * cannot show the "Service Advisor can't verify an Outcome, Technician can"
 * boundary on its own.
 *
 * Both accounts are `driver`-role company members with a capability grant
 * (not new DB roles) — see shared/maintenance/permissions.ts.
 *
 * Requires the Mr Diesel Inc partner fleet to already exist: run
 * `pnpm seed:partner` first.
 *
 * Usage:
 *   SERVICE_ADVISOR_PASSWORD='...' TECHNICIAN_PASSWORD='...' pnpm seed:partner-staff
 *
 * Either password may be omitted if that account already exists (its
 * existing password is left as-is); a password is required the first time
 * each account is created.
 */

const FLEET_NAME = "Mr Diesel Inc";

const SERVICE_ADVISOR_EMAIL = "mrdiesel.advisor@gmail.com";
const SERVICE_ADVISOR_PASSWORD = process.env.SERVICE_ADVISOR_PASSWORD ?? "";
const SERVICE_ADVISOR_NAME = "Ana Torres (Service Advisor)";
const SERVICE_ADVISOR_OPEN_ID = "seed_partner_mrdiesel_advisor";

const TECHNICIAN_EMAIL = "mrdiesel.tech@gmail.com";
const TECHNICIAN_PASSWORD = process.env.TECHNICIAN_PASSWORD ?? "";
const TECHNICIAN_NAME = "Sam Reyes (Technician)";
const TECHNICIAN_OPEN_ID = "seed_partner_mrdiesel_tech";

async function upsertStaffUser(input: {
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
  openId: string;
  email: string;
  name: string;
  password: string;
}) {
  const email = input.email.trim().toLowerCase();
  const [existing] = await input.db.select().from(users).where(eq(users.email, email)).limit(1);

  if (existing) {
    const passwordUpdate = input.password ? { passwordHash: await hashPassword(input.password) } : {};
    const [updated] = await input.db
      .update(users)
      .set({
        name: input.name,
        ...passwordUpdate,
        loginMethod: "email",
        emailVerified: true,
        role: "driver",
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id))
      .returning();
    return updated;
  }

  if (!input.password) {
    throw new Error(
      `A password is required to create ${email} for the first time. Set the matching *_PASSWORD env var.`
    );
  }

  const [created] = await input.db
    .insert(users)
    .values({
      openId: input.openId,
      email,
      name: input.name,
      passwordHash: await hashPassword(input.password),
      loginMethod: "email",
      emailVerified: true,
      role: "driver",
    })
    .returning();
  return created;
}

async function main() {
  const db = await getDb();
  if (!db) {
    throw new Error("DATABASE_URL is not configured; cannot seed the partner staff accounts.");
  }

  const [fleet] = await db
    .select({ id: fleets.id, ownerId: fleets.ownerId, name: fleets.name })
    .from(fleets)
    .where(and(eq(fleets.name, FLEET_NAME), eq(fleets.isPartner, true)))
    .limit(1);

  if (!fleet) {
    throw new Error(
      `No partner fleet named "${FLEET_NAME}" found. Run 'pnpm seed:partner' first to create the owner and fleet.`
    );
  }

  const advisor = await upsertStaffUser({
    db,
    openId: SERVICE_ADVISOR_OPEN_ID,
    email: SERVICE_ADVISOR_EMAIL,
    name: SERVICE_ADVISOR_NAME,
    password: SERVICE_ADVISOR_PASSWORD,
  });
  await ensureCompanyMembership({
    fleetId: fleet.id,
    userId: advisor.id,
    role: "driver",
    approvedByUserId: fleet.ownerId,
    status: "active",
  });
  await setMaintenanceGrant({
    fleetId: fleet.id,
    userId: advisor.id,
    capabilities: SERVICE_ADVISOR_CAPABILITIES,
    actorUserId: fleet.ownerId,
    notes: "Seeded demo account: Service Advisor capability preset.",
  });

  const technician = await upsertStaffUser({
    db,
    openId: TECHNICIAN_OPEN_ID,
    email: TECHNICIAN_EMAIL,
    name: TECHNICIAN_NAME,
    password: TECHNICIAN_PASSWORD,
  });
  await ensureCompanyMembership({
    fleetId: fleet.id,
    userId: technician.id,
    role: "driver",
    approvedByUserId: fleet.ownerId,
    status: "active",
  });
  await setMaintenanceGrant({
    fleetId: fleet.id,
    userId: technician.id,
    capabilities: TECHNICIAN_CAPABILITIES,
    actorUserId: fleet.ownerId,
    notes: "Seeded demo account: Technician capability preset.",
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        fleetId: fleet.id,
        fleetName: fleet.name,
        serviceAdvisor: {
          userId: advisor.id,
          email: SERVICE_ADVISOR_EMAIL,
          role: "driver",
          capabilities: SERVICE_ADVISOR_CAPABILITIES,
          canVerifyOutcome: SERVICE_ADVISOR_CAPABILITIES.includes(MAINTENANCE_CAPABILITIES.verifyOutcome),
        },
        technician: {
          userId: technician.id,
          email: TECHNICIAN_EMAIL,
          role: "driver",
          capabilities: TECHNICIAN_CAPABILITIES,
          canVerifyOutcome: TECHNICIAN_CAPABILITIES.includes(MAINTENANCE_CAPABILITIES.verifyOutcome),
        },
        signInAt: "/login",
        nextStep:
          "Sign in as the Service Advisor and confirm the Verify button on /app/case/:id is refused server-side; sign in as the Technician and confirm it succeeds.",
      },
      null,
      2
    )
  );
}

const executedDirectly = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false;

if (executedDirectly) {
  void main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
