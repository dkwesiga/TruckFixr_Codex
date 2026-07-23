import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, staffProcedure } from "../_core/trpc";
import {
  REVIEW_STATUSES,
  claimReview,
  completeReview,
  escalateToTechnician,
  listReviewQueue,
} from "../services/caseReviewQueue";
import { getOneCaseFunnel } from "../services/oneCaseFunnel";
import { listWeeklyQa } from "../services/weeklyQa";

// read_only_viewer staff may view the queue but not act on it.
function assertCanWrite(ctx: { user?: { internalAdminRole?: string | null } }): void {
  if (ctx.user?.internalAdminRole === "read_only_viewer") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Read-only reviewers cannot modify the review queue.",
    });
  }
}

const statusSchema = z.enum(REVIEW_STATUSES as unknown as [string, ...string[]]);

export const caseReviewRouter = router({
  list: staffProcedure
    .input(z.object({ status: statusSchema.optional() }).optional())
    .query(({ input }) => listReviewQueue({ status: input?.status as never })),

  claim: staffProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input, ctx }) => {
      assertCanWrite(ctx);
      return claimReview({ id: input.id, reviewerUserId: ctx.user.id });
    }),

  complete: staffProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        outcome: z.string().trim().min(1).max(60),
        reviewerNotes: z.string().trim().max(4000).optional(),
      })
    )
    .mutation(({ input, ctx }) => {
      assertCanWrite(ctx);
      return completeReview({ ...input, reviewerUserId: ctx.user.id });
    }),

  escalate: staffProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        backupReviewerUserId: z.number().int().positive().optional(),
        reason: z.string().trim().min(1).max(255),
      })
    )
    .mutation(({ input, ctx }) => {
      assertCanWrite(ctx);
      return escalateToTechnician(input);
    }),

  funnel: staffProcedure
    .input(z.object({ sinceDays: z.number().int().positive().max(365).optional() }).optional())
    .query(({ input }) => getOneCaseFunnel({ sinceDays: input?.sinceDays })),

  weeklyQa: staffProcedure.query(() => listWeeklyQa()),
});
