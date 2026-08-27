// Repair-shop case workflow orchestration (Phase 1):
//   new -> triage_in_progress -> triage_complete -> repair_in_progress
//   -> awaiting_follow_up -> resolved (or -> return_job, linking a NEW case)
//
// Maps onto the existing shared case-status vocabulary (shared/maintenance/
// caseWorkflow.ts) as: reported -> triaging -> decision_pending -> in_repair
// -> awaiting_follow_up -> closed | return_job. Composes existing building
// blocks (maintenanceCases, maintenanceDecisions, outcomeVerification,
// shopTriageWorkflow) rather than duplicating them — this file is the thin
// glue that sequences them into one coherent workflow and never overwrites
// prior evidence (every triage turn is a new maintenanceDecisions version;
// a return job is a brand-new case, never a mutation of the original).
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { maintenanceCases, repairFollowUps, vehicles } from "../../drizzle/schema";
import { canTransition, type CaseStatus } from "@shared/maintenance/caseWorkflow";
import { getCaseForFleet, transitionCaseStatus, createManualCase } from "./maintenanceCases";
import { addDecision, listDecisions } from "./maintenanceDecisions";
import { reportOutcome, verifyOutcome } from "./outcomeVerification";
import type { VerificationMethod, EvidenceSource } from "@shared/tadis/outcomeLifecycle";
import {
  runShopTriageStep,
  SHOP_TRIAGE_STEP_CAP,
  type ShopEvidenceEntry,
  type ShopTriageResult,
} from "./shopTriageWorkflow";
import { logMaintenanceActivity } from "./maintenanceActivityLog";

const FOLLOW_UP_DAYS = 3;

const FOLLOW_UP_RESULTS = ["resolved", "partially_resolved", "not_resolved", "returned"] as const;
export type FollowUpResult = (typeof FOLLOW_UP_RESULTS)[number];
export { FOLLOW_UP_RESULTS };

async function requireCase(fleetId: number, caseId: number) {
  const current = await getCaseForFleet(fleetId, caseId);
  if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Case not found in this fleet." });
  return current;
}

async function vehicleLabelFor(fleetId: number, vehicleId: string): Promise<{ label: string; mileage: string | null }> {
  const db = await getDb();
  if (!db) return { label: vehicleId, mileage: null };
  const [v] = await db
    .select()
    .from(vehicles)
    .where(and(eq(vehicles.id, vehicleId), eq(vehicles.fleetId, fleetId)))
    .limit(1);
  if (!v) return { label: vehicleId, mileage: null };
  const parts = [v.year, v.make, v.model].filter((p) => p !== null && p !== undefined && String(p).trim());
  const label = parts.join(" ") || v.unitNumber || v.vin;
  return { label, mileage: v.mileage != null ? String(v.mileage) : null };
}

// Reconstruct the diagnostic evidence trail from the append-only decision
// versions recorded so far (oldest first), so a resumed session has the full
// history without a separate evidence table.
// Fault codes captured at intake (shopCaseCapture.ts's initial "intake
// logged" decision stores them as evidenceJson.faultCodes, distinct from the
// {type, instruction, response} shape the triage loop itself writes) are a
// primary diagnostic input and must reach the triage prompt/evidence-ceiling
// calculation, not just sit unread in the decision history.
function faultCodesFromDecisions(decisions: Awaited<ReturnType<typeof listDecisions>>): string[] {
  const codes = new Set<string>();
  for (const d of decisions) {
    const evidence = d.evidenceJson as { faultCodes?: unknown } | null;
    if (Array.isArray(evidence?.faultCodes)) {
      for (const code of evidence.faultCodes) {
        if (typeof code === "string" && code.trim()) codes.add(code.trim());
      }
    }
  }
  return Array.from(codes);
}

function evidenceTrailFromDecisions(decisions: Awaited<ReturnType<typeof listDecisions>>): ShopEvidenceEntry[] {
  const trail: ShopEvidenceEntry[] = [];
  // Each decision's evidenceJson (when present) already carries the
  // {type, instruction, response} of whichever prior step it answers — see
  // the addDecision call below. listDecisions orders newest-first; walk
  // oldest-first to reconstruct chronological order.
  for (const d of [...decisions].reverse()) {
    const evidence = d.evidenceJson as { type?: string; instruction?: string; response?: string } | null;
    if (evidence?.instruction && evidence?.response) {
      trail.push({
        type: (evidence.type as ShopEvidenceEntry["type"]) ?? "observation",
        instruction: evidence.instruction,
        response: evidence.response,
        recordedAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : String(d.createdAt),
      });
    }
  }
  return trail;
}

/**
 * Advance the adaptive diagnostic triage loop by one turn. On the very first
 * call (no answer yet), runs triage against the complaint alone. On a
 * subsequent call, `answerToPreviousStep` is the technician's response to the
 * PRIOR turn's nextDiagnosticStep and is appended to the evidence trail
 * before re-evaluating. Safe to call repeatedly across sessions (save/resume):
 * the full trail is reconstructed from persisted decisions each time, and
 * this never overwrites a prior version — it appends a new one.
 */
export async function advanceShopTriage(input: {
  fleetId: number;
  caseId: number;
  actorUserId: number;
  answerToPreviousStep?: string | null;
}) {
  const current = await requireCase(input.fleetId, input.caseId);
  if (current.status !== "reported" && current.status !== "triaging") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Triage cannot be advanced from status "${current.status}".`,
    });
  }

  const priorDecisions = await listDecisions(input.fleetId, input.caseId);
  const latest = priorDecisions[0] ?? null;
  let evidence = evidenceTrailFromDecisions(priorDecisions);

  if (input.answerToPreviousStep?.trim()) {
    const priorStep = latest?.nextDiagnosticStepJson as
      | { type?: string; instruction?: string }
      | null;
    if (!priorStep?.instruction) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "No pending diagnostic step to answer.",
      });
    }
    evidence = [
      ...evidence,
      {
        type: (priorStep.type as ShopEvidenceEntry["type"]) ?? "observation",
        instruction: priorStep.instruction,
        response: input.answerToPreviousStep.trim(),
        recordedAt: new Date().toISOString(),
      },
    ];
  }

  const { label, mileage } = await vehicleLabelFor(input.fleetId, current.vehicleId);
  const faultCodes = faultCodesFromDecisions(priorDecisions);
  const priorAiTurns = priorDecisions.filter((d) => d.source === "ai").length;

  // Hard backstop (spec §8): once the turn cap is hit, stop calling the AI
  // and force the loop to a stop rather than asking forever. Uses the latest
  // known confidence rather than resetting to 0 — this is "we stopped
  // trying," not "we learned nothing."
  const result: ShopTriageResult =
    priorAiTurns >= SHOP_TRIAGE_STEP_CAP
      ? {
          urgency: (latest?.severity as ShopTriageResult["severity"]) ?? "attention",
          safetySummary:
            (latest?.safetySummary as string | null) ??
            "Diagnostic turn limit reached; use technician judgment.",
          confidence: latest?.confidence ?? 0,
          confidenceStatus: "insufficient",
          likelyCauses: (latest?.likelyCausesJson as ShopTriageResult["likelyCauses"]) ?? [],
          nextDiagnosticStep: null,
          evidenceSummary:
            (latest?.evidenceSummary as string | null) ??
            "Diagnostic turn limit reached before confidence cleared the target.",
          remainingVerification: (latest?.immediateChecksJson as string[] | null) ?? [],
          diagnosticRationale:
            `Reached the ${SHOP_TRIAGE_STEP_CAP}-turn diagnostic limit without reaching >85% confidence. ` +
            "Insufficient evidence to reach further confidence through this adaptive loop — use technician judgment to proceed.",
          severity: (latest?.severity as ShopTriageResult["severity"]) ?? "attention",
        }
      : await runShopTriageStep({
          complaint: current.summary ?? current.title ?? "",
          vehicleLabel: label,
          mileage,
          faultCodes,
          evidence,
        });

  if (current.status === "reported") {
    await transitionCaseStatus({
      fleetId: input.fleetId,
      caseId: input.caseId,
      toStatus: "triaging",
      actorUserId: input.actorUserId,
      note: "Diagnostic triage started.",
    });
  }

  const decision = await addDecision({
    fleetId: input.fleetId,
    caseId: input.caseId,
    actorUserId: input.actorUserId,
    source: "ai",
    severity: result.severity,
    proposedAction: "continue_monitor", // shop diagnostic triage is not a fleet dispatch decision
    rationale: result.diagnosticRationale,
    confidence: result.confidence,
    likelyCauses: result.likelyCauses,
    immediateChecks: result.remainingVerification,
    // Persist the last answered step + its result as this version's evidence,
    // so evidenceTrailFor can reconstruct the full trail from decision history.
    evidence: input.answerToPreviousStep?.trim()
      ? {
          type: (latest?.nextDiagnosticStepJson as { type?: string } | null)?.type ?? "observation",
          instruction: (latest?.nextDiagnosticStepJson as { instruction?: string } | null)?.instruction ?? "",
          response: input.answerToPreviousStep.trim(),
        }
      : null,
    confidenceStatus: result.confidenceStatus,
    nextDiagnosticStep: result.nextDiagnosticStep,
    safetySummary: result.safetySummary,
    evidenceSummary: result.evidenceSummary,
  });

  return { case: current, decision, triage: result };
}

// Explicitly mark triage complete once confidence has reached target (or the
// shop decides no further evidence is achievable) — a deliberate step rather
// than an automatic one, so the technician always sees and confirms the
// compact triage-complete summary before moving into repair.
export async function completeShopTriage(input: {
  fleetId: number;
  caseId: number;
  actorUserId: number;
}) {
  const current = await requireCase(input.fleetId, input.caseId);
  if (current.status !== "triaging") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Triage can only be completed while in progress.",
    });
  }
  await transitionCaseStatus({
    fleetId: input.fleetId,
    caseId: input.caseId,
    toStatus: "decision_pending",
    actorUserId: input.actorUserId,
    note: "Diagnostic triage complete.",
  });
  return { ok: true };
}

// Move a triaged case into repair. Purely a status marker (Phase 1 excludes
// estimating/parts/labour/invoicing) — see repair-shop Phase 1 spec §11.
export async function startShopRepair(input: {
  fleetId: number;
  caseId: number;
  actorUserId: number;
}) {
  const current = await requireCase(input.fleetId, input.caseId);
  if (!canTransition(current.status as CaseStatus, "in_repair")) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Cannot start repair from status "${current.status}".`,
    });
  }
  await transitionCaseStatus({
    fleetId: input.fleetId,
    caseId: input.caseId,
    toStatus: "in_repair",
    actorUserId: input.actorUserId,
  });
  return { ok: true };
}

// Record the confirmed repair outcome (spec §12) and close the diagnostic
// loop: composes the existing Reported + Verified outcome steps (Phase 1 has
// a single shop user, so both are attributed to the same actor in one call —
// verificationMethod doubles as the required "confirming test/measurement/
// evidence"), then moves the case to awaiting_follow_up with a 3-day due date.
export async function recordShopRepairOutcome(input: {
  fleetId: number;
  caseId: number;
  actorUserId: number;
  confirmedFault: string;
  rootCause?: string | null;
  rootCauseConfirmed?: boolean;
  repairPerformed: string;
  partsReplaced: string[]; // [] means "none"
  verificationMethod: VerificationMethod;
  verificationNotes?: string | null;
  evidenceSource?: EvidenceSource;
  shopConfidence: number;
  repairNotes?: string | null;
}) {
  const current = await requireCase(input.fleetId, input.caseId);
  if (!canTransition(current.status as CaseStatus, "awaiting_follow_up")) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Cannot record a repair outcome from status "${current.status}".`,
    });
  }

  const outcome = await reportOutcome({
    fleetId: input.fleetId,
    caseId: input.caseId,
    actorUserId: input.actorUserId,
    confirmedFault: input.confirmedFault,
    repairPerformed: input.repairPerformed,
    partsReplaced: input.partsReplaced,
    evidenceSource: input.evidenceSource ?? "shop_verified",
    vehicleId: current.vehicleId,
    repairNotes: input.repairNotes ?? null,
    shopConfidence: input.shopConfidence,
    rootCause: input.rootCause ?? null,
    rootCauseConfirmed: input.rootCauseConfirmed ?? Boolean(input.rootCause?.trim()),
  });

  await verifyOutcome({
    fleetId: input.fleetId,
    outcomeId: outcome.id,
    actorUserId: input.actorUserId,
    verificationMethod: input.verificationMethod,
    verificationNotes: input.verificationNotes ?? null,
  });

  const followUpDueAt = new Date();
  followUpDueAt.setDate(followUpDueAt.getDate() + FOLLOW_UP_DAYS);

  const db = await getDb();
  if (db) {
    await db
      .update(maintenanceCases)
      .set({ followUpDueAt, updatedAt: new Date() })
      .where(eq(maintenanceCases.id, input.caseId));
  }

  await transitionCaseStatus({
    fleetId: input.fleetId,
    caseId: input.caseId,
    toStatus: "awaiting_follow_up",
    actorUserId: input.actorUserId,
    note: "Repair outcome recorded; awaiting 3-day follow-up.",
  });

  return { outcome, followUpDueAt };
}

// Manual 3-day follow-up (spec §14). Resolved closes the case; anything else
// leaves it open for further shop action or a return job.
export async function recordShopFollowUp(input: {
  fleetId: number;
  caseId: number;
  actorUserId: number;
  result: FollowUpResult;
  note?: string | null;
  repairOutcomeId?: number | null;
}) {
  const current = await requireCase(input.fleetId, input.caseId);
  if (current.status !== "awaiting_follow_up") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A follow-up can only be recorded while a case is awaiting follow-up.",
    });
  }

  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });

  const [followUp] = await db
    .insert(repairFollowUps)
    .values({
      fleetId: input.fleetId,
      maintenanceCaseId: input.caseId,
      repairOutcomeId: input.repairOutcomeId ?? null,
      result: input.result,
      note: input.note?.trim() || null,
      recordedByUserId: input.actorUserId,
    })
    .returning();

  const nextStatus: CaseStatus = input.result === "resolved" ? "closed" : input.result === "returned" ? "return_job" : "in_repair";

  if (canTransition(current.status as CaseStatus, nextStatus)) {
    await transitionCaseStatus({
      fleetId: input.fleetId,
      caseId: input.caseId,
      toStatus: nextStatus,
      actorUserId: input.actorUserId,
      note: `3-day follow-up recorded: ${input.result}.`,
    });
  }

  return { followUp, caseStatus: nextStatus };
}

export async function listFollowUpsForCase(fleetId: number, caseId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(repairFollowUps)
    .where(and(eq(repairFollowUps.fleetId, fleetId), eq(repairFollowUps.maintenanceCaseId, caseId)))
    .orderBy(desc(repairFollowUps.recordedAt));
}

// Create a NEW, separately-tracked case for a returned problem, linked back
// to the original via originalCaseId. The original case's complaint,
// diagnostic trail, triage, repair outcome, and follow-up are never touched
// (spec §15) — only its status is marked return_job, purely as a visible
// flag that a linked return job exists.
export async function createReturnJob(input: {
  fleetId: number;
  originalCaseId: number;
  actorUserId: number;
  complaint: string;
}) {
  const original = await requireCase(input.fleetId, input.originalCaseId);

  const newCase = await createManualCase({
    fleetId: input.fleetId,
    vehicleId: original.vehicleId,
    origin: "manual",
    title: `Return job: ${input.complaint.slice(0, 100)}`,
    summary: input.complaint,
    severity: "attention",
    createdByUserId: input.actorUserId,
    caseType: original.caseType ?? undefined,
  });
  if (!newCase) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create return-job case." });
  }

  const db = await getDb();
  if (db) {
    await db
      .update(maintenanceCases)
      .set({ originalCaseId: original.id, updatedAt: new Date() })
      .where(eq(maintenanceCases.id, newCase.id));
  }

  if (canTransition(original.status as CaseStatus, "return_job")) {
    await transitionCaseStatus({
      fleetId: input.fleetId,
      caseId: original.id,
      toStatus: "return_job",
      actorUserId: input.actorUserId,
      note: `Linked return job created: case ${newCase.reference}.`,
    });
  } else {
    await logMaintenanceActivity({
      fleetId: input.fleetId,
      userId: input.actorUserId,
      action: "maintenance_case_status_changed",
      entityType: "maintenanceCase",
      entityId: original.id,
      entityRef: original.reference,
      details: { returnJobCreated: newCase.reference, originalStatusUnchanged: original.status },
    });
  }

  return { originalCase: original, returnJobCase: { ...newCase, originalCaseId: original.id } };
}
