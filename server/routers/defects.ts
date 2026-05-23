import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  analyzeDiagnostic,
  mapDiagnosticRiskToAction,
  mapDiagnosticRiskToUrgency,
} from "../services/tadisCore";
import { eq, and, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  defects,
  tadisAlerts,
  defectActions,
  vehicles,
  maintenanceLogs,
  inspectionReviewQueueItems,
} from "../../drizzle/schema";
import { canManageVehicleAccess, canViewVehicle } from "../services/vehicleAccess";
import { sendEmail } from "../services/email";
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

      const hasAccess = await verifyFleetAccess(defect.fleetId, ctx.user.id, ctx.user.role);
      if (!hasAccess && defect.driverId !== ctx.user.id) {
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

      return { defect, tadisAlert: alert ?? null };
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

      return { success: true };
    }),
});
