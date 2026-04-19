import { and, desc, eq, lte, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  fleets,
  pilotAccessCodes,
  pilotAccessEvents,
  pilotAccessRedemptions,
  users,
  vehicles,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { sendEmail } from "./email";
import type { SubscriptionTier } from "../../shared/subscription";

export type PilotAccessOverview = {
  codeId: number;
  code: string;
  fleetId: number;
  fleetName: string;
  status: "active" | "expired" | "revoked" | "converted";
  activatedAt: Date;
  expiresAt: Date;
  maxUsers: number;
  maxVehicles: number;
  usersUsed: number;
  vehiclesUsed: number;
  isExpiringSoon: boolean;
  daysRemaining: number;
};

const PILOT_EXPIRING_SOON_DAYS = 3;

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

function getDaysRemaining(expiresAt: Date) {
  return Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

function isExpiredDate(value: Date | null | undefined) {
  return Boolean(value && value.getTime() <= Date.now());
}

function getExpiryStatus(input: {
  codeStatus: "active" | "expired" | "revoked";
  redemptionStatus: "active" | "expired" | "revoked" | "converted";
  expiresAt: Date | null;
  hardExpiryDate: Date | null;
}) {
  if (input.redemptionStatus === "converted") return "converted" as const;
  if (input.codeStatus === "revoked" || input.redemptionStatus === "revoked") return "revoked" as const;
  if (
    input.codeStatus === "expired" ||
    input.redemptionStatus === "expired" ||
    isExpiredDate(input.expiresAt) ||
    isExpiredDate(input.hardExpiryDate)
  ) {
    return "expired" as const;
  }

  return "active" as const;
}

async function getFleetName(fleetId: number, fallbackName: string | null) {
  const db = await getDb();
  if (!db) return fallbackName ?? `Fleet ${fleetId}`;

  const [fleet] = await db.select().from(fleets).where(eq(fleets.id, fleetId)).limit(1);
  return fleet?.name ?? fallbackName ?? `Fleet ${fleetId}`;
}

async function getPilotCounts(codeId: number, fleetId: number) {
  const db = await getDb();
  if (!db) {
    return { usersUsed: 0, vehiclesUsed: 0 };
  }

  const [userCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(pilotAccessRedemptions)
    .where(and(eq(pilotAccessRedemptions.codeId, codeId), eq(pilotAccessRedemptions.status, "active")));

  const [vehicleCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(vehicles)
    .where(eq(vehicles.fleetId, fleetId));

  return {
    usersUsed: userCountRow?.count ?? 0,
    vehiclesUsed: vehicleCountRow?.count ?? 0,
  };
}

async function getLatestRedemption(userId: number) {
  const db = await getDb();
  if (!db) return null;

  return (
    await db
      .select()
      .from(pilotAccessRedemptions)
      .where(eq(pilotAccessRedemptions.userId, userId))
      .orderBy(desc(pilotAccessRedemptions.updatedAt), desc(pilotAccessRedemptions.id))
      .limit(1)
  )[0] ?? null;
}

async function getCodeRecord(codeId: number) {
  const db = await getDb();
  if (!db) return null;

  return (
    await db.select().from(pilotAccessCodes).where(eq(pilotAccessCodes.id, codeId)).limit(1)
  )[0] ?? null;
}

async function buildPilotOverview(redemption: typeof pilotAccessRedemptions.$inferSelect) {
  const code = await getCodeRecord(redemption.codeId);
  if (!code) return null;

  const status = getExpiryStatus({
    codeStatus: code.status,
    redemptionStatus: redemption.status,
    expiresAt: redemption.expiresAt,
    hardExpiryDate: code.hardExpiryDate,
  });
  const counts = await getPilotCounts(code.id, redemption.fleetId);
  const expiresAt = redemption.expiresAt;
  const daysRemaining = getDaysRemaining(expiresAt);

  return {
    codeId: code.id,
    code: code.code,
    fleetId: redemption.fleetId,
    fleetName: await getFleetName(redemption.fleetId, code.fleetName),
    status,
    activatedAt: redemption.activatedAt,
    expiresAt,
    maxUsers: code.maxUsers,
    maxVehicles: code.maxVehicles,
    usersUsed: counts.usersUsed,
    vehiclesUsed: counts.vehiclesUsed,
    isExpiringSoon: status === "active" && daysRemaining <= PILOT_EXPIRING_SOON_DAYS,
    daysRemaining,
  } satisfies PilotAccessOverview;
}

export async function getPilotAccessOverview(userId: number) {
  const latestRedemption = await getLatestRedemption(userId);
  if (!latestRedemption) return null;
  return buildPilotOverview(latestRedemption);
}

export async function recordPilotAccessEvent(input: {
  userId?: number | null;
  fleetId?: number | null;
  codeId?: number | null;
  eventType: string;
  eventMetadata?: Record<string, unknown> | null;
}) {
  const db = await getDb();
  if (!db) return;

  await db.insert(pilotAccessEvents).values({
    userId: input.userId ?? null,
    fleetId: input.fleetId ?? null,
    codeId: input.codeId ?? null,
    eventType: input.eventType,
    eventMetadata: input.eventMetadata ?? null,
  });
}

async function getPilotNotificationRecipients(input: { userId: number; fleetId: number }) {
  const db = await getDb();
  if (!db) return [];

  const recipients = new Set<string>();
  const [user] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);

  if (user?.email) recipients.add(user.email.trim().toLowerCase());

  const [fleet] = await db
    .select({ ownerId: fleets.ownerId })
    .from(fleets)
    .where(eq(fleets.id, input.fleetId))
    .limit(1);

  if (fleet?.ownerId) {
    const [owner] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, fleet.ownerId))
      .limit(1);
    if (owner?.email) recipients.add(owner.email.trim().toLowerCase());
  }

  return Array.from(recipients);
}

async function sendPilotActivatedEmail(overview: PilotAccessOverview, userId: number) {
  const recipients = await getPilotNotificationRecipients({ userId, fleetId: overview.fleetId });
  if (recipients.length === 0) return;

  await sendEmail({
    to: recipients,
    subject: "Pilot Access activated for TruckFixr",
    text: [
      "Pilot Access is now active.",
      "",
      `Plan: ${overview.code ? "Pilot Access" : "Pilot Access"}`,
      `Fleet: ${overview.fleetName}`,
      `Expiry date: ${overview.expiresAt.toISOString().slice(0, 10)}`,
      `Vehicle limit: ${overview.maxVehicles}`,
      `User limit: ${overview.maxUsers}`,
      "",
      "Next steps:",
      "- Add your fleet vehicles",
      "- Run diagnostics and inspections",
      "- Upgrade to Pro or Fleet before Pilot Access expires",
    ].join("\n"),
    html: [
      "<p><strong>Pilot Access is now active.</strong></p>",
      `<p>Fleet: ${overview.fleetName}</p>`,
      `<p>Expiry date: ${overview.expiresAt.toISOString().slice(0, 10)}</p>`,
      `<p>Vehicle limit: ${overview.maxVehicles}<br/>User limit: ${overview.maxUsers}</p>`,
      "<p>Next steps: add vehicles, run diagnostics and inspections, and upgrade before Pilot Access expires.</p>",
    ].join(""),
  });
}

async function sendPilotExpiringSoonEmail(overview: PilotAccessOverview, userId: number) {
  const recipients = await getPilotNotificationRecipients({ userId, fleetId: overview.fleetId });
  if (recipients.length === 0) return;

  await sendEmail({
    to: recipients,
    subject: "Pilot Access is expiring soon",
    text: [
      "Pilot Access is expiring soon.",
      "",
      `Fleet: ${overview.fleetName}`,
      `Expiry date: ${overview.expiresAt.toISOString().slice(0, 10)}`,
      "",
      "Upgrade to Pro or Fleet to keep diagnostics, inspections, and maintenance moving without interruption.",
    ].join("\n"),
    html: [
      "<p><strong>Pilot Access is expiring soon.</strong></p>",
      `<p>Fleet: ${overview.fleetName}<br/>Expiry date: ${overview.expiresAt.toISOString().slice(0, 10)}</p>`,
      "<p>Upgrade to Pro or Fleet to keep diagnostics, inspections, and maintenance moving without interruption.</p>",
    ].join(""),
  });
}

async function maybeSendExpiringSoonNotification(overview: PilotAccessOverview, userId: number) {
  if (!overview.isExpiringSoon || overview.status !== "active") return;

  const db = await getDb();
  if (!db) return;

  const existing = (
    await db
      .select({ id: pilotAccessEvents.id })
      .from(pilotAccessEvents)
      .where(
        and(
          eq(pilotAccessEvents.userId, userId),
          eq(pilotAccessEvents.codeId, overview.codeId),
          eq(pilotAccessEvents.eventType, "pilot_access_expiring_soon")
        )
      )
      .limit(1)
  )[0];

  if (existing) return;

  await sendPilotExpiringSoonEmail(overview, userId);
  await recordPilotAccessEvent({
    userId,
    fleetId: overview.fleetId,
    codeId: overview.codeId,
    eventType: "pilot_access_expiring_soon",
    eventMetadata: {
      expiresAt: overview.expiresAt.toISOString(),
      daysRemaining: overview.daysRemaining,
    },
  });
}

export async function reconcilePilotAccessForUser(userId: number) {
  const db = await getDb();
  if (!db) return null;

  const latestRedemption = await getLatestRedemption(userId);
  if (!latestRedemption) return null;

  const code = await getCodeRecord(latestRedemption.codeId);
  if (!code) return null;

  const nextStatus = getExpiryStatus({
    codeStatus: code.status,
    redemptionStatus: latestRedemption.status,
    expiresAt: latestRedemption.expiresAt,
    hardExpiryDate: code.hardExpiryDate,
  });

  if (nextStatus === "active") {
    const overview = await buildPilotOverview(latestRedemption);
    if (overview) {
      await maybeSendExpiringSoonNotification(overview, userId);
    }
    return overview;
  }

  const now = new Date();
  if (latestRedemption.status !== nextStatus) {
    await db
      .update(pilotAccessRedemptions)
      .set({
        status: nextStatus,
        updatedAt: now,
      })
      .where(eq(pilotAccessRedemptions.id, latestRedemption.id));
  }

  if (code.status === "active" && nextStatus === "expired") {
    await db
      .update(pilotAccessCodes)
      .set({
        status: "expired",
        updatedAt: now,
      })
      .where(eq(pilotAccessCodes.id, code.id));
  }

  await recordPilotAccessEvent({
    userId,
    fleetId: latestRedemption.fleetId,
    codeId: latestRedemption.codeId,
    eventType: nextStatus === "revoked" ? "pilot_access_revoked" : "pilot_access_expired",
    eventMetadata: {
      expiresAt: latestRedemption.expiresAt.toISOString(),
    },
  });

  return buildPilotOverview({
    ...latestRedemption,
    status: nextStatus,
    updatedAt: now,
  });
}

function getPilotExpiry(code: typeof pilotAccessCodes.$inferSelect, now = new Date()) {
  if (code.expiresAt) return code.expiresAt;

  const durationExpiry = new Date(
    now.getTime() + code.activationDurationDays * 24 * 60 * 60 * 1000
  );

  if (code.hardExpiryDate && code.hardExpiryDate.getTime() < durationExpiry.getTime()) {
    return code.hardExpiryDate;
  }

  return durationExpiry;
}

async function resolveOrCreateFleet(input: {
  userId: number;
  preferredName: string;
  expiresAt: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [existingFleet] = await db
    .select()
    .from(fleets)
    .where(eq(fleets.name, input.preferredName))
    .limit(1);

  if (existingFleet) return existingFleet;

  const [fleet] = await db
    .insert(fleets)
    .values({
      name: input.preferredName,
      ownerId: input.userId,
      premiumTadis: true,
      trialEndsAt: input.expiresAt,
      updatedAt: new Date(),
    })
    .returning();

  return fleet;
}

export async function redeemPilotAccessCode(input: {
  userId: number;
  currentTier: SubscriptionTier;
  code: string;
  companyName?: string | null;
}) {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database not available",
    });
  }

  const normalizedCode = normalizeCode(input.code);
  const [code] = await db
    .select()
    .from(pilotAccessCodes)
    .where(eq(pilotAccessCodes.code, normalizedCode))
    .limit(1);

  if (!code) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "That Pilot Access code is invalid.",
    });
  }

  if (input.currentTier === "pro" || input.currentTier === "fleet") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Pilot Access is only available for new or Free accounts.",
    });
  }

  if (code.status === "revoked") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This Pilot Access code has been revoked.",
    });
  }

  if (code.status === "expired" || isExpiredDate(code.hardExpiryDate) || isExpiredDate(code.expiresAt)) {
    await db
      .update(pilotAccessCodes)
      .set({ status: "expired", updatedAt: new Date() })
      .where(eq(pilotAccessCodes.id, code.id));

    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This Pilot Access code has expired.",
    });
  }

  const [existingActiveRedemption] = await db
    .select()
    .from(pilotAccessRedemptions)
    .where(
      and(
        eq(pilotAccessRedemptions.userId, input.userId),
        eq(pilotAccessRedemptions.status, "active")
      )
    )
    .limit(1);

  if (existingActiveRedemption) {
    const existingOverview = await buildPilotOverview(existingActiveRedemption);
    if (existingOverview) return existingOverview;
  }

  const now = new Date();
  const activatedAt = code.activatedAt ?? now;
  const expiresAt = code.expiresAt ?? getPilotExpiry(code, activatedAt);

  const [activeUserCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(pilotAccessRedemptions)
    .where(and(eq(pilotAccessRedemptions.codeId, code.id), eq(pilotAccessRedemptions.status, "active")));

  const activeUsers = activeUserCountRow?.count ?? 0;
  if (activeUsers >= code.maxUsers) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This Pilot Access code is fully used.",
    });
  }

  const fleetName = input.companyName?.trim() || code.fleetName?.trim();
  if (!fleetName) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A fleet or company name is required to activate Pilot Access.",
    });
  }

  const fleet = await resolveOrCreateFleet({
    userId: input.userId,
    preferredName: fleetName,
    expiresAt,
  });

  const [vehicleCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(vehicles)
    .where(eq(vehicles.fleetId, fleet.id));

  if ((vehicleCountRow?.count ?? 0) > code.maxVehicles) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This Pilot Access fleet is already over the allowed vehicle limit.",
    });
  }

  if (!code.activatedAt || !code.expiresAt || code.fleetName !== fleet.name) {
    await db
      .update(pilotAccessCodes)
      .set({
        fleetName: fleet.name,
        activatedAt,
        expiresAt,
        status: "active",
        updatedAt: now,
      })
      .where(eq(pilotAccessCodes.id, code.id));
  }

  const [redemption] = await db
    .insert(pilotAccessRedemptions)
    .values({
      codeId: code.id,
      userId: input.userId,
      fleetId: fleet.id,
      activatedAt,
      expiresAt,
      status: "active",
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const overview = await buildPilotOverview(redemption);
  if (!overview) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Pilot Access activated, but the status could not be loaded.",
    });
  }

  await recordPilotAccessEvent({
    userId: input.userId,
    fleetId: fleet.id,
    codeId: code.id,
    eventType: "demo_code_redeemed",
    eventMetadata: {
      code: code.code,
      fleetName: fleet.name,
      expiresAt: expiresAt.toISOString(),
    },
  });

  await recordPilotAccessEvent({
    userId: input.userId,
    fleetId: fleet.id,
    codeId: code.id,
    eventType: "pilot_access_activated",
    eventMetadata: {
      code: code.code,
      fleetName: fleet.name,
      expiresAt: expiresAt.toISOString(),
      maxUsers: code.maxUsers,
      maxVehicles: code.maxVehicles,
    },
  });

  await sendPilotActivatedEmail(overview, input.userId);
  return overview;
}

export async function markPilotAccessConvertedToPaid(input: {
  userId: number;
  nextTier: SubscriptionTier;
}) {
  const db = await getDb();
  if (!db || (input.nextTier !== "pro" && input.nextTier !== "fleet")) return;

  const activeRedemption = (
    await db
      .select()
      .from(pilotAccessRedemptions)
      .where(
        and(
          eq(pilotAccessRedemptions.userId, input.userId),
          eq(pilotAccessRedemptions.status, "active")
        )
      )
      .orderBy(desc(pilotAccessRedemptions.updatedAt))
      .limit(1)
  )[0];

  if (!activeRedemption) return;

  await db
    .update(pilotAccessRedemptions)
    .set({
      status: "converted",
      updatedAt: new Date(),
    })
    .where(eq(pilotAccessRedemptions.id, activeRedemption.id));

  await recordPilotAccessEvent({
    userId: input.userId,
    fleetId: activeRedemption.fleetId,
    codeId: activeRedemption.codeId,
    eventType: "converted_to_paid",
    eventMetadata: {
      nextTier: input.nextTier,
    },
  });
}

export async function getDefaultFleetIdForUser(userId: number) {
  const db = await getDb();
  if (!db) return 1;

  const activeRedemption = (
    await db
      .select({ fleetId: pilotAccessRedemptions.fleetId })
      .from(pilotAccessRedemptions)
      .where(
        and(
          eq(pilotAccessRedemptions.userId, userId),
          eq(pilotAccessRedemptions.status, "active")
        )
      )
      .orderBy(desc(pilotAccessRedemptions.updatedAt))
      .limit(1)
  )[0];

  if (activeRedemption?.fleetId) return activeRedemption.fleetId;

  const [ownedFleet] = await db
    .select({ id: fleets.id })
    .from(fleets)
    .where(eq(fleets.ownerId, userId))
    .limit(1);

  return ownedFleet?.id ?? 1;
}

export async function recordPilotMilestone(input: {
  userId: number;
  fleetId: number;
  eventType:
    | "first_vehicle_added"
    | "first_diagnostic_run"
    | "first_inspection_completed"
    | "upgrade_prompt_shown";
  eventMetadata?: Record<string, unknown>;
}) {
  const overview = await getPilotAccessOverview(input.userId);
  if (!overview || overview.status !== "active") return;

  const db = await getDb();
  if (!db) return;

  const [existing] = await db
    .select({ id: pilotAccessEvents.id })
    .from(pilotAccessEvents)
    .where(
      and(
        eq(pilotAccessEvents.userId, input.userId),
        eq(pilotAccessEvents.codeId, overview.codeId),
        eq(pilotAccessEvents.eventType, input.eventType)
      )
    )
    .limit(1);

  if (existing) return;

  await recordPilotAccessEvent({
    userId: input.userId,
    fleetId: input.fleetId,
    codeId: overview.codeId,
    eventType: input.eventType,
    eventMetadata: input.eventMetadata ?? null,
  });
}
