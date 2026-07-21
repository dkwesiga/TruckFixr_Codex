import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { maintenancePermissions } from "../../drizzle/schema";
import {
  sanitizeMaintenanceCapabilities,
  type MaintenanceCapability,
} from "@shared/maintenance/permissions";
import { canManageCompanyOperations } from "./companyAccess";
import { logMaintenanceActivity } from "./maintenanceActivityLog";

// Narrow, fleet-scoped maintenance grants. Owners/managers always have the
// operational capabilities implicitly (they manage the fleet); this table
// only elevates a specific non-manager member for specific capabilities.

export async function getActiveMaintenanceGrant(input: {
  fleetId: number;
  userId: number;
}): Promise<MaintenanceCapability[] | null> {
  const db = await getDb();
  if (!db) return null;

  const [row] = await db
    .select({
      capabilitiesJson: maintenancePermissions.capabilitiesJson,
      active: maintenancePermissions.active,
    })
    .from(maintenancePermissions)
    .where(
      and(
        eq(maintenancePermissions.fleetId, input.fleetId),
        eq(maintenancePermissions.userId, input.userId)
      )
    )
    .limit(1);

  if (!row || row.active !== true) return null;
  const caps = Array.isArray(row.capabilitiesJson)
    ? (row.capabilitiesJson as string[])
    : [];
  return sanitizeMaintenanceCapabilities(caps);
}

// Whether a user may perform a maintenance capability for a fleet. Owners and
// managers implicitly hold every operational capability. A granted member
// holds only the capabilities in their active grant. This never confers
// feature management, pilot config, exports, estimate approval, or critical
// override finalization — those are checked separately against owner/manager.
export async function hasMaintenanceCapability(input: {
  fleetId: number;
  user: { id: number; role: string };
  capability: MaintenanceCapability;
}): Promise<boolean> {
  if (
    await canManageCompanyOperations({
      fleetId: input.fleetId,
      user: input.user,
    })
  ) {
    return true;
  }

  const grant = await getActiveMaintenanceGrant({
    fleetId: input.fleetId,
    userId: input.user.id,
  });
  return grant?.includes(input.capability) ?? false;
}

// Upsert (grant/replace) capabilities for a member. Only callable after the
// caller has been verified as an owner/manager of the fleet by the router.
// Capabilities are sanitized so unknown/forbidden keys are dropped.
export async function setMaintenanceGrant(input: {
  fleetId: number;
  userId: number;
  capabilities: readonly string[];
  actorUserId: number;
  notes?: string | null;
}): Promise<MaintenanceCapability[] | null> {
  const db = await getDb();
  if (!db) return null;

  const capabilities = sanitizeMaintenanceCapabilities(input.capabilities);
  const now = new Date();

  const [existing] = await db
    .select({ id: maintenancePermissions.id })
    .from(maintenancePermissions)
    .where(
      and(
        eq(maintenancePermissions.fleetId, input.fleetId),
        eq(maintenancePermissions.userId, input.userId)
      )
    )
    .limit(1);

  if (existing) {
    await db
      .update(maintenancePermissions)
      .set({
        capabilitiesJson: capabilities as never,
        active: capabilities.length > 0,
        grantedByUserId: input.actorUserId,
        revokedByUserId: null,
        revokedAt: null,
        notes: input.notes ?? null,
        updatedAt: now,
      })
      .where(eq(maintenancePermissions.id, existing.id));
  } else {
    await db.insert(maintenancePermissions).values({
      fleetId: input.fleetId,
      userId: input.userId,
      capabilitiesJson: capabilities as never,
      active: capabilities.length > 0,
      grantedByUserId: input.actorUserId,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  await logMaintenanceActivity({
    fleetId: input.fleetId,
    userId: input.actorUserId,
    action: "maintenance_permission_changed",
    entityType: "maintenancePermission",
    entityId: input.userId,
    details: { targetUserId: input.userId, capabilities },
  });

  return capabilities;
}

export async function revokeMaintenanceGrant(input: {
  fleetId: number;
  userId: number;
  actorUserId: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db
    .update(maintenancePermissions)
    .set({
      active: false,
      capabilitiesJson: [] as never,
      revokedByUserId: input.actorUserId,
      revokedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(maintenancePermissions.fleetId, input.fleetId),
        eq(maintenancePermissions.userId, input.userId)
      )
    );

  await logMaintenanceActivity({
    fleetId: input.fleetId,
    userId: input.actorUserId,
    action: "maintenance_permission_changed",
    entityType: "maintenancePermission",
    entityId: input.userId,
    details: { targetUserId: input.userId, revoked: true },
  });
}
