import { getDb } from './server/db';
import { randomUUID } from 'crypto';
import { driverInvitations, users, vehicleAssignments, vehicles } from './drizzle/schema';
import { eq, gt, or, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { canManageVehicleAccess } from './server/services/vehicleAccess';
import { ensureCompanyMembership } from './server/services/companyAccess';
import {
  buildOwnerOperatorSelfAssignmentNote,
  isOwnerOperatorEnabled,
  parseOwnerOperatorSelfAssignmentNote,
} from './server/services/ownerOperator';

const ALLOWED_VEHICLE_TYPES = [
  'truck', 'tractor', 'trailer', 'straight_truck', 'bus', 
  'van', 'reefer_trailer', 'flatbed_trailer', 'dry_van_trailer', 'other'
];

export const addVehicle = async (input: any, ctx: any) => {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  if (ctx.user.role === 'driver') {
    throw new TRPCError({ code: "FORBIDDEN", message: "Drivers cannot add vehicles." });
  }

  if (!input.assetType || !ALLOWED_VEHICLE_TYPES.includes(input.assetType)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid Vehicle Type." });
  }

  const [vehicle] = await db.insert(vehicles).values({
    id: `veh_${randomUUID()}`,
    assetType: input.assetType,
    unitNumber: input.unitNumber,
    fleetId: ctx.user.fleetId,
    vin: input.vin,
    licensePlate: input.licensePlate,
    make: input.make,
    model: input.model,
    year: input.year,
    status: "active",
    createdByUserId: ctx.user.id,
  }).returning();

  return vehicle;
};

export const assignDriver = async (req: any) => {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { 
    fleetId, 
    vehicleId, 
    driverUserId, 
    accessType, 
    expiresAt, 
    notes, 
    driverMode, 
    inviteFirstName, 
    inviteLastName, 
    inviteEmail, 
    confirmReassign 
  } = req.input;
  const { user } = req.ctx;
  const vehicleIdText = String(vehicleId).trim();
  const numericVehicleId = Number(vehicleIdText);
  const vehicleIdCondition = Number.isFinite(numericVehicleId)
    ? or(
        eq(vehicles.id, numericVehicleId as any),
        sql`CAST(${vehicles.id} AS text) = ${vehicleIdText}`
      )
    : sql`CAST(${vehicles.id} AS text) = ${vehicleIdText}`;

  // Validate invitation details if in invite mode
  if (driverMode === 'invite' && (!inviteEmail || !inviteFirstName || !inviteLastName)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "First name, last name, and email are required for driver invitations."
    });
  }

  // 1. Fetch asset and validate access
  const [asset] = await db
    .select()
    .from(vehicles)
    .where(vehicleIdCondition)
    .limit(1);

  if (!asset) throw new TRPCError({ code: "NOT_FOUND", message: "Vehicle not found" });
  const canManage = await canManageVehicleAccess({
    fleetId: asset.fleetId as any,
    user,
  });
  if (!canManage) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Unauthorized to manage assets in this fleet." });
  }
  if (String(asset.status ?? "").toLowerCase() === "retired") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Retired assets cannot be assigned.",
    });
  }

  const normalizedDriverUserId =
    driverUserId == null ? null : String(driverUserId).trim();

  // 2. Best-effort assignment history lookup.
  // Some deployments have schema drift on vehicleAssignments; do not block core assignment flow.
  let activeAssignment: any = null;
  try {
    const result = await db.execute(sql`
      select
        "id",
        "fleetId",
        "vehicleId",
        "driverUserId",
        "assignedByUserId",
        "accessType",
        "startsAt",
        "expiresAt",
        "status",
        "notes",
        "createdAt",
        "updatedAt"
      from "vehicleAssignments"
      where
        CAST("vehicleId" AS text) = ${String(asset.id)}
        and "status" = ${'active'}
        and ("accessType" = ${'permanent'} or "expiresAt" > ${new Date()})
      order by "updatedAt" desc
      limit 1
    `);
    activeAssignment = result.rows?.[0] ?? null;
  } catch (error) {
    console.warn("[AssignDriver] Skipping active assignment lookup due to schema mismatch.", {
      vehicleId: asset.id,
      error: error instanceof Error ? error.message : error,
    });
  }

  if (activeAssignment && !confirmReassign) {
    throw new TRPCError({ code: "CONFLICT", message: "ALREADY_ASSIGNED" });
  }

  if (driverMode === 'existing' && normalizedDriverUserId && !confirmReassign) {
    const additionalAssignments = await db.execute(sql`
      select
        CAST("id" AS text) as "id",
        "unitNumber",
        "licensePlate",
        "assetType"
      from "vehicles"
      where
        "fleetId" = ${asset.fleetId}
        and CAST("id" AS text) <> ${String(asset.id)}
        and CAST("assignedDriverId" AS text) = ${normalizedDriverUserId}
      order by "updatedAt" desc
      limit 5
    `);

    if ((additionalAssignments.rows?.length ?? 0) > 0) {
      const assignedAssets = additionalAssignments.rows
        .map((row: any) => row.unitNumber || row.licensePlate || row.id)
        .filter(Boolean);

      throw new TRPCError({
        code: "CONFLICT",
        message: `DRIVER_HAS_OTHER_ASSIGNMENTS:${assignedAssets.join(", ")}`,
      });
    }
  }

  return await db.transaction(async (tx) => {
    // 3. Revoke existing assignment if necessary
    if (activeAssignment) {
      try {
        await tx.execute(sql`
          update "vehicleAssignments"
          set
            "status" = ${'revoked'},
            "notes" = ${notes ? `${notes} | previous assignment revoked` : 'previous assignment revoked'},
            "updatedAt" = ${new Date()}
          where "id" = ${activeAssignment.id}
        `);
      } catch (error) {
        console.warn("[AssignDriver] Could not revoke previous assignment record.", {
          assignmentId: activeAssignment.id,
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    let targetDriverUserId = normalizedDriverUserId;
    let driverInvitationId = null;

    // 4. Handle Invitation if in invite mode
    if (driverMode === 'invite') {
      const [invite] = await tx.insert(driverInvitations).values({
        fleetId: fleetId,
        email: inviteEmail!,
        firstName: inviteFirstName!,
        lastName: inviteLastName!,
        invitedByUserId: user.id,
        status: 'pending'
      }).returning();
      
      driverInvitationId = invite.id;
      targetDriverUserId = null;
    }

    // 5. Create new assignment
    let newAssignment: any = null;
  try {
    const inserted = await tx.execute(sql`
        insert into "vehicleAssignments" (
          "fleetId",
          "vehicleId",
          "driverUserId",
          "assignedByUserId",
          "accessType",
          "startsAt",
          "expiresAt",
          "status",
          "notes",
          "createdAt",
          "updatedAt"
        ) values (
          ${fleetId},
          ${String(asset.id)},
          ${targetDriverUserId == null ? null : Number(targetDriverUserId)},
          ${user.id},
          ${accessType},
          ${new Date()},
          ${accessType === 'temporary' && expiresAt ? new Date(expiresAt) : null},
          ${'active'},
          ${notes ?? null},
          ${new Date()},
          ${new Date()}
        )
        returning
          "id",
          "fleetId",
          "vehicleId",
          "driverUserId",
          "assignedByUserId",
          "accessType",
          "startsAt",
          "expiresAt",
          "status",
          "notes",
          "createdAt",
          "updatedAt"
      `);
      newAssignment = inserted.rows?.[0] ?? null;
    } catch (error) {
      console.warn("[AssignDriver] Could not write vehicleAssignments history row; continuing with legacy assignment update.", {
        fleetId,
        vehicleId: asset.id,
        driverUserId: targetDriverUserId,
        error: error instanceof Error ? error.message : error,
      });
    }

    if (targetDriverUserId != null) {
      try {
        await tx
          .update(users)
          .set({
            managerUserId: user.id,
            managerEmail: user.email?.trim().toLowerCase() || null,
            updatedAt: new Date(),
          })
          .where(eq(users.id, Number(targetDriverUserId)));
      } catch (error) {
        console.warn("[AssignDriver] Could not update driver's manager linkage.", {
          driverUserId: targetDriverUserId,
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    // 6. Update legacy column on vehicle for backward compatibility
    // We update this regardless of whether targetDriverUserId is null to ensure 
    // the legacy state accurately reflects the new assignment.
    const assignmentDriverCandidates: Array<string | number | null> =
      targetDriverUserId == null ? [null] : [targetDriverUserId];
    if (targetDriverUserId != null) {
      const numericDriverId = Number(targetDriverUserId);
      if (Number.isFinite(numericDriverId)) {
        assignmentDriverCandidates.push(numericDriverId);
      }
    }

    const uniqueDriverCandidates = Array.from(
      new Set(assignmentDriverCandidates.map(candidate => candidate == null ? null : String(candidate)))
    ).map(candidate => {
      if (candidate == null) return null;
      const asNumber = Number(candidate);
      return Number.isFinite(asNumber) && String(asNumber) === candidate ? asNumber : candidate;
    });

    let assignedDriverUpdated = false;
    let lastAssignedDriverError: unknown = null;
    for (const candidate of uniqueDriverCandidates) {
      try {
        await tx.execute(sql`
          update "vehicles"
          set
            "assignedDriverId" = ${candidate as any},
            "updatedAt" = ${new Date()}
          where CAST("id" AS text) = ${String(asset.id)}
        `);
        assignedDriverUpdated = true;
        break;
      } catch (error) {
        lastAssignedDriverError = error;
      }
    }

    if (!assignedDriverUpdated) {
      console.warn("[AssignDriver] Could not update vehicles.assignedDriverId; continuing without legacy column update.", {
        vehicleId: asset.id,
        attemptedDriverCandidates: uniqueDriverCandidates,
        error:
          lastAssignedDriverError instanceof Error
            ? lastAssignedDriverError.message
            : lastAssignedDriverError,
      });
    }

    if (driverMode === 'existing' && targetDriverUserId != null) {
      const numericTargetDriverUserId = Number(targetDriverUserId);
      if (!Number.isFinite(numericTargetDriverUserId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Assigned driver is invalid.",
        });
      }

      await ensureCompanyMembership({
        fleetId: Number(asset.fleetId),
        userId: numericTargetDriverUserId,
        role: "driver",
        approvedByUserId: user.id,
        status: "active",
      });
    }

    return (
      newAssignment ?? {
        id: null,
        fleetId,
        vehicleId: asset.id,
        driverUserId: targetDriverUserId,
        driverInvitationId,
        assignedByUserId: user.id,
        accessType,
        startsAt: new Date(),
        expiresAt: accessType === 'temporary' && expiresAt ? new Date(expiresAt) : null,
        notes: notes ?? null,
        status: 'active',
      }
    );
  });
};

async function getOwnerOperatorAssetForSelfAssignment(input: {
  fleetId: number;
  vehicleId: string | number;
  user: any;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  if (!isOwnerOperatorEnabled(input.user)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only owner-operators can assign a vehicle to themselves.",
    });
  }

  const vehicleIdText = String(input.vehicleId).trim();
  const [asset] = await db
    .select()
    .from(vehicles)
    .where(sql`CAST(${vehicles.id} AS text) = ${vehicleIdText}`)
    .limit(1);

  if (!asset || Number(asset.fleetId) !== Number(input.fleetId)) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Vehicle not found" });
  }

  const canManage = await canManageVehicleAccess({
    fleetId: Number(asset.fleetId),
    user: input.user,
  });
  if (!canManage) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Unauthorized to manage this fleet asset.",
    });
  }

  if (
    String(asset.assetRecordStatus ?? "").toLowerCase() !== "active" ||
    String(asset.status ?? "").toLowerCase() !== "active"
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Only operational active vehicles can be assigned to you.",
    });
  }

  return { db, asset };
}

async function getLatestActiveOwnerOperatorSelfAssignment(input: {
  vehicleId: string | number;
  ownerOperatorUserId?: number | null;
}) {
  const db = await getDb();
  if (!db) return null;

  const vehicleIdText = String(input.vehicleId).trim();
  const result = await db.execute(sql`
    select
      "id",
      "fleetId",
      "vehicleId",
      "driverUserId",
      "assignedByUserId",
      "accessType",
      "startsAt",
      "expiresAt",
      "status",
      "notes",
      "revokedAt",
      "revokedByUserId",
      "createdAt",
      "updatedAt"
    from "vehicleAssignments"
    where
      CAST("vehicleId" AS text) = ${vehicleIdText}
      and "status" = ${'active'}
    order by "updatedAt" desc
  `);

  const rows = (result.rows ?? []) as Array<any>;
  for (const row of rows) {
    const metadata = parseOwnerOperatorSelfAssignmentNote(row.notes);
    if (!metadata) continue;
    if (
      input.ownerOperatorUserId != null &&
      metadata.ownerOperatorUserId !== input.ownerOperatorUserId
    ) {
      continue;
    }

    return {
      ...row,
      metadata,
    };
  }

  return null;
}

export const assignOwnerOperatorToSelf = async (req: any) => {
  const { fleetId, vehicleId, confirmTakeover } = req.input;
  const { user } = req.ctx;
  const { db, asset } = await getOwnerOperatorAssetForSelfAssignment({
    fleetId,
    vehicleId,
    user,
  });

  const activeSelfAssignment = await getLatestActiveOwnerOperatorSelfAssignment({
    vehicleId: asset.id,
    ownerOperatorUserId: user.id,
  });

  if (activeSelfAssignment) {
    return {
      status: "already_assigned",
      vehicleId: asset.id,
      driverUserId: user.id,
      previousDriverUserId:
        activeSelfAssignment.metadata.previousDriverUserId ?? null,
      previousDriverName:
        activeSelfAssignment.metadata.previousDriverName ?? null,
    };
  }

  const previousDriverUserId =
    asset.assignedDriverId != null && Number(asset.assignedDriverId) !== user.id
      ? Number(asset.assignedDriverId)
      : null;
  const [previousDriver] =
    previousDriverUserId != null
      ? await db
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(eq(users.id, previousDriverUserId))
          .limit(1)
      : [null];

  if (previousDriverUserId != null && !confirmTakeover) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `OWNER_OPERATOR_CONFIRM_TAKEOVER:${previousDriver?.name || previousDriver?.email || `Driver ${previousDriverUserId}`}`,
    });
  }

  return await db.transaction(async (tx) => {
    if (previousDriverUserId != null) {
      const preservedAssignment = await tx.execute(sql`
        select "id"
        from "vehicleAssignments"
        where
          CAST("vehicleId" AS text) = ${String(asset.id)}
          and "driverUserId" = ${previousDriverUserId}
          and "status" = ${'active'}
        order by "updatedAt" desc
        limit 1
      `);

      if ((preservedAssignment.rows?.length ?? 0) === 0) {
        try {
          await tx.insert(vehicleAssignments).values({
            fleetId: Number(asset.fleetId),
            vehicleId: String(asset.id),
            driverUserId: previousDriverUserId,
            assignedByUserId: user.id,
            accessType: "permanent",
            startsAt: new Date(),
            status: "active",
            notes: "Preserved during owner-operator self-assignment",
          });
        } catch (error) {
          console.warn("[OwnerOperator] Could not preserve previous driver assignment row.", {
            vehicleId: asset.id,
            previousDriverUserId,
            error: error instanceof Error ? error.message : error,
          });
        }
      }
    }

    const metadata = {
      ownerOperatorUserId: Number(user.id),
      ownerOperatorName: user.name ?? null,
      previousDriverUserId,
      previousDriverName: previousDriver?.name ?? previousDriver?.email ?? null,
      assignedAt: new Date().toISOString(),
    };

    const [assignment] = await tx
      .insert(vehicleAssignments)
      .values({
        fleetId: Number(asset.fleetId),
        vehicleId: String(asset.id),
        driverUserId: Number(user.id),
        assignedByUserId: Number(user.id),
        accessType: "permanent",
        startsAt: new Date(),
        status: "active",
        notes: buildOwnerOperatorSelfAssignmentNote(metadata),
      })
      .returning();

    await tx.execute(sql`
      update "vehicles"
      set
        "assignedDriverId" = ${Number(user.id)},
        "updatedAt" = ${new Date()}
      where CAST("id" AS text) = ${String(asset.id)}
    `);

    return {
      status: "assigned",
      vehicleId: asset.id,
      driverUserId: user.id,
      previousDriverUserId,
      previousDriverName: previousDriver?.name ?? previousDriver?.email ?? null,
      assignmentId: assignment?.id ?? null,
    };
  });
};

export const releaseOwnerOperatorSelfAssignment = async (req: any) => {
  const { fleetId, vehicleId } = req.input;
  const { user } = req.ctx;
  const { db, asset } = await getOwnerOperatorAssetForSelfAssignment({
    fleetId,
    vehicleId,
    user,
  });

  const activeSelfAssignment = await getLatestActiveOwnerOperatorSelfAssignment({
    vehicleId: asset.id,
    ownerOperatorUserId: user.id,
  });

  if (!activeSelfAssignment) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "No active self-assignment was found for this vehicle.",
    });
  }

  const restoredDriverUserId =
    activeSelfAssignment.metadata.previousDriverUserId ?? null;
  const [restoredDriver] =
    restoredDriverUserId != null
      ? await db
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(eq(users.id, restoredDriverUserId))
          .limit(1)
      : [null];

  return await db.transaction(async (tx) => {
    await tx
      .update(vehicleAssignments)
      .set({
        status: "revoked",
        revokedAt: new Date(),
        revokedByUserId: Number(user.id),
        updatedAt: new Date(),
        notes: `${activeSelfAssignment.notes ?? ""} | released_by_owner_operator:${new Date().toISOString()}`,
      })
      .where(eq(vehicleAssignments.id, Number(activeSelfAssignment.id)));

    await tx.execute(sql`
      update "vehicles"
      set
        "assignedDriverId" = ${restoredDriverUserId},
        "updatedAt" = ${new Date()}
      where CAST("id" AS text) = ${String(asset.id)}
    `);

    return {
      status: "released",
      vehicleId: asset.id,
      restoredDriverUserId,
      restoredDriverName: restoredDriver?.name ?? restoredDriver?.email ?? null,
    };
  });
};
