import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import {
  CASE_STATUSES,
  MAINTENANCE_ACTIONS,
  MAINTENANCE_SEVERITIES,
} from "@shared/maintenance/caseWorkflow";
import { FLEET_MAINTENANCE_CAPABILITY_FLAGS as CAP } from "@shared/maintenance/featureKeys";
import { requireFleetFeature } from "../services/fleetFeatures";
import {
  resolveActiveFleetId,
  assertManagesFleet,
  assertVehicleInFleet,
} from "../services/maintenanceTenantScope";
import {
  assignCase,
  createAutomaticCaseFromDiagnosis,
  createManualCase,
  getCaseForFleet,
  listCasesForFleet,
  reopenCase,
  transitionCaseStatus,
} from "../services/maintenanceCases";
import {
  addDecision,
  approveCurrentDecision,
  listDecisions,
  recordCriticalOverride,
} from "../services/maintenanceDecisions";
import {
  completeCycle,
  listCycles,
  markCycleStage,
  returnToService,
  startRepairCycle,
} from "../services/repairCycles";
import { getCaseTimeline, getDowntimeBoard } from "../services/maintenanceBoards";
import { MaintenanceRecommendationAdapter } from "@shared/maintenance/recommendationAdapter";

const PAGE_DEFAULT = 25;
const PAGE_MAX = 100;
const caseStatusEnum = z.enum(CASE_STATUSES as unknown as [string, ...string[]]);
const severityEnum = z.enum(MAINTENANCE_SEVERITIES as unknown as [string, ...string[]]);
const actionEnum = z.enum(MAINTENANCE_ACTIONS as unknown as [string, ...string[]]);

async function gateManages(ctx: { user: { id: number; role: string } }, requestedFleetId?: number | null) {
  const fleetId = await resolveActiveFleetId({ user: ctx.user, requestedFleetId: requestedFleetId ?? null });
  await assertManagesFleet({ user: ctx.user, fleetId });
  await requireFleetFeature(fleetId, CAP.maintenanceCases);
  return fleetId;
}

export const maintenanceCasesRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        fleetId: z.number().optional(),
        status: z.string().optional(),
        vehicleId: z.string().optional(),
        limit: z.number().min(1).max(PAGE_MAX).default(PAGE_DEFAULT),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const fleetId = await resolveActiveFleetId({ user: ctx.user, requestedFleetId: input.fleetId ?? null });
      await requireFleetFeature(fleetId, CAP.maintenanceCases);
      return listCasesForFleet({
        fleetId,
        status: input.status,
        vehicleId: input.vehicleId,
        limit: input.limit,
        offset: input.offset,
      });
    }),

  get: protectedProcedure
    .input(z.object({ fleetId: z.number().optional(), caseId: z.number() }))
    .query(async ({ ctx, input }) => {
      const fleetId = await resolveActiveFleetId({ user: ctx.user, requestedFleetId: input.fleetId ?? null });
      await requireFleetFeature(fleetId, CAP.maintenanceCases);
      const [caseRow, decisions, cycles, timeline] = await Promise.all([
        getCaseForFleet(fleetId, input.caseId),
        listDecisions(fleetId, input.caseId),
        listCycles(fleetId, input.caseId),
        getCaseTimeline({ fleetId, caseId: input.caseId }),
      ]);
      return { case: caseRow, decisions, cycles, timeline };
    }),

  createManual: adminProcedure
    .input(
      z.object({
        fleetId: z.number().optional(),
        vehicleId: z.string().min(1),
        reason: z.string().min(1).max(2000),
        title: z.string().max(255).optional(),
        origin: z.enum(["issue", "inspection", "event", "pm", "manual"]).default("manual"),
        severity: severityEnum.optional(),
        sourceDefectId: z.number().optional(),
        sourceInspectionId: z.number().optional(),
        sourceEventId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const fleetId = await gateManages(ctx, input.fleetId);
      await assertVehicleInFleet({ fleetId, vehicleId: input.vehicleId });
      return createManualCase({
        fleetId,
        vehicleId: input.vehicleId,
        origin: input.origin,
        title: input.title ?? null,
        summary: input.reason,
        severity: input.severity as never,
        sourceDefectId: input.sourceDefectId ?? null,
        sourceInspectionId: input.sourceInspectionId ?? null,
        sourceEventId: input.sourceEventId ?? null,
        createdByUserId: ctx.user.id,
      });
    }),

  // Automatic creation from a completed diagnosis. Idempotent per diagnostic
  // session; called AFTER diagnosis completes so diagnosis is never modified.
  createFromDiagnosis: adminProcedure
    .input(
      z.object({
        fleetId: z.number().optional(),
        vehicleId: z.string().min(1),
        diagnosticSessionId: z.string().min(1),
        title: z.string().max(255).optional(),
        summary: z.string().max(4000).optional(),
        // Read-only view of diagnosis OUTPUT used by the adapter (never mutated).
        diagnosis: z
          .object({
            safeToDriveDecision: z.string().nullish(),
            riskLevel: z.string().nullish(),
            urgency: z.string().nullish(),
            recommendedAction: z.string().nullish(),
            maintenanceRecommendation: z.string().nullish(),
            confidenceScore: z.number().nullish(),
            likelyCauses: z.array(z.string()).nullish(),
            recommendedTests: z.array(z.string()).nullish(),
            model: z.string().nullish(),
            promptVersion: z.string().nullish(),
          })
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const fleetId = await gateManages(ctx, input.fleetId);
      await assertVehicleInFleet({ fleetId, vehicleId: input.vehicleId });

      const rec = input.diagnosis
        ? MaintenanceRecommendationAdapter.fromDiagnosticSession({
            caseId: input.diagnosticSessionId,
            ...input.diagnosis,
          })
        : null;

      const result = await createAutomaticCaseFromDiagnosis({
        fleetId,
        vehicleId: input.vehicleId,
        diagnosticSessionId: input.diagnosticSessionId,
        title: input.title ?? null,
        summary: input.summary ?? rec?.originalRecommendation ?? null,
        severity: (rec?.severity ?? null) as never,
        createdByUserId: ctx.user.id,
      });
      if (!result) return null;

      // Seed the first decision from the normalized recommendation.
      if (result.created && rec) {
        await addDecision({
          fleetId,
          caseId: result.case.id,
          actorUserId: ctx.user.id,
          source: "ai",
          severity: rec.severity,
          proposedAction: rec.action,
          originalRecommendation: rec.originalRecommendation,
          rationale: rec.rationale,
          confidence: rec.confidence,
          likelyCauses: rec.likelyCauses,
          immediateChecks: rec.immediateChecks,
          diagnosticSessionId: input.diagnosticSessionId,
          model: rec.model,
          promptVersion: rec.promptVersion,
        });
      }
      return result;
    }),

  transition: adminProcedure
    .input(
      z.object({
        fleetId: z.number().optional(),
        caseId: z.number(),
        toStatus: caseStatusEnum,
        note: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const fleetId = await gateManages(ctx, input.fleetId);
      return transitionCaseStatus({
        fleetId,
        caseId: input.caseId,
        toStatus: input.toStatus as never,
        actorUserId: ctx.user.id,
        note: input.note,
      });
    }),

  assign: adminProcedure
    .input(
      z.object({
        fleetId: z.number().optional(),
        caseId: z.number(),
        managerUserId: z.number().nullable().optional(),
        maintenanceUserId: z.number().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const fleetId = await gateManages(ctx, input.fleetId);
      await assignCase({
        fleetId,
        caseId: input.caseId,
        actorUserId: ctx.user.id,
        managerUserId: input.managerUserId,
        maintenanceUserId: input.maintenanceUserId,
      });
      return { ok: true };
    }),

  reopen: adminProcedure
    .input(z.object({ fleetId: z.number().optional(), caseId: z.number(), reason: z.string().min(1).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      const fleetId = await gateManages(ctx, input.fleetId);
      await reopenCase({ fleetId, caseId: input.caseId, actorUserId: ctx.user.id, reason: input.reason });
      return { ok: true };
    }),

  // ---- Decisions --------------------------------------------------------
  addDecision: adminProcedure
    .input(
      z.object({
        fleetId: z.number().optional(),
        caseId: z.number(),
        severity: severityEnum,
        proposedAction: actionEnum,
        rationale: z.string().max(4000).optional(),
        likelyCauses: z.array(z.string()).optional(),
        immediateChecks: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const fleetId = await gateManages(ctx, input.fleetId);
      return addDecision({
        fleetId,
        caseId: input.caseId,
        actorUserId: ctx.user.id,
        source: "manual",
        severity: input.severity as never,
        proposedAction: input.proposedAction as never,
        rationale: input.rationale,
        likelyCauses: input.likelyCauses,
        immediateChecks: input.immediateChecks,
      });
    }),

  approveDecision: adminProcedure
    .input(z.object({ fleetId: z.number().optional(), caseId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const fleetId = await gateManages(ctx, input.fleetId);
      return approveCurrentDecision({ fleetId, caseId: input.caseId, actorUserId: ctx.user.id });
    }),

  // Critical override — owner/manager only (adminProcedure). Reason mandatory.
  criticalOverride: adminProcedure
    .input(
      z.object({
        fleetId: z.number().optional(),
        caseId: z.number(),
        finalAction: actionEnum,
        overrideReason: z.string().min(1).max(2000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const fleetId = await gateManages(ctx, input.fleetId);
      return recordCriticalOverride({
        fleetId,
        caseId: input.caseId,
        actorUserId: ctx.user.id,
        finalAction: input.finalAction as never,
        overrideReason: input.overrideReason,
      });
    }),

  // ---- Repair cycles ----------------------------------------------------
  startCycle: adminProcedure
    .input(z.object({ fleetId: z.number().optional(), caseId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const fleetId = await gateManages(ctx, input.fleetId);
      return startRepairCycle({ fleetId, caseId: input.caseId, actorUserId: ctx.user.id });
    }),

  markCycleStage: adminProcedure
    .input(
      z.object({
        fleetId: z.number().optional(),
        caseId: z.number(),
        stage: z.enum(["out_of_service", "repair_started", "awaiting_parts", "ready_for_return"]),
        expectedCompletionAt: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const fleetId = await gateManages(ctx, input.fleetId);
      const expected =
        input.expectedCompletionAt === undefined
          ? undefined
          : input.expectedCompletionAt
            ? new Date(input.expectedCompletionAt)
            : null;
      return markCycleStage({
        fleetId,
        caseId: input.caseId,
        actorUserId: ctx.user.id,
        stage: input.stage,
        expectedCompletionAt: expected,
      });
    }),

  returnToService: adminProcedure
    .input(z.object({ fleetId: z.number().optional(), caseId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const fleetId = await gateManages(ctx, input.fleetId);
      return returnToService({ fleetId, caseId: input.caseId, actorUserId: ctx.user.id });
    }),

  completeCycle: adminProcedure
    .input(
      z.object({
        fleetId: z.number().optional(),
        caseId: z.number(),
        closureResult: z.enum(["resolved", "partially_resolved", "not_resolved"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const fleetId = await gateManages(ctx, input.fleetId);
      return completeCycle({
        fleetId,
        caseId: input.caseId,
        actorUserId: ctx.user.id,
        closureResult: input.closureResult,
      });
    }),

  // ---- Boards -----------------------------------------------------------
  downtimeBoard: protectedProcedure
    .input(z.object({ fleetId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const fleetId = await resolveActiveFleetId({ user: ctx.user, requestedFleetId: input?.fleetId ?? null });
      await requireFleetFeature(fleetId, CAP.maintenanceCases);
      return getDowntimeBoard({ fleetId });
    }),
});
