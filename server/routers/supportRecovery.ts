import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, staffProcedure } from "../_core/trpc";
import {
  getSupportRecoverySnapshot,
  deactivateUserFromFleet,
  moveUserToFleet,
  overrideFleetBillingStatus,
  reactivateUserInFleet,
  reassignVehicleFleet,
  resetPilotCode,
  setVehicleRecoveryStatus,
} from "../services/supportRecovery";

const reasonSchema = z.string().trim().min(12, "Describe why this support recovery action is needed.");

function toSupportError(error: unknown): TRPCError {
  if (error instanceof TRPCError) return error;
  const message = error instanceof Error ? error.message : "Support recovery action failed";
  const notFound = /not found/i.test(message);
  return new TRPCError({
    code: notFound ? "NOT_FOUND" : "BAD_REQUEST",
    message,
  });
}

export const supportRecoveryRouter = router({
  snapshot: staffProcedure
    .input(
      z.object({
        query: z.string().trim().optional(),
        fleetId: z.number().int().positive().optional(),
        userId: z.number().int().positive().optional(),
        vehicleId: z.string().trim().min(1).optional(),
      })
    )
    .query(async ({ input }) => getSupportRecoverySnapshot(input)),

  moveUserToFleet: staffProcedure
    .input(
      z.object({
        userId: z.number().int().positive(),
        toFleetId: z.number().int().positive(),
        fromFleetId: z.number().int().positive().optional(),
        role: z.enum(["owner", "manager", "driver"]),
        reason: reasonSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await moveUserToFleet({
          staffUserId: ctx.user.id,
          userId: input.userId,
          toFleetId: input.toFleetId,
          fromFleetId: input.fromFleetId,
          role: input.role,
          reason: input.reason,
        });
      } catch (error) {
        throw toSupportError(error);
      }
    }),

  reassignVehicleFleet: staffProcedure
    .input(
      z.object({
        vehicleId: z.string().trim().min(1),
        toFleetId: z.number().int().positive(),
        assignedDriverId: z.number().int().positive().nullable().optional(),
        reason: reasonSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await reassignVehicleFleet({
          staffUserId: ctx.user.id,
          vehicleId: input.vehicleId,
          toFleetId: input.toFleetId,
          assignedDriverId: input.assignedDriverId,
          reason: input.reason,
        });
      } catch (error) {
        throw toSupportError(error);
      }
    }),

  deactivateUserFromFleet: staffProcedure
    .input(
      z.object({
        userId: z.number().int().positive(),
        fleetId: z.number().int().positive(),
        reason: reasonSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await deactivateUserFromFleet({
          staffUserId: ctx.user.id,
          userId: input.userId,
          fleetId: input.fleetId,
          reason: input.reason,
        });
      } catch (error) {
        throw toSupportError(error);
      }
    }),

  reactivateUserInFleet: staffProcedure
    .input(
      z.object({
        userId: z.number().int().positive(),
        fleetId: z.number().int().positive(),
        role: z.enum(["owner", "manager", "driver"]),
        vehicleId: z.string().trim().min(1).nullable().optional(),
        reason: reasonSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await reactivateUserInFleet({
          staffUserId: ctx.user.id,
          userId: input.userId,
          fleetId: input.fleetId,
          role: input.role,
          vehicleId: input.vehicleId,
          reason: input.reason,
        });
      } catch (error) {
        throw toSupportError(error);
      }
    }),

  setVehicleRecoveryStatus: staffProcedure
    .input(
      z.object({
        vehicleId: z.string().trim().min(1),
        status: z.enum(["active", "maintenance", "retired"]),
        assetRecordStatus: z.enum(["active", "inactive", "archived"]),
        reason: reasonSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await setVehicleRecoveryStatus({
          staffUserId: ctx.user.id,
          vehicleId: input.vehicleId,
          status: input.status,
          assetRecordStatus: input.assetRecordStatus,
          reason: input.reason,
        });
      } catch (error) {
        throw toSupportError(error);
      }
    }),

  resetPilotCode: staffProcedure
    .input(
      z.object({
        codeId: z.number().int().positive(),
        reason: reasonSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await resetPilotCode({
          staffUserId: ctx.user.id,
          codeId: input.codeId,
          reason: input.reason,
        });
      } catch (error) {
        throw toSupportError(error);
      }
    }),

  overrideFleetBillingStatus: staffProcedure
    .input(
      z.object({
        fleetId: z.number().int().positive(),
        billingStatus: z.enum([
          "active",
          "trialing",
          "past_due",
          "canceled",
          "incomplete",
          "incomplete_expired",
          "unpaid",
          "expired",
          "custom",
        ]),
        reason: reasonSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await overrideFleetBillingStatus({
          staffUserId: ctx.user.id,
          fleetId: input.fleetId,
          billingStatus: input.billingStatus,
          reason: input.reason,
        });
      } catch (error) {
        throw toSupportError(error);
      }
    }),
});
