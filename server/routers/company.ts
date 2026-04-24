import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  companyJoinRequests,
  companyMemberships,
  fleets,
  users,
  vehicles,
} from "../../drizzle/schema";
import {
  canInviteCompanyRole,
  canManageCompanyBilling,
  canManageCompanyOperations,
  createCompanyJoinRequest,
  createCompanyInvitationRecord,
  ensureCompanyMembership,
  ensureFleetInviteCode,
  getCompanyMembership,
  getUserPrimaryFleetId,
} from "../services/companyAccess";

export const companyRouter = router({
  getCurrent: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;

    const fleetId = await getUserPrimaryFleetId(ctx.user.id);
    const [company] = await db.select().from(fleets).where(eq(fleets.id, fleetId)).limit(1);
    if (!company) return null;

    const inviteCode = await ensureFleetInviteCode(company.id);
    const membership = await getCompanyMembership({ userId: ctx.user.id, fleetId: company.id });
    const activeAssetRows = await db
      .select({ id: vehicles.id })
      .from(vehicles)
      .where(and(eq(vehicles.fleetId, company.id), eq(vehicles.assetRecordStatus, "active")));

    return {
      company: {
        ...company,
        inviteCode,
      },
      membership,
      permissions: {
        canManageBilling: await canManageCompanyBilling({ fleetId: company.id, user: ctx.user }),
        canManageOperations: await canManageCompanyOperations({ fleetId: company.id, user: ctx.user }),
      },
      activeAssetCount: activeAssetRows.length,
    };
  }),

  updateProfile: protectedProcedure
    .input(
      z.object({
        fleetId: z.number().int().positive(),
        name: z.string().trim().min(2),
        companyEmail: z.string().trim().email().optional().nullable(),
        companyPhone: z.string().trim().max(50).optional().nullable(),
        address: z.string().trim().max(500).optional().nullable(),
        activeVehicleLimit: z.number().int().positive().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const canManage = await canManageCompanyBilling({
        fleetId: input.fleetId,
        user: ctx.user,
      });
      if (!canManage) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the company owner can update the company profile and subscription settings",
        });
      }

      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      const [updated] = await db
        .update(fleets)
        .set({
          name: input.name,
          companyEmail: input.companyEmail ?? null,
          companyPhone: input.companyPhone ?? null,
          address: input.address ?? null,
          activeVehicleLimit: input.activeVehicleLimit ?? null,
          subscriptionOwnerUserId: ctx.user.id,
          updatedAt: new Date(),
        })
        .where(eq(fleets.id, input.fleetId))
        .returning();

      return updated ?? null;
    }),

  inviteMember: protectedProcedure
    .input(
      z.object({
        fleetId: z.number().int().positive(),
        role: z.enum(["manager", "driver"]),
        name: z.string().trim().min(2),
        email: z.string().trim().email(),
        assignedVehicleIds: z.array(z.number().int().positive()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const allowed = await canInviteCompanyRole({
        fleetId: input.fleetId,
        user: ctx.user,
        inviteRole: input.role,
      });
      if (!allowed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            input.role === "manager"
              ? "Only the company owner can invite or promote fleet managers"
              : "You do not have permission to invite drivers for this company",
        });
      }

      const invitation = await createCompanyInvitationRecord({
        fleetId: input.fleetId,
        email: input.email,
        name: input.name,
        role: input.role,
        invitedByUserId: ctx.user.id,
        assignedVehicleIds: input.assignedVehicleIds,
      });

      return {
        invitation,
        message:
          input.role === "manager"
            ? "Manager invitation created. Only the company owner can grant this role."
            : "Driver invitation created for this company.",
      };
    }),

  listMembers: protectedProcedure
    .input(z.object({ fleetId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const allowed = await canManageCompanyOperations({
        fleetId: input.fleetId,
        user: ctx.user,
      });
      if (!allowed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to view company members",
        });
      }

      const db = await getDb();
      if (!db) return [];

      const memberships = await db
        .select()
        .from(companyMemberships)
        .where(eq(companyMemberships.fleetId, input.fleetId))
        .orderBy(desc(companyMemberships.updatedAt));

      const userIds = Array.from(new Set(memberships.map((row) => row.userId)));
      const memberRows =
        userIds.length > 0
          ? await db
              .select({ id: users.id, name: users.name, email: users.email, role: users.role })
              .from(users)
              .where(inArray(users.id, userIds))
          : [];
      const userMap = new Map(memberRows.map((row) => [row.id, row]));

      return memberships.map((membership) => ({
        ...membership,
        user: userMap.get(membership.userId) ?? null,
      }));
    }),

  requestJoinByCode: protectedProcedure
    .input(
      z.object({
        inviteCode: z.string().trim().min(4),
        note: z.string().trim().max(1000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      const [company] = await db
        .select({ id: fleets.id, inviteCode: fleets.inviteCode })
        .from(fleets)
        .where(eq(fleets.inviteCode, input.inviteCode.toUpperCase()))
        .limit(1);

      if (!company) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That company invite code was not recognized",
        });
      }

      await ensureCompanyMembership({
        fleetId: company.id,
        userId: ctx.user.id,
        role: "driver",
        status: "pending",
      });

      const request = await createCompanyJoinRequest({
        fleetId: company.id,
        userId: ctx.user.id,
        inviteCode: input.inviteCode.toUpperCase(),
        note: input.note,
      });

      return {
        success: true,
        request,
      };
    }),

  listJoinRequests: protectedProcedure
    .input(z.object({ fleetId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const allowed = await canManageCompanyOperations({
        fleetId: input.fleetId,
        user: ctx.user,
      });
      if (!allowed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to review company join requests",
        });
      }

      const db = await getDb();
      if (!db) return [];

      const requests = await db
        .select()
        .from(companyJoinRequests)
        .where(eq(companyJoinRequests.fleetId, input.fleetId))
        .orderBy(desc(companyJoinRequests.createdAt));

      const userIds = Array.from(new Set(requests.map((row) => row.userId)));
      const requestUsers =
        userIds.length > 0
          ? await db
              .select({ id: users.id, name: users.name, email: users.email })
              .from(users)
              .where(inArray(users.id, userIds))
          : [];
      const requestUserMap = new Map(requestUsers.map((row) => [row.id, row]));

      return requests.map((request) => ({
        ...request,
        user: requestUserMap.get(request.userId) ?? null,
      }));
    }),

  reviewJoinRequest: protectedProcedure
    .input(
      z.object({
        requestId: z.number().int().positive(),
        decision: z.enum(["approved", "denied"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      const [request] = await db
        .select()
        .from(companyJoinRequests)
        .where(eq(companyJoinRequests.id, input.requestId))
        .limit(1);

      if (!request) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Join request not found" });
      }

      const allowed = await canManageCompanyOperations({
        fleetId: request.fleetId,
        user: ctx.user,
      });
      if (!allowed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to review company join requests",
        });
      }

      const [updated] = await db
        .update(companyJoinRequests)
        .set({
          status: input.decision,
          reviewedByUserId: ctx.user.id,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(companyJoinRequests.id, input.requestId))
        .returning();

      await ensureCompanyMembership({
        fleetId: request.fleetId,
        userId: request.userId,
        role: "driver",
        approvedByUserId: ctx.user.id,
        status: input.decision === "approved" ? "active" : "inactive",
      });

      return updated ?? null;
    }),
});
