import { z } from "zod";
import { TRPCError } from "@trpc/server";
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
  getCaseFleetId,
  listCasesForFleet,
  reopenCase,
  setCaseTadisEligibilityOverride,
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
import { hasMaintenanceCapability } from "../services/maintenancePermissions";
import { MAINTENANCE_CAPABILITIES, type MaintenanceCapability } from "@shared/maintenance/permissions";
import { CASE_TYPES, RESOLUTION_CATEGORIES } from "@shared/tadis/caseTypes";
import {
  CONFIRMATION_EVIDENCE_TYPES,
  VERIFICATION_METHODS,
  EVIDENCE_SOURCES,
} from "@shared/tadis/outcomeLifecycle";
import {
  createShopCase as createShopCaseService,
  listShopVehicles,
} from "../services/shopCaseCapture";
import {
  confirmOutcome as confirmOutcomeService,
  listOutcomesForCase,
  markOutcomeFailed as markOutcomeFailedService,
  recordOutcomeImpact as recordOutcomeImpactService,
  reportOutcome as reportOutcomeService,
  reviseVerifiedOutcome as reviseVerifiedOutcomeService,
  verifyOutcome as verifyOutcomeService,
} from "../services/outcomeVerification";
import { ESTIMATE_SOURCES } from "@shared/tadis/roiImpact";
import { isStaffAdminUser } from "../_core/trpc";
import { isRepairShopFleet } from "../services/repairShop";
import {
  advanceShopTriage,
  completeShopTriage,
  createReturnJob,
  FOLLOW_UP_RESULTS,
  listFollowUpsForCase,
  recordShopFollowUp,
  recordShopRepairOutcome,
  startShopRepair,
} from "../services/repairShopWorkflow";

const PAGE_DEFAULT = 25;
const PAGE_MAX = 100;
const caseStatusEnum = z.enum(CASE_STATUSES as unknown as [string, ...string[]]);
const severityEnum = z.enum(MAINTENANCE_SEVERITIES as unknown as [string, ...string[]]);
const actionEnum = z.enum(MAINTENANCE_ACTIONS as unknown as [string, ...string[]]);
const caseTypeEnum = z.enum(CASE_TYPES as unknown as [string, ...string[]]);
const resolutionCategoryEnum = z.enum(RESOLUTION_CATEGORIES as unknown as [string, ...string[]]);
const verificationMethodEnum = z.enum(VERIFICATION_METHODS as unknown as [string, ...string[]]);
const confirmationEvidenceEnum = z.enum(CONFIRMATION_EVIDENCE_TYPES as unknown as [string, ...string[]]);
const evidenceSourceEnum = z.enum(EVIDENCE_SOURCES as unknown as [string, ...string[]]);

// Resolves the fleet for a case-scoped action. An explicit fleetId is
// trusted (and verified) as before. Otherwise, when a caseId is given,
// resolve the fleet the case actually belongs to — maintenanceCases.id is a
// global (not per-fleet) primary key, so this is unambiguous — rather than
// guessing at the caller's "primary"/most-recently-active fleet, which for a
// user who belongs to more than one fleet (e.g. a repair-shop owner who also
// has their own operational fleet) may not be the fleet this case lives in.
// Falls back to the old "primary fleet" guess when there is no caseId to
// resolve from (e.g. list/createManual) or the case can't be found, so the
// existing not-found error is still surfaced by the caller.
async function resolveCaseFleetId(
  ctx: { user: { id: number; role: string } },
  requestedFleetId: number | null | undefined,
  caseId?: number | null
) {
  if (requestedFleetId == null && caseId != null) {
    const caseFleetId = await getCaseFleetId(caseId);
    if (caseFleetId != null) {
      return resolveActiveFleetId({ user: ctx.user, requestedFleetId: caseFleetId });
    }
  }
  return resolveActiveFleetId({ user: ctx.user, requestedFleetId: requestedFleetId ?? null });
}

async function gateManages(
  ctx: { user: { id: number; role: string } },
  requestedFleetId?: number | null,
  caseId?: number | null
) {
  const fleetId = await resolveCaseFleetId(ctx, requestedFleetId, caseId);
  await assertManagesFleet({ user: ctx.user, fleetId });
  await requireFleetFeature(fleetId, CAP.maintenanceCases);
  return fleetId;
}

// Service Advisor / Technician gate (§4): resolves the caller's fleet,
// requires the fleetFeatures flag, and requires the named maintenance
// capability — owners/managers always pass implicitly (see
// hasMaintenanceCapability), so this is strictly narrower than gateManages,
// not an alternative tenant boundary.
async function gateCapability(
  ctx: { user: { id: number; role: string } },
  requestedFleetId: number | null | undefined,
  capability: MaintenanceCapability,
  caseId?: number | null
) {
  const fleetId = await resolveCaseFleetId(ctx, requestedFleetId, caseId);
  await requireFleetFeature(fleetId, CAP.maintenanceCases);
  const allowed = await hasMaintenanceCapability({ fleetId, user: ctx.user, capability });
  if (!allowed) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have the capability required for this action.",
    });
  }
  return fleetId;
}

// Revision-of-a-verified-outcome gate (§17): TruckFixr staff OR this fleet's
// owner/manager. Deliberately NOT satisfiable by a bare capability grant —
// correcting an already-verified technical fact is not an ordinary
// technician action.
// Repair-shop workflow gate (Phase 1): resolves the caller's fleet, requires
// the maintenanceCases feature flag + capability grant (same as the other
// shop-staff actions), AND requires the fleet actually be a repair shop
// (fleets.isPartner) — so a non-repair-shop fleet with the maintenance
// feature enabled cannot accidentally reach triage/follow-up/return-job
// endpoints meant only for the repair-shop persona.
async function gateRepairShop(
  ctx: { user: { id: number; role: string; email?: string | null } },
  requestedFleetId: number | null | undefined,
  capability: MaintenanceCapability,
  caseId?: number | null
) {
  const fleetId = await gateCapability(ctx, requestedFleetId, capability, caseId);
  if (!(await isRepairShopFleet(fleetId))) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This workflow is only available to repair-shop accounts.",
    });
  }
  return fleetId;
}

async function gateReviseVerified(
  ctx: { user: { id: number; role: string; internalAdminRole?: string | null; email?: string | null } },
  requestedFleetId: number | null | undefined,
  caseId?: number | null
) {
  const fleetId = await resolveCaseFleetId(ctx, requestedFleetId, caseId);
  if (isStaffAdminUser(ctx.user)) return fleetId;
  await assertManagesFleet({ user: ctx.user, fleetId });
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
      const fleetId = await resolveCaseFleetId(ctx, input.fleetId, input.caseId);
      await requireFleetFeature(fleetId, CAP.maintenanceCases);
      const [caseRow, decisions, cycles, timeline, outcomes, isRepairShop, followUps] = await Promise.all([
        getCaseForFleet(fleetId, input.caseId),
        listDecisions(fleetId, input.caseId),
        listCycles(fleetId, input.caseId),
        getCaseTimeline({ fleetId, caseId: input.caseId }),
        listOutcomesForCase(fleetId, input.caseId),
        isRepairShopFleet(fleetId),
        listFollowUpsForCase(fleetId, input.caseId),
      ]);
      return { case: caseRow, decisions, cycles, timeline, outcomes, isRepairShop, followUps };
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
      const fleetId = await gateManages(ctx, input.fleetId, input.caseId);
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
      const fleetId = await gateManages(ctx, input.fleetId, input.caseId);
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
      const fleetId = await gateManages(ctx, input.fleetId, input.caseId);
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
      const fleetId = await gateManages(ctx, input.fleetId, input.caseId);
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
      const fleetId = await gateManages(ctx, input.fleetId, input.caseId);
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
      const fleetId = await gateManages(ctx, input.fleetId, input.caseId);
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
      const fleetId = await gateManages(ctx, input.fleetId, input.caseId);
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
      const fleetId = await gateManages(ctx, input.fleetId, input.caseId);
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
      const fleetId = await gateManages(ctx, input.fleetId, input.caseId);
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
      const fleetId = await gateManages(ctx, input.fleetId, input.caseId);
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

  // ---- Mr Diesel shop workflow: Service Advisor / Technician capability-
  // gated actions (§4-§10). None of these require owner/manager — a granted
  // member passes gateCapability via hasMaintenanceCapability. ------------

  // Every vehicle this shop has on file, for the "existing vehicle" picker on
  // the new-case form. Every capability-granted member sees the whole shop's
  // vehicle list — vehicles.listByFleet is scoped to a caller's own driver
  // assignments for non-owner/manager roles, which capability-granted shop
  // staff (Service Advisor / Technician) never have.
  listShopVehicles: protectedProcedure
    .input(z.object({ fleetId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const fleetId = await gateCapability(ctx, input.fleetId, MAINTENANCE_CAPABILITIES.createCase);
      return listShopVehicles({ fleetId });
    }),

  // Fast VIN-first case capture (§5/§6). Creates the vehicle record if this
  // is a new walk-in vehicle, then the case, then a lightweight "intake
  // logged" first Resolution.
  createShopCase: protectedProcedure
    .input(
      z
        .object({
          fleetId: z.number().optional(),
          caseType: caseTypeEnum,
          complaint: z.string().min(1).max(4000),
          symptoms: z.array(z.string().trim().min(1)).max(20).optional(),
          faultCodes: z.array(z.string().trim().min(1)).max(20).optional(),
          severity: severityEnum.optional(),
          // A returning customer's vehicle already on file for this shop.
          vehicleId: z.string().trim().min(1).optional(),
          // New/walk-in vehicle intake — required unless vehicleId is given.
          vehicle: z
            .object({
              vin: z.string().trim().length(17).optional(),
              unitNumber: z.string().trim().max(50).optional(),
              licensePlate: z.string().trim().max(20).optional(),
              make: z.string().trim().max(100).optional(),
              model: z.string().trim().max(100).optional(),
              year: z.number().int().min(1980).max(2100).optional(),
              engineMake: z.string().trim().max(100).optional(),
              assetType: z.enum(["tractor", "straight_truck", "trailer", "other"]).optional(),
              vinSource: z.enum(["vin_decoder", "tenant_record", "technician_input", "historical_import", "ai_extraction"]),
            })
            .optional(),
        })
        .refine((val) => Boolean(val.vehicleId) !== Boolean(val.vehicle), {
          message: "Provide either an existing vehicleId or new vehicle details, not both.",
          path: ["vehicle"],
        })
    )
    .mutation(async ({ ctx, input }) => {
      const fleetId = await gateCapability(ctx, input.fleetId, MAINTENANCE_CAPABILITIES.createCase);
      return createShopCaseService({
        fleetId,
        actorUserId: ctx.user.id,
        vehicleId: input.vehicleId,
        vehicle: input.vehicle,
        caseType: input.caseType as never,
        complaint: input.complaint,
        symptoms: input.symptoms,
        faultCodes: input.faultCodes,
        severity: input.severity as never,
      });
    }),

  // Record a Resolution (§8) — likely cause, recommended test/repair,
  // monitor, tow, etc. A Case may accumulate several of these; each becomes
  // its own maintenanceDecisions version.
  addResolution: protectedProcedure
    .input(
      z.object({
        fleetId: z.number().optional(),
        caseId: z.number(),
        severity: severityEnum,
        proposedAction: actionEnum,
        resolutionCategory: resolutionCategoryEnum,
        rationale: z.string().max(4000).optional(),
        likelyCauses: z.array(z.string()).optional(),
        immediateChecks: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const fleetId = await gateCapability(ctx, input.fleetId, MAINTENANCE_CAPABILITIES.recordResolution, input.caseId);
      return addDecision({
        fleetId,
        caseId: input.caseId,
        actorUserId: ctx.user.id,
        source: "manual",
        severity: input.severity as never,
        proposedAction: input.proposedAction as never,
        resolutionCategory: input.resolutionCategory,
        rationale: input.rationale,
        likelyCauses: input.likelyCauses,
        immediateChecks: input.immediateChecks,
      });
    }),

  // ---- Outcome lifecycle (§9/§10) ---------------------------------------
  reportOutcome: protectedProcedure
    .input(
      z.object({
        fleetId: z.number().optional(),
        caseId: z.number(),
        vehicleId: z.string().min(1),
        repairCycleId: z.number().optional(),
        confirmedFault: z.string().min(1).max(4000),
        repairPerformed: z.string().min(1).max(4000),
        partsReplaced: z.array(z.string()).optional(),
        evidenceSource: evidenceSourceEnum,
        repairNotes: z.string().max(4000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const fleetId = await gateCapability(ctx, input.fleetId, MAINTENANCE_CAPABILITIES.submitRepairOutcome, input.caseId);
      return reportOutcomeService({
        fleetId,
        caseId: input.caseId,
        vehicleId: input.vehicleId,
        repairCycleId: input.repairCycleId ?? null,
        actorUserId: ctx.user.id,
        confirmedFault: input.confirmedFault,
        repairPerformed: input.repairPerformed,
        partsReplaced: input.partsReplaced,
        evidenceSource: input.evidenceSource as never,
        repairNotes: input.repairNotes,
      });
    }),

  // Technician-only: the one action that turns a Reported outcome into a
  // Verified one (§4/§9).
  verifyOutcome: protectedProcedure
    .input(
      z.object({
        fleetId: z.number().optional(),
        outcomeId: z.number(),
        verificationMethod: verificationMethodEnum,
        verificationNotes: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const fleetId = await gateCapability(ctx, input.fleetId, MAINTENANCE_CAPABILITIES.verifyOutcome);
      return verifyOutcomeService({
        fleetId,
        outcomeId: input.outcomeId,
        actorUserId: ctx.user.id,
        verificationMethod: input.verificationMethod as never,
        verificationNotes: input.verificationNotes,
      });
    }),

  confirmOutcome: protectedProcedure
    .input(
      z.object({
        fleetId: z.number().optional(),
        outcomeId: z.number(),
        confirmationEvidenceType: confirmationEvidenceEnum,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const fleetId = await gateCapability(ctx, input.fleetId, MAINTENANCE_CAPABILITIES.confirmOutcome);
      return confirmOutcomeService({
        fleetId,
        outcomeId: input.outcomeId,
        actorUserId: ctx.user.id,
        confirmationEvidenceType: input.confirmationEvidenceType as never,
      });
    }),

  markOutcomeFailed: protectedProcedure
    .input(
      z.object({
        fleetId: z.number().optional(),
        outcomeId: z.number(),
        failureNotes: z.string().min(1).max(4000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const fleetId = await gateCapability(ctx, input.fleetId, MAINTENANCE_CAPABILITIES.submitRepairOutcome);
      return markOutcomeFailedService({
        fleetId,
        outcomeId: input.outcomeId,
        actorUserId: ctx.user.id,
        failureNotes: input.failureNotes,
      });
    }),

  // Optional downtime/financial impact (§20/§21). Never affects technical
  // evidence quality — see shared/tadis/qualityScore.ts, which has no such
  // input fields at all.
  recordOutcomeImpact: protectedProcedure
    .input(
      z.object({
        fleetId: z.number().optional(),
        outcomeId: z.number(),
        estimatedDowntimeAvoidedHours: z.number().min(0).max(10_000).optional(),
        estimatedTowAvoidedCents: z.number().int().min(0).optional(),
        estimatedRoadCallAvoidedCents: z.number().int().min(0).optional(),
        estimateSource: z.enum(ESTIMATE_SOURCES),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const fleetId = await gateCapability(ctx, input.fleetId, MAINTENANCE_CAPABILITIES.submitRepairOutcome);
      return recordOutcomeImpactService({
        fleetId,
        outcomeId: input.outcomeId,
        actorUserId: ctx.user.id,
        estimatedDowntimeAvoidedHours: input.estimatedDowntimeAvoidedHours,
        estimatedTowAvoidedCents: input.estimatedTowAvoidedCents,
        estimatedRoadCallAvoidedCents: input.estimatedRoadCallAvoidedCents,
        estimateSource: input.estimateSource,
      });
    }),

  // Correct a technical fact on an already Verified/Confirmed outcome (§17).
  // TruckFixr staff or this fleet's owner/manager only — never a bare
  // capability grant. Always creates a revision; never overwrites in place.
  reviseVerifiedOutcome: protectedProcedure
    .input(
      z.object({
        fleetId: z.number().optional(),
        outcomeId: z.number(),
        reason: z.string().min(1).max(2000),
        patch: z.object({
          confirmedFault: z.string().max(4000).optional(),
          repairPerformed: z.string().max(4000).optional(),
          confirmedFaultCode: z.string().max(64).optional(),
          systemCategory: z.string().max(64).optional(),
          componentCategory: z.string().max(64).optional(),
        }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const fleetId = await gateReviseVerified(ctx, input.fleetId);
      return reviseVerifiedOutcomeService({
        fleetId,
        outcomeId: input.outcomeId,
        actorUserId: ctx.user.id,
        reason: input.reason,
        patch: input.patch,
      });
    }),

  // Human override of the auto-suggested TADIS eligibility (§12). Owner/
  // manager of the fleet or TruckFixr staff.
  setTadisEligibilityOverride: protectedProcedure
    .input(
      z.object({
        fleetId: z.number().optional(),
        caseId: z.number(),
        eligibility: z.enum([
          "not_assessed",
          "operational_record",
          "tadis_candidate",
          "tadis_learning_record",
          "excluded",
        ]),
        reason: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const fleetId = await gateReviseVerified(ctx, input.fleetId, input.caseId);
      return setCaseTadisEligibilityOverride({
        fleetId,
        caseId: input.caseId,
        eligibility: input.eligibility,
        reason: input.reason ?? null,
        actorUserId: ctx.user.id,
      });
    }),

  // ---- Repair-shop workflow (Phase 1): adaptive diagnostic triage, repair
  // outcome, manual 3-day follow-up, and linked return jobs. Gated to
  // repair-shop fleets (fleets.isPartner) only — see gateRepairShop above. --

  // Advance the adaptive triage loop by one turn. Call with no answer to run
  // the very first turn against the complaint alone; call again with
  // `answer` to submit the technician's response to the prior turn's
  // nextDiagnosticStep and get the next one. Idempotent to resume: the full
  // evidence trail is reconstructed from persisted decisions each time.
  advanceTriage: protectedProcedure
    .input(
      z.object({
        fleetId: z.number().optional(),
        caseId: z.number(),
        answer: z.string().trim().min(1).max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const fleetId = await gateRepairShop(ctx, input.fleetId, MAINTENANCE_CAPABILITIES.submitTechnicianAssessment, input.caseId);
      return advanceShopTriage({
        fleetId,
        caseId: input.caseId,
        actorUserId: ctx.user.id,
        answerToPreviousStep: input.answer,
      });
    }),

  completeTriage: protectedProcedure
    .input(z.object({ fleetId: z.number().optional(), caseId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const fleetId = await gateRepairShop(ctx, input.fleetId, MAINTENANCE_CAPABILITIES.submitTechnicianAssessment, input.caseId);
      return completeShopTriage({ fleetId, caseId: input.caseId, actorUserId: ctx.user.id });
    }),

  startRepair: protectedProcedure
    .input(z.object({ fleetId: z.number().optional(), caseId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const fleetId = await gateRepairShop(ctx, input.fleetId, MAINTENANCE_CAPABILITIES.updateRepairStatus, input.caseId);
      return startShopRepair({ fleetId, caseId: input.caseId, actorUserId: ctx.user.id });
    }),

  // Single structured repair-outcome form (§12): actual fault found, root
  // cause (or left unconfirmed), repair performed, parts replaced ([] =
  // none), confirming test/measurement/evidence, and the shop's own
  // confidence that the issue is resolved. Moves the case to
  // awaiting_follow_up with a 3-day follow-up date.
  recordRepairOutcome: protectedProcedure
    .input(
      z.object({
        fleetId: z.number().optional(),
        caseId: z.number(),
        confirmedFault: z.string().min(1).max(4000),
        rootCause: z.string().max(2000).optional(),
        rootCauseConfirmed: z.boolean().optional(),
        repairPerformed: z.string().min(1).max(4000),
        partsReplaced: z.array(z.string().trim().min(1)).max(50).default([]),
        verificationMethod: verificationMethodEnum,
        verificationNotes: z.string().max(2000).optional(),
        evidenceSource: evidenceSourceEnum.optional(),
        shopConfidence: z.number().int().min(0).max(100),
        repairNotes: z.string().max(4000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // This single form both reports AND verifies the outcome in one call
      // (Phase 1 has one shop user) — verifying is the one capability the
      // existing outcome lifecycle deliberately reserves for a Technician
      // grant (see verifyOutcome above), so require it here too rather than
      // letting a bare submitRepairOutcome grant silently gain it.
      const fleetId = await gateRepairShop(ctx, input.fleetId, MAINTENANCE_CAPABILITIES.submitRepairOutcome, input.caseId);
      const canVerify = await hasMaintenanceCapability({
        fleetId,
        user: ctx.user,
        capability: MAINTENANCE_CAPABILITIES.verifyOutcome,
      });
      if (!canVerify) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Recording a repair outcome also verifies it — this requires the Technician verify-outcome capability.",
        });
      }
      return recordShopRepairOutcome({
        fleetId,
        caseId: input.caseId,
        actorUserId: ctx.user.id,
        confirmedFault: input.confirmedFault,
        rootCause: input.rootCause,
        rootCauseConfirmed: input.rootCauseConfirmed,
        repairPerformed: input.repairPerformed,
        partsReplaced: input.partsReplaced,
        verificationMethod: input.verificationMethod as never,
        verificationNotes: input.verificationNotes,
        evidenceSource: input.evidenceSource as never,
        shopConfidence: input.shopConfidence,
        repairNotes: input.repairNotes,
      });
    }),

  // Manual 3-day follow-up (§14): resolved / partially_resolved /
  // not_resolved / returned + an optional note. Resolved closes the case;
  // returned flags it for a linked return job (createReturnJob below).
  recordFollowUp: protectedProcedure
    .input(
      z.object({
        fleetId: z.number().optional(),
        caseId: z.number(),
        result: z.enum(FOLLOW_UP_RESULTS),
        note: z.string().max(2000).optional(),
        repairOutcomeId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const fleetId = await gateRepairShop(ctx, input.fleetId, MAINTENANCE_CAPABILITIES.submitRepairOutcome, input.caseId);
      return recordShopFollowUp({
        fleetId,
        caseId: input.caseId,
        actorUserId: ctx.user.id,
        result: input.result,
        note: input.note,
        repairOutcomeId: input.repairOutcomeId,
      });
    }),

  listFollowUps: protectedProcedure
    .input(z.object({ fleetId: z.number().optional(), caseId: z.number() }))
    .query(async ({ ctx, input }) => {
      const fleetId = await gateRepairShop(ctx, input.fleetId, MAINTENANCE_CAPABILITIES.viewAssignedCases, input.caseId);
      return listFollowUpsForCase(fleetId, input.caseId);
    }),

  // Create a new, separately-tracked case for a returned problem, linked to
  // the original via originalCaseId (§15). The original case's complaint,
  // triage, outcome, and follow-up history are never modified.
  createReturnJob: protectedProcedure
    .input(
      z.object({
        fleetId: z.number().optional(),
        originalCaseId: z.number(),
        complaint: z.string().min(1).max(4000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const fleetId = await gateRepairShop(ctx, input.fleetId, MAINTENANCE_CAPABILITIES.createCase, input.originalCaseId);
      return createReturnJob({
        fleetId,
        originalCaseId: input.originalCaseId,
        actorUserId: ctx.user.id,
        complaint: input.complaint,
      });
    }),
});
