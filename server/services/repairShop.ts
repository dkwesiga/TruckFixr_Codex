import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { fleets } from "../../drizzle/schema";
import { canManageVehicleAccess } from "./vehicleAccess";
import { getPartnerProfile } from "./partnerProfiles";

// A "repair shop" account is a fleet flagged `isPartner` — the same reusable
// tenant-kind flag the knowledge-base promotion bridge (server/routers/
// partner.ts) already uses, mirroring the convention in
// server/services/tadisAdminMetrics.ts (tenantType = partnerProfiles.tenantType
// ?? (isPartner ? "repair_shop" : "fleet")). This is deliberately NOT tied to
// any specific email/account — any fleet an admin flags isPartner gets the
// repair-shop workflow, current and future.
export async function isRepairShopFleet(fleetId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const [fleet] = await db
    .select({ isPartner: fleets.isPartner })
    .from(fleets)
    .where(eq(fleets.id, fleetId))
    .limit(1);
  if (!fleet?.isPartner) return false;
  // Defensive: if a profile exists with an explicit non-repair-shop
  // tenantType in the future, respect it rather than assuming isPartner
  // always means repair_shop.
  const profile = await getPartnerProfile(fleetId);
  return !profile || profile.tenantType === "repair_shop";
}

/**
 * Verify the caller may act in the repair-shop workflow for this fleet: the
 * fleet must be a repair shop (isPartner) AND the caller must manage it
 * (owner/manager, or an explicit capability grant — canManageVehicleAccess
 * covers both, matching server/routers/partner.ts's requirePartnerFleet).
 */
export async function assertRepairShopAccess(input: {
  fleetId: number;
  user: { id: number; role: string; email?: string | null };
}): Promise<void> {
  const isShop = await isRepairShopFleet(input.fleetId);
  if (!isShop) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This workflow is only available to repair-shop accounts.",
    });
  }
  const manages = await canManageVehicleAccess({ fleetId: input.fleetId, user: input.user });
  if (!manages) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You do not manage this repair shop." });
  }
}
