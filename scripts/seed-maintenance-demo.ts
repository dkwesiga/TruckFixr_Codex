import "dotenv/config";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { and, eq } from "drizzle-orm";
import { getDb } from "../server/db";
import {
  externalAiConsent,
  fleets,
  maintenanceCases,
  pilotSettings,
  repairDocuments,
  repairOutcomes,
  users,
  vehicles,
} from "../drizzle/schema";
import {
  ALL_FLEET_MAINTENANCE_FEATURE_KEYS,
} from "../shared/maintenance/featureKeys";
import { MAINTENANCE_CAPABILITIES } from "../shared/maintenance/permissions";
import { setFleetFeature } from "../server/services/fleetFeatures";
import { setMaintenanceGrant } from "../server/services/maintenancePermissions";
import { ingestVehicleEvents } from "../server/services/vehicleEventIngestion";
import { createPmTemplate, assignPmTemplate } from "../server/services/pmService";
import {
  createManualCase,
  reopenCase,
  transitionCaseStatus,
} from "../server/services/maintenanceCases";
import {
  addDecision,
  approveCurrentDecision,
  recordCriticalOverride,
} from "../server/services/maintenanceDecisions";
import {
  completeCycle,
  markCycleStage,
  returnToService,
  startRepairCycle,
} from "../server/services/repairCycles";
import { upsertPilotSettings } from "../server/services/pilotSettings";

// Idempotent demo seed for the Fleet Health & Maintenance pilot (§50). Safe to
// re-run: every entity is looked up by a stable marker before creation. No real
// credentials or customer data. Local DB only unless ALLOW_DEMO_REMOTE_SEED=true.

const SEED_TAG = "[mx-demo]";
const FLEET_MARKER = "Maintenance Pilot Demo";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

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
  if (!local.has(host) && process.env.ALLOW_DEMO_REMOTE_SEED !== "true") {
    throw new Error(
      "Maintenance demo seed is blocked for remote DATABASE_URL unless ALLOW_DEMO_REMOTE_SEED=true."
    );
  }
}

async function ensureUser(db: Db, openId: string, name: string, email: string, role: "owner" | "manager" | "driver") {
  const [existing] = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  if (existing) return existing;
  const [row] = await db
    .insert(users)
    .values({ openId, name, email, role, emailVerified: true })
    .returning();
  return row;
}

async function ensureFleet(db: Db, ownerId: number) {
  const [existing] = await db.select().from(fleets).where(eq(fleets.name, FLEET_MARKER)).limit(1);
  if (existing) return existing;
  const [row] = await db.insert(fleets).values({ name: FLEET_MARKER, ownerId }).returning();
  return row;
}

async function ensureVehicle(db: Db, id: string, fleetId: number, unitNumber: string, vin: string, make: string, model: string) {
  const [existing] = await db.select().from(vehicles).where(eq(vehicles.id, id)).limit(1);
  if (existing) return existing;
  const [row] = await db
    .insert(vehicles)
    .values({ id, fleetId, unitNumber, vin, licensePlate: `MX${unitNumber}`, make, model, year: 2021 })
    .returning();
  return row;
}

async function findCaseByTitle(db: Db, fleetId: number, title: string) {
  const [row] = await db
    .select()
    .from(maintenanceCases)
    .where(and(eq(maintenanceCases.fleetId, fleetId), eq(maintenanceCases.title, title)))
    .limit(1);
  return row ?? null;
}

async function ensureCase(
  db: Db,
  args: { fleetId: number; vehicleId: string; title: string; summary: string; origin: "manual" | "issue" | "inspection"; actorUserId: number }
) {
  const existing = await findCaseByTitle(db, args.fleetId, args.title);
  if (existing) return { row: existing, created: false };
  const row = await createManualCase({
    fleetId: args.fleetId,
    vehicleId: args.vehicleId,
    origin: args.origin,
    title: args.title,
    summary: args.summary,
    createdByUserId: args.actorUserId,
  });
  return { row: row!, created: true };
}

async function ensureDocument(
  db: Db,
  args: { fleetId: number; caseId: number; filename: string; type: string; state: string; fields?: unknown }
) {
  const [existing] = await db
    .select({ id: repairDocuments.id })
    .from(repairDocuments)
    .where(and(eq(repairDocuments.caseId, args.caseId), eq(repairDocuments.originalFilename, args.filename)))
    .limit(1);
  if (existing) return existing.id;
  const [row] = await db
    .insert(repairDocuments)
    .values({
      fleetId: args.fleetId,
      caseId: args.caseId,
      documentType: args.type,
      originalFilename: args.filename,
      storageKey: `demo/${args.fleetId}/${args.caseId}/${args.filename}`,
      sizeBytes: 12345,
      mimeType: "application/pdf",
      checksumSha256: `demo-${args.caseId}-${args.filename}`.padEnd(64, "0").slice(0, 64),
      processingState: args.state,
      normalizedFieldsJson: (args.fields ?? null) as never,
    })
    .returning({ id: repairDocuments.id });
  return row?.id ?? null;
}

export async function seedMaintenanceDemo() {
  assertSafeTarget();
  const db = await getDb();
  if (!db) throw new Error("Database unavailable.");

  const owner = await ensureUser(db, `${SEED_TAG}-owner`, "Demo Owner", "owner@mx-demo.truckfixr.test", "owner");
  const manager = await ensureUser(db, `${SEED_TAG}-manager`, "Demo Manager", "manager@mx-demo.truckfixr.test", "manager");
  const maint = await ensureUser(db, `${SEED_TAG}-maint`, "Demo Maintenance", "maint@mx-demo.truckfixr.test", "driver");
  const fleet = await ensureFleet(db, owner!.id);
  const fleetId = fleet!.id;

  const v1 = await ensureVehicle(db, `${SEED_TAG}-v1`, fleetId, "101", "1FUJGLDR0MDA10101", "Freightliner", "Cascadia");
  const v2 = await ensureVehicle(db, `${SEED_TAG}-v2`, fleetId, "102", "1FUJGLDR0MDA10202", "Kenworth", "T680");
  const v3 = await ensureVehicle(db, `${SEED_TAG}-v3`, fleetId, "103", "1FUJGLDR0MDA10303", "Peterbilt", "579");

  // Enable all pilot flags.
  for (const key of ALL_FLEET_MAINTENANCE_FEATURE_KEYS) {
    await setFleetFeature({ fleetId, featureKey: key, enabled: true, actorUserId: owner!.id });
  }

  // Grant the maintenance user narrow capabilities.
  await setMaintenanceGrant({
    fleetId,
    userId: maint!.id,
    actorUserId: owner!.id,
    capabilities: [
      MAINTENANCE_CAPABILITIES.viewAssignedCases,
      MAINTENANCE_CAPABILITIES.updateRepairStatus,
      MAINTENANCE_CAPABILITIES.uploadDocuments,
      MAINTENANCE_CAPABILITIES.viewOperationalRepairDetails,
    ],
  });

  // Events: accepted structured + review-required free text (idempotent by key).
  await ingestVehicleEvents({
    fleetId,
    actorUserId: manager!.id,
    channel: "manual",
    events: [
      { vehicleId: v1!.id, source: "manual", eventType: "odometer", eventTimestamp: "2026-07-10T12:00:00Z", odometerKm: 250000 },
      { vehicleId: v1!.id, source: "manual", eventType: "dtc_detected", eventTimestamp: "2026-07-12T12:00:00Z", dtcCode: "P0420" },
      { vehicleId: v1!.id, source: "manual", eventType: "dtc_detected", eventTimestamp: "2026-07-18T12:00:00Z", dtcCode: "P0420" },
      { vehicleId: v2!.id, source: "manual", eventType: "free_text", eventTimestamp: "2026-07-15T12:00:00Z" },
    ],
  });

  // PM: a template (guarded by name) with two vehicle assignments.
  const pmTemplate = await ensurePmTemplate(db, fleetId, owner!.id);
  if (pmTemplate) {
    await assignPmTemplate({ fleetId, actorUserId: owner!.id, vehicleId: v1!.id, pmTemplateId: pmTemplate });
    await assignPmTemplate({ fleetId, actorUserId: owner!.id, vehicleId: v2!.id, pmTemplateId: pmTemplate });
  }

  // Stable case (monitoring).
  const stable = await ensureCase(db, { fleetId, vehicleId: v3!.id, title: `${SEED_TAG} Stable monitor`, summary: "Minor noise; monitor.", origin: "manual", actorUserId: manager!.id });
  if (stable.created) {
    await addDecision({ fleetId, caseId: stable.row.id, actorUserId: manager!.id, source: "manual", severity: "stable", proposedAction: "continue_monitor" });
  }

  // Attention case (approved).
  const attention = await ensureCase(db, { fleetId, vehicleId: v2!.id, title: `${SEED_TAG} Attention aftertreatment`, summary: "Repeat DEF derate; schedule service.", origin: "issue", actorUserId: manager!.id });
  if (attention.created) {
    await addDecision({ fleetId, caseId: attention.row.id, actorUserId: manager!.id, source: "manual", severity: "attention", proposedAction: "schedule_service", rationale: "Repeat DEF derate within 14 days." });
    await approveCurrentDecision({ fleetId, caseId: attention.row.id, actorUserId: manager!.id });
  }

  // Critical case with a recorded override.
  const critical = await ensureCase(db, { fleetId, vehicleId: v1!.id, title: `${SEED_TAG} Critical brake`, summary: "Critical brake defect; do not operate.", origin: "inspection", actorUserId: manager!.id });
  if (critical.created) {
    await addDecision({ fleetId, caseId: critical.row.id, actorUserId: manager!.id, source: "ai", severity: "critical", proposedAction: "pull_from_service", originalRecommendation: { text: "Stop now — brake chamber failure." } });
    await recordCriticalOverride({ fleetId, caseId: critical.row.id, actorUserId: owner!.id, finalAction: "schedule_service", overrideReason: "Certified tech inspected; safe to move to the shop at low speed." });
  }

  // Awaiting-parts, overdue.
  const awaiting = await ensureCase(db, { fleetId, vehicleId: v1!.id, title: `${SEED_TAG} Awaiting parts overdue`, summary: "Waiting on a NOx sensor.", origin: "issue", actorUserId: manager!.id });
  if (awaiting.created) {
    await addDecision({ fleetId, caseId: awaiting.row.id, actorUserId: manager!.id, source: "manual", severity: "attention", proposedAction: "schedule_service" });
    await approveCurrentDecision({ fleetId, caseId: awaiting.row.id, actorUserId: manager!.id });
    await transitionCaseStatus({ fleetId, caseId: awaiting.row.id, toStatus: "scheduled", actorUserId: manager!.id });
    await transitionCaseStatus({ fleetId, caseId: awaiting.row.id, toStatus: "out_of_service", actorUserId: manager!.id });
    await startRepairCycle({ fleetId, caseId: awaiting.row.id, actorUserId: manager!.id });
    await markCycleStage({ fleetId, caseId: awaiting.row.id, actorUserId: manager!.id, stage: "out_of_service" });
    await markCycleStage({ fleetId, caseId: awaiting.row.id, actorUserId: manager!.id, stage: "awaiting_parts", expectedCompletionAt: new Date("2026-07-15T12:00:00Z") });
    await transitionCaseStatus({ fleetId, caseId: awaiting.row.id, toStatus: "awaiting_parts", actorUserId: manager!.id });
  }

  // Reopened case with two repair cycles + documents + outcome.
  const reopened = await ensureCase(db, { fleetId, vehicleId: v2!.id, title: `${SEED_TAG} Reopened two cycles`, summary: "Coolant leak recurred after first repair.", origin: "issue", actorUserId: manager!.id });
  if (reopened.created) {
    await addDecision({ fleetId, caseId: reopened.row.id, actorUserId: manager!.id, source: "manual", severity: "attention", proposedAction: "schedule_service" });
    await approveCurrentDecision({ fleetId, caseId: reopened.row.id, actorUserId: manager!.id });
    await transitionCaseStatus({ fleetId, caseId: reopened.row.id, toStatus: "scheduled", actorUserId: manager!.id });
    await transitionCaseStatus({ fleetId, caseId: reopened.row.id, toStatus: "out_of_service", actorUserId: manager!.id });
    await startRepairCycle({ fleetId, caseId: reopened.row.id, actorUserId: manager!.id });
    await markCycleStage({ fleetId, caseId: reopened.row.id, actorUserId: manager!.id, stage: "out_of_service" });
    await markCycleStage({ fleetId, caseId: reopened.row.id, actorUserId: manager!.id, stage: "ready_for_return" });
    await transitionCaseStatus({ fleetId, caseId: reopened.row.id, toStatus: "in_repair", actorUserId: manager!.id });
    await transitionCaseStatus({ fleetId, caseId: reopened.row.id, toStatus: "ready_for_return", actorUserId: manager!.id });
    await returnToService({ fleetId, caseId: reopened.row.id, actorUserId: manager!.id });
    await completeCycle({ fleetId, caseId: reopened.row.id, actorUserId: manager!.id, closureResult: "partially_resolved" });
    await transitionCaseStatus({ fleetId, caseId: reopened.row.id, toStatus: "completed", actorUserId: manager!.id });
    await transitionCaseStatus({ fleetId, caseId: reopened.row.id, toStatus: "closed", actorUserId: manager!.id });
    await reopenCase({ fleetId, caseId: reopened.row.id, actorUserId: owner!.id, reason: "Coolant leak recurred within 10 days." });
    await startRepairCycle({ fleetId, caseId: reopened.row.id, actorUserId: manager!.id });

    // Documents with an estimate/invoice variance + a duplicate invoice line.
    await ensureDocument(db, {
      fleetId, caseId: reopened.row.id, filename: "estimate.pdf", type: "estimate", state: "completed",
      fields: { currency: "CAD", subtotalCents: 100000, taxCents: 13000, totalCents: 113000, labourHours: 4, lineItems: [
        { description: "Labour", kind: "labour", quantity: 4, unitPriceCents: 15000, totalCents: 60000 },
        { description: "Coolant hose", kind: "part", quantity: 1, unitPriceCents: 40000, totalCents: 40000 },
      ] },
    });
    await ensureDocument(db, {
      fleetId, caseId: reopened.row.id, filename: "invoice.pdf", type: "invoice", state: "completed",
      fields: { currency: "CAD", subtotalCents: 145000, taxCents: 18850, totalCents: 163850, labourHours: 7, lineItems: [
        { description: "Labour", kind: "labour", quantity: 7, unitPriceCents: 15000, totalCents: 105000 },
        { description: "Coolant hose", kind: "part", quantity: 1, unitPriceCents: 40000, totalCents: 40000 },
        { description: "Shop supplies", kind: "fee", quantity: 1, unitPriceCents: 5000, totalCents: 5000 },
        { description: "Shop supplies", kind: "fee", quantity: 1, unitPriceCents: 5000, totalCents: 5000 },
      ] },
    });
    // A document stuck in manual review (extraction unavailable).
    await ensureDocument(db, { fleetId, caseId: reopened.row.id, filename: "workorder.pdf", type: "work_order", state: "manual_review_only" });

    // Structured repair outcome linked to the case.
    const [existingOutcome] = await db
      .select({ id: repairOutcomes.id })
      .from(repairOutcomes)
      .where(and(eq(repairOutcomes.fleetId, fleetId), eq(repairOutcomes.maintenanceCaseId, reopened.row.id)))
      .limit(1);
    if (!existingOutcome) {
      await db.insert(repairOutcomes).values({
        fleetId, vehicleId: v2!.id, recordedByUserId: manager!.id,
        confirmedFault: "Coolant hose leak", repairPerformed: "Replaced coolant hose and clamp",
        maintenanceCaseId: reopened.row.id, systemCategory: "cooling",
        agreementClassification: "agree", repairResult: "resolved",
      });
    }
  }

  // Pilot settings: primary manager set, NO backup manager (readiness warning),
  // valid dates, an authorization limit.
  await upsertPilotSettings({
    fleetId, actorUserId: owner!.id,
    patch: {
      status: "active",
      startDate: new Date("2026-07-01T00:00:00Z"),
      endDate: new Date("2026-09-30T00:00:00Z"),
      primaryManagerUserId: manager!.id,
      enrolledVehicleIds: [v1!.id, v2!.id, v3!.id],
      authorizationPolicy: { fleetLimitCents: 100000, managerLimitCents: 500000, delegationEnabled: false, currency: "CAD" },
    },
  });

  // Consent left at "none" so the readiness banner exercises manual-document mode.
  const [consent] = await db.select({ id: externalAiConsent.id }).from(externalAiConsent).where(eq(externalAiConsent.fleetId, fleetId)).limit(1);
  if (!consent) {
    await db.insert(externalAiConsent).values({ fleetId, status: "none" });
  }

  return {
    fleetId,
    users: { owner: owner!.id, manager: manager!.id, maintenance: maint!.id },
    vehicles: [v1!.id, v2!.id, v3!.id],
    cases: [stable.row.reference, attention.row.reference, critical.row.reference, awaiting.row.reference, reopened.row.reference],
  };
}

// Idempotent PM template creation guarded by name.
async function ensurePmTemplate(db: Db, fleetId: number, actorUserId: number): Promise<number | null> {
  const { pmTemplates } = await import("../drizzle/schema");
  const [existing] = await db
    .select({ id: pmTemplates.id })
    .from(pmTemplates)
    .where(and(eq(pmTemplates.fleetId, fleetId), eq(pmTemplates.name, `${SEED_TAG} A-service`)))
    .limit(1);
  if (existing) return existing.id;
  const row = await createPmTemplate({
    fleetId, actorUserId, name: `${SEED_TAG} A-service`,
    description: "Demo PM (km + days).", intervalKm: 20000, intervalDays: 180, warningKm: 1000, warningDays: 14,
  });
  return row?.id ?? null;
}

// Idempotent rollback: removes the demo fleet and its maintenance data. Scoped
// strictly to the marked demo fleet; guarded against remote targets.
export async function rollbackMaintenanceDemo() {
  assertSafeTarget();
  const db = await getDb();
  if (!db) throw new Error("Database unavailable.");

  const [fleet] = await db.select({ id: fleets.id }).from(fleets).where(eq(fleets.name, FLEET_MARKER)).limit(1);
  if (!fleet) return { removed: false, reason: "demo fleet not found" };
  const fleetId = fleet.id;

  // repairOutcomes has no cascading FK on fleetId; delete explicitly first.
  await db.delete(repairOutcomes).where(eq(repairOutcomes.fleetId, fleetId));
  await db.delete(vehicles).where(eq(vehicles.fleetId, fleetId));
  // Deleting the fleet cascades fleetFeatures, maintenancePermissions,
  // vehicleEvents, pm*, attentionScore*, maintenanceCases (→ decisions, cycles,
  // documents, authorizations), pilotSettings, and externalAiConsent.
  await db.delete(fleets).where(eq(fleets.id, fleetId));
  // Remove the demo users last (they own nothing else now).
  for (const openId of [`${SEED_TAG}-owner`, `${SEED_TAG}-manager`, `${SEED_TAG}-maint`]) {
    await db.delete(users).where(eq(users.openId, openId));
  }
  return { removed: true, fleetId };
}

async function main() {
  const rollback = process.argv.includes("--rollback");
  const summary = rollback ? await rollbackMaintenanceDemo() : await seedMaintenanceDemo();
  console.log(JSON.stringify({ ok: true, mode: rollback ? "rollback" : "seed", ...summary }, null, 2));
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
