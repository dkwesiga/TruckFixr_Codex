import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { FLEET_MAINTENANCE_CAPABILITY_FLAGS as CAP } from "@shared/maintenance/featureKeys";
import { MAINTENANCE_CAPABILITIES } from "@shared/maintenance/permissions";
import { REPAIR_DOCUMENT_TYPES } from "@shared/maintenance/documentLimits";
import { requireFleetFeature } from "../services/fleetFeatures";
import { resolveActiveFleetId, assertManagesFleet } from "../services/maintenanceTenantScope";
import { canManageCompanyOperations } from "../services/companyAccess";
import { hasMaintenanceCapability } from "../services/maintenancePermissions";
import {
  compareCaseDocuments,
  getDocumentDownloadUrl,
  listCaseDocuments,
  retryDocumentProcessing,
  saveManualFields,
  uploadRepairDocument,
} from "../services/repairDocuments";
import { authorizeRepair } from "../services/repairAuthorization";

const lineItemSchema = z.object({
  description: z.string().max(255),
  kind: z.enum(["labour", "part", "fee"]),
  quantity: z.number(),
  unitPriceCents: z.number().int(),
  totalCents: z.number().int(),
});
const financialsSchema = z.object({
  currency: z.string().min(3).max(8),
  subtotalCents: z.number().int(),
  taxCents: z.number().int(),
  totalCents: z.number().int(),
  labourHours: z.number().nullable().optional(),
  lineItems: z.array(lineItemSchema).max(200),
});

// Upload / view are available to owners/managers AND maintenance-permitted
// users; financial value entry, comparison, and approvals stay owner/manager.
async function assertCanUpload(
  ctx: { user: { id: number; role: string } },
  fleetId: number
) {
  if (await canManageCompanyOperations({ fleetId, user: ctx.user })) return;
  const granted = await hasMaintenanceCapability({
    fleetId,
    user: ctx.user,
    capability: MAINTENANCE_CAPABILITIES.uploadDocuments,
  });
  if (!granted) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You cannot upload documents for this case." });
  }
}

export const repairDocumentsRouter = router({
  list: protectedProcedure
    .input(z.object({ fleetId: z.number().optional(), caseId: z.number() }))
    .query(async ({ ctx, input }) => {
      const fleetId = await resolveActiveFleetId({ user: ctx.user, requestedFleetId: input.fleetId ?? null });
      await requireFleetFeature(fleetId, CAP.repairDocumentReview);
      await assertCanUpload(ctx, fleetId);
      return listCaseDocuments(fleetId, input.caseId);
    }),

  upload: protectedProcedure
    .input(
      z.object({
        fleetId: z.number().optional(),
        caseId: z.number(),
        repairCycleId: z.number().nullable().optional(),
        documentType: z.enum(REPAIR_DOCUMENT_TYPES as unknown as [string, ...string[]]),
        filename: z.string().min(1).max(255),
        declaredMimeType: z.string().max(128),
        base64Content: z.string().min(1),
        consent: z.boolean().default(false),
        allowFleetDuplicate: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const fleetId = await resolveActiveFleetId({ user: ctx.user, requestedFleetId: input.fleetId ?? null });
      await requireFleetFeature(fleetId, CAP.repairDocumentReview);
      await assertCanUpload(ctx, fleetId);
      return uploadRepairDocument({
        fleetId,
        caseId: input.caseId,
        repairCycleId: input.repairCycleId,
        documentType: input.documentType as never,
        filename: input.filename,
        declaredMimeType: input.declaredMimeType,
        base64Content: input.base64Content,
        uploadedByUserId: ctx.user.id,
        consentAtUpload: input.consent,
        allowFleetDuplicate: input.allowFleetDuplicate,
      });
    }),

  downloadUrl: protectedProcedure
    .input(z.object({ fleetId: z.number().optional(), documentId: z.number() }))
    .query(async ({ ctx, input }) => {
      const fleetId = await resolveActiveFleetId({ user: ctx.user, requestedFleetId: input.fleetId ?? null });
      await requireFleetFeature(fleetId, CAP.repairDocumentReview);
      await assertCanUpload(ctx, fleetId);
      return getDocumentDownloadUrl({ fleetId, documentId: input.documentId });
    }),

  retry: adminProcedure
    .input(z.object({ fleetId: z.number().optional(), documentId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const fleetId = await resolveActiveFleetId({ user: ctx.user, requestedFleetId: input.fleetId ?? null });
      await assertManagesFleet({ user: ctx.user, fleetId });
      await requireFleetFeature(fleetId, CAP.repairDocumentReview);
      return retryDocumentProcessing({ fleetId, documentId: input.documentId, actorUserId: ctx.user.id });
    }),

  // Financial value entry/correction — owner/manager only.
  saveFields: adminProcedure
    .input(
      z.object({
        fleetId: z.number().optional(),
        documentId: z.number(),
        documentType: z.enum(REPAIR_DOCUMENT_TYPES as unknown as [string, ...string[]]).optional(),
        fields: financialsSchema,
        isCorrection: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const fleetId = await resolveActiveFleetId({ user: ctx.user, requestedFleetId: input.fleetId ?? null });
      await assertManagesFleet({ user: ctx.user, fleetId });
      await requireFleetFeature(fleetId, CAP.repairDocumentReview);
      return saveManualFields({
        fleetId,
        documentId: input.documentId,
        actorUserId: ctx.user.id,
        fields: input.fields as never,
        documentType: input.documentType as never,
        isCorrection: input.isCorrection,
      });
    }),

  // Deterministic estimate-to-invoice comparison — owner/manager only.
  compare: adminProcedure
    .input(
      z.object({
        fleetId: z.number().optional(),
        caseId: z.number(),
        estimateDocumentId: z.number(),
        invoiceDocumentId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const fleetId = await resolveActiveFleetId({ user: ctx.user, requestedFleetId: input.fleetId ?? null });
      await assertManagesFleet({ user: ctx.user, fleetId });
      await requireFleetFeature(fleetId, CAP.repairDocumentReview);
      return compareCaseDocuments({
        fleetId,
        caseId: input.caseId,
        actorUserId: ctx.user.id,
        estimateDocumentId: input.estimateDocumentId,
        invoiceDocumentId: input.invoiceDocumentId,
      });
    }),

  // Repair authorization. Available to owners/managers and delegated maintenance
  // users; the policy decides the required tier. Financial reasons are logged.
  authorize: protectedProcedure
    .input(
      z.object({
        fleetId: z.number().optional(),
        caseId: z.number(),
        repairCycleId: z.number().nullable().optional(),
        estimateCents: z.number().int().nonnegative(),
        valuesReviewed: z.boolean().default(false),
        scopeMatchesAssessment: z.boolean().default(false),
        hasUnresolvedHighVariance: z.boolean().default(false),
        note: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const fleetId = await resolveActiveFleetId({ user: ctx.user, requestedFleetId: input.fleetId ?? null });
      await requireFleetFeature(fleetId, CAP.repairDocumentReview);
      const isManager = await canManageCompanyOperations({ fleetId, user: ctx.user });
      if (!isManager) {
        // Must at least hold a maintenance grant to attempt authorization.
        const granted = await hasMaintenanceCapability({
          fleetId,
          user: ctx.user,
          capability: MAINTENANCE_CAPABILITIES.viewOperationalRepairDetails,
        });
        if (!granted) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You cannot authorize repairs for this case." });
        }
      }
      return authorizeRepair({
        fleetId,
        caseId: input.caseId,
        actor: { id: ctx.user.id, role: ctx.user.role },
        actorIsMaintenanceUser: !isManager,
        estimateCents: input.estimateCents,
        repairCycleId: input.repairCycleId,
        valuesReviewed: input.valuesReviewed,
        scopeMatchesAssessment: input.scopeMatchesAssessment,
        hasUnresolvedHighVariance: input.hasUnresolvedHighVariance,
        note: input.note,
      });
    }),
});
