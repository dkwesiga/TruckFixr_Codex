// Guest "/try-one-case" demo seed for staging (§38 scenarios). Creates guest
// cases via the real services so the data is realistic. Local DB only unless
// ALLOW_GUEST_DEMO_REMOTE_SEED=true. Tagged by anonSessionId for clean rollback.
//
//   pnpm seed:guest-demo            # seed
//   pnpm seed:guest-demo:rollback   # remove seeded rows

import "dotenv/config";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { eq, like } from "drizzle-orm";
import { getDb } from "../server/db";
import { guestCases, pilotApplications } from "../drizzle/schema";
import {
  startGuestCase,
  submitGuestContact,
} from "../server/services/guestCaseService";
import { recordOutcome } from "../server/services/guestCaseOutcomes";
import { applyForPilot } from "../server/services/pilotApplications";

const TAG = "guest-demo-seed";
const FLEET_MARKER = "Demo Fleet (guest-demo)";

function assertSafeTarget() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is required.");
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    throw new Error("DATABASE_URL is invalid.");
  }
  const local = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!local.has(host) && process.env.ALLOW_GUEST_DEMO_REMOTE_SEED !== "true") {
    throw new Error(
      "Guest demo seed is blocked for remote DATABASE_URL unless ALLOW_GUEST_DEMO_REMOTE_SEED=true."
    );
  }
}

export async function seedGuestDemo() {
  assertSafeTarget();
  const db = await getDb();
  if (!db) throw new Error("Database not available.");

  const existing = await db.select().from(guestCases).where(eq(guestCases.anonSessionId, TAG)).limit(1);
  if (existing.length > 0) {
    return { skipped: true, reason: "already seeded — run rollback first" };
  }

  const base = { anonSessionId: TAG, intakeSource: "web" as const };

  // 1. Ready — benign, operating normally.
  await startGuestCase({ ...base, concernText: "Amber check-engine light, truck runs fine", operatingStatus: "operating_normally", concernCategory: "warning_light", vehicleIdentifier: { unitNumber: "D-101" } });

  // 2. Service Soon — stopped, needs scheduling.
  const serviceSoon = await startGuestCase({ ...base, concernText: "Engine lost power and stopped on the shoulder", operatingStatus: "stopped", concernCategory: "symptom", vehicleIdentifier: { unitNumber: "D-118" } });
  await submitGuestContact({ publicToken: serviceSoon.publicToken, email: "ops@demo-fleet.com", consentEmail: true });

  // 3. Stop — critical trigger (persisted + review queued).
  await startGuestCase({ ...base, concernText: "Driver reports the brakes failed coming down a hill", operatingStatus: "stopped", concernCategory: "symptom", vehicleIdentifier: { unitNumber: "D-214" } });

  // 4. Duplicate free-case attempt — same email domain as #2 -> graceful limit.
  const dup = await startGuestCase({ ...base, concernText: "Coolant temperature reading high", operatingStatus: "operating_with_symptoms", concernCategory: "warning_light", vehicleIdentifier: { unitNumber: "D-402" } });
  await submitGuestContact({ publicToken: dup.publicToken, email: "dispatch@demo-fleet.com", consentEmail: true });

  // 5. Prior confirmed repair (sets up repeat detection).
  const prior = await startGuestCase({ ...base, concernText: "DPF regeneration fault", operatingStatus: "operating_with_symptoms", concernCategory: "fault_code", vehicleIdentifier: { vin: "1DEMOVIN0000001" } });
  await submitGuestContact({ publicToken: prior.publicToken, email: "shop@demo-fleet.com", consentEmail: true });
  await recordOutcome({ publicToken: prior.publicToken, confirmedRepair: true, repairCompletedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), actualDowntimeHours: 6, evidenceSource: "customer_reported" });

  // 6. Repeat within 30 days — same VIN as #5.
  const repeat = await startGuestCase({ ...base, concernText: "DPF fault returned after the repair", operatingStatus: "operating_with_symptoms", concernCategory: "fault_code", vehicleIdentifier: { vin: "1DEMOVIN0000001" } });
  await submitGuestContact({ publicToken: repeat.publicToken, email: "shop@demo-fleet.com", consentEmail: true });
  await recordOutcome({ publicToken: repeat.publicToken, confirmedRepair: true, evidenceSource: "unknown" });

  // 7. Pilot application (qualified).
  await applyForPilot({ fleetName: FLEET_MARKER, vehicleCount: 4, expectedCases30d: 3, primaryContact: { email: "owner@demo-fleet.com" } });

  const total = await db.select().from(guestCases).where(eq(guestCases.anonSessionId, TAG));
  return { seeded: true, guestCases: total.length };
}

export async function rollbackGuestDemo() {
  assertSafeTarget();
  const db = await getDb();
  if (!db) throw new Error("Database not available.");
  // Child rows (events/contacts/review-queue) cascade on guest case delete.
  await db.delete(guestCases).where(eq(guestCases.anonSessionId, TAG));
  await db.delete(pilotApplications).where(like(pilotApplications.fleetName, "%(guest-demo)%"));
  return { rolledBack: true };
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  const rollback = process.argv.includes("--rollback");
  (rollback ? rollbackGuestDemo() : seedGuestDemo())
    .then((summary) => {
      console.log(JSON.stringify({ ok: true, mode: rollback ? "rollback" : "seed", ...summary }, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
