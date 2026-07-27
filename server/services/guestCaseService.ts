// Guest "/try-one-case" service — thin DB layer over the pure assessment core.
//
// One canonical guest case record; opaque publicToken handle; critical cases are
// persisted and queued for review BEFORE any contact capture; free-case
// eligibility is a hashed ledger (no raw PII); no fleet-wide data is ever returned.

import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import {
  analyticsEvents,
  freeCaseLedger,
  guestCaseContacts,
  guestCaseEvents,
  guestCases,
} from "../../drizzle/schema";
import {
  MAX_ADAPTIVE_QUESTIONS,
  nextAdaptiveQuestion,
  type AdaptiveQuestion,
  type ConcernCategory,
  type GuestCaseInput,
  type OperatingStatus,
} from "../../shared/maintenance/guestCaseFlow";
import { customerReadinessMeta } from "../../shared/maintenance/customerReadiness";
import { assessGuestCase, type GuestAssessment } from "./guestCaseAssessment";
import { generateOpaqueToken, hashIdentifier } from "./guestTokens";
import { enqueueReview } from "./caseReviewQueue";
import { recordObservabilityEvent } from "./observability";

const GUEST_CASE_TTL_DAYS = 30;

function requireDb(db: unknown): asserts db {
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database not available",
    });
  }
}

export interface GuestVehicleIdentifier {
  unitNumber?: string | null;
  vin?: string | null;
  year?: string | null;
  make?: string | null;
  model?: string | null;
}

export interface StartGuestCaseArgs {
  concernText: string;
  concernCategory?: ConcernCategory;
  operatingStatus: OperatingStatus;
  faultCodes?: string[];
  vehicleIdentifier?: GuestVehicleIdentifier;
  mileage?: number | null;
  engine?: string | null;
  location?: string | null;
  intakeSource?: string;
  anonSessionId?: string | null;
  ipHash?: string | null;
}

type Answers = Record<string, string>;

function toInput(row: {
  concernText: string;
  operatingStatus: string;
  concernCategory: string | null;
  faultCodes: unknown;
}): GuestCaseInput {
  return {
    concernText: row.concernText,
    operatingStatus: row.operatingStatus as OperatingStatus,
    concernCategory: (row.concernCategory ?? undefined) as
      | ConcernCategory
      | undefined,
    faultCodes: Array.isArray(row.faultCodes)
      ? (row.faultCodes as string[])
      : undefined,
  };
}

function preliminaryView(assessment: GuestAssessment) {
  return {
    readiness: assessment.customerReadiness,
    severity: assessment.internalSeverity,
    action: assessment.operatingAction,
    recommendation: assessment.recommendation,
    label: customerReadinessMeta(assessment.customerReadiness).label,
  };
}

function decisionCard(
  assessment: GuestAssessment,
  input: GuestCaseInput,
  answers: Answers
) {
  const evidenceReviewed: string[] = [
    `Concern: ${input.concernCategory ?? "described"}`,
    `Operating status: ${input.operatingStatus}`,
    ...(input.faultCodes?.length ? [`Fault codes: ${input.faultCodes.join(", ")}`] : []),
    ...Object.entries(answers).map(([q, a]) => `Answered ${q}: ${a}`),
  ];
  return {
    readiness: assessment.customerReadiness,
    readinessLabel: customerReadinessMeta(assessment.customerReadiness).label,
    operatingAction: assessment.operatingAction,
    recommendation: assessment.recommendation,
    evidenceReviewed,
    // Possible causes are intentionally SUPPRESSED for a deterministic, no-media
    // guest pass (evidence incomplete / physical testing required). §16.
    possibleCauses: null as string[] | null,
    possibleCausesSuppressed: true,
    humanReviewStatus: assessment.reviewStatus,
    safetyGuidance: assessment.safetyGuidance,
  };
}

async function emitEvent(
  db: any,
  guestCaseId: number,
  type: string,
  payload?: Record<string, unknown>
): Promise<void> {
  await db.insert(guestCaseEvents).values({
    guestCaseId,
    type,
    payloadJson: payload ?? null,
    at: new Date(),
  });
}

async function emitAnalytics(
  db: any,
  event: string,
  fields: Partial<{
    guestCaseId: number;
    anonSessionId: string | null;
    intakeSource: string | null;
    readiness: string | null;
    severity: string | null;
    reviewRequirement: string | null;
    funnelStep: string | null;
  }>
): Promise<void> {
  // NOTE: only non-PII, non-free-text fields are ever written here (§27).
  await db.insert(analyticsEvents).values({
    event,
    guestCaseId: fields.guestCaseId ?? null,
    anonSessionId: fields.anonSessionId ?? null,
    intakeSource: fields.intakeSource ?? null,
    readiness: fields.readiness ?? null,
    severity: fields.severity ?? null,
    reviewRequirement: fields.reviewRequirement ?? null,
    funnelStep: fields.funnelStep ?? null,
    at: new Date(),
  });
}

function criticalReason(triggerCode: string | null): string {
  return triggerCode ? `critical_trigger:${triggerCode}` : "critical_trigger";
}

export async function startGuestCase(args: StartGuestCaseArgs) {
  const db = await getDb();
  requireDb(db);

  const input: GuestCaseInput = {
    concernText: args.concernText.trim(),
    operatingStatus: args.operatingStatus,
    concernCategory: args.concernCategory,
    faultCodes: args.faultCodes,
  };
  const assessment = assessGuestCase(input, {});
  const now = new Date();
  const publicToken = generateOpaqueToken();

  const [row] = await db
    .insert(guestCases)
    .values({
      publicToken,
      status: assessment.criticalTriggered ? "preliminary" : "started",
      concernCategory: args.concernCategory ?? null,
      concernText: input.concernText,
      operatingStatus: args.operatingStatus,
      faultCodes: args.faultCodes ?? null,
      vehicleIdentifier: args.vehicleIdentifier ?? null,
      mileage: args.mileage ?? null,
      engine: args.engine?.trim() || null,
      location: args.location?.trim() || null,
      internalSeverity: assessment.internalSeverity,
      customerReadiness: assessment.customerReadiness,
      operatingAction: assessment.operatingAction,
      criticalTriggered: assessment.criticalTriggered,
      criticalTriggerCode: assessment.criticalTrigger?.code ?? null,
      answersJson: {},
      preliminaryJson: preliminaryView(assessment),
      reviewStatus: assessment.reviewStatus,
      intakeSource: args.intakeSource ?? "web",
      anonSessionId: args.anonSessionId ?? null,
      ipHash: args.ipHash ?? null,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + GUEST_CASE_TTL_DAYS * 24 * 60 * 60 * 1000),
    })
    .returning();

  await emitEvent(db, row.id, "submitted", { criticalTriggered: assessment.criticalTriggered });
  await emitAnalytics(db, "case_submitted", {
    guestCaseId: row.id,
    anonSessionId: args.anonSessionId ?? null,
    intakeSource: args.intakeSource ?? "web",
    readiness: assessment.customerReadiness,
    severity: assessment.internalSeverity,
    reviewRequirement: assessment.reviewStatus,
    funnelStep: "submitted",
  });

  if (assessment.criticalTriggered) {
    await emitEvent(db, row.id, "critical_triggered", {
      code: assessment.criticalTrigger?.code ?? "unspecified",
    });
    await enqueueReview({
      guestCaseId: row.id,
      category: "critical_safety",
      submittedAt: now,
      escalationReason: criticalReason(assessment.criticalTrigger?.code ?? null),
    });
    recordObservabilityEvent({
      category: "workflow",
      event: "guest_case_critical_triggered",
      severity: "warning",
      context: { code: assessment.criticalTrigger?.code ?? "unspecified" },
    });
  }

  const nextQuestion: AdaptiveQuestion | null = assessment.criticalTriggered
    ? null
    : nextAdaptiveQuestion(input, []);

  return {
    publicToken,
    status: row.status,
    criticalTriggered: assessment.criticalTriggered,
    // Safety guidance is returned IMMEDIATELY (never behind contact capture).
    safetyGuidance: assessment.safetyGuidance,
    preliminary: preliminaryView(assessment),
    nextQuestion,
    questionsRemaining: assessment.criticalTriggered ? 0 : MAX_ADAPTIVE_QUESTIONS,
  };
}

async function loadCase(db: any, publicToken: string) {
  const [row] = await db
    .select()
    .from(guestCases)
    .where(eq(guestCases.publicToken, publicToken))
    .limit(1);
  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Case not found." });
  }
  return row;
}

export async function answerGuestQuestion(params: {
  publicToken: string;
  questionId: string;
  answer: string;
}) {
  const db = await getDb();
  requireDb(db);
  const row = await loadCase(db, params.publicToken);

  const answers: Answers = {
    ...(row.answersJson && typeof row.answersJson === "object" ? row.answersJson : {}),
    [params.questionId]: params.answer,
  };
  const input = toInput(row);
  const assessment = assessGuestCase(input, answers);
  const now = new Date();
  // Capture prior state BEFORE the update (avoid any read-after-write aliasing).
  const wasCritical = row.criticalTriggered === true;

  await db
    .update(guestCases)
    .set({
      answersJson: answers,
      internalSeverity: assessment.internalSeverity,
      customerReadiness: assessment.customerReadiness,
      operatingAction: assessment.operatingAction,
      criticalTriggered: assessment.criticalTriggered,
      criticalTriggerCode: assessment.criticalTrigger?.code ?? row.criticalTriggerCode ?? null,
      preliminaryJson: preliminaryView(assessment),
      reviewStatus: assessment.reviewStatus,
      status: assessment.criticalTriggered ? "preliminary" : row.status,
      updatedAt: now,
    })
    .where(eq(guestCases.id, row.id));

  await emitEvent(db, row.id, "question_answered", { questionId: params.questionId });

  // A previously non-critical case can become critical via the safety sweep.
  if (assessment.criticalTriggered && !wasCritical) {
    await emitEvent(db, row.id, "critical_triggered", { via: "answer" });
    await enqueueReview({
      guestCaseId: row.id,
      category: "critical_safety",
      submittedAt: now,
      escalationReason: criticalReason(assessment.criticalTrigger?.code ?? null),
    });
  }

  const nextQuestion = assessment.criticalTriggered
    ? null
    : nextAdaptiveQuestion(input, Object.keys(answers));

  return {
    criticalTriggered: assessment.criticalTriggered,
    safetyGuidance: assessment.safetyGuidance,
    preliminary: preliminaryView(assessment),
    nextQuestion,
  };
}

/** Free-case eligibility: hashed-key ledger lookup. Critical is never blocked. */
async function evaluateFreeCase(
  db: any,
  contact: { email?: string | null; phone?: string | null }
): Promise<{ limitReached: boolean; matchKind: string | null }> {
  const keys: Array<{ hash: string; kind: string }> = [];
  if (contact.email) {
    const domain = contact.email.split("@")[1];
    if (domain) keys.push({ hash: hashIdentifier(`email_domain:${domain}`), kind: "email_domain" });
  }
  if (contact.phone) {
    keys.push({ hash: hashIdentifier(`phone:${contact.phone}`), kind: "phone" });
  }
  for (const key of keys) {
    const [existing] = await db
      .select()
      .from(freeCaseLedger)
      .where(eq(freeCaseLedger.matchKeyHash, key.hash))
      .limit(1);
    if (existing) return { limitReached: true, matchKind: key.kind };
  }
  return { limitReached: false, matchKind: null };
}

async function recordFreeCaseKeys(
  db: any,
  guestCaseId: number,
  contact: { email?: string | null; phone?: string | null }
): Promise<void> {
  const now = new Date();
  const rows: Array<{ matchKeyHash: string; matchKind: string }> = [];
  if (contact.email) {
    const domain = contact.email.split("@")[1];
    if (domain) rows.push({ matchKeyHash: hashIdentifier(`email_domain:${domain}`), matchKind: "email_domain" });
  }
  if (contact.phone) {
    rows.push({ matchKeyHash: hashIdentifier(`phone:${contact.phone}`), matchKind: "phone" });
  }
  for (const r of rows) {
    await db.insert(freeCaseLedger).values({
      matchKeyHash: r.matchKeyHash,
      matchKind: r.matchKind,
      guestCaseId,
      consumedAt: now,
    });
  }
}

export async function submitGuestContact(params: {
  publicToken: string;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  consentEmail?: boolean;
  consentSms?: boolean;
  consentWhatsapp?: boolean;
  consentMarketing?: boolean;
  authorityConfirmed?: boolean;
  disclaimerAcknowledged?: boolean;
  disclaimerVersion?: string | null;
}) {
  const email = params.email?.trim().toLowerCase() || null;
  const phone = params.phone?.trim() || null;
  if (!email) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "An email address is required to release the full result.",
    });
  }
  // The disclaimer acknowledgment is the liability record — never release the full
  // decision card without it. (The preliminary result and any critical/unsafe
  // safety warning are shown earlier, ungated.)
  if (params.disclaimerAcknowledged !== true) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Please acknowledge the disclaimer to see the full result.",
    });
  }

  const db = await getDb();
  requireDb(db);
  const row = await loadCase(db, params.publicToken);
  const input = toInput(row);
  const answers: Answers =
    row.answersJson && typeof row.answersJson === "object" ? row.answersJson : {};
  const assessment = assessGuestCase(input, answers);

  // Free-case duplicate detection never blocks a critical case, and even for a
  // non-critical duplicate we still show guidance (graceful, no hard block §24).
  const eligibility = assessment.criticalTriggered
    ? { limitReached: false, matchKind: null }
    : await evaluateFreeCase(db, { email, phone });

  await db.insert(guestCaseContacts).values({
    guestCaseId: row.id,
    email,
    phone,
    role: params.role ?? null,
    consentEmail: params.consentEmail === true,
    consentSms: params.consentSms === true,
    consentWhatsapp: params.consentWhatsapp === true,
    consentMarketing: params.consentMarketing === true,
    authorityConfirmed: params.authorityConfirmed === true,
    disclaimerAcknowledged: true,
    disclaimerVersion: params.disclaimerVersion?.trim() || null,
    disclaimerAcknowledgedAt: new Date(),
    capturedAt: new Date(),
  });

  if (!eligibility.limitReached) {
    await recordFreeCaseKeys(db, row.id, { email, phone });
  }

  const card = decisionCard(assessment, input, answers);
  await db
    .update(guestCases)
    .set({ status: "decided", decisionJson: card, updatedAt: new Date() })
    .where(eq(guestCases.id, row.id));

  await emitEvent(db, row.id, "contact_captured", { limitReached: eligibility.limitReached });
  await emitAnalytics(db, "contact_gate_completed", {
    guestCaseId: row.id,
    anonSessionId: row.anonSessionId,
    intakeSource: row.intakeSource,
    readiness: assessment.customerReadiness,
    severity: assessment.internalSeverity,
    reviewRequirement: assessment.reviewStatus,
    funnelStep: "contact",
  });

  return {
    decision: card,
    freeCaseLimitReached: eligibility.limitReached,
    // When the free allowance is used, route to the pilot (guidance still shown).
    pilotSuggested: eligibility.limitReached,
  };
}

/** Guest-safe read by publicToken. Returns only this case — never fleet data. */
export async function getGuestCase(publicToken: string) {
  const db = await getDb();
  requireDb(db);
  const row = await loadCase(db, publicToken);
  const input = toInput(row);
  const answers: Answers =
    row.answersJson && typeof row.answersJson === "object" ? row.answersJson : {};
  const assessment = assessGuestCase(input, answers);
  return {
    publicToken: row.publicToken,
    status: row.status,
    criticalTriggered: row.criticalTriggered,
    preliminary: preliminaryView(assessment),
    decision: row.status === "decided" ? decisionCard(assessment, input, answers) : null,
    reviewStatus: row.reviewStatus,
  };
}

export const __testables = { evaluateFreeCase, decisionCard, preliminaryView };
