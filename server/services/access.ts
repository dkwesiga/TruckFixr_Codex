import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { randomBytes } from "crypto";
import { getDb } from "../db";
import {
  companyInvitations,
  companyMemberships,
  fleets,
  pilotAccessCodes,
  users,
  vehicleAssignments,
  vehicles,
} from "../../drizzle/schema";

function normalize(value: string) {
  return value.trim().toUpperCase();
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

const TRIAL_VEHICLE_LIMIT = 3;
const TRIAL_TRAILER_LIMIT = 3;
const TRIAL_AI_LIMIT = 20;
const PILOT_VEHICLE_LIMIT = 10;
const PILOT_TRAILER_LIMIT = 10;
const PILOT_AI_LIMIT = 100;

export function buildDriverInviteUrl(input: {
  token: string;
  email: string;
  managerEmail?: string | null;
  managerName?: string | null;
  companyName?: string | null;
  pilotCode?: string | null;
}) {
  const params = new URLSearchParams();
  params.set("token", input.token);
  params.set("email", input.email.trim().toLowerCase());
  if (input.managerEmail) params.set("managerEmail", input.managerEmail);
  if (input.managerName) params.set("managerName", input.managerName);
  if (input.companyName) params.set("companyName", input.companyName);
  if (input.pilotCode) params.set("pilotCode", input.pilotCode);
  return `/access/driver-invite?${params.toString()}`;
}

export async function lookupPilotCode(code: string) {
  const db = await getDb();
  if (!db) return null;

  const normalizedCode = normalize(code);
  const [record] = await db
    .select()
    .from(pilotAccessCodes)
    .where(eq(pilotAccessCodes.code, normalizedCode))
    .limit(1);

  if (!record) return null;

  const isExpired = Boolean(record.hardExpiryDate && record.hardExpiryDate.getTime() <= Date.now());

  return {
    ...record,
    isExpired,
    isRedeemed: record.status !== "active" || Boolean(record.activatedAt),
    maskedCode:
      record.code.length > 8 ? `${record.code.slice(0, 8)}-${"•".repeat(Math.max(0, record.code.length - 8))}` : record.code,
  };
}

export async function lookupInvitationByToken(token: string) {
  const db = await getDb();
  if (!db) return null;

  const [record] = await db
    .select()
    .from(companyInvitations)
    .where(eq(companyInvitations.inviteToken, token.trim()))
    .limit(1);

  if (!record) return null;

  return {
    ...record,
    isExpired: record.expiresAt.getTime() <= Date.now(),
  };
}

export async function acceptInvitationByToken(input: {
  token: string;
  userId: number;
  email?: string | null;
}) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const invitation = await lookupInvitationByToken(input.token);
  if (!invitation) {
    throw new Error("That invitation link is no longer valid.");
  }

  if (invitation.status !== "pending") {
    throw new Error("That invitation has already been used.");
  }

  if (invitation.expiresAt.getTime() <= Date.now()) {
    throw new Error("That invitation has expired.");
  }

  if (input.email && normalizeEmail(input.email) !== normalizeEmail(invitation.email)) {
    throw new Error("That invitation was sent to a different email address.");
  }

  const [user] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
  if (!user) {
    throw new Error("User not found.");
  }

  await db
    .update(companyInvitations)
    .set({
      status: "accepted",
      updatedAt: new Date(),
    })
    .where(eq(companyInvitations.id, invitation.id));

  await db
    .insert(companyMemberships)
    .values({
      fleetId: invitation.fleetId,
      userId: input.userId,
      role: invitation.role,
      status: "active",
      approvedByUserId: invitation.invitedByUserId,
      joinedAt: new Date(),
      updatedAt: new Date(),
    })
    .catch(async () => {
      await db
        .update(companyMemberships)
        .set({
          role: invitation.role,
          status: "active",
          approvedByUserId: invitation.invitedByUserId,
          updatedAt: new Date(),
        })
        .where(and(eq(companyMemberships.fleetId, invitation.fleetId), eq(companyMemberships.userId, input.userId)));
    });

  await db
    .update(users)
    .set({
      role: invitation.role,
      managerUserId: invitation.role === "driver" ? invitation.invitedByUserId : null,
      managerEmail: invitation.role === "driver" ? user.managerEmail ?? user.email ?? null : null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, input.userId));

  const assignedVehicleIds = Array.isArray(invitation.assignedVehicleIds)
    ? invitation.assignedVehicleIds
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
    : [];

  if (assignedVehicleIds.length > 0) {
    const vehicleRows = await db
      .select({ id: vehicles.id })
      .from(vehicles)
      .where(and(eq(vehicles.fleetId, invitation.fleetId), inArray(vehicles.id, assignedVehicleIds.map(String))))
      .catch(() => []);

    if (vehicleRows.length > 0) {
      const existingAssignments = await db
        .select({ vehicleId: vehicleAssignments.vehicleId })
        .from(vehicleAssignments)
        .where(
          and(
            eq(vehicleAssignments.fleetId, invitation.fleetId),
            eq(vehicleAssignments.driverUserId, input.userId),
            eq(vehicleAssignments.status, "active")
          )
        );
      const assignedSet = new Set(existingAssignments.map((row) => String(row.vehicleId)));

      for (const vehicleId of vehicleRows.map((row) => String(row.id))) {
        if (assignedSet.has(vehicleId)) continue;
        await db.insert(vehicleAssignments).values({
          fleetId: invitation.fleetId,
          vehicleId,
          driverUserId: input.userId,
          assignedByUserId: invitation.invitedByUserId,
          accessType: "permanent",
          startsAt: new Date(),
          status: "active",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }
  }

  return invitation;
}

export function generatePilotCode(prefix = "TFX-PILOT") {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const suffix = Array.from({ length: 8 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  return `${prefix}-${suffix}`;
}

export function maskPilotCode(code: string) {
  const normalized = code.trim().toUpperCase();
  if (normalized.length <= 8) return normalized;
  return `${normalized.slice(0, 8)}-${"•".repeat(Math.max(0, normalized.length - 8))}`;
}

export async function createPendingTrialFleet(input: {
  userId: number;
  companyName: string;
  companyEmail?: string | null;
  companyPhone?: string | null;
  location?: string | null;
  fleetSize?: string | null;
  biggestMaintenanceChallenge?: string | null;
  vehicleTypes?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const now = new Date();
  const [existing] = await db.select().from(fleets).where(eq(fleets.ownerId, input.userId)).limit(1);
  const payload = {
    name: input.companyName.trim(),
    ownerId: input.userId,
    companyEmail: input.companyEmail ?? null,
    companyPhone: input.companyPhone ?? null,
    address: input.location ?? null,
    subscriptionOwnerUserId: input.userId,
    planName: "free_trial",
    billingInterval: "trial",
    billingStatus: "trialing",
    poweredVehicleLimit: TRIAL_VEHICLE_LIMIT,
    includedTrailerLimit: TRIAL_TRAILER_LIMIT,
    paidExtraTrailerQuantity: 0,
    totalActiveTrailerLimit: TRIAL_TRAILER_LIMIT,
    aiSessionMonthlyLimit: TRIAL_AI_LIMIT,
    aiSessionsUsedCurrentPeriod: 0,
    trialStartedAt: null,
    trialEndsAt: null,
    isTrial: true,
    isPaidPilot: false,
    salesStatus: "trial_pending_verification",
    updatedAt: now,
  } as const;

  const [fleet] = existing
    ? await db
        .update(fleets)
        .set(payload)
        .where(eq(fleets.id, existing.id))
        .returning()
    : await db.insert(fleets).values(payload).returning();

  if (fleet) {
    await ensureCompanyMembership({
      fleetId: fleet.id,
      userId: input.userId,
      role: "owner",
      approvedByUserId: input.userId,
      status: "active",
    });
  }

  return fleet ?? existing ?? null;
}

export async function markPendingAccessVerified(input: { userId: number; emailVerified?: boolean | null }) {
  const db = await getDb();
  if (!db || !input.emailVerified) return null;

  const [fleet] = await db
    .select()
    .from(fleets)
    .where(eq(fleets.ownerId, input.userId))
    .limit(1);
  if (!fleet) return null;

  const now = new Date();

  if (fleet.salesStatus === "trial_pending_verification") {
    const trialEndsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const [updated] = await db
      .update(fleets)
      .set({
        salesStatus: "trial_active",
        trialStartedAt: now,
        trialEndsAt,
        planName: "free_trial",
        billingInterval: "trial",
        billingStatus: "trialing",
        poweredVehicleLimit: TRIAL_VEHICLE_LIMIT,
        includedTrailerLimit: TRIAL_TRAILER_LIMIT,
        totalActiveTrailerLimit: TRIAL_TRAILER_LIMIT,
        aiSessionMonthlyLimit: TRIAL_AI_LIMIT,
        updatedAt: now,
      })
      .where(eq(fleets.id, fleet.id))
      .returning();
    return updated ?? fleet;
  }

  if (fleet.salesStatus === "pilot_pending_email_verification") {
    const pilotEndsAt = fleet.paidPilotStartedAt
      ? new Date(fleet.paidPilotStartedAt.getTime() + 30 * 24 * 60 * 60 * 1000)
      : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const [updated] = await db
      .update(fleets)
      .set({
        salesStatus: "pilot_active",
        planName: "fleet_growth",
        billingInterval: "pilot",
        billingStatus: "active",
        poweredVehicleLimit: PILOT_VEHICLE_LIMIT,
        includedTrailerLimit: PILOT_TRAILER_LIMIT,
        totalActiveTrailerLimit: PILOT_TRAILER_LIMIT,
        aiSessionMonthlyLimit: PILOT_AI_LIMIT,
        paidPilotStartedAt: fleet.paidPilotStartedAt ?? now,
        paidPilotEndsAt: pilotEndsAt,
        updatedAt: now,
      })
      .where(eq(fleets.id, fleet.id))
      .returning();
    return updated ?? fleet;
  }

  return fleet;
}
