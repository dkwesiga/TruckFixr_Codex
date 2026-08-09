import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router, staffProcedure } from "../_core/trpc";
import { enforceIpRateLimit } from "../_core/rateLimit";
import { ENV } from "../_core/env";
import { TECHNICIAN_REVIEW_STATES } from "../../shared/maintenance/technicianReviewState";
import {
  beginTechnicianReviewCheckout,
  claimTechnicianReview,
  completeTechnicianReview,
  createReviewForGuestCase,
  deliverTechnicianReview,
  getTechnicianReview,
  listTechnicianReviewQueue,
  markReviewReady,
  notifySlaAtRisk,
  proposeEvidenceCall,
  recordSlaRemedyChoice,
  refundTechnicianReview,
  requestMissingEvidence,
} from "../services/technicianReviews";

// read_only_viewer staff may view the queue but not act on it.
function assertCanWrite(ctx: { user?: { internalAdminRole?: string | null } }): void {
  if (ctx.user?.internalAdminRole === "read_only_viewer") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Read-only reviewers cannot modify the review queue.",
    });
  }
}

const statusSchema = z.enum(TECHNICIAN_REVIEW_STATES as unknown as [string, ...string[]]);

function getAbsoluteUrl(path: string) {
  const base = ENV.appBaseUrl.replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

const guestRateLimit = (ctx: { req: unknown }, bucket: string, limit: number) =>
  enforceIpRateLimit({
    req: (ctx as { req: any }).req,
    bucket,
    limit,
    windowMs: 10 * 60 * 1000,
    message: "Too many requests. Please wait a few minutes and try again.",
  });

export const technicianReviewsRouter = router({
  // Guest-facing: start a paid review for a case and go to Stripe Checkout.
  startCheckout: publicProcedure
    .input(
      z.object({
        publicToken: z.string().trim().min(10).max(128),
        successPath: z.string().default("/try-one-case?review=success"),
        cancelPath: z.string().default("/try-one-case?review=cancelled"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      guestRateLimit(ctx, "technician_review_checkout", 10);
      const review = await createReviewForGuestCase(input.publicToken);
      return beginTechnicianReviewCheckout({
        technicianReviewId: review.id,
        successUrl: getAbsoluteUrl(input.successPath),
        cancelUrl: getAbsoluteUrl(input.cancelPath),
      });
    }),

  // Staff queue.
  list: staffProcedure
    .input(z.object({ statuses: z.array(statusSchema).optional() }).optional())
    .query(({ input }) => listTechnicianReviewQueue(input?.statuses as never)),

  get: staffProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(({ input }) => getTechnicianReview(input.id)),

  requestMissingEvidence: staffProcedure
    .input(z.object({ id: z.number().int().positive(), notes: z.string().trim().min(1).max(2000) }))
    .mutation(({ input, ctx }) => {
      assertCanWrite(ctx);
      return requestMissingEvidence({ technicianReviewId: input.id, notes: input.notes });
    }),

  proposeCall: staffProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input, ctx }) => {
      assertCanWrite(ctx);
      return proposeEvidenceCall({ technicianReviewId: input.id });
    }),

  markReviewReady: staffProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input, ctx }) => {
      assertCanWrite(ctx);
      return markReviewReady({ technicianReviewId: input.id });
    }),

  claim: staffProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input, ctx }) => {
      assertCanWrite(ctx);
      return claimTechnicianReview({ technicianReviewId: input.id, reviewerUserId: ctx.user.id });
    }),

  complete: staffProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        findings: z.object({
          technicianRisk: z.string().trim().max(255).optional(),
          likelyCauses: z.array(z.unknown()).optional(),
          testsRecommended: z.array(z.unknown()).optional(),
          repairsRecommended: z.array(z.unknown()).optional(),
          partsRequirements: z.array(z.unknown()).optional(),
        }),
        aiOverrides: z
          .array(
            z.object({
              field: z.string(),
              original: z.unknown(),
              revised: z.unknown(),
              reason: z.string().trim().min(1),
            })
          )
          .optional(),
        limitationsText: z.string().trim().min(1).max(4000),
        customerMessage: z.string().trim().max(4000).optional(),
      })
    )
    .mutation(({ input, ctx }) => {
      assertCanWrite(ctx);
      return completeTechnicianReview({
        technicianReviewId: input.id,
        findings: input.findings,
        aiOverrides: input.aiOverrides,
        limitationsText: input.limitationsText,
        customerMessage: input.customerMessage,
      });
    }),

  deliver: staffProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input, ctx }) => {
      assertCanWrite(ctx);
      return deliverTechnicianReview({ technicianReviewId: input.id });
    }),

  notifySlaAtRisk: staffProcedure
    .input(z.object({ id: z.number().int().positive(), revisedDueAt: z.date().optional() }))
    .mutation(({ input, ctx }) => {
      assertCanWrite(ctx);
      return notifySlaAtRisk({ technicianReviewId: input.id, revisedDueAt: input.revisedDueAt });
    }),

  recordSlaRemedyChoice: staffProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        choice: z.enum(["refund", "revised_time"]),
      })
    )
    .mutation(({ input, ctx }) => {
      assertCanWrite(ctx);
      return recordSlaRemedyChoice({ technicianReviewId: input.id, choice: input.choice });
    }),

  refund: staffProcedure
    .input(z.object({ id: z.number().int().positive(), reason: z.string().trim().min(1).max(255) }))
    .mutation(({ input, ctx }) => {
      assertCanWrite(ctx);
      return refundTechnicianReview({ technicianReviewId: input.id, reason: input.reason });
    }),
});
