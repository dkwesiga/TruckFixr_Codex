import { and, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import { randomBytes } from "crypto";
import { getDb } from "../db";
import {
  companyInvitations,
  companyJoinRequests,
  companyMemberships,
  fleets,
  users,
  vehicleAssignments,
  vehicles,
} from "../../drizzle/schema";

type AppUser = {
  id: number;
  role: string;
  email?: string | null;
};

export type CompanyMembershipRecord = {
  fleetId: number;
  userId: number;
  role: "owner" | "manager" | "driver";
  status: "pending" | "active" | "inactive" | "removed";
};

function normalizeEmail(value?: string | null) {
  return value?.trim().toLowerCase() ?? null;
}

export function generateCompanyInviteCode() {
  return randomBytes(4).toString("hex").toUpperCase();
}

export async function ensureFleetInviteCode(fleetId: number) {
  const db = await getDb();
  if (!db) return null;

  const [fleet] = await db
    .select({ id: fleets.id, inviteCode: fleets.inviteCode })
    .from(fleets)
    .where(eq(fleets.id, fleetId))
    .limit(1);

  if (!fleet) return null;
  if (fleet.inviteCode) return fleet.inviteCode;

  const inviteCode = generateCompanyInviteCode();
  await db
    .update(fleets)
    .set({ inviteCode, updatedAt: new Date() })
    .where(eq(fleets.id, fleetId));

  return inviteCode;
}

export async function ensureCompanyMembership(input: {
  fleetId: number;
  userId: number;
  role: "owner" | "manager" | "driver";
  approvedByUserId?: number | null;
  status?: "pending" | "active" | "inactive" | "removed";
}) {
  const db = await getDb();
  if (!db) return null;

  const [existing] = await db
    .select()
    .from(companyMemberships)
    .where(
      and(
        eq(companyMemberships.fleetId, input.fleetId),
        eq(companyMemberships.userId, input.userId)
      )
    )
    .limit(1);

  const nextStatus = input.status ?? "active";

  if (existing) {
    const [updated] = await db
      .update(companyMemberships)
      .set({
        role: input.role,
        status: nextStatus,
        approvedByUserId: input.approvedByUserId ?? existing.approvedByUserId,
        removedAt: nextStatus === "removed" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(companyMemberships.id, existing.id))
      .returning();
    return updated ?? existing;
  }

  const [created] = await db
    .insert(companyMemberships)
    .values({
      fleetId: input.fleetId,
      userId: input.userId,
      role: input.role,
      status: nextStatus,
      approvedByUserId: input.approvedByUserId ?? null,
      joinedAt: new Date(),
    })
    .returning();

  return created ?? null;
}

export async function getCompanyMembership(input: { userId: number; fleetId?: number | null }) {
  const db = await getDb();
  if (!db) return null;

  if (input.fleetId != null) {
    const [membership] = await db
      .select()
      .from(companyMemberships)
      .where(
        and(
          eq(companyMemberships.userId, input.userId),
          eq(companyMemberships.fleetId, input.fleetId)
        )
      )
      .orderBy(desc(companyMemberships.updatedAt))
      .limit(1);

    if (membership) {
      return membership;
    }
  }

  const [membership] = await db
    .select()
    .from(companyMemberships)
    .where(eq(companyMemberships.userId, input.userId))
    .orderBy(desc(companyMemberships.updatedAt))
    .limit(1);

  if (membership) {
    return membership;
  }

  if (input.fleetId != null) {
    const [ownedFleet] = await db
      .select({ id: fleets.id })
      .from(fleets)
      .where(and(eq(fleets.id, input.fleetId), eq(fleets.ownerId, input.userId)))
      .limit(1);

    if (ownedFleet) {
      return ensureCompanyMembership({
        fleetId: ownedFleet.id,
        userId: input.userId,
        role: "owner",
        approvedByUserId: input.userId,
      });
    }
  }

  return null;
}

export async function getUserPrimaryFleetId(userId: number) {
  const membership = await getCompanyMembership({ userId });
  if (membership?.fleetId) return membership.fleetId;

  const db = await getDb();
  if (!db) return 1;

  const [ownedFleet] = await db
    .select({ id: fleets.id })
    .from(fleets)
    .where(eq(fleets.ownerId, userId))
    .limit(1);

  if (ownedFleet?.id) {
    return ownedFleet.id;
  }

  const now = new Date();
  const [assignmentFleet] = await db
    .select({ fleetId: vehicleAssignments.fleetId })
    .from(vehicleAssignments)
    .where(
      and(
        eq(vehicleAssignments.driverUserId, userId),
        eq(vehicleAssignments.status, "active"),
        or(eq(vehicleAssignments.accessType, "permanent"), gte(vehicleAssignments.expiresAt, now))
      )
    )
    .orderBy(desc(vehicleAssignments.updatedAt))
    .limit(1);

  if (assignmentFleet?.fleetId) {
    await ensureCompanyMembership({
      fleetId: assignmentFleet.fleetId,
      userId,
      role: "driver",
      status: "active",
    }).catch(() => null);
    return assignmentFleet.fleetId;
  }

  const [directVehicleFleet] = await db
    .select({ fleetId: vehicles.fleetId })
    .from(vehicles)
    .where(eq(vehicles.assignedDriverId, userId))
    .orderBy(desc(vehicles.updatedAt))
    .limit(1);

  if (directVehicleFleet?.fleetId) {
    await ensureCompanyMembership({
      fleetId: directVehicleFleet.fleetId,
      userId,
      role: "driver",
      status: "active",
    }).catch(() => null);
    return directVehicleFleet.fleetId;
  }

  const [driverRow] = await db
    .select({
      managerUserId: users.managerUserId,
      role: users.role,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (driverRow?.role === "driver" && driverRow.managerUserId != null) {
    const managerMembership = await getCompanyMembership({
      userId: driverRow.managerUserId,
    });
    if (managerMembership?.fleetId) {
      await ensureCompanyMembership({
        fleetId: managerMembership.fleetId,
        userId,
        role: "driver",
        approvedByUserId: driverRow.managerUserId,
        status: "active",
      }).catch(() => null);
      return managerMembership.fleetId;
    }

    const [managedFleet] = await db
      .select({ id: fleets.id })
      .from(fleets)
      .where(eq(fleets.ownerId, driverRow.managerUserId))
      .limit(1);

    if (managedFleet?.id) {
      await ensureCompanyMembership({
        fleetId: managedFleet.id,
        userId,
        role: "driver",
        approvedByUserId: driverRow.managerUserId,
        status: "active",
      }).catch(() => null);
      return managedFleet.id;
    }
  }

  return 1;
}

export async function canManageCompanyOperations(input: { fleetId: number; user: AppUser }) {
  if (input.user.role !== "owner" && input.user.role !== "manager") return false;

  const membership = await getCompanyMembership({
    userId: input.user.id,
    fleetId: input.fleetId,
  });

  if (membership && membership.status === "active") {
    return membership.role === "owner" || membership.role === "manager";
  }

  const db = await getDb();
  if (!db) return false;

  const [fleet] = await db
    .select({ ownerId: fleets.ownerId })
    .from(fleets)
    .where(eq(fleets.id, input.fleetId))
    .limit(1);

  return fleet?.ownerId === input.user.id;
}

export async function canManageCompanyBilling(input: { fleetId: number; user: AppUser }) {
  if (input.user.role !== "owner") return false;

  const membership = await getCompanyMembership({
    userId: input.user.id,
    fleetId: input.fleetId,
  });

  if (membership) {
    return membership.status === "active" && membership.role === "owner";
  }

  const db = await getDb();
  if (!db) return false;

  const [fleet] = await db
    .select({ ownerId: fleets.ownerId })
    .from(fleets)
    .where(eq(fleets.id, input.fleetId))
    .limit(1);

  return fleet?.ownerId === input.user.id;
}

export async function canInviteCompanyRole(input: {
  fleetId: number;
  user: AppUser;
  inviteRole: "owner" | "manager" | "driver";
}) {
  if (input.inviteRole === "driver") {
    return canManageCompanyOperations(input);
  }

  return canManageCompanyBilling(input);
}

export async function getFleetManagementContacts(fleetId: number) {
  const db = await getDb();
  if (!db) return [];

  const membershipRows = await db
    .select({
      userId: companyMemberships.userId,
      role: companyMemberships.role,
      status: companyMemberships.status,
    })
    .from(companyMemberships)
    .where(eq(companyMemberships.fleetId, fleetId));

  const activeManagers = membershipRows.filter(
    (row) => row.status === "active" && (row.role === "owner" || row.role === "manager")
  );

  const managerIds = activeManagers.map((row) => row.userId);
  const managerRows =
    managerIds.length > 0
      ? await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            role: users.role,
          })
          .from(users)
          .where(inArray(users.id, managerIds))
      : [];

  if (managerRows.length > 0) {
    return managerRows;
  }

  const [fleet] = await db
    .select({ ownerId: fleets.ownerId })
    .from(fleets)
    .where(eq(fleets.id, fleetId))
    .limit(1);

  if (!fleet) return [];

  const [owner] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
    })
    .from(users)
    .where(eq(users.id, fleet.ownerId))
    .limit(1);

  return owner ? [owner] : [];
}

export async function verifyDriverCompanyMembership(input: { fleetId: number; driverUserId: number }) {
  const membership = await getCompanyMembership({
    userId: input.driverUserId,
    fleetId: input.fleetId,
  });

  if (membership) {
    return membership.status === "active" && membership.role === "driver";
  }

  const db = await getDb();
  if (!db) return false;

  const [driver] = await db
    .select({
      id: users.id,
      role: users.role,
      managerUserId: users.managerUserId,
      managerEmail: users.managerEmail,
    })
    .from(users)
    .where(eq(users.id, input.driverUserId))
    .limit(1);

  if (!driver || driver.role !== "driver") return false;

  const contacts = await getFleetManagementContacts(input.fleetId);
  const contactIds = new Set(contacts.map((contact) => contact.id));
  const contactEmails = new Set(
    contacts.map((contact) => normalizeEmail(contact.email)).filter((value): value is string => Boolean(value))
  );

  return (
    (driver.managerUserId != null && contactIds.has(driver.managerUserId)) ||
    (driver.managerEmail != null &&
      normalizeEmail(driver.managerEmail) != null &&
      contactEmails.has(normalizeEmail(driver.managerEmail)!))
  );
}

export async function isAssetOperational(vehicleId: number | string) {
  const db = await getDb();
  if (!db) return false;

  const normalizedVehicleId = String(vehicleId).trim();

  const [vehicle] = await db
    .select({
      status: vehicles.status,
      assetRecordStatus: vehicles.assetRecordStatus,
    })
    .from(vehicles)
    .where(sql`CAST(${vehicles.id} AS text) = ${normalizedVehicleId}`)
    .limit(1);

  if (!vehicle) return false;
  return vehicle.assetRecordStatus === "active" && vehicle.status !== "retired";
}

export async function createCompanyInvitationRecord(input: {
  fleetId: number;
  email: string;
  name?: string | null;
  role: "owner" | "manager" | "driver";
  invitedByUserId: number;
  assignedVehicleIds?: number[];
}) {
  const db = await getDb();
  if (!db) return null;

  const inviteToken = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

  const [record] = await db
    .insert(companyInvitations)
    .values({
      fleetId: input.fleetId,
      email: normalizeEmail(input.email) ?? input.email,
      name: input.name?.trim() || null,
      role: input.role,
      inviteToken,
      invitedByUserId: input.invitedByUserId,
      expiresAt,
      assignedVehicleIds: input.assignedVehicleIds?.length ? input.assignedVehicleIds : null,
    })
    .returning();

  return record ?? null;
}

export async function createCompanyJoinRequest(input: {
  fleetId: number;
  userId: number;
  inviteCode?: string | null;
  note?: string | null;
}) {
  const db = await getDb();
  if (!db) return null;

  const [existing] = await db
    .select()
    .from(companyJoinRequests)
    .where(
      and(
        eq(companyJoinRequests.fleetId, input.fleetId),
        eq(companyJoinRequests.userId, input.userId)
      )
    )
    .orderBy(desc(companyJoinRequests.updatedAt))
    .limit(1);

  if (existing && existing.status === "pending") {
    return existing;
  }

  const [created] = await db
    .insert(companyJoinRequests)
    .values({
      fleetId: input.fleetId,
      userId: input.userId,
      inviteCode: input.inviteCode ?? null,
      note: input.note ?? null,
    })
    .returning();

  return created ?? null;
}
