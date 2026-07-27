// CAD $99 pilot service (§29–§30). Account-first: qualification can be public,
// but agreement acceptance, payment, kickoff, and activation require an
// authenticated owner. Payment alone never activates a pilot.

import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { analyticsEvents, pilotApplications } from "../../drizzle/schema";
import {
  PILOT_DURATION_DAYS,
  PILOT_PRICE_CAD_CENTS,
  PILOT_VEHICLE_LIMIT,
  activationBlockers,
  canTransitionPilot,
  isWithinConversionWindow,
  qualifyPilot,
  type PilotActivationState,
  type PilotState,
} from "../../shared/maintenance/pilotStateMachine";

function requireDb(db: unknown): asserts db {
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
}

async function load(db: any, id: number) {
  const [row] = await db.select().from(pilotApplications).where(eq(pilotApplications.id, id)).limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Pilot application not found." });
  return row;
}

async function emit(db: any, event: string): Promise<void> {
  await db.insert(analyticsEvents).values({ event, funnelStep: "pilot", at: new Date() });
}

export interface ApplyForPilotInput {
  fleetName: string;
  vehicleCount?: number | null;
  vehicleTypes?: string[] | null;
  approxAge?: string | null;
  coordinatorName?: string | null;
  outsourced?: boolean | null;
  hasMaintenanceManager?: boolean | null;
  expectedCases30d?: number | null;
  primaryContact?: Record<string, unknown> | null;
  guestCaseId?: number | null;
}

export async function applyForPilot(input: ApplyForPilotInput) {
  const db = await getDb();
  requireDb(db);
  const qualificationResult = qualifyPilot({
    vehicleCount: input.vehicleCount,
    expectedCases30d: input.expectedCases30d,
    hasMaintenanceManager: input.hasMaintenanceManager,
    outsourced: input.outsourced,
  });
  const state: PilotState =
    qualificationResult === "qualified"
      ? "qualified"
      : qualificationResult === "needs_review"
        ? "under_review"
        : "declined";
  const now = new Date();
  const [row] = await db
    .insert(pilotApplications)
    .values({
      fleetName: input.fleetName.trim(),
      vehicleCount: input.vehicleCount ?? null,
      vehicleTypesJson: input.vehicleTypes ?? null,
      approxAge: input.approxAge ?? null,
      coordinatorName: input.coordinatorName ?? null,
      outsourced: input.outsourced ?? null,
      hasMaintenanceManager: input.hasMaintenanceManager ?? null,
      expectedCases30d: input.expectedCases30d ?? null,
      primaryContactJson: input.primaryContact ?? null,
      qualificationResult,
      state,
      guestCaseId: input.guestCaseId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  await emit(db, "pilot_interest_submitted");
  if (qualificationResult === "qualified") await emit(db, "pilot_qualified");

  return { id: row.id, state: row.state as PilotState, qualificationResult };
}

async function transition(db: any, id: number, to: PilotState, extra: Record<string, unknown> = {}) {
  const app = await load(db, id);
  if (app.state !== to && !canTransitionPilot(app.state as PilotState, to)) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `Cannot move pilot from ${app.state} to ${to}.`,
    });
  }
  await db
    .update(pilotApplications)
    .set({ state: to, updatedAt: new Date(), ...extra })
    .where(eq(pilotApplications.id, id));
  return load(db, id);
}

export async function acceptAgreement(params: {
  applicationId: number;
  agreementVersion: string;
  acceptedByUserId: number;
  fleetId: number;
  snapshot?: Record<string, unknown> | null;
}) {
  const db = await getDb();
  requireDb(db);
  await load(db, params.applicationId);
  await db
    .update(pilotApplications)
    .set({
      agreementVersion: params.agreementVersion,
      agreementAcceptedAt: new Date(),
      acceptedByUserId: params.acceptedByUserId,
      fleetId: params.fleetId,
      agreementSnapshotJson: params.snapshot ?? null,
      updatedAt: new Date(),
    })
    .where(eq(pilotApplications.id, params.applicationId));
  await emit(db, "pilot_agreement_accepted");
  return load(db, params.applicationId);
}

/** Move a qualified application into payment_pending (called when checkout starts). */
export async function beginCheckout(params: { applicationId: number }) {
  const db = await getDb();
  requireDb(db);
  return transition(db, params.applicationId, "payment_pending");
}

/** Webhook-driven: mark paid. Idempotent. Payment does NOT activate the pilot. */
export async function markPilotPaid(params: { applicationId: number; paymentRef: string }) {
  const db = await getDb();
  requireDb(db);
  const app = await load(db, params.applicationId);
  if (["paid", "kickoff_pending", "active", "completed", "converted"].includes(app.state)) {
    return app; // already paid or beyond (idempotent)
  }
  // Payment is authoritative (webhook-driven): set paid directly from qualified
  // or payment_pending rather than enforcing the step-by-step transition guard.
  await db
    .update(pilotApplications)
    .set({ state: "paid", paymentRef: params.paymentRef, updatedAt: new Date() })
    .where(eq(pilotApplications.id, params.applicationId));
  await emit(db, "pilot_payment_completed");
  return load(db, params.applicationId);
}

export async function recordKickoff(params: {
  applicationId: number;
  baseline?: Record<string, unknown> | null;
  vehicleIds: string[];
}) {
  const db = await getDb();
  requireDb(db);
  const app = await load(db, params.applicationId);
  const vehicles = (params.vehicleIds ?? []).slice(0, PILOT_VEHICLE_LIMIT);
  await db
    .update(pilotApplications)
    .set({
      baselineJson: params.baseline ?? { recordedAt: new Date().toISOString() },
      enrolledVehicleIdsJson: vehicles,
      state: app.state === "paid" ? "kickoff_pending" : app.state,
      updatedAt: new Date(),
    })
    .where(eq(pilotApplications.id, params.applicationId));
  return load(db, params.applicationId);
}

export function activationStateOf(app: any): PilotActivationState {
  return {
    paid: ["paid", "kickoff_pending", "active", "completed", "converted"].includes(app.state) || Boolean(app.paymentRef),
    agreementAccepted: Boolean(app.agreementAcceptedAt),
    hasAccountableOwner: Boolean(app.fleetId) && Boolean(app.acceptedByUserId),
    baselineRecorded: Boolean(app.baselineJson),
    vehiclesAdded: Array.isArray(app.enrolledVehicleIdsJson) ? app.enrolledVehicleIdsJson.length : 0,
  };
}

export async function activatePilot(params: { applicationId: number }) {
  const db = await getDb();
  requireDb(db);
  const app = await load(db, params.applicationId);
  const blockers = activationBlockers(activationStateOf(app));
  if (blockers.length > 0) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `Cannot activate pilot: ${blockers.join(", ")}.`,
    });
  }
  const now = new Date();
  const endDate = new Date(now.getTime() + PILOT_DURATION_DAYS * 24 * 60 * 60 * 1000);
  return transition(db, params.applicationId, "active", { startDate: now, endDate });
}

export async function completePilot(params: { applicationId: number }) {
  const db = await getDb();
  requireDb(db);
  return transition(db, params.applicationId, "completed");
}

/** Credit CAD $99 toward the first subscription if converting within 14 days of pilot end. */
export async function recordConversionCredit(params: { applicationId: number; now?: Date }) {
  const db = await getDb();
  requireDb(db);
  const app = await load(db, params.applicationId);
  if (app.state !== "completed") {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Pilot is not completed." });
  }
  const now = params.now ?? new Date();
  const reference = app.endDate ?? app.updatedAt ?? now;
  if (!isWithinConversionWindow(reference, now)) {
    return { credited: false, amountCents: 0 };
  }
  await transition(db, params.applicationId, "converted", {
    pilotCreditAmountCents: PILOT_PRICE_CAD_CENTS,
    pilotCreditAppliedAt: now,
  });
  return { credited: true, amountCents: PILOT_PRICE_CAD_CENTS };
}
