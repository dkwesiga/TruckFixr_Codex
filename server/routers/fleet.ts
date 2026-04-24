import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { companyMemberships, fleets, vehicles, inspections, defects } from "../../drizzle/schema";
import {
  ensureCompanyMembership,
  ensureFleetInviteCode,
  getCompanyMembership,
} from "../services/companyAccess";

async function verifyFleetAccess(fleetId: number, userId: number, userRole: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const membership = await getCompanyMembership({ userId, fleetId });
  if (membership?.status === "active") {
    if (userRole === "owner" || userRole === "manager") {
      return membership.role === "owner" || membership.role === "manager";
    }
    return true;
  }

  const [fleet] = await db.select().from(fleets).where(eq(fleets.id, fleetId)).limit(1);
  if (!fleet) return false;
  return fleet.ownerId === userId;
}

async function verifyDriverFleetAccess(fleetId: number, driverId: number): Promise<boolean> {
  const membership = await getCompanyMembership({ userId: driverId, fleetId });
  return membership?.status === "active" && membership.role === "driver";
}

export const fleetRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1, "Fleet name is required"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "owner" && ctx.user.role !== "manager") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only owners and managers can create fleets",
        });
      }

      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      const [fleet] = await db
        .insert(fleets)
        .values({
          name: input.name,
          ownerId: ctx.user.id,
          subscriptionOwnerUserId: ctx.user.id,
          planId: 1,
        })
        .returning();

      await ensureCompanyMembership({
        fleetId: fleet.id,
        userId: ctx.user.id,
        role: "owner",
        approvedByUserId: ctx.user.id,
      });
      const inviteCode = await ensureFleetInviteCode(fleet.id);

      console.log('[Analytics] Fleet created:', { fleetId: fleet.id, fleetName: fleet.name, userId: ctx.user.id });
      
      return {
        ...fleet,
        inviteCode,
      };
    }),

  getById: protectedProcedure
    .input(z.object({ fleetId: z.number() }))
    .query(async ({ input, ctx }) => {
      const hasAccess = await verifyFleetAccess(input.fleetId, ctx.user.id, ctx.user.role);
      if (!hasAccess) {
        const driverAccess = await verifyDriverFleetAccess(input.fleetId, ctx.user.id);
        if (!driverAccess) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You do not have access to this fleet",
          });
        }
      }

      const db = await getDb();
      if (!db) return null;

      const [fleet] = await db
        .select()
        .from(fleets)
        .where(eq(fleets.id, input.fleetId))
        .limit(1);

      return fleet ?? null;
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    if (ctx.user.role === "owner" || ctx.user.role === "manager") {
      const memberships = await db
        .select({ fleetId: companyMemberships.fleetId })
        .from(companyMemberships)
        .where(eq(companyMemberships.userId, ctx.user.id));

      const membershipFleetIds = memberships.map((row) => row.fleetId);
      const ownedFleets = await db.select().from(fleets).where(eq(fleets.ownerId, ctx.user.id));
      const ownedFleetIds = ownedFleets.map((fleet) => fleet.id);
      const fleetIds = Array.from(new Set([...membershipFleetIds, ...ownedFleetIds]));

      if (fleetIds.length === 0) return [];
      return await db
        .select()
        .from(fleets)
        .where(fleetIds.length === 1 ? eq(fleets.id, fleetIds[0]) : inArray(fleets.id, fleetIds));
    }

    const assignedVehicles = await db
      .select({ fleetId: vehicles.fleetId })
      .from(vehicles)
      .where(eq(vehicles.assignedDriverId, ctx.user.id));

    const membershipFleetIds = (
      await db
        .select({ fleetId: companyMemberships.fleetId })
        .from(companyMemberships)
        .where(eq(companyMemberships.userId, ctx.user.id))
    ).map((row) => row.fleetId);

    const fleetIds = Array.from(new Set([...assignedVehicles.map((v) => v.fleetId), ...membershipFleetIds]));

    if (fleetIds.length === 0) return [];

    return await db
      .select()
      .from(fleets)
      .where(fleetIds.length === 1 ? eq(fleets.id, fleetIds[0]) : inArray(fleets.id, fleetIds));
  }),

  getHealthSummary: protectedProcedure
    .input(z.object({ fleetId: z.number() }))
    .query(async ({ input, ctx }) => {
      const hasAccess = await verifyFleetAccess(input.fleetId, ctx.user.id, ctx.user.role);
      if (!hasAccess) {
        const driverAccess = await verifyDriverFleetAccess(input.fleetId, ctx.user.id);
        if (!driverAccess) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You do not have access to this fleet",
          });
        }
      }

      const db = await getDb();
      if (!db) {
        return {
          fleetId: input.fleetId,
          activeTrucks: 0,
          trucksInService: 0,
          trucksInMaintenance: 0,
          criticalDefects: 0,
          openDefects: 0,
          pendingInspections: 0,
          maintenanceAlerts: 0,
          averageFleetHealth: 100,
          lastUpdated: new Date(),
        };
      }

      const allVehicles = await db
        .select()
        .from(vehicles)
        .where(eq(vehicles.fleetId, input.fleetId));

      const activeTrucks = allVehicles.filter(v => v.status === "active").length;
      const trucksInService = allVehicles.filter(v => v.status === "active" && v.complianceStatus === "green").length;
      const trucksInMaintenance = allVehicles.filter(v => v.status === "maintenance").length;

      const allDefects = await db
        .select()
        .from(defects)
        .where(eq(defects.fleetId, input.fleetId));

      const criticalDefects = allDefects.filter(d => d.severity === "critical" && d.status !== "resolved").length;
      const openDefects = allDefects.filter(d => d.status !== "resolved").length;

      const recentInspections = await db
        .select()
        .from(inspections)
        .where(eq(inspections.fleetId, input.fleetId));

      const now = new Date();
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const pendingInspections = recentInspections.filter(i => 
        i.status === "in_progress" || 
        (i.submittedAt && i.submittedAt > twentyFourHoursAgo)
      ).length;

      const healthScores = allVehicles.map(v => 
        v.complianceStatus === "green" ? 100 : 
        v.complianceStatus === "yellow" ? 70 : 40
      );
      const averageFleetHealth = healthScores.length > 0
        ? Math.round(healthScores.reduce((a, b) => a + b, 0) / healthScores.length)
        : 100;

      return {
        fleetId: input.fleetId,
        activeTrucks,
        trucksInService,
        trucksInMaintenance,
        criticalDefects,
        openDefects,
        pendingInspections,
        maintenanceAlerts: trucksInMaintenance,
        averageFleetHealth,
        lastUpdated: new Date(),
      };
    }),

  getDefectsBySeverity: protectedProcedure
    .input(z.object({ fleetId: z.number() }))
    .query(async ({ input, ctx }) => {
      const hasAccess = await verifyFleetAccess(input.fleetId, ctx.user.id, ctx.user.role);
      if (!hasAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this fleet",
        });
      }

      const db = await getDb();
      if (!db) {
        return { critical: 0, high: 0, medium: 0, low: 0 };
      }

      const fleetDefects = await db
        .select()
        .from(defects)
        .where(eq(defects.fleetId, input.fleetId));

      return {
        critical: fleetDefects.filter(d => d.severity === "critical" && d.status !== "resolved").length,
        high: fleetDefects.filter(d => d.severity === "high" && d.status !== "resolved").length,
        medium: fleetDefects.filter(d => d.severity === "medium" && d.status !== "resolved").length,
        low: fleetDefects.filter(d => d.severity === "low" && d.status !== "resolved").length,
      };
    }),

  update: protectedProcedure
    .input(
      z.object({
        fleetId: z.number(),
        name: z.string().optional(),
        planId: z.number().optional(),
        premiumTadis: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "owner" && ctx.user.role !== "manager") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only owners and managers can update fleets",
        });
      }

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

      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (input.name) updateData.name = input.name;
      if (input.planId) updateData.planId = input.planId;
      if (input.premiumTadis !== undefined) updateData.premiumTadis = input.premiumTadis;

      const [updated] = await db
        .update(fleets)
        .set(updateData)
        .where(eq(fleets.id, input.fleetId))
        .returning();

      console.log('[Analytics] Fleet updated:', { fleetId: input.fleetId, userId: ctx.user.id });
      
      return updated;
    }),
});
