import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { quickStartGuideProgress } from "../../drizzle/schema";
import { getUserPrimaryFleetId } from "../services/companyAccess";

const quickStartSlugSchema = z.enum([
  "driver",
  "owner-operator",
  "fleet-manager",
  "fleet-owner",
]);

function scopeWhere(input: {
  userId: number;
  fleetId: number | null;
  manualSlug: z.infer<typeof quickStartSlugSchema>;
}) {
  return and(
    eq(quickStartGuideProgress.userId, input.userId),
    input.fleetId == null
      ? isNull(quickStartGuideProgress.fleetId)
      : eq(quickStartGuideProgress.fleetId, input.fleetId),
    eq(quickStartGuideProgress.manualSlug, input.manualSlug)
  );
}

async function getScopedProgress(input: {
  userId: number;
  fleetId: number | null;
  manualSlug: z.infer<typeof quickStartSlugSchema>;
}) {
  const db = await getDb();
  if (!db) return null;

  const [progress] = await db
    .select()
    .from(quickStartGuideProgress)
    .where(scopeWhere(input))
    .orderBy(desc(quickStartGuideProgress.updatedAt))
    .limit(1);

  return progress ?? null;
}

export const quickStartRouter = router({
  getMine: protectedProcedure
    .input(z.object({ manualSlug: quickStartSlugSchema.optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return input?.manualSlug ? null : [];

      const fleetId = await getUserPrimaryFleetId(ctx.user.id);
      const baseWhere = and(
        eq(quickStartGuideProgress.userId, ctx.user.id),
        fleetId == null
          ? isNull(quickStartGuideProgress.fleetId)
          : eq(quickStartGuideProgress.fleetId, fleetId)
      );

      if (input?.manualSlug) {
        const [progress] = await db
          .select()
          .from(quickStartGuideProgress)
          .where(and(baseWhere, eq(quickStartGuideProgress.manualSlug, input.manualSlug)))
          .orderBy(desc(quickStartGuideProgress.updatedAt))
          .limit(1);
        return progress ?? null;
      }

      return db
        .select()
        .from(quickStartGuideProgress)
        .where(baseWhere)
        .orderBy(desc(quickStartGuideProgress.updatedAt));
    }),

  recordViewed: protectedProcedure
    .input(z.object({ manualSlug: quickStartSlugSchema }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      const fleetId = await getUserPrimaryFleetId(ctx.user.id);
      const existing = await getScopedProgress({
        userId: ctx.user.id,
        fleetId,
        manualSlug: input.manualSlug,
      });

      if (existing) {
        const [updated] = await db
          .update(quickStartGuideProgress)
          .set({
            manualViewedAt: existing.manualViewedAt ?? new Date(),
            role: ctx.user.role,
            updatedAt: new Date(),
          })
          .where(eq(quickStartGuideProgress.id, existing.id))
          .returning();
        return updated;
      }

      const [created] = await db
        .insert(quickStartGuideProgress)
        .values({
          userId: ctx.user.id,
          fleetId,
          role: ctx.user.role,
          manualSlug: input.manualSlug,
          manualViewedAt: new Date(),
        })
        .returning();

      return created;
    }),

  markComplete: protectedProcedure
    .input(z.object({ manualSlug: quickStartSlugSchema }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      const fleetId = await getUserPrimaryFleetId(ctx.user.id);
      const existing = await getScopedProgress({
        userId: ctx.user.id,
        fleetId,
        manualSlug: input.manualSlug,
      });

      if (existing) {
        const [updated] = await db
          .update(quickStartGuideProgress)
          .set({
            manualViewedAt: existing.manualViewedAt ?? new Date(),
            manualCompletedAt: existing.manualCompletedAt ?? new Date(),
            completionSource: "manual_button",
            role: ctx.user.role,
            updatedAt: new Date(),
          })
          .where(eq(quickStartGuideProgress.id, existing.id))
          .returning();
        return updated;
      }

      const now = new Date();
      const [created] = await db
        .insert(quickStartGuideProgress)
        .values({
          userId: ctx.user.id,
          fleetId,
          role: ctx.user.role,
          manualSlug: input.manualSlug,
          manualViewedAt: now,
          manualCompletedAt: now,
          completionSource: "manual_button",
        })
        .returning();

      return created;
    }),
});
