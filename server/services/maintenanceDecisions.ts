import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { maintenanceCases, maintenanceDecisions } from "../../drizzle/schema";
import {
  approvalRequirementFor,
  isCriticalAction,
  type MaintenanceAction,
  type MaintenanceSeverity,
} from "@shared/maintenance/caseWorkflow";
import { logMaintenanceActivity } from "./maintenanceActivityLog";

interface AddDecisionInput {
  fleetId: number;
  caseId: number;
  actorUserId: number;
  source: "ai" | "manual";
  severity: MaintenanceSeverity;
  proposedAction: MaintenanceAction;
  finalAction?: MaintenanceAction | null;
  originalRecommendation?: unknown;
  rationale?: string | null;
  confidence?: number | null;
  likelyCauses?: string[] | null;
  immediateChecks?: string[] | null;
  evidence?: unknown;
  diagnosticSessionId?: string | null;
  model?: string | null;
  promptVersion?: string | null;
}

// Append a new decision version. Marks all prior versions not-current, points
// the case at the new decision, and records the case severity. Stable decisions
// auto-record; attention/critical start pending approval.
export async function addDecision(input: AddDecisionInput) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });

  const [caseRow] = await db
    .select({ id: maintenanceCases.id, reference: maintenanceCases.reference })
    .from(maintenanceCases)
    .where(and(eq(maintenanceCases.id, input.caseId), eq(maintenanceCases.fleetId, input.fleetId)))
    .limit(1);
  if (!caseRow) throw new TRPCError({ code: "NOT_FOUND", message: "Case not found in this fleet." });

  const [latest] = await db
    .select({ id: maintenanceDecisions.id, version: maintenanceDecisions.version })
    .from(maintenanceDecisions)
    .where(eq(maintenanceDecisions.caseId, input.caseId))
    .orderBy(desc(maintenanceDecisions.version))
    .limit(1);

  const nextVersion = (latest?.version ?? 0) + 1;
  const approvalRequirement = approvalRequirementFor(input.severity);
  const approvalState = approvalRequirement === "auto_record" ? "auto_recorded" : "pending";

  // Supersede all prior versions.
  await db
    .update(maintenanceDecisions)
    .set({ isCurrent: false })
    .where(eq(maintenanceDecisions.caseId, input.caseId));

  const [created] = await db
    .insert(maintenanceDecisions)
    .values({
      fleetId: input.fleetId,
      caseId: input.caseId,
      version: nextVersion,
      source: input.source,
      originalRecommendationJson: (input.originalRecommendation ?? null) as never,
      proposedAction: input.proposedAction,
      finalAction: input.finalAction ?? null,
      severity: input.severity,
      confidence: input.confidence ?? null,
      rationale: input.rationale ?? null,
      likelyCausesJson: (input.likelyCauses ?? null) as never,
      immediateChecksJson: (input.immediateChecks ?? null) as never,
      evidenceJson: (input.evidence ?? null) as never,
      approvalRequirement,
      approvalState,
      supersededDecisionId: latest?.id ?? null,
      diagnosticSessionId: input.diagnosticSessionId ?? null,
      model: input.model ?? null,
      promptVersion: input.promptVersion ?? null,
      isCurrent: true,
      createdByUserId: input.actorUserId,
    })
    .returning();

  await db
    .update(maintenanceCases)
    .set({
      currentDecisionId: created?.id ?? null,
      severity: input.severity,
      updatedAt: new Date(),
    })
    .where(eq(maintenanceCases.id, input.caseId));

  await logMaintenanceActivity({
    fleetId: input.fleetId,
    userId: input.actorUserId,
    action: "maintenance_decision_created",
    entityType: "maintenanceDecision",
    entityId: created?.id ?? null,
    entityRef: caseRow.reference,
    details: { version: nextVersion, severity: input.severity, source: input.source },
  });

  return created;
}

// Approve the current decision (attention/critical). Owner/manager only
// (enforced at the router). Records who approved and when.
export async function approveCurrentDecision(input: {
  fleetId: number;
  caseId: number;
  actorUserId: number;
}) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });

  const [current] = await db
    .select()
    .from(maintenanceDecisions)
    .where(
      and(
        eq(maintenanceDecisions.caseId, input.caseId),
        eq(maintenanceDecisions.fleetId, input.fleetId),
        eq(maintenanceDecisions.isCurrent, true)
      )
    )
    .limit(1);
  if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "No current decision to approve." });

  if (current.approvalRequirement === "critical_approval") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A critical decision requires a recorded override, not a plain approval.",
    });
  }

  await db
    .update(maintenanceDecisions)
    .set({ approvalState: "approved", approvedByUserId: input.actorUserId, approvedAt: new Date() })
    .where(eq(maintenanceDecisions.id, current.id));

  await logMaintenanceActivity({
    fleetId: input.fleetId,
    userId: input.actorUserId,
    action: "maintenance_decision_approved",
    entityType: "maintenanceDecision",
    entityId: current.id,
    details: { version: current.version },
  });

  return { ok: true };
}

// Record a critical override: a NEW decision version that supersedes the current
// one, with a MANDATORY reason. Only owners/managers can finalize (enforced at
// the router). Preserves the original recommendation; requires a non-critical
// final action to be chosen deliberately.
export async function recordCriticalOverride(input: {
  fleetId: number;
  caseId: number;
  actorUserId: number;
  finalAction: MaintenanceAction;
  overrideReason: string;
}) {
  if (!input.overrideReason?.trim()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "An override reason is mandatory." });
  }

  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });

  const [current] = await db
    .select()
    .from(maintenanceDecisions)
    .where(
      and(
        eq(maintenanceDecisions.caseId, input.caseId),
        eq(maintenanceDecisions.fleetId, input.fleetId),
        eq(maintenanceDecisions.isCurrent, true)
      )
    )
    .limit(1);
  if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "No current decision to override." });
  if (current.severity !== "critical") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Critical override applies only to a critical decision.",
    });
  }

  const nextVersion = current.version + 1;

  await db
    .update(maintenanceDecisions)
    .set({ isCurrent: false })
    .where(eq(maintenanceDecisions.caseId, input.caseId));

  const [created] = await db
    .insert(maintenanceDecisions)
    .values({
      fleetId: input.fleetId,
      caseId: input.caseId,
      version: nextVersion,
      source: "manual",
      // Preserve the original AI recommendation from the superseded version.
      originalRecommendationJson: current.originalRecommendationJson as never,
      proposedAction: current.proposedAction,
      finalAction: input.finalAction,
      severity: "critical",
      confidence: current.confidence,
      rationale: current.rationale,
      approvalRequirement: "critical_approval",
      approvalState: "approved",
      approvedByUserId: input.actorUserId,
      approvedAt: new Date(),
      overrideState: "overridden",
      overrideReason: input.overrideReason,
      supersededDecisionId: current.id,
      diagnosticSessionId: current.diagnosticSessionId,
      isCurrent: true,
      createdByUserId: input.actorUserId,
    })
    .returning();

  await db
    .update(maintenanceCases)
    .set({ currentDecisionId: created?.id ?? null, updatedAt: new Date() })
    .where(eq(maintenanceCases.id, input.caseId));

  await logMaintenanceActivity({
    fleetId: input.fleetId,
    userId: input.actorUserId,
    action: "maintenance_critical_override",
    entityType: "maintenanceDecision",
    entityId: created?.id ?? null,
    details: {
      version: nextVersion,
      finalAction: input.finalAction,
      finalActionIsCritical: isCriticalAction(input.finalAction),
      overrideReason: input.overrideReason,
    },
  });

  return created;
}

export async function listDecisions(fleetId: number, caseId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(maintenanceDecisions)
    .where(and(eq(maintenanceDecisions.caseId, caseId), eq(maintenanceDecisions.fleetId, fleetId)))
    .orderBy(desc(maintenanceDecisions.version));
}
