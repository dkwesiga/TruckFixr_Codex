import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

export const fleetRouter = router({
  /**
   * Create a new fleet (owner/manager only)
   */
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

      // TODO: Create fleet in database
      // For now, return mock data
      const fleet = {
        id: 1,
        name: input.name,
        ownerId: ctx.user.id,
        planId: 1,
        premiumTadis: false,
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      // Track fleet creation event
      console.log('[Analytics] Fleet created:', { fleetId: fleet.id, fleetName: fleet.name, userId: ctx.user.id });
      
      return fleet;
    }),

  /**
   * Get fleet by ID
   */
  getById: protectedProcedure
    .input(z.object({ fleetId: z.number() }))
    .query(async ({ input, ctx }) => {
      // TODO: Verify user has access to this fleet
      // TODO: Fetch fleet from database
      return null;
    }),

  /**
   * List all fleets for current user
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    // TODO: Fetch fleets from database filtered by user
    return [];
  }),

  /**
   * Get fleet health summary (Morning Fleet Summary)
   * Returns: active trucks, critical defects, pending inspections, maintenance alerts
   */
  getHealthSummary: protectedProcedure
    .input(z.object({ fleetId: z.number() }))
    .query(async ({ input, ctx }) => {
      // TODO: Fetch from database
      // For now, return realistic mock data
      return {
        fleetId: input.fleetId,
        activeTrucks: 12,
        trucksInService: 10,
        trucksInMaintenance: 2,
        criticalDefects: 3,
        openDefects: 8,
        pendingInspections: 5,
        maintenanceAlerts: 2,
        averageFleetHealth: 78,
        lastUpdated: new Date(),
      };
    }),

  /**
   * Get defects by severity for the fleet
   */
  getDefectsBySeverity: protectedProcedure
    .input(z.object({ fleetId: z.number() }))
    .query(async ({ input, ctx }) => {
      // TODO: Fetch from database
      return {
        critical: 3,
        high: 5,
        medium: 12,
        low: 8,
      };
    }),

  /**
   * Update fleet details
   */
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

      // TODO: Update fleet in database
      return null;
    }),
});
