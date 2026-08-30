import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  analyzeDiagnostic,
  mapDiagnosticRiskToAction,
  mapDiagnosticRiskToUrgency,
} from "../services/tadisCore";
import { eq, and, desc, sql, or } from "drizzle-orm";
import { getDb } from "../db";
import {
  defects,
  tadisAlerts,
  defectActions,
  vehicles,
  maintenanceLogs,
  inspectionReviewQueueItems,
  aiTriageRecords,
  inAppAlerts,
  earlyWarningFlags,
  repairOutcomes,
} from "../../drizzle/schema";
import { canManageVehicleAccess, canViewVehicle } from "../services/vehicleAccess";
import { sendEmail } from "../services/email";
import { runDefectTriage } from "../services/aiTriage";
import { evaluateEarlyWarnings } from "../services/earlyWarning";
import {
  deriveIssueReviewSeverity,
  deriveManagerReviewRequired,
  deriveOperationalStateForDecision,
  deriveOperationalStateForSeverity,
  derivePrimaryQueueDetails,
  deriveProvisionalDriverGuidance,
  deriveReportOutcome,
  deriveUrgentDefectQueueDetails,
} from "../services/inspectionReviewWorkflow";

async function verifyFleetAccess(fleetId: number, userId: number, userRole: string): Promise<boolean> {
  return canManageVehicleAccess({
    fleetId,
    user: {
      id: userId,
      role: userRole,
    },
  });
}

const managerReviewStatusSchema = z.enum([
  "reviewed",
  "scheduled",
  "deferred",
  "resolved",
  "escalated",
]);

function mapManagerReviewStatusToDefectStatus(
  managerReviewStatus?: z.infer<typeof managerReviewStatusSchema>
) {
  switch (managerReviewStatus) {
    case "reviewed":
      return "acknowledged";
    case "scheduled":
      return "assigned";
    case "deferred":
      return "monitoring";
    case "resolved":
      return "resolved";
    case "escalated":
      return "repair_required";
    default:
      return undefined;
  }
}

function mapDefectStatusToManagerReviewStatus(status?: string | null) {
  switch (status) {
    case "acknowledged":
      return "reviewed";
    case "assigned":
      return "scheduled";
    case "monitoring":
      return "deferred";
    case "resolved":
      return "resolved";
    case "repair_required":
      return "escalated";
    default:
      return undefined;
  }
}

async function updateVehicleOperationalState(input: {
  vehicleId: number | string;
  operationalState: "active" | "blocked_pending_manager_review" | "move_for_repair_only" | "returned_to_service";
  defectId?: number | null;
  decisionByUserId?: number | null;
  instruction?: string | null;
  complianceStatus?: "green" | "yellow" | "red";
}) {
  const db = await getDb();
  if (!db) return null;

  const nextStatus =
    input.operationalState === "active" || input.operationalState === "returned_to_service"
      ? "active"
      : "maintenance";

  return db
    .update(vehicles)
    .set({
      operationalState: input.operationalState,
      operationalDecisionDefectId: input.defectId ?? null,
      operationalDecisionByUserId: input.decisionByUserId ?? null,
      operationalDecisionAt: new Date(),
      operationalInstruction: input.instruction ?? null,
      ...(input.complianceStatus ? { complianceStatus: input.complianceStatus } : {}),
      status: nextStatus,
      updatedAt: new Date(),
    })
    .where(sql`CAST(${vehicles.id} AS text) = ${String(input.vehicleId)}`);
}

function mapDefectWorkflowToDecision(status?: string | null) {
  switch (status) {
    case "resolved":
      return "return_to_service" as const;
    case "assigned":
      return "move_for_repair_only" as const;
    case "repair_required":
      return "do_not_operate" as const;
    default:
      return null;
  }
}

export const defectsRouter = router({
  reportIssue: protectedProcedure
    .input(
      z.object({
        fleetId: z.number().int().positive(),
        vehicleId: z.union([z.number(), z.string().trim().min(1)]),
        title: z.string().trim().min(1, "Issue title is required").max(255),
        description: z.string().trim().optional(),
        category: z.string().trim().optional(),
        severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
        photoUrls: z.array(z.string().min(1)).default([]),
        localDraftId: z.string().trim().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      const hasAccess = await canViewVehicle({
        user: ctx.user,
        vehicleId: input.vehicleId,
        fleetId: input.fleetId,
      });
      if (!hasAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to report issues for this asset",
        });
      }

      const complianceStatus =
        input.severity === "critical" || input.severity === "high"
          ? "red"
          : input.severity === "medium"
            ? "yellow"
            : "green";
      const now = new Date();
      const normalizedVehicleId = String(input.vehicleId);
      const normalizedDraftId = input.localDraftId?.trim() || null;
      const highestSeverity = deriveIssueReviewSeverity(input.severity);
      const reportOutcome = deriveReportOutcome(highestSeverity);
      const managerReviewRequired = deriveManagerReviewRequired(highestSeverity);
      const provisionalDriverGuidance = deriveProvisionalDriverGuidance(highestSeverity);
      const primaryQueue = derivePrimaryQueueDetails(highestSeverity);
      const urgentQueue = deriveUrgentDefectQueueDetails(highestSeverity);

      if (normalizedDraftId) {
        const [existingDefect] = await db
          .select({
            id: defects.id,
            status: defects.status,
            complianceStatus: defects.complianceStatus,
          })
          .from(defects)
          .where(
            and(
              eq(defects.fleetId, input.fleetId),
              eq(defects.driverId, ctx.user.id),
              eq(defects.vehicleId, normalizedVehicleId),
              eq(defects.clientDraftId, normalizedDraftId)
            )
          )
          .limit(1);

        if (existingDefect) {
          return {
            success: true,
            defectId: existingDefect.id,
            status: existingDefect.status,
            complianceStatus: existingDefect.complianceStatus,
          };
        }
      }

      const [defect] = await db
        .insert(defects)
        .values({
          fleetId: input.fleetId,
          vehicleId: normalizedVehicleId,
          driverId: ctx.user.id,
          clientDraftId: normalizedDraftId,
          title: input.title,
          description: input.description ?? null,
          category: input.category ?? "driver_reported_issue",
          severity: input.severity as any,
          complianceStatus,
          status: input.severity === "critical" ? "repair_required" : "open",
          managerReviewStatus: "submitted",
          managerReviewStatusUpdatedAt: now,
          isBlockingOperationally: highestSeverity === "major" || highestSeverity === "unsafe",
          photoUrls: input.photoUrls,
          updatedAt: now,
        })
        .returning();

      await db
        .update(vehicles)
        .set({
          complianceStatus,
          status: complianceStatus === "red" ? "maintenance" : "active",
          updatedAt: now,
        })
        .where(sql`CAST(${vehicles.id} AS text) = ${normalizedVehicleId}`);

      if (primaryQueue) {
        const [primaryQueueItem] = await db
          .insert(inspectionReviewQueueItems)
          .values({
            fleetId: input.fleetId,
            defectId: defect.id,
            vehicleId: normalizedVehicleId,
            queueType: primaryQueue.queueType,
            status: "new",
            headlineStatus: primaryQueue.headlineStatus,
            priority: primaryQueue.priority,
            highestSeverity,
            managerDecisionRequired: primaryQueue.managerDecisionRequired,
            requiresDriverInstruction: primaryQueue.requiresDriverInstruction,
            provisionalGuidanceSnapshot: provisionalDriverGuidance,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: inspectionReviewQueueItems.id });

        if (urgentQueue) {
          await db.insert(inspectionReviewQueueItems).values({
            fleetId: input.fleetId,
            defectId: defect.id,
            vehicleId: normalizedVehicleId,
            parentQueueItemId: primaryQueueItem?.id ?? null,
            queueType: urgentQueue.queueType,
            status: "new",
            headlineStatus: urgentQueue.headlineStatus,
            priority: urgentQueue.priority,
            highestSeverity,
            managerDecisionRequired: urgentQueue.managerDecisionRequired,
            requiresDriverInstruction: urgentQueue.requiresDriverInstruction,
            provisionalGuidanceSnapshot: provisionalDriverGuidance,
            createdAt: now,
            updatedAt: now,
          });
        }
      }

      if (managerReviewRequired) {
        await updateVehicleOperationalState({
          vehicleId: normalizedVehicleId,
          operationalState: deriveOperationalStateForSeverity(highestSeverity),
          defectId: defect.id,
          instruction: provisionalDriverGuidance,
          complianceStatus,
        });
      }

      await db.insert(tadisAlerts).values({
        fleetId: input.fleetId,
        defectId: defect.id,
        urgency: input.severity === "critical" || input.severity === "high" ? "Critical" : "Attention",
        recommendedAction: input.severity === "critical" ? "Stop Now" : "Inspect Soon",
        likelyCause: input.title,
        reasoning: JSON.stringify({
          source: "driver_mode_issue_report",
          description: input.description ?? "",
          severity: input.severity,
          localDraftId: input.localDraftId ?? null,
        }),
      });

      await db.execute(sql`
        INSERT INTO "inAppAlerts" (
          "fleetId", "vehicleId", "defectId", "alertType", "severity", "title", "message", "createdAt", "updatedAt"
        )
        VALUES (
          ${input.fleetId},
          ${normalizedVehicleId},
          ${defect.id},
          ${input.severity === "critical" ? "critical_defect_reported" : "driver_issue_submitted"},
          ${input.severity === "critical" ? "critical" : "warning"},
          ${input.severity === "critical" ? "Critical driver issue reported" : "Driver issue reported"},
          ${`${ctx.user.name || "A driver"} reported ${input.title}.`},
          ${now},
          ${now}
        )
      `);

      if (input.severity === "critical" && ctx.user.managerEmail) {
        sendEmail({
          to: [ctx.user.managerEmail],
          subject: `TruckFixr critical driver issue - ${input.title}`,
          text: `${ctx.user.name || "A driver"} reported a critical issue.\n\nAsset: ${input.vehicleId}\nIssue: ${input.title}\nNotes: ${input.description ?? "None"}\n\nReview this in TruckFixr before dispatch.`,
          html: `<p><strong>${ctx.user.name || "A driver"} reported a critical issue.</strong></p><p>Asset: ${input.vehicleId}</p><p>Issue: ${input.title}</p><p>Notes: ${input.description ?? "None"}</p><p>Review this in TruckFixr before dispatch.</p>`,
        }).catch((error) => {
          console.warn("[Defects] Unable to send critical driver issue email:", error);
        });
      }

      console.log("[Analytics] Driver issue submitted:", {
        defectId: defect.id,
        vehicleId: input.vehicleId,
        fleetId: input.fleetId,
        severity: input.severity,
        userId: ctx.user.id,
      });

      await evaluateEarlyWarnings({ fleetId: input.fleetId, vehicleId: normalizedVehicleId });

      return {
        success: true,
        defectId: defect.id,
        status: defect.status,
        complianceStatus,
        reportOutcome,
        managerReviewRequired,
        provisionalDriverGuidance,
      };
    }),

  // Driver-scoped feed of the issues this driver reported (manual reports and
  // AI-triage-filed issues), newest first. Powers the driver dashboard "Recent
  // activity" feed alongside submitted inspections. Distinct from listByVehicle
  // (single vehicle) and listByFleet (manager view).
  listMyRecent: protectedProcedure
    .input(z.object({ limit: z.number().int().positive().max(25).default(10) }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];

      const rows = await db
        .select({
          id: defects.id,
          vehicleId: defects.vehicleId,
          title: defects.title,
          category: defects.category,
          severity: defects.severity,
          status: defects.status,
          sourceType: defects.sourceType,
          aiConfidenceScore: defects.aiConfidenceScore,
          createdAt: defects.createdAt,
        })
        .from(defects)
        .where(eq(defects.driverId, ctx.user.id))
        .orderBy(desc(defects.createdAt))
        .limit(input.limit);

      const vehicleIds = Array.from(new Set(rows.map((row) => String(row.vehicleId))));
      const vehicleRows =
        vehicleIds.length > 0
          ? await db
              .select()
              .from(vehicles)
              .where(or(...vehicleIds.map((vehicleId) => sql`CAST(${vehicles.id} AS text) = ${vehicleId}`)))
          : [];
      const vehicleMap = new Map(vehicleRows.map((vehicle) => [String(vehicle.id), vehicle]));

      return rows.map((row) => {
        const vehicle = vehicleMap.get(String(row.vehicleId));
        return {
          ...row,
          vehicleLabel:
            vehicle?.unitNumber || vehicle?.licensePlate || vehicle?.vin || String(row.vehicleId),
        };
      });
    }),

  create: protectedProcedure
    .input(
      z.object({
        fleetId: z.number(),
        vehicleId: z.union([z.number(), z.string().trim().min(1)]),
        inspectionId: z.number().optional(),
        title: z.string().min(1, "Defect title is required"),
        description: z.string().optional(),
        category: z.string().optional(),
        photoUrls: z.array(z.string()).optional(),
        symptoms: z.array(z.string()),
        faultCodes: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role === "driver") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Drivers cannot directly create defects",
        });
      }

      const hasAccess = await verifyFleetAccess(input.fleetId, ctx.user.id, ctx.user.role);
      if (!hasAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this fleet",
        });
      }

      try {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Database not available",
          });
        }

        const tadisResult = await analyzeDiagnostic({
          symptoms: input.symptoms,
          faultCodes: input.faultCodes ?? [],
          vehicleId: input.vehicleId,
          driverNotes: input.description,
        });

        const [defect] = await db
          .insert(defects)
          .values({
            fleetId: input.fleetId,
            vehicleId: String(input.vehicleId),
            inspectionId: input.inspectionId ?? null,
            driverId: ctx.user.id,
            title: input.title,
            description: input.description ?? null,
            category: input.category ?? null,
            sourceType: input.inspectionId ? "inspection" : "manual_report",
            sourceRecordId: input.inspectionId ? String(input.inspectionId) : null,
            symptoms: input.symptoms ?? null,
            faultCodes: input.faultCodes ?? null,
            photoUrls: input.photoUrls ?? null,
            status: "open",
          })
          .returning();

        const [alert] = await db
          .insert(tadisAlerts)
          .values({
            fleetId: input.fleetId,
            defectId: defect.id,
            urgency: mapDiagnosticRiskToUrgency(tadisResult.risk_level),
            recommendedAction: mapDiagnosticRiskToAction(tadisResult.risk_level),
            likelyCause: tadisResult.possible_causes[0]?.cause ?? input.title,
            reasoning: JSON.stringify(tadisResult),
          })
          .returning();

        console.log('[Analytics] Defect created:', { defectId: defect.id, title: input.title, category: input.category, vehicleId: input.vehicleId, fleetId: input.fleetId, userId: ctx.user.id });

        await evaluateEarlyWarnings({ fleetId: input.fleetId, vehicleId: String(input.vehicleId) });

        return {
          defectId: defect.id,
          title: defect.title,
          description: defect.description,
          category: defect.category,
          photoUrls: defect.photoUrls,
          status: defect.status,
          tadisAlert: {
            id: alert.id,
            urgency: alert.urgency,
            recommendedAction: alert.recommendedAction,
            likelyCause: alert.likelyCause,
            reasoning: alert.reasoning,
            confidence: tadisResult.confidence_score / 100,
            nextSteps: tadisResult.recommended_tests,
          },
          createdAt: defect.createdAt,
        };
      } catch (error) {
        console.error("Failed to create defect:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create defect and run analysis",
        });
      }
    }),

  getById: protectedProcedure
    .input(z.object({ defectId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return null;

      const [defect] = await db
        .select()
        .from(defects)
        .where(eq(defects.id, input.defectId))
        .limit(1);

      if (!defect) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Defect not found",
        });
      }

      const hasAccess = await canViewVehicle({
        user: ctx.user,
        vehicleId: defect.vehicleId,
        fleetId: defect.fleetId,
      });
      if (!hasAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this defect",
        });
      }

      const [alert] = await db
        .select()
        .from(tadisAlerts)
        .where(eq(tadisAlerts.defectId, input.defectId))
        .limit(1);

      const [latestTriage] = await db
        .select()
        .from(aiTriageRecords)
        .where(eq(aiTriageRecords.defectId, input.defectId))
        .orderBy(desc(aiTriageRecords.createdAt))
        .limit(1);

      const decisions = await db
        .select()
        .from(defectActions)
        .where(eq(defectActions.defectId, input.defectId))
        .orderBy(desc(defectActions.createdAt));

      const repairHistory = await db
        .select()
        .from(repairOutcomes)
        .where(eq(repairOutcomes.defectId, input.defectId))
        .orderBy(desc(repairOutcomes.createdAt));

      const maintenance = await db
        .select()
        .from(maintenanceLogs)
        .where(eq(maintenanceLogs.defectId, input.defectId))
        .orderBy(desc(maintenanceLogs.createdAt));

      const earlyWarnings = await db
        .select()
        .from(earlyWarningFlags)
        .where(
          and(
            eq(earlyWarningFlags.vehicleId, defect.vehicleId),
            eq(earlyWarningFlags.isActive, true)
          )
        )
        .orderBy(desc(earlyWarningFlags.createdAt));

      return {
        defect,
        tadisAlert: alert ?? null,
        latestTriage: latestTriage ?? null,
        decisions,
        repairHistory,
        maintenance,
        earlyWarnings,
      };
    }),

  listByVehicle: protectedProcedure
    .input(z.object({ vehicleId: z.union([z.number(), z.string().trim().min(1)]), status: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];

      const [vehicle] = await db
        .select()
        .from(vehicles)
        .where(sql`CAST(${vehicles.id} AS text) = ${String(input.vehicleId)}`)
        .limit(1);

      if (!vehicle) return [];

      const hasAccess = await canViewVehicle({
        user: ctx.user,
        vehicleId: input.vehicleId,
        fleetId: vehicle.fleetId,
      });
      if (!hasAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this vehicle",
        });
      }

      const conditions = [eq(defects.vehicleId, String(input.vehicleId))];
      if (input.status) {
        conditions.push(eq(defects.status, input.status as any));
      }

      return await db.select().from(defects).where(and(...conditions));
    }),

  listByFleet: protectedProcedure
    .input(z.object({ fleetId: z.number(), urgency: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const hasAccess = await verifyFleetAccess(input.fleetId, ctx.user.id, ctx.user.role);
      if (!hasAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this fleet",
        });
      }

      const db = await getDb();
      if (!db) return [];

      const conditions = [eq(defects.fleetId, input.fleetId)];
      
      return await db.select().from(defects).where(and(...conditions));
    }),

  updateStatus: protectedProcedure
    .input(
      z.object({
        defectId: z.number(),
        status: z
          .enum([
            "open",
            "acknowledged",
            "assigned",
            "monitoring",
            "repair_required",
            "resolved",
            "dismissed",
          ])
          .optional(),
        managerReviewStatus: managerReviewStatusSchema.optional(),
        notes: z.string().optional(),
        assignedTo: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "owner" && ctx.user.role !== "manager") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only managers can update defect status",
        });
      }

      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      const [existing] = await db
        .select()
        .from(defects)
        .where(eq(defects.id, input.defectId))
        .limit(1);

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Defect not found",
        });
      }

      const hasAccess = await verifyFleetAccess(existing.fleetId, ctx.user.id, ctx.user.role);
      if (!hasAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this fleet",
        });
      }

      const now = new Date();
      const nextStatus =
        input.status ?? mapManagerReviewStatusToDefectStatus(input.managerReviewStatus) ?? existing.status;
      const nextManagerReviewStatus =
        input.managerReviewStatus ??
        mapDefectStatusToManagerReviewStatus(input.status) ??
        existing.managerReviewStatus ??
        "submitted";
      const shouldRefreshManagerReviewTimestamp =
        nextManagerReviewStatus !== (existing.managerReviewStatus ?? "submitted");
      const workflowDecision = mapDefectWorkflowToDecision(nextStatus);

      await db
        .update(defects)
        .set({
          status: nextStatus as any,
          managerReviewStatus: nextManagerReviewStatus,
          managerReviewStatusUpdatedAt: shouldRefreshManagerReviewTimestamp
            ? now
            : existing.managerReviewStatusUpdatedAt,
          latestManagerDecision: workflowDecision,
          latestManagerActionByUserId: ctx.user.id,
          latestManagerActionAt: now,
          updatedAt: now,
        })
        .where(eq(defects.id, input.defectId));

      await db
        .update(inspectionReviewQueueItems)
        .set({
          status: nextStatus === "resolved" ? "reviewed" : "new",
          headlineStatus:
            nextStatus === "resolved"
              ? "reviewed"
              : nextStatus === "repair_required"
                ? "urgent"
                : "review_needed",
          latestManagerDecision: workflowDecision,
          latestInternalNote: input.notes ?? null,
          reviewedAt: nextStatus === "resolved" ? now : null,
          reviewedByUserId: nextStatus === "resolved" ? ctx.user.id : null,
          updatedAt: now,
        })
        .where(eq(inspectionReviewQueueItems.defectId, input.defectId));

      if (workflowDecision) {
        await updateVehicleOperationalState({
          vehicleId: existing.vehicleId,
          operationalState: deriveOperationalStateForDecision(workflowDecision),
          defectId: input.defectId,
          decisionByUserId: ctx.user.id,
          instruction: input.notes ?? existing.latestDriverInstruction ?? null,
          complianceStatus: existing.complianceStatus,
        });
      }

      if (input.notes || input.assignedTo || input.managerReviewStatus) {
        await db
          .insert(defectActions)
          .values({
            defectId: input.defectId,
            managerId: ctx.user.id,
            actionType: input.assignedTo
              ? "assign"
              : nextStatus === "resolved"
                ? "resolve"
                : input.managerReviewStatus === "reviewed"
                  ? "acknowledge"
                  : "comment",
            notes:
              input.notes ??
              (input.managerReviewStatus
                ? `Manager review status changed to ${input.managerReviewStatus}.`
                : null),
            assignedTo: input.assignedTo ?? null,
          });
      }

      console.log('[Analytics] Defect status updated:', {
        defectId: input.defectId,
        status: nextStatus,
        managerReviewStatus: nextManagerReviewStatus,
        userId: ctx.user.id,
      });

      await evaluateEarlyWarnings({ fleetId: existing.fleetId, vehicleId: existing.vehicleId });

      return { success: true };
    }),

  resolve: protectedProcedure
    .input(
      z.object({
        defectId: z.number(),
        resolutionNotes: z.string(),
        cost: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "owner" && ctx.user.role !== "manager") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only managers can resolve defects",
        });
      }

      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      const [existing] = await db
        .select()
        .from(defects)
        .where(eq(defects.id, input.defectId))
        .limit(1);

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Defect not found",
        });
      }

      const hasAccess = await verifyFleetAccess(existing.fleetId, ctx.user.id, ctx.user.role);
      if (!hasAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this fleet",
        });
      }

      await db
        .update(defects)
        .set({
          status: "resolved",
          managerReviewStatus: "resolved",
          managerReviewStatusUpdatedAt: new Date(),
          latestManagerDecision: "return_to_service",
          latestDriverInstruction: input.resolutionNotes,
          latestManagerActionByUserId: ctx.user.id,
          latestManagerActionAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(defects.id, input.defectId));

      await db
        .update(inspectionReviewQueueItems)
        .set({
          status: "reviewed",
          headlineStatus: "reviewed",
          latestManagerDecision: "return_to_service",
          latestDriverInstruction: input.resolutionNotes,
          reviewedAt: new Date(),
          reviewedByUserId: ctx.user.id,
          updatedAt: new Date(),
        })
        .where(eq(inspectionReviewQueueItems.defectId, input.defectId));

      await updateVehicleOperationalState({
        vehicleId: existing.vehicleId,
        operationalState: "returned_to_service",
        defectId: input.defectId,
        decisionByUserId: ctx.user.id,
        instruction: input.resolutionNotes,
        complianceStatus: existing.complianceStatus,
      });

      await db
        .insert(maintenanceLogs)
        .values({
          fleetId: existing.fleetId,
          vehicleId: existing.vehicleId,
          defectId: input.defectId,
          type: "repair",
          description: input.resolutionNotes,
          cost: input.cost ? String(input.cost) : null,
        });

      await db
        .insert(defectActions)
        .values({
          defectId: input.defectId,
          managerId: ctx.user.id,
          actionType: "resolve",
          notes: input.resolutionNotes,
        });

      console.log('[Analytics] Defect resolved:', { defectId: input.defectId, userId: ctx.user.id });

      await db.insert(inAppAlerts).values({
        fleetId: existing.fleetId,
        vehicleId: existing.vehicleId,
        defectId: input.defectId,
        alertType: "repair_completed",
        severity: "info",
        title: "Repair completed",
        message: `${existing.title} was resolved by ${ctx.user.name || "a manager"}.`,
      });

      // Resolving an issue clears its active early-warning flags and may close
      // recurrence-style warnings for the vehicle.
      await evaluateEarlyWarnings({ fleetId: existing.fleetId, vehicleId: existing.vehicleId });

      return { success: true };
    }),

  // Manual AI triage. V1.0 does NOT auto-run triage for manually reported or
  // diagnostic-sourced issues (cost control + manager oversight); a manager
  // explicitly triggers it after reviewing the issue. The inspection submit
  // flow keeps its own auto-triage.
  runTriage: protectedProcedure
    .input(z.object({ defectId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      const [defect] = await db
        .select()
        .from(defects)
        .where(eq(defects.id, input.defectId))
        .limit(1);

      if (!defect) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Defect not found" });
      }

      // Managers/owners can triage any defect in a fleet they can access. The
      // reporting driver can also triage their own filed issue — this powers the
      // driver "Report a Problem" flow, which files the issue and then runs AI
      // triage on it in one action.
      const isManager = ctx.user.role === "owner" || ctx.user.role === "manager";
      const isReportingDriver = defect.driverId === ctx.user.id;
      if (!isManager && !isReportingDriver) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to run AI triage for this issue",
        });
      }
      if (isManager) {
        const hasAccess = await verifyFleetAccess(defect.fleetId, ctx.user.id, ctx.user.role);
        if (!hasAccess) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You do not have access to this defect",
          });
        }
      }

      const [vehicle] = await db
        .select()
        .from(vehicles)
        .where(sql`CAST(${vehicles.id} AS text) = ${String(defect.vehicleId)}`)
        .limit(1);

      const symptoms = Array.isArray(defect.symptoms)
        ? (defect.symptoms as string[])
        : undefined;
      const faultCodes = Array.isArray(defect.faultCodes)
        ? (defect.faultCodes as string[])
        : undefined;

      const triage = await runDefectTriage({
        vehicleId: defect.vehicleId,
        vehicle: {
          id: vehicle?.id ?? defect.vehicleId,
          vin: vehicle?.vin,
          make: vehicle?.make,
          model: vehicle?.model,
          year: vehicle?.year,
        },
        defectDescription: defect.description || defect.title,
        category: defect.category,
        severity: defect.severity ?? "medium",
        symptoms,
        faultCodes,
        driverNotes: defect.description,
      });

      const now = new Date();
      const [triageRecord] = await db
        .insert(aiTriageRecords)
        .values({
          fleetId: defect.fleetId,
          vehicleId: defect.vehicleId,
          inspectionId: defect.inspectionId ?? null,
          defectId: defect.id,
          mostLikelyCause: triage.most_likely_cause,
          severity: triage.severity,
          confidenceScore: triage.confidence_score,
          recommendedAction: triage.recommended_action,
          driverMessage: triage.driver_message,
          managerSummary: triage.manager_summary,
          clarifyingQuestions: triage.clarifying_questions,
          safetyWarning: triage.safety_warning,
          suggestedNextSteps: triage.suggested_next_steps,
          rawResult: triage.raw,
        })
        .returning();

      await db
        .update(defects)
        .set({
          aiRecommendation: triage.recommended_action,
          aiConfidenceScore: triage.confidence_score,
          aiSummary: triage.manager_summary,
          updatedAt: now,
        })
        .where(eq(defects.id, defect.id));

      await db.insert(inAppAlerts).values({
        fleetId: defect.fleetId,
        vehicleId: defect.vehicleId,
        defectId: defect.id,
        alertType: "ai_triage_completed",
        severity:
          triage.severity === "critical" || triage.recommended_action === "do_not_operate"
            ? "critical"
            : "info",
        title: "AI triage completed",
        message: `${defect.title}: ${triage.recommended_action} (confidence ${triage.confidence_score}%).`,
      });

      console.log("[Analytics] Manual AI triage run:", {
        defectId: defect.id,
        recommendedAction: triage.recommended_action,
        confidence: triage.confidence_score,
        userId: ctx.user.id,
      });

      return { success: true, triage: { ...triage, id: triageRecord.id } };
    }),

  // Enhanced triage: driver answers clarifying questions to build confidence.
  // Re-runs AI triage with driver answers, returns final diagnosis when
  // confidence >= 85%. If still low, asks more questions. Always routes to
  // manager for review before final action.
  submitClarifyingAnswers: protectedProcedure
    .input(
      z.object({
        defectId: z.number(),
        answers: z.array(
          z.object({
            question: z.string(),
            answer: z.string().trim().min(1),
          })
        ),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      const [defect] = await db
        .select()
        .from(defects)
        .where(eq(defects.id, input.defectId))
        .limit(1);

      if (!defect) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Defect not found" });
      }

      // Only the reporting driver can submit clarifying answers
      if (defect.driverId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only answer clarifying questions for your own report",
        });
      }

      const [vehicle] = await db
        .select()
        .from(vehicles)
        .where(sql`CAST(${vehicles.id} AS text) = ${String(defect.vehicleId)}`)
        .limit(1);

      const symptoms = Array.isArray(defect.symptoms)
        ? (defect.symptoms as string[])
        : undefined;
      const faultCodes = Array.isArray(defect.faultCodes)
        ? (defect.faultCodes as string[])
        : undefined;

      // Build enhanced driver notes with clarifying answers
      const answerText = input.answers
        .map((a) => `Q: ${a.question}\nA: ${a.answer}`)
        .join("\n\n");
      const enhancedNotes =
        (defect.description || "") +
        (answerText ? `\n\nAdditional details from driver follow-up:\n${answerText}` : "");

      // Re-run triage with enhanced context
      const triage = await runDefectTriage({
        vehicleId: defect.vehicleId,
        vehicle: {
          id: vehicle?.id ?? defect.vehicleId,
          vin: vehicle?.vin,
          make: vehicle?.make,
          model: vehicle?.model,
          year: vehicle?.year,
        },
        defectDescription: defect.description || defect.title,
        category: defect.category,
        severity: defect.severity ?? "medium",
        symptoms,
        faultCodes,
        driverNotes: enhancedNotes,
      });

      const now = new Date();
      const [triageRecord] = await db
        .insert(aiTriageRecords)
        .values({
          fleetId: defect.fleetId,
          vehicleId: defect.vehicleId,
          inspectionId: defect.inspectionId ?? null,
          defectId: defect.id,
          mostLikelyCause: triage.most_likely_cause,
          severity: triage.severity,
          confidenceScore: triage.confidence_score,
          recommendedAction: triage.recommended_action,
          driverMessage: triage.driver_message,
          managerSummary: triage.manager_summary,
          clarifyingQuestions: triage.clarifying_questions,
          safetyWarning: triage.safety_warning,
          suggestedNextSteps: triage.suggested_next_steps,
          rawResult: triage.raw,
        })
        .returning();

      // Update defect with latest triage results
      await db
        .update(defects)
        .set({
          aiRecommendation: triage.recommended_action,
          aiConfidenceScore: triage.confidence_score,
          aiSummary: triage.manager_summary,
          updatedAt: now,
        })
        .where(eq(defects.id, defect.id));

      // If confidence >= 85%, create manager alert for review + approval
      if (triage.confidence_score >= 85) {
        const fleetManagers = await db
          .select()
          .from(defectActions)
          .where(eq(defectActions.defectId, defect.id))
          .limit(1);

        // Create in-app alert for managers to review this issue
        await db.insert(inAppAlerts).values({
          fleetId: defect.fleetId,
          defectId: defect.id,
          title: `Driver Follow-up: ${defect.title}`,
          message: `Driver answered follow-up questions. TruckFixr confidence is now ${triage.confidence_score}%. Recommends: ${triage.recommended_action}. Review and approve before action.`,
          alertType: "defect_update",
          severity:
            defect.severity === "critical"
              ? "critical"
              : defect.severity === "high"
                ? "high"
                : "medium",
          createdAt: now,
        });
      }

      return {
        success: true,
        triage: { ...triage, id: triageRecord.id },
        confidenceMetTarget: triage.confidence_score >= 85,
        stillNeedsManagerReview: true,
      };
    }),

  // Manager decision using the V1.0 decision vocabulary. Maps each decision to
  // the existing defect status workflow + operational state, records the
  // decision, and re-evaluates early warnings.
  recordDecision: protectedProcedure
    .input(
      z.object({
        defectId: z.number(),
        decision: z.enum([
          "monitor",
          "schedule_repair",
          "pull_from_service",
          "emergency_attention",
          "dismiss_no_action",
        ]),
        notes: z.string().trim().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "owner" && ctx.user.role !== "manager") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only managers can record decisions",
        });
      }

      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      const [existing] = await db
        .select()
        .from(defects)
        .where(eq(defects.id, input.defectId))
        .limit(1);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Defect not found" });
      }

      const hasAccess = await verifyFleetAccess(existing.fleetId, ctx.user.id, ctx.user.role);
      if (!hasAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this defect",
        });
      }

      const statusByDecision = {
        monitor: "monitoring",
        schedule_repair: "assigned",
        pull_from_service: "repair_required",
        emergency_attention: "repair_required",
        dismiss_no_action: "dismissed",
      } as const;
      const actionTypeByDecision = {
        monitor: "comment",
        schedule_repair: "assign",
        pull_from_service: "assign",
        emergency_attention: "assign",
        dismiss_no_action: "resolve",
      } as const;

      const now = new Date();
      const nextStatus = statusByDecision[input.decision];
      const workflowDecision = mapDefectWorkflowToDecision(nextStatus);
      const isEmergency = input.decision === "emergency_attention";
      const isDismiss = input.decision === "dismiss_no_action";

      await db
        .update(defects)
        .set({
          status: nextStatus as any,
          recommendedAction: input.decision,
          latestManagerDecision: workflowDecision,
          latestDriverInstruction: input.notes ?? existing.latestDriverInstruction ?? null,
          latestManagerActionByUserId: ctx.user.id,
          latestManagerActionAt: now,
          closedAt: isDismiss ? now : existing.closedAt,
          ...(isEmergency ? { complianceStatus: "red" as const } : {}),
          updatedAt: now,
        })
        .where(eq(defects.id, input.defectId));

      if (workflowDecision) {
        await updateVehicleOperationalState({
          vehicleId: existing.vehicleId,
          operationalState: deriveOperationalStateForDecision(workflowDecision),
          defectId: input.defectId,
          decisionByUserId: ctx.user.id,
          instruction: input.notes ?? existing.latestDriverInstruction ?? null,
          complianceStatus: isEmergency ? "red" : existing.complianceStatus,
        });
      }

      await db.insert(defectActions).values({
        defectId: input.defectId,
        managerId: ctx.user.id,
        actionType: actionTypeByDecision[input.decision],
        notes:
          input.notes ??
          `Manager decision: ${input.decision.replace(/_/g, " ")}.`,
      });

      const decisionAlert =
        input.decision === "emergency_attention"
          ? { alertType: "emergency_attention", severity: "critical", title: "Issue marked as emergency" }
          : input.decision === "schedule_repair"
            ? { alertType: "repair_scheduled", severity: "info", title: "Repair scheduled" }
            : input.decision === "dismiss_no_action"
              ? { alertType: "issue_closed", severity: "info", title: "Issue closed" }
              : null;
      if (decisionAlert) {
        await db.insert(inAppAlerts).values({
          fleetId: existing.fleetId,
          vehicleId: existing.vehicleId,
          defectId: input.defectId,
          alertType: decisionAlert.alertType,
          severity: decisionAlert.severity,
          title: decisionAlert.title,
          message: `${existing.title} — ${decisionAlert.title.toLowerCase()} by ${ctx.user.name || "a manager"}.`,
        });
      }

      await evaluateEarlyWarnings({ fleetId: existing.fleetId, vehicleId: existing.vehicleId });

      console.log("[Analytics] Manager decision recorded:", {
        defectId: input.defectId,
        decision: input.decision,
        status: nextStatus,
        userId: ctx.user.id,
      });

      return { success: true, decision: input.decision, status: nextStatus };
    }),

  // Active early-warning flags for a fleet (Fleet Dashboard warning cards).
  listEarlyWarnings: protectedProcedure
    .input(z.object({ fleetId: z.number() }))
    .query(async ({ input, ctx }) => {
      const hasAccess = await verifyFleetAccess(input.fleetId, ctx.user.id, ctx.user.role);
      if (!hasAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this fleet",
        });
      }

      const db = await getDb();
      if (!db) return [];

      const warnings = await db
        .select()
        .from(earlyWarningFlags)
        .where(
          and(
            eq(earlyWarningFlags.fleetId, input.fleetId),
            eq(earlyWarningFlags.isActive, true)
          )
        )
        .orderBy(desc(earlyWarningFlags.createdAt));

      const fleetVehicles = await db
        .select()
        .from(vehicles)
        .where(eq(vehicles.fleetId, input.fleetId));
      const vehicleById = new Map(fleetVehicles.map((v) => [String(v.id), v]));

      return warnings.map((warning) => {
        const vehicle = vehicleById.get(String(warning.vehicleId));
        return {
          ...warning,
          vehicleLabel:
            vehicle?.unitNumber || vehicle?.licensePlate || vehicle?.vin || String(warning.vehicleId),
        };
      });
    }),

  // Aggregated issue/warning/repair view for a single vehicle (Vehicle Profile).
  getVehicleOverview: protectedProcedure
    .input(z.object({ vehicleId: z.union([z.number(), z.string().trim().min(1)]) }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      }

      const normalizedVehicleId = String(input.vehicleId);
      const [vehicle] = await db
        .select()
        .from(vehicles)
        .where(sql`CAST(${vehicles.id} AS text) = ${normalizedVehicleId}`)
        .limit(1);
      if (!vehicle) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Vehicle not found" });
      }

      const hasAccess = await canViewVehicle({
        user: ctx.user,
        vehicleId: input.vehicleId,
        fleetId: vehicle.fleetId,
      });
      if (!hasAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this vehicle",
        });
      }

      const allIssues = await db
        .select()
        .from(defects)
        .where(eq(defects.vehicleId, normalizedVehicleId))
        .orderBy(desc(defects.createdAt));

      const activeWarnings = await db
        .select()
        .from(earlyWarningFlags)
        .where(
          and(
            eq(earlyWarningFlags.vehicleId, normalizedVehicleId),
            eq(earlyWarningFlags.isActive, true)
          )
        )
        .orderBy(desc(earlyWarningFlags.createdAt));

      const [latestTriage] = await db
        .select()
        .from(aiTriageRecords)
        .where(eq(aiTriageRecords.vehicleId, normalizedVehicleId))
        .orderBy(desc(aiTriageRecords.createdAt))
        .limit(1);

      const repairHistory = await db
        .select()
        .from(repairOutcomes)
        .where(eq(repairOutcomes.vehicleId, normalizedVehicleId))
        .orderBy(desc(repairOutcomes.createdAt));

      const maintenance = await db
        .select()
        .from(maintenanceLogs)
        .where(eq(maintenanceLogs.vehicleId, normalizedVehicleId))
        .orderBy(desc(maintenanceLogs.createdAt));

      const openStatuses = new Set([
        "open",
        "acknowledged",
        "assigned",
        "monitoring",
        "repair_required",
      ]);

      return {
        vehicle,
        openIssues: allIssues.filter((issue) => openStatuses.has(issue.status ?? "open")),
        allIssues,
        activeWarnings,
        latestTriage: latestTriage ?? null,
        repairHistory,
        maintenance,
      };
    }),
});
