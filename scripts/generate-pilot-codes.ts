import { eq } from "drizzle-orm";
import { getDb } from "../server/db";
import { pilotAccessCodes } from "../drizzle/schema";
import { generatePilotCode } from "../server/services/access";

function getArg(name: string, fallback: string) {
  const index = process.argv.findIndex((arg) => arg === name);
  return index >= 0 ? String(process.argv[index + 1] ?? fallback) : fallback;
}

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_REMOTE_SEED !== "true") {
    throw new Error("Pilot code generation is blocked in production unless ALLOW_DEMO_REMOTE_SEED=true.");
  }

  const count = Math.max(1, Number(getArg("--count", "20")) || 20);
  const prefix = getArg("--prefix", "TFX-PILOT");
  const source = getArg("--source", "existing_customer");

  const db = await getDb();
  if (!db) {
    throw new Error("Database not available.");
  }

  const created: string[] = [];
  for (let index = 0; index < count; index += 1) {
    let code = generatePilotCode(prefix);
    let attempts = 0;
    while (attempts < 10) {
      const [existing] = await db.select({ id: pilotAccessCodes.id }).from(pilotAccessCodes).where(eq(pilotAccessCodes.code, code)).limit(1);
      if (!existing) break;
      code = generatePilotCode(prefix);
      attempts += 1;
    }

    await db.insert(pilotAccessCodes).values({
      code,
      fleetName: null,
      status: "active",
      maxUsers: 1,
      maxVehicles: 10,
      activationDurationDays: 30,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    created.push(code);
  }

  console.log(
    JSON.stringify(
      {
        success: true,
        count: created.length,
        source,
        prefix,
        codes: created,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
