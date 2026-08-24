import "dotenv/config";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { getDb } from "../server/db";
import { fleets, users } from "../drizzle/schema";
import { hashPassword } from "../server/_core/localUsers";
import { setFleetFeature } from "../server/services/fleetFeatures";
import { ALL_FLEET_MAINTENANCE_FEATURE_KEYS } from "../shared/maintenance/featureKeys";

/**
 * Seed the flagship partner repair shop (Mr Diesel Inc).
 *
 * Creates (idempotently) a partner owner user and a partner-flagged fleet so
 * the shop can run triage, record outcomes, and promote them into the shared
 * knowledge base at /partner/knowledge.
 *
 * Usage: PARTNER_PASSWORD='...' pnpm seed:partner   (requires DATABASE_URL)
 *
 * The password is intentionally NOT committed to source. When the user already
 * exists and PARTNER_PASSWORD is unset, the existing password is left as-is;
 * creating a new user requires PARTNER_PASSWORD.
 */

const PARTNER_EMAIL = "mrdiesel.ca@gmail.com";
const PARTNER_PASSWORD = process.env.PARTNER_PASSWORD ?? "";
const PARTNER_NAME = "Mr Diesel";
const PARTNER_FLEET_NAME = "Mr Diesel Inc";
const PARTNER_OPEN_ID = "seed_partner_mrdiesel";

// Partner shops are free-to-partner but bounded (docs/repair-shop-partner-mvp.md
// §5.4) — reuse the existing "custom_fleet" plan (uncapped vehicle/trailer/AI
// limits, no card required) rather than inventing a new PlanKey, and mark
// billing "active" so the fleet never reads as trialing in the UI.
const PARTNER_PLAN_FIELDS = {
  planName: "custom_fleet",
  billingInterval: "custom",
  billingStatus: "active",
  poweredVehicleLimit: null,
  includedTrailerLimit: null,
  paidExtraTrailerQuantity: 0,
  totalActiveTrailerLimit: null,
  aiSessionMonthlyLimit: null,
  isTrial: false,
  isPaidPilot: false,
  salesStatus: "partner_active",
} as const;

async function main() {
  const db = await getDb();
  if (!db) {
    throw new Error("DATABASE_URL is not configured; cannot seed the partner account.");
  }

  const email = PARTNER_EMAIL.trim().toLowerCase();

  // Upsert the partner owner user.
  const [existingUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  let userId: number;
  if (existingUser) {
    // Only reset the password when one is explicitly provided; otherwise the
    // existing credential is preserved.
    const passwordUpdate = PARTNER_PASSWORD
      ? { passwordHash: await hashPassword(PARTNER_PASSWORD) }
      : {};
    const [updated] = await db
      .update(users)
      .set({
        name: PARTNER_NAME,
        ...passwordUpdate,
        loginMethod: "email",
        emailVerified: true,
        role: "owner",
        updatedAt: new Date(),
      })
      .where(eq(users.id, existingUser.id))
      .returning();
    userId = updated.id;
  } else {
    if (!PARTNER_PASSWORD) {
      throw new Error(
        "PARTNER_PASSWORD is required to create the partner user. Run: PARTNER_PASSWORD='...' pnpm seed:partner"
      );
    }
    const [created] = await db
      .insert(users)
      .values({
        openId: PARTNER_OPEN_ID,
        email,
        name: PARTNER_NAME,
        passwordHash: await hashPassword(PARTNER_PASSWORD),
        loginMethod: "email",
        emailVerified: true,
        role: "owner",
      })
      .returning();
    userId = created.id;
  }

  // Upsert the partner fleet owned by that user.
  const [existingFleet] = await db
    .select()
    .from(fleets)
    .where(eq(fleets.ownerId, userId))
    .limit(1);

  let fleetId: number;
  if (existingFleet) {
    const [updated] = await db
      .update(fleets)
      .set({
        name: PARTNER_FLEET_NAME,
        isPartner: true,
        ...PARTNER_PLAN_FIELDS,
        updatedAt: new Date(),
      })
      .where(eq(fleets.id, existingFleet.id))
      .returning();
    fleetId = updated.id;
  } else {
    const [created] = await db
      .insert(fleets)
      .values({
        name: PARTNER_FLEET_NAME,
        ownerId: userId,
        isPartner: true,
        ...PARTNER_PLAN_FIELDS,
      })
      .returning();
    fleetId = created.id;
  }

  // Fleet Health & Maintenance capabilities (issue capture, repair outcomes,
  // etc.) fail closed with no fleetFeatures row — enable the full pilot flag
  // set so the shop's vehicle -> issue -> repair-outcome loop actually works,
  // mirroring how scripts/seed-maintenance-demo.ts provisions a demo fleet.
  for (const key of ALL_FLEET_MAINTENANCE_FEATURE_KEYS) {
    await setFleetFeature({ fleetId, featureKey: key, enabled: true, actorUserId: userId });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        partner: {
          userId,
          fleetId,
          email,
          name: PARTNER_NAME,
          fleetName: PARTNER_FLEET_NAME,
          role: "owner",
          isPartner: true,
        },
        signInAt: "/login",
        newCasePath: "/partner/cases/new",
        casesPath: "/app/fleet-health",
        studioPath: "/partner/knowledge",
        nextStep:
          "Sign in as the partner owner, open /partner/cases/new to add a vehicle and issue, record the repair outcome on the case page, then propose confirmed outcomes to the knowledge base at /partner/knowledge.",
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
