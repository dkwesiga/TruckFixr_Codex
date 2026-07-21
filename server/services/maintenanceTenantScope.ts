import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { vehicles } from "../../drizzle/schema";
import {
  canManageCompanyOperations,
  getCompanyMembership,
  getUserPrimaryFleetId,
} from "./companyAccess";

// Tenant-isolation helpers for the maintenance workflow. Every business record
// carries fleetId; these helpers derive the caller's fleet server-side and
// reject any cross-fleet reference. Client-submitted fleet ids are NEVER
// trusted — the fleet is always resolved from the authenticated user.

type ScopedUser = { id: number; role: string; email?: string | null };

// Resolve the fleet the caller is acting within. If the client passes a
// fleetId, it must match a fleet the user actually belongs to; otherwise the
// user's primary fleet is used. Throws FORBIDDEN on mismatch.
export async function resolveActiveFleetId(input: {
  user: ScopedUser;
  requestedFleetId?: number | null;
}): Promise<number> {
  const { user, requestedFleetId } = input;

  if (requestedFleetId != null) {
    const membership = await getCompanyMembership({
      userId: user.id,
      fleetId: requestedFleetId,
    });
    if (!membership || membership.status !== "active") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You do not have access to this fleet.",
      });
    }
    return requestedFleetId;
  }

  const primary = await getUserPrimaryFleetId(user.id);
  if (primary == null) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No fleet is associated with your account.",
    });
  }
  return primary;
}

export async function assertManagesFleet(input: {
  user: ScopedUser;
  fleetId: number;
}): Promise<void> {
  const ok = await canManageCompanyOperations({
    fleetId: input.fleetId,
    user: input.user,
  });
  if (!ok) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This action requires an owner or manager of this fleet.",
    });
  }
}

// Confirm a vehicle belongs to the given fleet. Foreign vehicle ids fail with
// NOT_FOUND (never revealing whether the id exists in another fleet).
export async function assertVehicleInFleet(input: {
  fleetId: number;
  vehicleId: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
  }

  const [row] = await db
    .select({ id: vehicles.id })
    .from(vehicles)
    .where(
      and(
        eq(vehicles.id, String(input.vehicleId)),
        eq(vehicles.fleetId, input.fleetId)
      )
    )
    .limit(1);

  if (!row) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Vehicle not found in this fleet.",
    });
  }
}
