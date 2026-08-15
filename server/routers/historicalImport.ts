import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { FLEET_MAINTENANCE_CAPABILITY_FLAGS as CAP } from "@shared/maintenance/featureKeys";
import { requireFleetFeature } from "../services/fleetFeatures";
import { resolveActiveFleetId } from "../services/maintenanceTenantScope";
import { hasMaintenanceCapability } from "../services/maintenancePermissions";
import { MAINTENANCE_CAPABILITIES } from "@shared/maintenance/permissions";
import { CASE_TYPES, RESOLUTION_CATEGORIES } from "@shared/tadis/caseTypes";
import { extractHistoricalCaseDraft, importHistoricalCase } from "../services/historicalCaseImport";

async function gateCreateCase(ctx: { user: { id: number; role: string } }, requestedFleetId?: number | null) {
  const fleetId = await resolveActiveFleetId({ user: ctx.user, requestedFleetId: requestedFleetId ?? null });
  await requireFleetFeature(fleetId, CAP.maintenanceCases);
  const allowed = await hasMaintenanceCapability({
    fleetId,
    user: ctx.user,
    capability: MAINTENANCE_CAPABILITIES.createCase,
  });
  if (!allowed) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You cannot import historical cases for this shop." });
  }
  return fleetId;
}

const draftSchema = z.object({
  vin: z.string().nullable(),
  make: z.string().nullable(),
  model: z.string().nullable(),
  year: z.number().int().nullable(),
  complaint: z.string(),
  symptoms: z.array(z.string()),
  faultCodes: z.array(z.string()),
  diagnosis: z.string().nullable(),
  rootCause: z.string().nullable(),
  repairPerformed: z.string().nullable(),
  partsReplaced: z.array(z.string()),
  caseType: z.enum(CASE_TYPES as unknown as [string, ...string[]]),
  resolutionCategory: z.enum(RESOLUTION_CATEGORIES as unknown as [string, ...string[]]),
  confidence: z.number(),
});

export const historicalImportRouter = router({
  // Step 1: AI proposes a draft from pasted text. Never touches the database
  // — the human reviews/edits the returned draft before calling `import`.
  extractDraft: protectedProcedure
    .input(z.object({ fleetId: z.number().optional(), sourceText: z.string().trim().min(1).max(20_000) }))
    .mutation(async ({ ctx, input }) => {
      await gateCreateCase(ctx, input.fleetId);
      return extractHistoricalCaseDraft(input.sourceText);
    }),

  // Step 2: persist the human-reviewed draft, flagged recordOrigin:
  // "historical_import" so it starts at a lower evidence-quality ceiling.
  import: protectedProcedure
    .input(z.object({ fleetId: z.number().optional(), draft: draftSchema }))
    .mutation(async ({ ctx, input }) => {
      const fleetId = await gateCreateCase(ctx, input.fleetId);
      return importHistoricalCase({
        fleetId,
        actorUserId: ctx.user.id,
        draft: input.draft as never,
      });
    }),
});
