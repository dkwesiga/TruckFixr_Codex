import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import {
  acceptInvitationByToken,
  lookupInvitationByToken,
  lookupPilotCode,
  maskPilotCode,
} from "../services/access";

export const accessRouter = router({
  validatePilotCode: publicProcedure
    .input(
      z.object({
        code: z.string().trim().min(4),
      })
    )
    .query(async ({ input }) => {
      const record = await lookupPilotCode(input.code);
      if (!record) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That pilot code was not recognized.",
        });
      }

      return {
        valid: !record.isExpired && record.status === "active",
        status: record.status,
        codeId: record.id,
        maskedCode: maskPilotCode(record.code),
        companyName: record.fleetName,
        vehicleLimit: record.maxVehicles,
        driverLimit: record.maxUsers,
        aiDiagnosticLimit: null,
        validityDaysAfterRedemption: record.activationDurationDays,
        source: "existing_customer",
        planType: "pilot",
        isExpired: record.isExpired,
        isRedeemed: record.isRedeemed,
      };
    }),

  getDriverInvitation: publicProcedure
    .input(
      z.object({
        token: z.string().trim().min(10),
      })
    )
    .query(async ({ input }) => {
      const record = await lookupInvitationByToken(input.token);
      if (!record) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That invitation link was not recognized.",
        });
      }

      return {
        valid: record.status === "pending" && !record.isExpired,
        invitation: {
          id: record.id,
          companyName: record.name ?? null,
          email: record.email,
          role: record.role,
          invitedByUserId: record.invitedByUserId,
          status: record.status,
          expiresAt: record.expiresAt,
          assignedVehicleIds: Array.isArray(record.assignedVehicleIds)
            ? record.assignedVehicleIds
            : [],
        },
      };
    }),

  acceptDriverInvitation: protectedProcedure
    .input(
      z.object({
        token: z.string().trim().min(10),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const invitation = await acceptInvitationByToken({
        token: input.token,
        userId: ctx.user.id,
        email: ctx.user.email ?? null,
      });

      return {
        success: true,
        invitation: {
          id: invitation.id,
          companyName: invitation.name ?? null,
          email: invitation.email,
          role: invitation.role,
        },
      };
    }),
});
