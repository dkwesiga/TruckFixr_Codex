import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, staffProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  faultCodeReferenceApprovals,
  faultCodeReferences,
  faultCodeReferenceSources,
  users,
} from "../../drizzle/schema";

const reviewStatusSchema = z.enum(["needs_review", "approved", "rejected", "archived"]);
const riskLevelSchema = z.enum(["low", "medium", "high", "critical"]);

const stringArraySchema = z
  .array(z.string().trim().min(1))
  .default([])
  .transform((values) => values.map((value) => value.trim()).filter(Boolean));

const referenceInputSchema = z.object({
  id: z.number().int().positive().optional(),
  sourceId: z.number().int().positive().nullable().optional(),
  codeSystem: z.string().trim().min(1).max(64),
  code: z.string().trim().min(1).max(128),
  normalizedCode: z.string().trim().min(1).max(128),
  category: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(255),
  summary: z.string().trim().min(1),
  recommendedChecks: stringArraySchema,
  riskLevel: riskLevelSchema,
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

const sourceInputSchema = z.object({
  title: z.string().trim().min(1).max(255),
  sourceType: z.string().trim().min(1).max(80),
  urlOrPath: z.string().trim().max(2_000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

function assertDb(db: Awaited<ReturnType<typeof getDb>>) {
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database is not configured for fault-code reference review.",
    });
  }
  return db;
}

function normalizeRecommendedChecks(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function searchCondition(search: string) {
  const term = `%${search.trim().toLowerCase()}%`;
  return sql`(
    lower(${faultCodeReferences.code}) like ${term} OR
    lower(${faultCodeReferences.normalizedCode}) like ${term} OR
    lower(${faultCodeReferences.title}) like ${term} OR
    lower(${faultCodeReferences.summary}) like ${term} OR
    lower(${faultCodeReferences.category}) like ${term}
  )`;
}

export const faultCodeReferencesRouter = router({
  dashboard: staffProcedure
    .input(
      z
        .object({
          search: z.string().trim().default(""),
          status: z.union([reviewStatusSchema, z.literal("all")]).default("needs_review"),
          category: z.string().trim().default("all"),
          riskLevel: z.union([riskLevelSchema, z.literal("all")]).default("all"),
          limit: z.number().int().min(10).max(200).default(100),
        })
        .default({
          search: "",
          status: "needs_review",
          category: "all",
          riskLevel: "all",
          limit: 100,
        })
    )
    .query(async ({ input }) => {
      const db = assertDb(await getDb());
      const filters = [];

      if (input.status !== "all") {
        filters.push(eq(faultCodeReferences.reviewStatus, input.status));
      }
      if (input.category !== "all") {
        filters.push(eq(faultCodeReferences.category, input.category));
      }
      if (input.riskLevel !== "all") {
        filters.push(eq(faultCodeReferences.riskLevel, input.riskLevel));
      }
      if (input.search) {
        filters.push(searchCondition(input.search));
      }

      const references = await db
        .select({
          id: faultCodeReferences.id,
          sourceId: faultCodeReferences.sourceId,
          codeSystem: faultCodeReferences.codeSystem,
          code: faultCodeReferences.code,
          normalizedCode: faultCodeReferences.normalizedCode,
          category: faultCodeReferences.category,
          title: faultCodeReferences.title,
          summary: faultCodeReferences.summary,
          recommendedChecks: faultCodeReferences.recommendedChecks,
          riskLevel: faultCodeReferences.riskLevel,
          reviewStatus: faultCodeReferences.reviewStatus,
          reviewerUserId: faultCodeReferences.reviewerUserId,
          approvedAt: faultCodeReferences.approvedAt,
          archivedAt: faultCodeReferences.archivedAt,
          metadata: faultCodeReferences.metadata,
          createdAt: faultCodeReferences.createdAt,
          updatedAt: faultCodeReferences.updatedAt,
          sourceTitle: faultCodeReferenceSources.title,
          sourceType: faultCodeReferenceSources.sourceType,
          sourceUrlOrPath: faultCodeReferenceSources.urlOrPath,
        })
        .from(faultCodeReferences)
        .leftJoin(
          faultCodeReferenceSources,
          eq(faultCodeReferences.sourceId, faultCodeReferenceSources.id)
        )
        .where(filters.length > 0 ? and(...filters) : undefined)
        .orderBy(desc(faultCodeReferences.updatedAt), desc(faultCodeReferences.createdAt))
        .limit(input.limit);

      const statusRows = await db
        .select({
          status: faultCodeReferences.reviewStatus,
          count: sql<number>`count(*)::int`,
        })
        .from(faultCodeReferences)
        .groupBy(faultCodeReferences.reviewStatus);

      const categoryRows = await db
        .select({
          category: faultCodeReferences.category,
          count: sql<number>`count(*)::int`,
        })
        .from(faultCodeReferences)
        .groupBy(faultCodeReferences.category)
        .orderBy(faultCodeReferences.category);

      const riskRows = await db
        .select({
          riskLevel: faultCodeReferences.riskLevel,
          count: sql<number>`count(*)::int`,
        })
        .from(faultCodeReferences)
        .groupBy(faultCodeReferences.riskLevel);

      const sources = await db
        .select()
        .from(faultCodeReferenceSources)
        .orderBy(desc(faultCodeReferenceSources.updatedAt), desc(faultCodeReferenceSources.createdAt))
        .limit(100);

      return {
        references: references.map((reference) => ({
          ...reference,
          recommendedChecks: normalizeRecommendedChecks(reference.recommendedChecks),
        })),
        stats: {
          byStatus: Object.fromEntries(statusRows.map((row) => [row.status, Number(row.count)])),
          byRisk: Object.fromEntries(riskRows.map((row) => [row.riskLevel, Number(row.count)])),
          total: statusRows.reduce((sum, row) => sum + Number(row.count), 0),
          needsReview: statusRows.find((row) => row.status === "needs_review")?.count ?? 0,
          approved: statusRows.find((row) => row.status === "approved")?.count ?? 0,
        },
        categories: categoryRows,
        sources,
      };
    }),

  detail: staffProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = assertDb(await getDb());
      const [reference] = await db
        .select({
          id: faultCodeReferences.id,
          sourceId: faultCodeReferences.sourceId,
          codeSystem: faultCodeReferences.codeSystem,
          code: faultCodeReferences.code,
          normalizedCode: faultCodeReferences.normalizedCode,
          category: faultCodeReferences.category,
          title: faultCodeReferences.title,
          summary: faultCodeReferences.summary,
          recommendedChecks: faultCodeReferences.recommendedChecks,
          riskLevel: faultCodeReferences.riskLevel,
          reviewStatus: faultCodeReferences.reviewStatus,
          reviewerUserId: faultCodeReferences.reviewerUserId,
          approvedAt: faultCodeReferences.approvedAt,
          archivedAt: faultCodeReferences.archivedAt,
          metadata: faultCodeReferences.metadata,
          createdAt: faultCodeReferences.createdAt,
          updatedAt: faultCodeReferences.updatedAt,
          sourceTitle: faultCodeReferenceSources.title,
          sourceType: faultCodeReferenceSources.sourceType,
          sourceUrlOrPath: faultCodeReferenceSources.urlOrPath,
          sourceReviewStatus: faultCodeReferenceSources.reviewStatus,
        })
        .from(faultCodeReferences)
        .leftJoin(
          faultCodeReferenceSources,
          eq(faultCodeReferences.sourceId, faultCodeReferenceSources.id)
        )
        .where(eq(faultCodeReferences.id, input.id))
        .limit(1);

      if (!reference) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Fault-code reference not found." });
      }

      const approvals = await db
        .select({
          id: faultCodeReferenceApprovals.id,
          referenceId: faultCodeReferenceApprovals.referenceId,
          reviewerUserId: faultCodeReferenceApprovals.reviewerUserId,
          previousStatus: faultCodeReferenceApprovals.previousStatus,
          nextStatus: faultCodeReferenceApprovals.nextStatus,
          notes: faultCodeReferenceApprovals.notes,
          createdAt: faultCodeReferenceApprovals.createdAt,
          reviewerName: users.name,
          reviewerEmail: users.email,
        })
        .from(faultCodeReferenceApprovals)
        .leftJoin(users, eq(faultCodeReferenceApprovals.reviewerUserId, users.id))
        .where(eq(faultCodeReferenceApprovals.referenceId, input.id))
        .orderBy(desc(faultCodeReferenceApprovals.createdAt));

      return {
        reference: {
          ...reference,
          recommendedChecks: normalizeRecommendedChecks(reference.recommendedChecks),
        },
        approvals,
      };
    }),

  upsertReference: staffProcedure
    .input(referenceInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = assertDb(await getDb());
      const payload = {
        sourceId: input.sourceId ?? null,
        codeSystem: input.codeSystem,
        code: input.code,
        normalizedCode: input.normalizedCode,
        category: input.category,
        title: input.title,
        summary: input.summary,
        recommendedChecks: input.recommendedChecks,
        riskLevel: input.riskLevel,
        metadata: input.metadata ?? null,
        updatedAt: new Date(),
      };

      if (input.id) {
        const [existing] = await db
          .select({ reviewStatus: faultCodeReferences.reviewStatus })
          .from(faultCodeReferences)
          .where(eq(faultCodeReferences.id, input.id))
          .limit(1);

        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Fault-code reference not found." });
        }

        const [updated] = await db
          .update(faultCodeReferences)
          .set(payload)
          .where(eq(faultCodeReferences.id, input.id))
          .returning();
        return updated;
      }

      const [created] = await db
        .insert(faultCodeReferences)
        .values({
          ...payload,
          reviewStatus: "needs_review",
          reviewerUserId: null,
          approvedAt: null,
          archivedAt: null,
        })
        .returning();

      await db.insert(faultCodeReferenceApprovals).values({
        referenceId: created.id,
        reviewerUserId: ctx.user.id,
        previousStatus: null,
        nextStatus: "needs_review",
        notes: "Reference created for review.",
      });

      return created;
    }),

  createSource: staffProcedure
    .input(sourceInputSchema)
    .mutation(async ({ input }) => {
      const db = assertDb(await getDb());
      const [source] = await db
        .insert(faultCodeReferenceSources)
        .values({
          title: input.title,
          sourceType: input.sourceType,
          urlOrPath: input.urlOrPath ?? null,
          metadata: input.metadata ?? null,
          reviewStatus: "needs_review",
        })
        .returning();
      return source;
    }),

  transitionReviewStatus: staffProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        nextStatus: reviewStatusSchema,
        notes: z.string().trim().max(2_000).optional().default(""),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = assertDb(await getDb());
      const [existing] = await db
        .select({
          id: faultCodeReferences.id,
          reviewStatus: faultCodeReferences.reviewStatus,
        })
        .from(faultCodeReferences)
        .where(eq(faultCodeReferences.id, input.id))
        .limit(1);

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Fault-code reference not found." });
      }

      const approvedAt = input.nextStatus === "approved" ? new Date() : null;
      const archivedAt = input.nextStatus === "archived" ? new Date() : null;

      const [updated] = await db
        .update(faultCodeReferences)
        .set({
          reviewStatus: input.nextStatus,
          reviewerUserId: ctx.user.id,
          approvedAt,
          archivedAt,
          updatedAt: new Date(),
        })
        .where(eq(faultCodeReferences.id, input.id))
        .returning();

      await db.insert(faultCodeReferenceApprovals).values({
        referenceId: input.id,
        reviewerUserId: ctx.user.id,
        previousStatus: existing.reviewStatus,
        nextStatus: input.nextStatus,
        notes: input.notes || null,
      });

      return updated;
    }),
});
