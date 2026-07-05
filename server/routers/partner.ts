import { z } from "zod";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  faultCodeReferenceApprovals,
  faultCodeReferences,
  faultCodeReferenceSources,
  fleets,
  repairOutcomes,
} from "../../drizzle/schema";
import { canManageVehicleAccess } from "../services/vehicleAccess";
import {
  buildReferenceCandidate,
  describePromotionError,
  RISK_LEVELS,
} from "../services/partnerKnowledge";

const referenceDraftSchema = z.object({
  codeSystem: z.string().trim().min(1).max(64),
  code: z.string().trim().min(1).max(128),
  category: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(255),
  riskLevel: z.enum(RISK_LEVELS),
  recommendedChecks: z.array(z.string().trim().min(1)).max(20).default([]),
  summaryNotes: z.string().trim().max(1_000).optional(),
});

function assertDb(db: Awaited<ReturnType<typeof getDb>>) {
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database is not configured for partner knowledge promotion.",
    });
  }
  return db;
}

/**
 * Load a partner fleet and verify the caller may act for it. Owner/manager of a
 * fleet flagged `isPartner` only — this is the tenant boundary for the one
 * bridge from private outcomes into the shared knowledge base.
 */
async function requirePartnerFleet(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  user: { id: number; role: string; email?: string | null },
  fleetId: number
) {
  const [fleet] = await db
    .select({ id: fleets.id, isPartner: fleets.isPartner })
    .from(fleets)
    .where(eq(fleets.id, fleetId))
    .limit(1);

  if (!fleet) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Fleet not found." });
  }
  if (!fleet.isPartner) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only partner repair shops can contribute to the knowledge base.",
    });
  }
  const manages = await canManageVehicleAccess({ fleetId, user });
  if (!manages) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not manage this partner shop.",
    });
  }
  return fleet;
}

/** Find-or-create the partner's provenance source row (attribution for Loop B). */
async function ensurePartnerSourceId(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  fleetId: number,
  fleetName: string | null
) {
  const [existing] = await db
    .select({ id: faultCodeReferenceSources.id })
    .from(faultCodeReferenceSources)
    .where(
      and(
        eq(faultCodeReferenceSources.sourceType, "partner_shop"),
        sql`${faultCodeReferenceSources.metadata} ->> 'partnerFleetId' = ${String(fleetId)}`
      )
    )
    .limit(1);

  if (existing) return existing.id;

  const [created] = await db
    .insert(faultCodeReferenceSources)
    .values({
      title: fleetName?.trim() || `Partner shop #${fleetId}`,
      sourceType: "partner_shop",
      urlOrPath: null,
      metadata: { partnerFleetId: String(fleetId) },
      reviewStatus: "needs_review",
    })
    .returning();

  return created.id;
}

export const partnerRouter = router({
  /** Partner outcomes eligible to be proposed for the shared knowledge base. */
  listPromotableOutcomes: protectedProcedure
    .input(z.object({ fleetId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = assertDb(await getDb());
      await requirePartnerFleet(db, ctx.user, input.fleetId);

      const rows = await db
        .select({
          id: repairOutcomes.id,
          vehicleId: repairOutcomes.vehicleId,
          diagnosticCaseId: repairOutcomes.diagnosticCaseId,
          confirmedFault: repairOutcomes.confirmedFault,
          repairPerformed: repairOutcomes.repairPerformed,
          partsReplaced: repairOutcomes.partsReplaced,
          aiDiagnosisCorrect: repairOutcomes.aiDiagnosisCorrect,
          promotedReferenceId: repairOutcomes.promotedReferenceId,
          createdAt: repairOutcomes.createdAt,
        })
        .from(repairOutcomes)
        .where(
          and(
            eq(repairOutcomes.fleetId, input.fleetId),
            eq(repairOutcomes.source, "partner_shop"),
            isNull(repairOutcomes.promotedReferenceId)
          )
        )
        .orderBy(desc(repairOutcomes.createdAt))
        .limit(100);

      return rows;
    }),

  /**
   * Promote one confirmed partner outcome into a `needs_review` fault-code
   * reference candidate. It never reaches customer-facing diagnosis until a
   * TruckFixr curator approves it at /admin/fault-codes.
   */
  promoteOutcomeToReference: protectedProcedure
    .input(
      z.object({
        fleetId: z.number().int().positive(),
        outcomeId: z.number().int().positive(),
        reference: referenceDraftSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = assertDb(await getDb());
      const [fleetRow] = await db
        .select({ id: fleets.id, name: fleets.name, isPartner: fleets.isPartner })
        .from(fleets)
        .where(eq(fleets.id, input.fleetId))
        .limit(1);

      if (!fleetRow) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Fleet not found." });
      }
      if (!fleetRow.isPartner) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only partner repair shops can contribute to the knowledge base.",
        });
      }
      const manages = await canManageVehicleAccess({ fleetId: input.fleetId, user: ctx.user });
      if (!manages) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not manage this partner shop." });
      }

      const [outcome] = await db
        .select()
        .from(repairOutcomes)
        .where(eq(repairOutcomes.id, input.outcomeId))
        .limit(1);

      if (!outcome || outcome.fleetId !== input.fleetId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This repair outcome does not belong to your shop.",
        });
      }

      const built = buildReferenceCandidate({
        fleetId: input.fleetId,
        isPartnerFleet: true,
        promotedByUserId: ctx.user.id,
        outcome,
        reference: input.reference,
      });

      if (!built.ok) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: describePromotionError(built.error, built.details),
        });
      }

      const sourceId = await ensurePartnerSourceId(db, input.fleetId, fleetRow.name);

      const [createdReference] = await db
        .insert(faultCodeReferences)
        .values({
          sourceId,
          codeSystem: built.candidate.codeSystem,
          code: built.candidate.code,
          normalizedCode: built.candidate.normalizedCode,
          category: built.candidate.category,
          title: built.candidate.title,
          summary: built.candidate.summary,
          recommendedChecks: built.candidate.recommendedChecks,
          riskLevel: built.candidate.riskLevel,
          reviewStatus: "needs_review",
          reviewerUserId: null,
          approvedAt: null,
          archivedAt: null,
          metadata: built.candidate.metadata,
        })
        .returning();

      await db.insert(faultCodeReferenceApprovals).values({
        referenceId: createdReference.id,
        reviewerUserId: ctx.user.id,
        previousStatus: null,
        nextStatus: "needs_review",
        notes: `Promoted from partner repair outcome #${outcome.id}.`,
      });

      await db
        .update(repairOutcomes)
        .set({
          promotedReferenceId: createdReference.id,
          promotedAt: new Date(),
          promotedByUserId: ctx.user.id,
          updatedAt: new Date(),
        })
        .where(eq(repairOutcomes.id, outcome.id));

      return {
        success: true as const,
        referenceId: createdReference.id,
        reviewStatus: "needs_review" as const,
      };
    }),
});
