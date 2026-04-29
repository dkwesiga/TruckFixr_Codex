import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { getDb } from "../db";
import { fleets, users, vehicleAssignments, vehicles } from "../../drizzle/schema";
import {
  canManageCompanyOperations,
  getFleetManagementContacts,
  isAssetOperational,
  verifyDriverCompanyMembership,
} from "./companyAccess";

type AppUser = {
  id: number;
  role: string;
  email?: string | null;
};

type VehicleIdentifier = number | string;

function normalizeVehicleIdentifier(vehicleId: VehicleIdentifier) {
  return String(vehicleId).trim();
}

export type FleetGrantContact = {
  id: number;
  name: string | null;
  email: string | null;
  role: string;
};

async function getFleetOwnerRecord(fleetId: number) {
  const db = await getDb();
  if (!db) return null;

  const [fleet] = await db
    .select({ id: fleets.id, ownerId: fleets.ownerId })
    .from(fleets)
    .where(eq(fleets.id, fleetId))
    .limit(1);

  if (!fleet) return null;

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

  return owner ?? null;
}

export async function listFleetGrantContacts(fleetId: number): Promise<FleetGrantContact[]> {
  const db = await getDb();
  if (!db) return [];

  const managedContacts = await getFleetManagementContacts(fleetId);
  if (managedContacts.length > 0) {
    return managedContacts;
  }

  const owner = await getFleetOwnerRecord(fleetId);
  if (!owner) return [];

  const linkedManagers = [owner];

  const unique = new Map<number, FleetGrantContact>();
  for (const person of linkedManagers) {
    unique.set(person.id, person);
  }

  if (!unique.has(owner.id)) {
    unique.set(owner.id, owner);
  }

  return Array.from(unique.values());
}

export async function getPrimaryFleetGrantContact(fleetId: number) {
  const contacts = await listFleetGrantContacts(fleetId);
  return contacts[0] ?? null;
}

export async function canManageVehicleAccess(input: {
  fleetId: number;
  user: AppUser;
}) {
  return canManageCompanyOperations(input);
}

export async function getVehicleById(vehicleId: VehicleIdentifier) {
  const db = await getDb();
  if (!db) return null;
  const normalizedVehicleId = normalizeVehicleIdentifier(vehicleId);
  const [vehicle] = await db
    .select()
    .from(vehicles)
    .where(sql`CAST(${vehicles.id} AS text) = ${normalizedVehicleId}`)
    .limit(1);
  return vehicle ?? null;
}

export async function getActiveVehicleAssignment(input: {
  vehicleId: VehicleIdentifier;
  driverUserId: number;
}) {
  const db = await getDb();
  if (!db) return null;
  const now = new Date();
  const normalizedVehicleId = normalizeVehicleIdentifier(input.vehicleId);
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
      CAST("vehicleId" AS text) = ${normalizedVehicleId}
      and "driverUserId" = ${input.driverUserId}
      and "status" = ${"active"}
      and "startsAt" <= ${now}
      and ("expiresAt" is null or "expiresAt" >= ${now})
    order by "updatedAt" desc
    limit 1
  `);

  return (result.rows?.[0] as any) ?? null;
}

export async function canViewVehicle(input: {
  user: AppUser;
  vehicleId: VehicleIdentifier;
  fleetId?: number;
}) {
  const vehicle = await getVehicleById(input.vehicleId);
  if (!vehicle) return false;

  if (input.fleetId && vehicle.fleetId !== input.fleetId) return false;

  if (input.user.role === "owner" || input.user.role === "manager") {
    return canManageVehicleAccess({ fleetId: vehicle.fleetId, user: input.user });
  }

  const assignment = await getActiveVehicleAssignment({
    vehicleId: input.vehicleId,
    driverUserId: input.user.id,
  });

  if (assignment) return true;
  return vehicle.assignedDriverId === input.user.id;
}

export async function canInspectVehicle(input: {
  user: AppUser;
  vehicleId: VehicleIdentifier;
  fleetId?: number;
}) {
  const canView = await canViewVehicle(input);
  if (!canView) return false;
  return isAssetOperational(input.vehicleId);
}

export async function canDiagnoseVehicle(input: {
  user: AppUser;
  vehicleId: VehicleIdentifier;
  fleetId?: number;
}) {
  const canView = await canViewVehicle(input);
  if (!canView) return false;
  return isAssetOperational(input.vehicleId);
}

export async function listDriverAccessibleVehicles(input: {
  fleetId: number;
  driverUserId: number;
}) {
  const db = await getDb();
  if (!db) return [];

  const now = new Date();
  const assignments = await db
    .select({ vehicleId: vehicleAssignments.vehicleId })
    .from(vehicleAssignments)
    .where(
      and(
        eq(vehicleAssignments.fleetId, input.fleetId),
        eq(vehicleAssignments.driverUserId, input.driverUserId),
        eq(vehicleAssignments.status, "active"),
        lte(vehicleAssignments.startsAt, now),
        or(isNull(vehicleAssignments.expiresAt), gte(vehicleAssignments.expiresAt, now))
      )
    );

  const assignedVehicleIds = new Set(assignments.map((row) => row.vehicleId));
  const directVehicles = await db
    .select()
    .from(vehicles)
    .where(eq(vehicles.fleetId, input.fleetId));

  return directVehicles.filter(
    (vehicle) =>
      vehicle.assetRecordStatus === "active" &&
      (vehicle.assignedDriverId === input.driverUserId || assignedVehicleIds.has(vehicle.id))
  );
}

export async function listDriverAccessibleVehiclesAcrossFleets(input: {
  driverUserId: number;
}) {
  const db = await getDb();
  if (!db) return [];

  const now = new Date();
  const assignments = await db
    .select({
      vehicleId: vehicleAssignments.vehicleId,
    })
    .from(vehicleAssignments)
    .where(
      and(
        eq(vehicleAssignments.driverUserId, input.driverUserId),
        eq(vehicleAssignments.status, "active"),
        lte(vehicleAssignments.startsAt, now),
        or(isNull(vehicleAssignments.expiresAt), gte(vehicleAssignments.expiresAt, now))
      )
    );

  const assignedVehicleIds = Array.from(
    new Set(assignments.map((row) => row.vehicleId).filter(Boolean))
  );

  const assignedVehicles =
    assignedVehicleIds.length > 0
      ? await db.select().from(vehicles).where(inArray(vehicles.id, assignedVehicleIds))
      : [];

  const directVehicles = await db
    .select()
    .from(vehicles)
    .where(eq(vehicles.assignedDriverId, input.driverUserId));

  const mergedVehicles = new Map<string, (typeof directVehicles)[number]>();
  for (const vehicle of [...assignedVehicles, ...directVehicles]) {
    mergedVehicles.set(String(vehicle.id), vehicle);
  }

  return Array.from(mergedVehicles.values()).filter(
    (vehicle) => vehicle.assetRecordStatus === "active"
  );
}

export async function verifyDriverBelongsToFleet(input: {
  fleetId: number;
  driverUserId: number;
}) {
  const assignedVehicles = await listDriverAccessibleVehicles(input);
  if (assignedVehicles.length > 0) return true;
  return verifyDriverCompanyMembership(input);
}
