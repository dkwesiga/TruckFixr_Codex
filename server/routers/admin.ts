import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { staffProcedure, router } from "../_core/trpc";
import {
  addAdminFleetNote,
  assertAdminCanExport,
  assertAdminCanWrite,
  getAdminFleetDetail,
  getAdminFleetExport,
  getAdminMetrics,
  getInternalAdminRole,
  updateAdminFleetAccountType,
  updateAdminFleetFollowUp,
} from "../services/adminMetrics";

const accountTypeSchema = z.enum(["production", "demo", "internal_test", "archived"]);
const riskStatusSchema = z.enum([
  "healthy",
  "needs_onboarding",
  "inactive",
  "billing_risk",
  "compliance_risk",
  "diagnostic_follow_up_risk",
  "high_priority",
]);
const followUpStatusSchema = z.enum([
  "healthy",
  "needs_onboarding",
  "follow_up_needed",
  "at_risk",
  "converted",
  "churned",
]);

const filtersSchema = z.object({
  timeframe: z
    .enum(["today", "yesterday", "last_7_days", "last_30_days", "last_90_days", "mtd", "qtd", "ytd", "all_time", "custom"])
    .default("last_30_days"),
  from: z.string().optional(),
  to: z.string().optional(),
  accountType: z.union([accountTypeSchema, z.literal("all")]).default("production"),
  plan: z.string().optional(),
  billingStatus: z.string().optional(),
  riskStatus: z.union([riskStatusSchema, z.literal("all")]).optional(),
  followUpStatus: z.union([followUpStatusSchema, z.literal("all")]).optional(),
  search: z.string().optional(),
});

function requireInternalRole(ctxUser: any) {
  const role = getInternalAdminRole(ctxUser);
  if (!role) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This action is limited to TruckFixr internal administrators.",
    });
  }
  return role;
}

export const adminRouter = router({
  me: staffProcedure.query(({ ctx }) => {
    const role = requireInternalRole(ctx.user);
    return {
      role,
      canWrite: assertAdminCanWrite(role),
      canExport: assertAdminCanExport(role),
    };
  }),

  metrics: staffProcedure
    .input(filtersSchema)
    .query(async ({ input, ctx }) => {
      const role = requireInternalRole(ctx.user);
      return {
        admin: {
          role,
          canWrite: assertAdminCanWrite(role),
          canExport: assertAdminCanExport(role),
        },
        ...(await getAdminMetrics(input)),
      };
    }),

  fleets: staffProcedure
    .input(filtersSchema)
    .query(async ({ input, ctx }) => {
      requireInternalRole(ctx.user);
      const metrics = await getAdminMetrics(input);
      return metrics.tables.fleetRows;
    }),

  fleetDetail: staffProcedure
    .input(z.object({ fleetId: z.number().int().positive(), filters: filtersSchema.optional() }))
    .query(async ({ input, ctx }) => {
      requireInternalRole(ctx.user);
      const detail = await getAdminFleetDetail(input.fleetId, input.filters ?? {});
      if (!detail) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Fleet not found" });
      }
      return detail;
    }),

  addFleetNote: staffProcedure
    .input(
      z.object({
        fleetId: z.number().int().positive(),
        note: z.string().trim().min(1).max(5000),
        noteType: z.string().trim().max(64).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const role = requireInternalRole(ctx.user);
      if (!assertAdminCanWrite(role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Read-only viewers cannot add notes." });
      }
      return addAdminFleetNote({
        fleetId: input.fleetId,
        createdByUserId: ctx.user.id,
        note: input.note,
        noteType: input.noteType,
      });
    }),

  updateFollowUp: staffProcedure
    .input(
      z.object({
        fleetId: z.number().int().positive(),
        followUpStatus: followUpStatusSchema.optional(),
        riskStatus: riskStatusSchema.optional(),
        riskReason: z.string().trim().max(1000).nullable().optional(),
        nextFollowUpAt: z.string().nullable().optional(),
        adminOwnerId: z.number().int().positive().nullable().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const role = requireInternalRole(ctx.user);
      if (!assertAdminCanWrite(role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Read-only viewers cannot update follow-up status." });
      }
      return updateAdminFleetFollowUp({
        fleetId: input.fleetId,
        followUpStatus: input.followUpStatus,
        riskStatus: input.riskStatus,
        riskReason: input.riskReason,
        nextFollowUpAt:
          input.nextFollowUpAt === undefined
            ? undefined
            : input.nextFollowUpAt
              ? new Date(input.nextFollowUpAt)
              : null,
        adminOwnerId: input.adminOwnerId,
      });
    }),

  updateAccountType: staffProcedure
    .input(z.object({ fleetId: z.number().int().positive(), accountType: accountTypeSchema }))
    .mutation(async ({ input, ctx }) => {
      const role = requireInternalRole(ctx.user);
      if (role !== "super_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only Super Admin can change account type." });
      }
      return updateAdminFleetAccountType(input.fleetId, input.accountType);
    }),

  exportCsv: staffProcedure
    .input(z.object({ variant: z.enum(["fleets", "at_risk", "investor"]), filters: filtersSchema }))
    .query(async ({ input, ctx }) => {
      const role = requireInternalRole(ctx.user);
      if (!assertAdminCanExport(role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only Super Admin can export admin metrics." });
      }
      return {
        fileName: `truckfixr-${input.variant}-${new Date().toISOString().slice(0, 10)}.csv`,
        contentType: "text/csv",
        csv: await getAdminFleetExport(input.filters, input.variant),
      };
    }),
});
