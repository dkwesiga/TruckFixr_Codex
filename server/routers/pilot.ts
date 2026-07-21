import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  adminProcedure,
  protectedProcedure,
  router,
  staffProcedure,
} from "../_core/trpc";
import { FLEET_MAINTENANCE_CAPABILITY_FLAGS as CAP } from "@shared/maintenance/featureKeys";
import { requireFleetFeature } from "../services/fleetFeatures";
import { resolveActiveFleetId } from "../services/maintenanceTenantScope";
import {
  computePilotReadiness,
  getConsent,
  getPilotSettings,
  setConsent,
  upsertPilotSettings,
} from "../services/pilotSettings";
import { buildCaseExportCsv, getPilotMetrics } from "../services/pilotMetricsService";

function assertInternalCanWrite(user: { internalAdminRole?: string | null }) {
  if (user.internalAdminRole === "read_only_viewer") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Read-only internal administrators cannot modify pilot configuration." });
  }
}

export const pilotRouter = router({
  // Owners/managers get read-only visibility of settings.
  getSettings: protectedProcedure
    .input(z.object({ fleetId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const fleetId = await resolveActiveFleetId({ user: ctx.user, requestedFleetId: input?.fleetId ?? null });
      await requireFleetFeature(fleetId, CAP.pilotMetrics, { requireUmbrella: true }).catch(() => {});
      const [settings, consent] = await Promise.all([getPilotSettings(fleetId), getConsent(fleetId)]);
      return { fleetId, settings, consent };
    }),

  // Internal admins configure pilot settings.
  upsertSettings: staffProcedure
    .input(
      z.object({
        fleetId: z.number(),
        status: z.enum(["not_started", "active", "completed", "extended", "cancelled"]).optional(),
        startDate: z.string().nullable().optional(),
        endDate: z.string().nullable().optional(),
        primaryManagerUserId: z.number().nullable().optional(),
        backupManagerUserId: z.number().nullable().optional(),
        enrolledVehicleIds: z.array(z.string()).optional(),
        notificationRecipients: z.array(z.number()).optional(),
        authorizationPolicy: z
          .object({
            fleetLimitCents: z.number().nullable().optional(),
            managerLimitCents: z.number().nullable().optional(),
            delegationEnabled: z.boolean().optional(),
            delegatedLimitCents: z.number().nullable().optional(),
            currency: z.string().optional(),
          })
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertInternalCanWrite(ctx.user);
      return upsertPilotSettings({
        fleetId: input.fleetId,
        actorUserId: ctx.user.id,
        patch: {
          status: input.status,
          startDate: input.startDate === undefined ? undefined : input.startDate ? new Date(input.startDate) : null,
          endDate: input.endDate === undefined ? undefined : input.endDate ? new Date(input.endDate) : null,
          primaryManagerUserId: input.primaryManagerUserId,
          backupManagerUserId: input.backupManagerUserId,
          enrolledVehicleIds: input.enrolledVehicleIds,
          notificationRecipients: input.notificationRecipients,
          authorizationPolicy: input.authorizationPolicy,
        },
      });
    }),

  // Owner grants/withdraws fleet consent (managers view only, per §37).
  setConsent: adminProcedure
    .input(z.object({ fleetId: z.number().optional(), action: z.enum(["grant", "withdraw"]), purpose: z.string().max(255).optional(), expiresAt: z.string().nullable().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "owner") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only a fleet owner can change AI consent." });
      }
      const fleetId = await resolveActiveFleetId({ user: ctx.user, requestedFleetId: input.fleetId ?? null });
      return setConsent({
        fleetId,
        actorUserId: ctx.user.id,
        action: input.action,
        source: "fleet_owner",
        purpose: input.purpose,
        expiresAt: input.expiresAt === undefined ? undefined : input.expiresAt ? new Date(input.expiresAt) : null,
      });
    }),

  // Internal admin records documented consent with evidence (never impersonates).
  recordConsent: staffProcedure
    .input(
      z.object({
        fleetId: z.number(),
        action: z.enum(["grant", "withdraw"]),
        provider: z.string().max(64).optional(),
        model: z.string().max(150).optional(),
        regionDisclosure: z.string().max(255).optional(),
        disclosureVersion: z.string().max(32).optional(),
        evidence: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertInternalCanWrite(ctx.user);
      return setConsent({
        fleetId: input.fleetId,
        actorUserId: ctx.user.id,
        action: input.action,
        source: "internal_admin",
        provider: input.provider,
        model: input.model,
        regionDisclosure: input.regionDisclosure,
        disclosureVersion: input.disclosureVersion,
        evidence: input.evidence ?? null,
      });
    }),

  readiness: protectedProcedure
    .input(z.object({ fleetId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const fleetId = await resolveActiveFleetId({ user: ctx.user, requestedFleetId: input?.fleetId ?? null });
      return computePilotReadiness(fleetId);
    }),

  metrics: protectedProcedure
    .input(z.object({ fleetId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const fleetId = await resolveActiveFleetId({ user: ctx.user, requestedFleetId: input?.fleetId ?? null });
      await requireFleetFeature(fleetId, CAP.pilotMetrics);
      return getPilotMetrics(fleetId);
    }),

  // Tenant-scoped CSV export (owner/manager). Returns the CSV as a string.
  exportCases: adminProcedure
    .input(z.object({ fleetId: z.number().optional(), timezone: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const fleetId = await resolveActiveFleetId({ user: ctx.user, requestedFleetId: input.fleetId ?? null });
      await requireFleetFeature(fleetId, CAP.pilotMetrics);
      const settings = await getPilotSettings(fleetId);
      const csv = await buildCaseExportCsv({
        fleetId,
        actorUserId: ctx.user.id,
        timezone: input.timezone,
        pilotStart: settings?.startDate ? new Date(settings.startDate).toISOString().slice(0, 10) : null,
        pilotEnd: settings?.endDate ? new Date(settings.endDate).toISOString().slice(0, 10) : null,
      });
      return { csv, filename: `truckfixr-pilot-cases-${new Date().toISOString().slice(0, 10)}.csv` };
    }),
});
