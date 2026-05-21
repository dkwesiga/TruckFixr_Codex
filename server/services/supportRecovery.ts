import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { getDb } from "../db";
import {
  activityLogs,
  companyMemberships,
  defects,
  fleets,
  inspections,
  pilotAccessCodes,
  pilotAccessRedemptions,
  repairOutcomes,
  subscriptions,
  supportRecoveryActions,
  users,
  vehicleAssignments,
  vehicles,
} from "../../drizzle/schema";

type JsonRecord = Record<string, unknown>;

export type SupportRecoveryTarget = {
  targetFleetId?: number | null;
  targetUserId?: number | null;
  targetVehicleId?: string | null;
  targetInspectionId?: number | null;
  targetDiagnosticCaseId?: string | null;
  targetMembershipId?: number | null;
  targetPilotCodeId?: number | null;
};

export async function recordSupportRecoveryAction(input: {
  actionType: string;
  staffUserId: number;
  reason: string;
  target?: SupportRecoveryTarget;
  beforeState?: unknown;
  afterState?: unknown;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [record] = await db
    .insert(supportRecoveryActions)
    .values({
      actionType: input.actionType,
      staffUserId: input.staffUserId,
      targetFleetId: input.target?.targetFleetId ?? null,
      targetUserId: input.target?.targetUserId ?? null,
      targetVehicleId: input.target?.targetVehicleId ?? null,
      targetInspectionId: input.target?.targetInspectionId ?? null,
      targetDiagnosticCaseId: input.target?.targetDiagnosticCaseId ?? null,
      targetMembershipId: input.target?.targetMembershipId ?? null,
      targetPilotCodeId: input.target?.targetPilotCodeId ?? null,
      reason: input.reason,
      beforeState: input.beforeState as JsonRecord | null,
      afterState: input.afterState as JsonRecord | null,
    })
    .returning();

  return record;
}

export async function getSupportRecoverySnapshot(input: {
  query?: string | null;
  fleetId?: number | null;
  userId?: number | null;
  vehicleId?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const query = input.query?.trim();
  const fleetRows = input.fleetId
    ? await db.select().from(fleets).where(eq(fleets.id, input.fleetId)).limit(10)
    : query
      ? await db
          .select()
          .from(fleets)
          .where(or(ilike(fleets.name, `%${query}%`), ilike(fleets.companyEmail, `%${query}%`)))
          .limit(10)
      : [];

  const userRows = input.userId
    ? await db.select().from(users).where(eq(users.id, input.userId)).limit(10)
    : query
      ? await db
          .select()
          .from(users)
          .where(or(ilike(users.email, `%${query}%`), ilike(users.name, `%${query}%`)))
          .limit(10)
      : [];

  const vehicleRows = input.vehicleId
    ? await db.select().from(vehicles).where(eq(vehicles.id, input.vehicleId)).limit(10)
    : query
      ? await db
          .select()
          .from(vehicles)
          .where(
            or(
              ilike(vehicles.id, `%${query}%`),
              ilike(vehicles.vin, `%${query}%`),
              ilike(vehicles.licensePlate, `%${query}%`),
              ilike(vehicles.unitNumber, `%${query}%`)
            )
          )
          .limit(10)
      : [];

  const fleetIds = Array.from(new Set(fleetRows.map((fleet) => fleet.id)));
  const userIds = Array.from(new Set(userRows.map((user) => user.id)));
  const vehicleIds = Array.from(new Set(vehicleRows.map((vehicle) => vehicle.id)));

  const membershipRows =
    fleetIds.length === 1
      ? await db
          .select()
          .from(companyMemberships)
          .where(eq(companyMemberships.fleetId, fleetIds[0]))
          .limit(50)
      : userIds.length === 1
        ? await db
            .select()
            .from(companyMemberships)
            .where(eq(companyMemberships.userId, userIds[0]))
            .limit(50)
        : [];

  const assignmentRows =
    vehicleIds.length === 1
      ? await db
          .select()
          .from(vehicleAssignments)
          .where(eq(vehicleAssignments.vehicleId, vehicleIds[0]))
          .orderBy(desc(vehicleAssignments.updatedAt))
          .limit(20)
      : userIds.length === 1
        ? await db
            .select()
            .from(vehicleAssignments)
            .where(eq(vehicleAssignments.driverUserId, userIds[0]))
            .orderBy(desc(vehicleAssignments.updatedAt))
            .limit(20)
        : [];

  const inspectionRows =
    vehicleIds.length === 1
      ? await db
          .select()
          .from(inspections)
          .where(eq(inspections.vehicleId, vehicleIds[0]))
          .orderBy(desc(inspections.createdAt))
          .limit(10)
      : fleetIds.length === 1
        ? await db
            .select()
            .from(inspections)
            .where(eq(inspections.fleetId, fleetIds[0]))
            .orderBy(desc(inspections.createdAt))
            .limit(10)
        : userIds.length === 1
          ? await db
              .select()
              .from(inspections)
              .where(eq(inspections.driverId, userIds[0]))
              .orderBy(desc(inspections.createdAt))
              .limit(10)
          : [];

  const defectRows =
    vehicleIds.length === 1
      ? await db
          .select()
          .from(defects)
          .where(eq(defects.vehicleId, vehicleIds[0]))
          .orderBy(desc(defects.createdAt))
          .limit(10)
      : fleetIds.length === 1
        ? await db
            .select()
            .from(defects)
            .where(eq(defects.fleetId, fleetIds[0]))
            .orderBy(desc(defects.createdAt))
            .limit(10)
        : [];

  const numericVehicleId = vehicleIds.length === 1 ? Number(vehicleIds[0]) : NaN;
  const diagnosticRows =
    vehicleIds.length === 1 && Number.isFinite(numericVehicleId)
      ? await db
          .select()
          .from(activityLogs)
          .where(and(eq(activityLogs.entityType, "vehicle"), eq(activityLogs.entityId, numericVehicleId)))
          .orderBy(desc(activityLogs.createdAt))
          .limit(20)
      : fleetIds.length === 1
        ? await db
            .select()
            .from(activityLogs)
            .where(eq(activityLogs.fleetId, fleetIds[0]))
            .orderBy(desc(activityLogs.createdAt))
            .limit(20)
        : [];

  const repairOutcomeRows =
    vehicleIds.length === 1
      ? await db
          .select()
          .from(repairOutcomes)
          .where(eq(repairOutcomes.vehicleId, vehicleIds[0]))
          .orderBy(desc(repairOutcomes.createdAt))
          .limit(10)
      : fleetIds.length === 1
        ? await db
            .select()
            .from(repairOutcomes)
            .where(eq(repairOutcomes.fleetId, fleetIds[0]))
            .orderBy(desc(repairOutcomes.createdAt))
            .limit(10)
        : [];

  const subscriptionRows =
    fleetIds.length === 1
      ? await db
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.fleetId, fleetIds[0]))
          .orderBy(desc(subscriptions.updatedAt))
          .limit(10)
      : userIds.length === 1
        ? await db
            .select()
            .from(subscriptions)
            .where(eq(subscriptions.userId, userIds[0]))
            .orderBy(desc(subscriptions.updatedAt))
            .limit(10)
        : [];

  const pilotRedemptionRows =
    fleetIds.length === 1
      ? await db
          .select()
          .from(pilotAccessRedemptions)
          .where(eq(pilotAccessRedemptions.fleetId, fleetIds[0]))
          .orderBy(desc(pilotAccessRedemptions.updatedAt))
          .limit(10)
      : [];

  const pilotCodeIds = Array.from(
    new Set(pilotRedemptionRows.map((redemption) => redemption.codeId).filter((codeId) => Number.isFinite(codeId)))
  );
  const pilotCodeRecords =
    pilotCodeIds.length > 0
      ? await db
          .select()
          .from(pilotAccessCodes)
          .where(inArray(pilotAccessCodes.id, pilotCodeIds))
      : [];
  const pilotCodeMap = new Map(pilotCodeRecords.map((code) => [code.id, code]));
  const pilotCodeRows = pilotRedemptionRows.map((redemption) => ({
    redemption,
    code: pilotCodeMap.get(redemption.codeId) ?? null,
  }));

  return {
    fleets: fleetRows,
    users: userRows,
    vehicles: vehicleRows,
    memberships: membershipRows,
    assignments: assignmentRows,
    inspections: inspectionRows,
    defects: defectRows,
    diagnosticActivity: diagnosticRows,
    repairOutcomes: repairOutcomeRows,
    subscriptions: subscriptionRows,
    pilotCodes: pilotCodeRows,
  };
}

export async function moveUserToFleet(input: {
  staffUserId: number;
  userId: number;
  toFleetId: number;
  fromFleetId?: number | null;
  role: "owner" | "manager" | "driver";
  reason: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [user] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
  const [targetFleet] = await db.select().from(fleets).where(eq(fleets.id, input.toFleetId)).limit(1);
  if (!user) throw new Error("Target user not found");
  if (!targetFleet) throw new Error("Target fleet not found");

  const beforeMemberships = await db
    .select()
    .from(companyMemberships)
    .where(eq(companyMemberships.userId, input.userId));

  if (input.fromFleetId) {
    await db
      .update(companyMemberships)
      .set({ status: "removed", removedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(companyMemberships.userId, input.userId),
          eq(companyMemberships.fleetId, input.fromFleetId)
        )
      );
  }

  const [existingTargetMembership] = await db
    .select()
    .from(companyMemberships)
    .where(and(eq(companyMemberships.userId, input.userId), eq(companyMemberships.fleetId, input.toFleetId)))
    .limit(1);

  let targetMembership = existingTargetMembership;
  if (existingTargetMembership) {
    [targetMembership] = await db
      .update(companyMemberships)
      .set({
        role: input.role,
        status: "active",
        approvedByUserId: input.staffUserId,
        removedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(companyMemberships.id, existingTargetMembership.id))
      .returning();
  } else {
    [targetMembership] = await db
      .insert(companyMemberships)
      .values({
        fleetId: input.toFleetId,
        userId: input.userId,
        role: input.role,
        status: "active",
        approvedByUserId: input.staffUserId,
        joinedAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
  }

  await db
    .update(users)
    .set({
      role: input.role,
      managerUserId: input.role === "driver" ? targetFleet.ownerId : null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, input.userId));

  await recordSupportRecoveryAction({
    actionType: "move_user_to_fleet",
    staffUserId: input.staffUserId,
    reason: input.reason,
    target: {
      targetFleetId: input.toFleetId,
      targetUserId: input.userId,
      targetMembershipId: targetMembership?.id ?? null,
    },
    beforeState: { user, memberships: beforeMemberships },
    afterState: { targetMembership, toFleetId: input.toFleetId, role: input.role },
  });

  return { targetMembership };
}

export async function reassignVehicleFleet(input: {
  staffUserId: number;
  vehicleId: string;
  toFleetId: number;
  assignedDriverId?: number | null;
  reason: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, input.vehicleId)).limit(1);
  const [targetFleet] = await db.select().from(fleets).where(eq(fleets.id, input.toFleetId)).limit(1);
  if (!vehicle) throw new Error("Target vehicle not found");
  if (!targetFleet) throw new Error("Target fleet not found");

  const previousAssignments = await db
    .select()
    .from(vehicleAssignments)
    .where(eq(vehicleAssignments.vehicleId, input.vehicleId));

  await db
    .update(vehicleAssignments)
    .set({ status: "revoked", revokedAt: new Date(), revokedByUserId: input.staffUserId, updatedAt: new Date() })
    .where(eq(vehicleAssignments.vehicleId, input.vehicleId));

  const [updatedVehicle] = await db
    .update(vehicles)
    .set({
      fleetId: input.toFleetId,
      assignedDriverId: input.assignedDriverId ?? null,
      updatedAt: new Date(),
    })
    .where(eq(vehicles.id, input.vehicleId))
    .returning();

  let assignment = null;
  if (input.assignedDriverId) {
    [assignment] = await db
      .insert(vehicleAssignments)
      .values({
        fleetId: input.toFleetId,
        vehicleId: input.vehicleId,
        driverUserId: input.assignedDriverId,
        assignedByUserId: input.staffUserId,
        accessType: "permanent",
        startsAt: new Date(),
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
  }

  await recordSupportRecoveryAction({
    actionType: "reassign_vehicle_fleet",
    staffUserId: input.staffUserId,
    reason: input.reason,
    target: {
      targetFleetId: input.toFleetId,
      targetUserId: input.assignedDriverId ?? null,
      targetVehicleId: input.vehicleId,
    },
    beforeState: { vehicle, assignments: previousAssignments },
    afterState: { vehicle: updatedVehicle, assignment },
  });

  return { vehicle: updatedVehicle, assignment };
}

export async function deactivateUserFromFleet(input: {
  staffUserId: number;
  userId: number;
  fleetId: number;
  reason: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [user] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
  const [fleet] = await db.select().from(fleets).where(eq(fleets.id, input.fleetId)).limit(1);
  if (!user) throw new Error("Target user not found");
  if (!fleet) throw new Error("Target fleet not found");

  const [membership] = await db
    .select()
    .from(companyMemberships)
    .where(and(eq(companyMemberships.userId, input.userId), eq(companyMemberships.fleetId, input.fleetId)))
    .limit(1);

  const assignments = await db
    .select()
    .from(vehicleAssignments)
    .where(and(eq(vehicleAssignments.driverUserId, input.userId), eq(vehicleAssignments.fleetId, input.fleetId)));

  if (membership) {
    await db
      .update(companyMemberships)
      .set({ status: "inactive", removedAt: new Date(), updatedAt: new Date() })
      .where(eq(companyMemberships.id, membership.id));
  }

  await db
    .update(vehicleAssignments)
    .set({ status: "revoked", revokedAt: new Date(), revokedByUserId: input.staffUserId, updatedAt: new Date() })
    .where(and(eq(vehicleAssignments.driverUserId, input.userId), eq(vehicleAssignments.fleetId, input.fleetId)));

  await db
    .update(vehicles)
    .set({ assignedDriverId: null, updatedAt: new Date() })
    .where(and(eq(vehicles.assignedDriverId, input.userId), eq(vehicles.fleetId, input.fleetId)));

  await recordSupportRecoveryAction({
    actionType: "deactivate_user_from_fleet",
    staffUserId: input.staffUserId,
    reason: input.reason,
    target: { targetFleetId: input.fleetId, targetUserId: input.userId, targetMembershipId: membership?.id ?? null },
    beforeState: { user, fleet, membership, assignments },
    afterState: { status: "inactive", revokedAssignments: assignments.length },
  });

  return { deactivated: true, revokedAssignments: assignments.length };
}

export async function reactivateUserInFleet(input: {
  staffUserId: number;
  userId: number;
  fleetId: number;
  role: "owner" | "manager" | "driver";
  vehicleId?: string | null;
  reason: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [user] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
  const [fleet] = await db.select().from(fleets).where(eq(fleets.id, input.fleetId)).limit(1);
  if (!user) throw new Error("Target user not found");
  if (!fleet) throw new Error("Target fleet not found");

  const [membership] = await db
    .select()
    .from(companyMemberships)
    .where(and(eq(companyMemberships.userId, input.userId), eq(companyMemberships.fleetId, input.fleetId)))
    .limit(1);
  if (!membership) {
    throw new Error("No existing membership was found for this user and fleet.");
  }

  const priorAssignments = await db
    .select()
    .from(vehicleAssignments)
    .where(and(eq(vehicleAssignments.driverUserId, input.userId), eq(vehicleAssignments.fleetId, input.fleetId)));

  let reactivatedVehicle = null;
  let reactivatedAssignment = null;

  if (input.vehicleId) {
    const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, input.vehicleId)).limit(1);
    if (!vehicle || vehicle.fleetId !== input.fleetId) {
      throw new Error("The selected vehicle does not belong to the target fleet.");
    }

    [reactivatedVehicle] = await db
      .update(vehicles)
      .set({ assignedDriverId: input.userId, updatedAt: new Date() })
      .where(eq(vehicles.id, input.vehicleId))
      .returning();

    const [existingAssignment] = await db
      .select()
      .from(vehicleAssignments)
      .where(and(eq(vehicleAssignments.vehicleId, input.vehicleId), eq(vehicleAssignments.driverUserId, input.userId)))
      .orderBy(desc(vehicleAssignments.updatedAt))
      .limit(1);

    if (existingAssignment) {
      [reactivatedAssignment] = await db
        .update(vehicleAssignments)
        .set({
          fleetId: input.fleetId,
          status: "active",
          revokedAt: null,
          revokedByUserId: null,
          assignedByUserId: input.staffUserId,
          startsAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(vehicleAssignments.id, existingAssignment.id))
        .returning();
    } else {
      [reactivatedAssignment] = await db
        .insert(vehicleAssignments)
        .values({
          fleetId: input.fleetId,
          vehicleId: input.vehicleId,
          driverUserId: input.userId,
          assignedByUserId: input.staffUserId,
          accessType: "permanent",
          startsAt: new Date(),
          status: "active",
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
    }
  }

  const [updatedMembership] = await db
    .update(companyMemberships)
    .set({
      role: input.role,
      status: "active",
      approvedByUserId: input.staffUserId,
      removedAt: null,
      joinedAt: membership.joinedAt ?? new Date(),
      updatedAt: new Date(),
    })
    .where(eq(companyMemberships.id, membership.id))
    .returning();

  const [updatedUser] = await db
    .update(users)
    .set({
      role: input.role,
      managerUserId: input.role === "driver" ? fleet.ownerId : null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, input.userId))
    .returning();

  await recordSupportRecoveryAction({
    actionType: "reactivate_user_in_fleet",
    staffUserId: input.staffUserId,
    reason: input.reason,
    target: {
      targetFleetId: input.fleetId,
      targetUserId: input.userId,
      targetVehicleId: input.vehicleId ?? null,
      targetMembershipId: membership.id,
    },
    beforeState: { user, fleet, membership, assignments: priorAssignments },
    afterState: {
      user: updatedUser,
      membership: updatedMembership,
      vehicle: reactivatedVehicle,
      assignment: reactivatedAssignment,
    },
  });

  return {
    reactivated: true,
    membership: updatedMembership,
    vehicle: reactivatedVehicle,
    assignment: reactivatedAssignment,
  };
}

export async function setVehicleRecoveryStatus(input: {
  staffUserId: number;
  vehicleId: string;
  status: "active" | "maintenance" | "retired";
  assetRecordStatus: "active" | "inactive" | "archived";
  reason: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, input.vehicleId)).limit(1);
  if (!vehicle) throw new Error("Target vehicle not found");

  const [updatedVehicle] = await db
    .update(vehicles)
    .set({
      status: input.status,
      assetRecordStatus: input.assetRecordStatus,
      assignedDriverId: input.assetRecordStatus === "active" ? vehicle.assignedDriverId : null,
      updatedAt: new Date(),
    })
    .where(eq(vehicles.id, input.vehicleId))
    .returning();

  if (input.assetRecordStatus !== "active") {
    await db
      .update(vehicleAssignments)
      .set({ status: "revoked", revokedAt: new Date(), revokedByUserId: input.staffUserId, updatedAt: new Date() })
      .where(eq(vehicleAssignments.vehicleId, input.vehicleId));
  }

  await recordSupportRecoveryAction({
    actionType: "set_vehicle_recovery_status",
    staffUserId: input.staffUserId,
    reason: input.reason,
    target: { targetFleetId: vehicle.fleetId, targetVehicleId: input.vehicleId },
    beforeState: { vehicle },
    afterState: { vehicle: updatedVehicle },
  });

  return { vehicle: updatedVehicle };
}

export async function resetPilotCode(input: {
  staffUserId: number;
  codeId: number;
  reason: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [code] = await db.select().from(pilotAccessCodes).where(eq(pilotAccessCodes.id, input.codeId)).limit(1);
  if (!code) throw new Error("Pilot code not found");

  const redemptions = await db
    .select()
    .from(pilotAccessRedemptions)
    .where(eq(pilotAccessRedemptions.codeId, input.codeId));

  await db
    .update(pilotAccessRedemptions)
    .set({ status: "revoked", updatedAt: new Date() })
    .where(eq(pilotAccessRedemptions.codeId, input.codeId));

  const [updatedCode] = await db
    .update(pilotAccessCodes)
    .set({
      status: "active",
      activatedAt: null,
      expiresAt: null,
      updatedAt: new Date(),
    })
    .where(eq(pilotAccessCodes.id, input.codeId))
    .returning();

  await recordSupportRecoveryAction({
    actionType: "reset_pilot_code",
    staffUserId: input.staffUserId,
    reason: input.reason,
    target: { targetPilotCodeId: input.codeId },
    beforeState: { code, redemptions },
    afterState: { code: updatedCode, revokedRedemptions: redemptions.length },
  });

  return { code: updatedCode, revokedRedemptions: redemptions.length };
}

export async function overrideFleetBillingStatus(input: {
  staffUserId: number;
  fleetId: number;
  billingStatus:
    | "active"
    | "trialing"
    | "past_due"
    | "canceled"
    | "incomplete"
    | "incomplete_expired"
    | "unpaid"
    | "expired"
    | "custom";
  reason: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [fleet] = await db.select().from(fleets).where(eq(fleets.id, input.fleetId)).limit(1);
  if (!fleet) throw new Error("Fleet not found");

  const relatedSubscriptions = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.fleetId, input.fleetId));

  const [updatedFleet] = await db
    .update(fleets)
    .set({ billingStatus: input.billingStatus, updatedAt: new Date() })
    .where(eq(fleets.id, input.fleetId))
    .returning();

  await db
    .update(subscriptions)
    .set({ billingStatus: input.billingStatus, updatedAt: new Date() })
    .where(eq(subscriptions.fleetId, input.fleetId));

  await recordSupportRecoveryAction({
    actionType: "override_fleet_billing_status",
    staffUserId: input.staffUserId,
    reason: input.reason,
    target: { targetFleetId: input.fleetId },
    beforeState: { fleet, subscriptions: relatedSubscriptions },
    afterState: { fleet: updatedFleet, billingStatus: input.billingStatus },
  });

  return { fleet: updatedFleet };
}
