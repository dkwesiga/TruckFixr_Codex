import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, publicProcedure, router, staffProcedure } from "../_core/trpc";
import { enforceIpRateLimit } from "../_core/rateLimit";
import { getSubscriptionState } from "../services/subscriptions";
import { canManageCompanyBilling } from "../services/companyAccess";
import {
  acceptAgreement,
  activatePilot,
  applyForPilot,
  beginCheckout,
  completePilot,
  markPilotPaid,
  recordConversionCredit,
  recordKickoff,
} from "../services/pilotApplications";

// Account-first pilot funnel:
//   apply (public) -> [account + agreement] -> beginCheckout -> Stripe pilot
//   checkout (existing subscriptions.createPilotCheckoutSession) -> webhook
//   marks paid -> kickoff -> activate. Payment alone never activates.
//
// NOTE: markPaid is exposed as a staff step until the Stripe webhook is wired to
// call markPilotPaid on checkout.session.completed for a pilot (needs the
// confirmed one-time CAD $99 price id + pilotApplicationId in session metadata).

export const pilotApplicationsRouter = router({
  submit: publicProcedure
    .input(
      z.object({
        fleetName: z.string().trim().min(2).max(200),
        vehicleCount: z.number().int().nonnegative().max(100000).optional(),
        vehicleTypes: z.array(z.string().trim().max(60)).max(20).optional(),
        approxAge: z.string().trim().max(40).optional(),
        coordinatorName: z.string().trim().max(200).optional(),
        outsourced: z.boolean().optional(),
        hasMaintenanceManager: z.boolean().optional(),
        expectedCases30d: z.number().int().nonnegative().max(100000).optional(),
        primaryContact: z
          .object({
            name: z.string().trim().max(200).optional(),
            email: z.string().trim().email().max(255).optional(),
            phone: z.string().trim().max(40).optional(),
          })
          .optional(),
        guestCaseId: z.number().int().positive().optional(),
        trapField: z.string().trim().max(255).optional().nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (input.trapField?.trim()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Could not submit. Please try again." });
      }
      enforceIpRateLimit({
        req: (ctx as { req: any }).req,
        bucket: "pilot_apply",
        limit: 5,
        windowMs: 10 * 60 * 1000,
        message: "Too many requests. Please wait a few minutes and try again.",
      });
      const { trapField: _t, ...rest } = input;
      return applyForPilot(rest as Parameters<typeof applyForPilot>[0]);
    }),

  // Authenticated owner accepts the pilot agreement. The fleet is derived from the
  // signed-in owner's active fleet (not client-supplied), and billing authority is
  // enforced, so an application can only ever be attached to a fleet the caller owns.
  acceptAgreement: adminProcedure
    .input(
      z.object({
        applicationId: z.number().int().positive(),
        agreementVersion: z.string().trim().min(1).max(64),
        snapshot: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { activeFleetId } = await getSubscriptionState(ctx.user.id);
      if (!activeFleetId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Set up your fleet before accepting the pilot agreement.",
        });
      }
      const canManage = await canManageCompanyBilling({ fleetId: activeFleetId, user: ctx.user });
      if (!canManage) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the company owner can accept the pilot agreement and pay.",
        });
      }
      return acceptAgreement({
        applicationId: input.applicationId,
        agreementVersion: input.agreementVersion,
        acceptedByUserId: ctx.user.id,
        fleetId: activeFleetId,
        snapshot: input.snapshot ?? null,
      });
    }),

  beginCheckout: adminProcedure
    .input(z.object({ applicationId: z.number().int().positive() }))
    .mutation(({ input }) => beginCheckout(input)),

  recordKickoff: adminProcedure
    .input(
      z.object({
        applicationId: z.number().int().positive(),
        vehicleIds: z.array(z.string().trim().min(1).max(60)).min(1).max(5),
        baseline: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(({ input }) => recordKickoff({ applicationId: input.applicationId, vehicleIds: input.vehicleIds, baseline: input.baseline ?? null })),

  activate: adminProcedure
    .input(z.object({ applicationId: z.number().int().positive() }))
    .mutation(({ input }) => activatePilot(input)),

  complete: adminProcedure
    .input(z.object({ applicationId: z.number().int().positive() }))
    .mutation(({ input }) => completePilot(input)),

  recordConversionCredit: adminProcedure
    .input(z.object({ applicationId: z.number().int().positive() }))
    .mutation(({ input }) => recordConversionCredit(input)),

  // Manual "mark paid" until the Stripe webhook is wired (see NOTE above).
  markPaid: staffProcedure
    .input(z.object({ applicationId: z.number().int().positive(), paymentRef: z.string().trim().min(1).max(128) }))
    .mutation(({ input }) => markPilotPaid(input)),
});
