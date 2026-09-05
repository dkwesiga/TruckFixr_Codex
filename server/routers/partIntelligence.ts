import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { FLEET_MAINTENANCE_CAPABILITY_FLAGS as CAP } from "@shared/maintenance/featureKeys";
import { requireFleetFeature } from "../services/fleetFeatures";
import { resolveActiveFleetId, assertManagesFleet } from "../services/maintenanceTenantScope";
import { hasMaintenanceCapability } from "../services/maintenancePermissions";
import { MAINTENANCE_CAPABILITIES } from "@shared/maintenance/permissions";
import { PART_REQUIREMENT_STATUSES } from "@shared/parts/partRequirementWorkflow";
import { getCaseFleetId } from "../services/maintenanceCases";
import {
  createPartRequirement,
  getPartRequirement,
  getPartRequirementFleetId,
  identifyPartForRequirement,
  listPartRequirementsForCase,
  markPartNotFound,
  transitionPartRequirementStatus,
} from "../services/partRequirements";
import {
  getCurrentFitmentAssessment,
  listFitmentAssessments,
  recordFitmentAssessment,
} from "../services/partFitmentAssessments";
import {
  addSupplierOption,
  getRecommendedOptions,
  getSupplierOption,
  getSupplierOptionFleetId,
  listSupplierOptionsForRequirement,
} from "../services/partSupplierOptions";
import {
  getCurrentApproval,
  listApprovalHistory,
  recordApprovalDecision,
} from "../services/partOptionApprovals";
import { PART_CONDITIONS, AVAILABILITY_STATES, ETA_TYPES } from "@shared/parts/recommendation";

// Parts Intelligence Phase 1 router. Every procedure resolves its fleet
// scope server-side via the SAME two patterns already established for
// maintenance cases — never a third authorization style:
//   - direct fleet input (list, by caseId) -> resolveActiveFleetId
//   - resource-derived fleet (get/transition/identify/assessments/options,
//     by partRequirementId) -> getPartRequirementFleetId + resolveActiveFleetId
// See docs/architecture/tenant-isolation-test-coverage.md.

const statusEnum = z.enum(PART_REQUIREMENT_STATUSES);

async function resolveFleetForCase(
  ctx: { user: { id: number; role: string } },
  requestedFleetId: number | null | undefined,
  caseId: number
) {
  if (requestedFleetId == null) {
    const caseFleetId = await getCaseFleetId(caseId);
    if (caseFleetId != null) {
      return resolveActiveFleetId({ user: ctx.user, requestedFleetId: caseFleetId });
    }
  }
  return resolveActiveFleetId({ user: ctx.user, requestedFleetId: requestedFleetId ?? null });
}

async function resolveFleetForRequirement(
  ctx: { user: { id: number; role: string } },
  requestedFleetId: number | null | undefined,
  partRequirementId: number
) {
  if (requestedFleetId == null) {
    const owningFleetId = await getPartRequirementFleetId(partRequirementId);
    if (owningFleetId != null) {
      return resolveActiveFleetId({ user: ctx.user, requestedFleetId: owningFleetId });
    }
  }
  return resolveActiveFleetId({ user: ctx.user, requestedFleetId: requestedFleetId ?? null });
}

async function resolveFleetForOption(
  ctx: { user: { id: number; role: string } },
  requestedFleetId: number | null | undefined,
  optionId: number
) {
  if (requestedFleetId == null) {
    const owningFleetId = await getSupplierOptionFleetId(optionId);
    if (owningFleetId != null) {
      return resolveActiveFleetId({ user: ctx.user, requestedFleetId: owningFleetId });
    }
  }
  return resolveActiveFleetId({ user: ctx.user, requestedFleetId: requestedFleetId ?? null });
}

async function gateRead(fleetId: number) {
  await requireFleetFeature(fleetId, CAP.maintenanceCases);
}

async function gateManage(ctx: { user: { id: number; role: string } }, fleetId: number) {
  await requireFleetFeature(fleetId, CAP.maintenanceCases);
  const allowed = await hasMaintenanceCapability({
    fleetId,
    user: ctx.user,
    capability: MAINTENANCE_CAPABILITIES.managePartRequirements,
  });
  if (!allowed) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have the capability required to manage part requirements.",
    });
  }
}

// Approving/declining a sourcing option is a financial/procurement-adjacent
// decision — the same category the existing capability system already
// reserves for owners/managers only (see `approve_estimate` in
// FORBIDDEN_MAINTENANCE_CAPABILITIES, shared/maintenance/permissions.ts: it
// can never be granted to a technician). Reuse that existing policy via
// assertManagesFleet rather than inventing a new grantable capability.
async function gateApprove(ctx: { user: { id: number; role: string } }, fleetId: number) {
  await requireFleetFeature(fleetId, CAP.maintenanceCases);
  await assertManagesFleet({ user: ctx.user, fleetId });
}

export const partIntelligenceRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        fleetId: z.number().optional(),
        caseId: z.number(),
        repairCycleId: z.number().optional().nullable(),
        description: z.string().trim().min(1).max(2000),
        reasonContext: z.string().trim().max(4000).optional().nullable(),
        quantity: z.number().int().positive().max(1000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const fleetId = await resolveFleetForCase(ctx, input.fleetId, input.caseId);
      await gateManage(ctx, fleetId);
      return createPartRequirement({
        fleetId,
        caseId: input.caseId,
        repairCycleId: input.repairCycleId ?? null,
        description: input.description,
        reasonContext: input.reasonContext ?? null,
        quantity: input.quantity,
        requestedByUserId: ctx.user.id,
      });
    }),

  listForCase: protectedProcedure
    .input(z.object({ fleetId: z.number().optional(), caseId: z.number() }))
    .query(async ({ ctx, input }) => {
      const fleetId = await resolveFleetForCase(ctx, input.fleetId, input.caseId);
      await gateRead(fleetId);
      return listPartRequirementsForCase(fleetId, input.caseId);
    }),

  get: protectedProcedure
    .input(z.object({ fleetId: z.number().optional(), id: z.number() }))
    .query(async ({ ctx, input }) => {
      const fleetId = await resolveFleetForRequirement(ctx, input.fleetId, input.id);
      await gateRead(fleetId);
      return getPartRequirement(fleetId, input.id);
    }),

  transition: protectedProcedure
    .input(z.object({ fleetId: z.number().optional(), id: z.number(), toStatus: statusEnum }))
    .mutation(async ({ ctx, input }) => {
      const fleetId = await resolveFleetForRequirement(ctx, input.fleetId, input.id);
      await gateManage(ctx, fleetId);
      return transitionPartRequirementStatus({ fleetId, id: input.id, toStatus: input.toStatus });
    }),

  identify: protectedProcedure
    .input(
      z.object({
        fleetId: z.number().optional(),
        id: z.number(),
        oemPartNumber: z.string().trim().max(120).optional().nullable(),
        manufacturerPartNumber: z.string().trim().max(120).optional().nullable(),
        manufacturer: z.string().trim().max(255).optional().nullable(),
        description: z.string().trim().max(2000).optional().nullable(),
        category: z.string().trim().max(100).optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const fleetId = await resolveFleetForRequirement(ctx, input.fleetId, input.id);
      await gateManage(ctx, fleetId);
      return identifyPartForRequirement({
        fleetId,
        id: input.id,
        oemPartNumber: input.oemPartNumber,
        manufacturerPartNumber: input.manufacturerPartNumber,
        manufacturer: input.manufacturer,
        description: input.description,
        category: input.category,
      });
    }),

  markNotFound: protectedProcedure
    .input(z.object({ fleetId: z.number().optional(), id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const fleetId = await resolveFleetForRequirement(ctx, input.fleetId, input.id);
      await gateManage(ctx, fleetId);
      return markPartNotFound({ fleetId, id: input.id });
    }),

  // ---- Fitment assessments ------------------------------------------------
  recordFitmentAssessment: protectedProcedure
    .input(
      z.object({
        fleetId: z.number().optional(),
        partRequirementId: z.number(),
        partId: z.number().optional().nullable(),
        vehicleId: z.string().trim().min(1),
        // "ai_assisted_extraction" is intentionally not accepted here — no AI
        // call exists in this phase; see .claude/rules/ai-safety.md.
        source: z.enum(["deterministic_rule", "technician_manual"]),
        evidence: z.object({
          exactCurrentPartNumberMatch: z.boolean().optional(),
          oemCatalogMatch: z.boolean().optional(),
          vehicleConfigurationMatch: z.boolean().optional(),
          crossReferenceMatch: z.boolean().optional(),
          manufacturerConfirmed: z.boolean().optional(),
          technicianConfirmed: z.boolean().optional(),
          conflictingEvidence: z.boolean().optional(),
          missingFields: z.array(z.string()).optional(),
        }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const fleetId = await resolveFleetForRequirement(ctx, input.fleetId, input.partRequirementId);
      await gateManage(ctx, fleetId);
      return recordFitmentAssessment({
        fleetId,
        partRequirementId: input.partRequirementId,
        partId: input.partId,
        vehicleId: input.vehicleId,
        evidence: input.evidence,
        source: input.source,
        // Never client-supplied — a manual confirmation is attributed to the
        // authenticated caller, never an arbitrary claimed user id.
        assessedByUserId: input.source === "technician_manual" ? ctx.user.id : null,
      });
    }),

  getCurrentFitmentAssessment: protectedProcedure
    .input(z.object({ fleetId: z.number().optional(), partRequirementId: z.number() }))
    .query(async ({ ctx, input }) => {
      const fleetId = await resolveFleetForRequirement(ctx, input.fleetId, input.partRequirementId);
      await gateRead(fleetId);
      return getCurrentFitmentAssessment(fleetId, input.partRequirementId);
    }),

  listFitmentAssessments: protectedProcedure
    .input(z.object({ fleetId: z.number().optional(), partRequirementId: z.number() }))
    .query(async ({ ctx, input }) => {
      const fleetId = await resolveFleetForRequirement(ctx, input.fleetId, input.partRequirementId);
      await gateRead(fleetId);
      return listFitmentAssessments(fleetId, input.partRequirementId);
    }),

  // ---- Supplier options ---------------------------------------------------
  addSupplierOption: protectedProcedure
    .input(
      z.object({
        fleetId: z.number().optional(),
        partRequirementId: z.number(),
        partId: z.number().optional().nullable(),
        supplierName: z.string().trim().min(1).max(255),
        supplierContact: z.string().trim().max(500).optional().nullable(),
        supplierLocation: z.string().trim().max(255).optional().nullable(),
        externalSupplierId: z.string().trim().max(120).optional().nullable(),
        quotedPartNumber: z.string().trim().max(120).optional().nullable(),
        conditionType: z.enum(PART_CONDITIONS).optional().nullable(),
        priceCents: z.number().int().nonnegative().optional().nullable(),
        currency: z.string().trim().length(3).optional(),
        freightCents: z.number().int().nonnegative().optional().nullable(),
        coreChargeCents: z.number().int().nonnegative().optional().nullable(),
        stockStatus: z.string().trim().max(40).optional().nullable(),
        availabilityState: z.enum(AVAILABILITY_STATES).optional().nullable(),
        etaType: z.enum(ETA_TYPES).optional().nullable(),
        etaAt: z.string().datetime().optional().nullable(),
        etaLeadTimeDays: z.number().int().nonnegative().optional().nullable(),
        warrantyText: z.string().trim().max(2000).optional().nullable(),
        returnable: z.boolean().optional().nullable(),
        quoteReference: z.string().trim().max(120).optional().nullable(),
        quoteExpiresAt: z.string().datetime().optional().nullable(),
        fitmentClaim: z.string().trim().max(2000).optional().nullable(),
        notes: z.string().trim().max(2000).optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const fleetId = await resolveFleetForRequirement(ctx, input.fleetId, input.partRequirementId);
      await gateManage(ctx, fleetId);
      return addSupplierOption({
        fleetId,
        partRequirementId: input.partRequirementId,
        partId: input.partId,
        supplierName: input.supplierName,
        supplierContact: input.supplierContact,
        supplierLocation: input.supplierLocation,
        externalSupplierId: input.externalSupplierId,
        quotedPartNumber: input.quotedPartNumber,
        conditionType: input.conditionType,
        priceCents: input.priceCents,
        currency: input.currency,
        freightCents: input.freightCents,
        coreChargeCents: input.coreChargeCents,
        stockStatus: input.stockStatus,
        availabilityState: input.availabilityState,
        etaType: input.etaType,
        etaAt: input.etaAt ? new Date(input.etaAt) : null,
        etaLeadTimeDays: input.etaLeadTimeDays,
        warrantyText: input.warrantyText,
        returnable: input.returnable,
        quoteReference: input.quoteReference,
        quoteExpiresAt: input.quoteExpiresAt ? new Date(input.quoteExpiresAt) : null,
        fitmentClaim: input.fitmentClaim,
        notes: input.notes,
        capturedByUserId: ctx.user.id,
      });
    }),

  getSupplierOption: protectedProcedure
    .input(z.object({ fleetId: z.number().optional(), id: z.number() }))
    .query(async ({ ctx, input }) => {
      const fleetId = await resolveFleetForOption(ctx, input.fleetId, input.id);
      await gateRead(fleetId);
      return getSupplierOption(fleetId, input.id);
    }),

  listSupplierOptions: protectedProcedure
    .input(z.object({ fleetId: z.number().optional(), partRequirementId: z.number() }))
    .query(async ({ ctx, input }) => {
      const fleetId = await resolveFleetForRequirement(ctx, input.fleetId, input.partRequirementId);
      await gateRead(fleetId);
      return listSupplierOptionsForRequirement(fleetId, input.partRequirementId);
    }),

  getRecommendedOptions: protectedProcedure
    .input(z.object({ fleetId: z.number().optional(), partRequirementId: z.number() }))
    .query(async ({ ctx, input }) => {
      const fleetId = await resolveFleetForRequirement(ctx, input.fleetId, input.partRequirementId);
      await gateRead(fleetId);
      return getRecommendedOptions(fleetId, input.partRequirementId);
    }),

  // ---- Human approval (§17/§18) -------------------------------------------
  // Owner/manager only — see gateApprove above. APPROVED != ORDERED: this
  // records a sourcing decision only, never a purchase/order event.
  //
  // recommendedOptionId is NEVER accepted from the client for any of these
  // three mutations — it is computed here, server-side, from the SAME
  // compareOptions() logic the read endpoints use, at the moment of
  // decision. Trusting a client-supplied "this was the recommendation"
  // value would let a caller corrupt the provenance record this is meant
  // to protect (§19: recommendation vs. human selection must both be
  // genuine, not asserted by whichever side benefits from the claim).
  approveOption: protectedProcedure
    .input(
      z.object({
        fleetId: z.number().optional(),
        partRequirementId: z.number(),
        selectedOptionId: z.number(),
        reasonNote: z.string().trim().max(2000).optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const fleetId = await resolveFleetForRequirement(ctx, input.fleetId, input.partRequirementId);
      await gateApprove(ctx, fleetId);
      const comparison = await getRecommendedOptions(fleetId, input.partRequirementId);
      return recordApprovalDecision({
        fleetId,
        partRequirementId: input.partRequirementId,
        decision: "approved",
        selectedOptionId: input.selectedOptionId,
        recommendedOptionId: (comparison.recommended?.id as number | undefined) ?? null,
        reasonNote: input.reasonNote,
        decidedByUserId: ctx.user.id,
      });
    }),

  declineOptions: protectedProcedure
    .input(
      z.object({
        fleetId: z.number().optional(),
        partRequirementId: z.number(),
        reasonNote: z.string().trim().max(2000).optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const fleetId = await resolveFleetForRequirement(ctx, input.fleetId, input.partRequirementId);
      await gateApprove(ctx, fleetId);
      const comparison = await getRecommendedOptions(fleetId, input.partRequirementId);
      return recordApprovalDecision({
        fleetId,
        partRequirementId: input.partRequirementId,
        decision: "declined",
        recommendedOptionId: (comparison.recommended?.id as number | undefined) ?? null,
        reasonNote: input.reasonNote,
        decidedByUserId: ctx.user.id,
      });
    }),

  requestMoreInformation: protectedProcedure
    .input(
      z.object({
        fleetId: z.number().optional(),
        partRequirementId: z.number(),
        reasonNote: z.string().trim().max(2000).optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const fleetId = await resolveFleetForRequirement(ctx, input.fleetId, input.partRequirementId);
      await gateApprove(ctx, fleetId);
      const comparison = await getRecommendedOptions(fleetId, input.partRequirementId);
      return recordApprovalDecision({
        fleetId,
        partRequirementId: input.partRequirementId,
        decision: "needs_more_information",
        recommendedOptionId: (comparison.recommended?.id as number | undefined) ?? null,
        reasonNote: input.reasonNote,
        decidedByUserId: ctx.user.id,
      });
    }),

  listApprovalHistory: protectedProcedure
    .input(z.object({ fleetId: z.number().optional(), partRequirementId: z.number() }))
    .query(async ({ ctx, input }) => {
      const fleetId = await resolveFleetForRequirement(ctx, input.fleetId, input.partRequirementId);
      await gateRead(fleetId);
      return listApprovalHistory(fleetId, input.partRequirementId);
    }),

  getCurrentApproval: protectedProcedure
    .input(z.object({ fleetId: z.number().optional(), partRequirementId: z.number() }))
    .query(async ({ ctx, input }) => {
      const fleetId = await resolveFleetForRequirement(ctx, input.fleetId, input.partRequirementId);
      await gateRead(fleetId);
      return getCurrentApproval(fleetId, input.partRequirementId);
    }),
});
