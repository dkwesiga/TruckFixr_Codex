import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { inAppAlerts } from "../../drizzle/schema";
import { canManageVehicleAccess } from "../services/vehicleAccess";

// In-app notifications (TruckFixr V1.0). Surfaces existing inAppAlerts rows
// (written by the inspection, defect, triage, and access flows) to managers.
// No email/SMS/push — in-app only.

async function verifyFleetAccess(fleetId: number, userId: number, role: string) {
  return canManageVehicleAccess({ fleetId, user: { id: userId, role } });
}

export const notificationsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        fleetId: z.number().int().positive(),
        limit: z.number().int().min(1).max(100).default(20),
      })
    )
    .query(async ({ input, ctx }) => {
      const hasAccess = await verifyFleetAccess(input.fleetId, ctx.user.id, ctx.user.role);
      if (!hasAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this fleet",
        });
      }

      const db = await getDb();
      if (!db) return [];

      return db
        .select()
        .from(inAppAlerts)
        .where(eq(inAppAlerts.fleetId, input.fleetId))
        .orderBy(desc(inAppAlerts.createdAt))
        .limit(input.limit);
    }),

  unreadCount: protectedProcedure
    .input(z.object({ fleetId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const hasAccess = await verifyFleetAccess(input.fleetId, ctx.user.id, ctx.user.role);
      if (!hasAccess) return 0;

      const db = await getDb();
      if (!db) return 0;

      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(inAppAlerts)
        .where(and(eq(inAppAlerts.fleetId, input.fleetId), eq(inAppAlerts.status, "open")));

      return row?.count ?? 0;
    }),

  markRead: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      const [alert] = await db
        .select()
        .from(inAppAlerts)
        .where(eq(inAppAlerts.id, input.id))
        .limit(1);
      if (!alert) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Notification not found" });
      }

      const hasAccess = await verifyFleetAccess(alert.fleetId, ctx.user.id, ctx.user.role);
      if (!hasAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this notification",
        });
      }

      await db
        .update(inAppAlerts)
        .set({ status: "read", updatedAt: new Date() })
        .where(eq(inAppAlerts.id, input.id));

      return { success: true };
    }),

  markAllRead: protectedProcedure
    .input(z.object({ fleetId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const hasAccess = await verifyFleetAccess(input.fleetId, ctx.user.id, ctx.user.role);
      if (!hasAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this fleet",
        });
      }

      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      await db
        .update(inAppAlerts)
        .set({ status: "read", updatedAt: new Date() })
        .where(and(eq(inAppAlerts.fleetId, input.fleetId), eq(inAppAlerts.status, "open")));

      return { success: true };
    }),
});
