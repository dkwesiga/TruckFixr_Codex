import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../_core/trpc";
import { enforceIpRateLimit } from "../_core/rateLimit";
import { ENV } from "../_core/env";
import {
  CONCERN_CATEGORIES,
  OPERATING_STATUSES,
} from "../../shared/maintenance/guestCaseFlow";
import { isInviteValid, parseInviteCodes } from "../../shared/guestInvite";
import {
  answerGuestQuestion,
  getGuestCase,
  startGuestCase,
  submitGuestContact,
} from "../services/guestCaseService";

// Guests have no fleet, so this is a GLOBAL fail-closed gate (not a per-fleet
// fleetFeatures flag). When disabled the public surface behaves as not-found.
function assertGuestWorkflowEnabled(): void {
  if (!ENV.enableGuestWorkflow) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Not available." });
  }
}

// Invite gate for the current rollout phase (fail-closed). A new case can only be
// started with a valid invite code; with none configured, all are denied. When
// GUEST_INVITE_REQUIRED is false (public mode), the gate is skipped.
function assertValidInvite(inviteCode: string | undefined | null): void {
  if (!ENV.guestInviteRequired) return; // public mode — no invite needed
  const configured = parseInviteCodes(ENV.guestInviteCodes);
  if (!isInviteValid(inviteCode, configured)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This is an invite-only preview. A valid invite code is required.",
    });
  }
}

const operatingStatusSchema = z.enum(
  OPERATING_STATUSES as unknown as [string, ...string[]]
);
const concernCategorySchema = z.enum(
  CONCERN_CATEGORIES as unknown as [string, ...string[]]
);

const guestRateLimit = (ctx: { req: unknown }, bucket: string, limit: number) =>
  enforceIpRateLimit({
    req: (ctx as { req: any }).req,
    bucket,
    limit,
    windowMs: 10 * 60 * 1000,
    message: "Too many requests. Please wait a few minutes and try again.",
  });

export const guestCasesRouter = router({
  start: publicProcedure
    .input(
      z.object({
        concernText: z.string().trim().min(3).max(4000),
        concernCategory: concernCategorySchema.optional(),
        operatingStatus: operatingStatusSchema,
        faultCodes: z.array(z.string().trim().max(40)).max(20).optional(),
        vehicleIdentifier: z
          .object({
            unitNumber: z.string().trim().max(60).optional().nullable(),
            vin: z.string().trim().max(20).optional().nullable(),
            year: z.string().trim().max(8).optional().nullable(),
            make: z.string().trim().max(60).optional().nullable(),
            model: z.string().trim().max(80).optional().nullable(),
          })
          .optional(),
        mileage: z.number().int().nonnegative().max(9_999_999).optional().nullable(),
        engine: z.string().trim().max(120).optional().nullable(),
        location: z.string().trim().max(255).optional().nullable(),
        intakeSource: z.string().trim().max(32).optional(),
        anonSessionId: z.string().trim().max(64).optional().nullable(),
        inviteCode: z.string().trim().max(64).optional().nullable(),
        // Honeypot — must stay empty.
        trapField: z.string().trim().max(255).optional().nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      assertGuestWorkflowEnabled();
      assertValidInvite(input.inviteCode);
      if (input.trapField?.trim()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Could not submit. Please try again." });
      }
      guestRateLimit(ctx, "guest_case_start", 8);
      const { trapField: _trap, inviteCode: _invite, ...rest } = input;
      return startGuestCase(rest as Parameters<typeof startGuestCase>[0]);
    }),

  answerQuestion: publicProcedure
    .input(
      z.object({
        publicToken: z.string().trim().min(10).max(128),
        questionId: z.string().trim().min(1).max(64),
        answer: z.string().trim().min(1).max(255),
      })
    )
    .mutation(async ({ input, ctx }) => {
      assertGuestWorkflowEnabled();
      guestRateLimit(ctx, "guest_case_answer", 30);
      return answerGuestQuestion(input);
    }),

  submitContact: publicProcedure
    .input(
      z
        .object({
          publicToken: z.string().trim().min(10).max(128),
          email: z.string().trim().email().max(255).optional().nullable(),
          phone: z.string().trim().max(40).optional().nullable(),
          role: z.string().trim().max(32).optional().nullable(),
          consentEmail: z.boolean().optional(),
          consentSms: z.boolean().optional(),
          consentWhatsapp: z.boolean().optional(),
          consentMarketing: z.boolean().optional(),
          authorityConfirmed: z.boolean().optional(),
          trapField: z.string().trim().max(255).optional().nullable(),
        })
        .refine((v) => Boolean(v.email) || Boolean(v.phone), {
          message: "Provide either an email address or a mobile number.",
        })
    )
    .mutation(async ({ input, ctx }) => {
      assertGuestWorkflowEnabled();
      if (input.trapField?.trim()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Could not submit. Please try again." });
      }
      guestRateLimit(ctx, "guest_case_contact", 10);
      const { trapField: _trap, ...rest } = input;
      return submitGuestContact(rest);
    }),

  get: publicProcedure
    .input(z.object({ publicToken: z.string().trim().min(10).max(128) }))
    .query(async ({ input }) => {
      assertGuestWorkflowEnabled();
      return getGuestCase(input.publicToken);
    }),
});
