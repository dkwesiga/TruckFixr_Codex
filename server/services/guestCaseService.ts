// Guest "/try-one-case" service — thin DB layer over the pure assessment core.
//
// One canonical guest case record; opaque publicToken handle; critical cases are
// persisted and queued for review BEFORE any contact capture; free-case
// eligibility is a hashed ledger (no raw PII); no fleet-wide data is ever returned.

import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { randomUUID } from "node:crypto";
import {
  analyticsEvents,
  freeCaseLedger,
  guestCaseContacts,
  guestCaseEvents,
  guestCaseEvidence,
  guestCases,
} from "../../drizzle/schema";
import { parseEvidenceImageDataUrl } from "./evidencePhotos";
import { storagePut } from "../storage";
import {
  MAX_ADAPTIVE_QUESTIONS,
  type AdaptiveQuestion,
  type ConcernCategory,
  type GuestCaseInput,
  type OperatingStatus,
} from "../../shared/maintenance/guestCaseFlow";
import { customerReadinessMeta } from "../../shared/maintenance/customerReadiness";
import { SAFETY_DISCLAIMERS } from "../../shared/maintenance/caseWorkflow";
import type { GuestAssessment } from "./guestCaseAssessment";
import { generateGuestAssessment, generateGuestNextQuestion } from "./guestCaseAi";
import { generateOpaqueToken, hashIdentifier } from "./guestTokens";
import { enqueueReview } from "./caseReviewQueue";
import { recordObservabilityEvent } from "./observability";
import { issueVerificationCode, verifyCode } from "./verificationCodes";
import { sendEmail } from "./email";
import { generateGuestLikelyCauses, type GuestLikelyCause } from "./guestCaseAiReport";

const CONTACT_VERIFY_PURPOSE = "guest_contact_verify";

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
    // AI-generated, issue-specific explanation (guestCaseAi.ts) — additive,
    // null when the deterministic engine handled this case (critical path,
    // or the AI call failed/wasn't configured).
    explanation: assessment.explanation,
  };
}

/**
 * Rebuilds a GuestAssessment from a row's already-persisted fields, instead
 * of recomputing via generateGuestAssessment(). Now that the assessment can
 * involve an AI call, recomputing on every read/step would both cost an
 * extra call for no reason (the answers haven't changed since the last
 * start/answer step that already computed and stored this) and risk the
 * model landing on a subtly different result than what the guest already
 * saw — e.g. a different readiness or explanation between the preliminary
 * screen and the final decision card. Reading back what was actually stored
 * guarantees the two stay identical.
 */
function assessmentFromRow(row: {
  criticalTriggered: boolean | null;
  internalSeverity: string;
  customerReadiness: string;
  operatingAction: string;
  reviewStatus: string;
  preliminaryJson: unknown;
}): GuestAssessment {
  const stored =
    row.preliminaryJson && typeof row.preliminaryJson === "object"
      ? (row.preliminaryJson as { recommendation?: string; explanation?: string | null })
      : null;
  const criticalTriggered = row.criticalTriggered === true;
  return {
    criticalTrigger: null,
    criticalTriggered,
    internalSeverity: row.internalSeverity as GuestAssessment["internalSeverity"],
    operatingAction: row.operatingAction as GuestAssessment["operatingAction"],
    customerReadiness: row.customerReadiness as GuestAssessment["customerReadiness"],
    recommendation:
      stored?.recommendation ??
      customerReadinessMeta(row.customerReadiness as GuestAssessment["customerReadiness"])
        .operatingRecommendation,
    safetyGuidance: criticalTriggered ? SAFETY_DISCLAIMERS.critical : null,
    reviewCategory: criticalTriggered ? "critical_safety" : null,
    reviewStatus: row.reviewStatus as GuestAssessment["reviewStatus"],
    explanation: stored?.explanation ?? null,
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
    // Suppressed by default; populated with AI-generated hypothesis-level
    // causes (§4.6) by submitGuestContact when available for a non-critical
    // case. Never set for a critical case (safety guidance takes priority).
    possibleCauses: null as GuestLikelyCause[] | null,
    possibleCausesSuppressed: true,
    humanReviewStatus: assessment.reviewStatus,
    safetyGuidance: assessment.safetyGuidance,
    explanation: assessment.explanation,
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
  const assessment = await generateGuestAssessment({
    input,
    answers: {},
    vehicleIdentifier: args.vehicleIdentifier ?? null,
  });
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
    : await generateGuestNextQuestion({
        input,
        answers: {},
        vehicleIdentifier: args.vehicleIdentifier ?? null,
      });

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
  const vehicleIdentifier = (row.vehicleIdentifier ?? null) as GuestVehicleIdentifier | null;
  const assessment = await generateGuestAssessment({ input, answers, vehicleIdentifier });
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
    : await generateGuestNextQuestion({ input, answers, vehicleIdentifier });

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
  const assessment = assessmentFromRow(row);

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
  // AI-generated likely causes (PRD §4.6) are strictly additive: only for
  // non-critical cases (an active emergency gets safety guidance, not cause
  // speculation), and never able to change readiness/safetyGuidance — those
  // remain fully governed by the deterministic assessment above.
  if (!assessment.criticalTriggered) {
    const causes = await generateGuestLikelyCauses({ guestCaseId: row.id, input, answers });
    if (causes.length > 0) {
      card.possibleCauses = causes;
      card.possibleCausesSuppressed = false;
    }
  }
  // Persisted for later retrieval by verifyGuestContactCode — recomputing at
  // verify time would risk drifting from what was captured here.
  await db
    .update(guestCases)
    .set({
      status: "decided",
      decisionJson: { card, freeCaseLimitReached: eligibility.limitReached },
      updatedAt: new Date(),
    })
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

  // PRD §4.5: the complete report unlocks only after the contact is verified
  // with a one-time code. The safety warning (if any) was already shown,
  // ungated, earlier in the flow — this gate never withholds that.
  const issued = await issueVerificationCode({
    guestCaseId: row.id,
    purpose: CONTACT_VERIFY_PURPOSE,
    channel: "email",
    destination: email,
    send: async ({ destination, code, expiresAt }) => {
      const minutesValid = Math.round((expiresAt.getTime() - Date.now()) / 60000);
      await sendEmail({
        to: [destination],
        subject: "Your TruckFixr verification code",
        text: `Your verification code is ${code}. It expires in ${minutesValid} minutes. If you didn't request this, you can ignore this message.`,
      });
    },
  });

  return {
    codeSent: true,
    maskedDestination: issued.maskedDestination,
  };
}

/** Verify the one-time code and release the previously-computed decision card. */
export async function verifyGuestContactCode(params: { publicToken: string; code: string }) {
  const db = await getDb();
  requireDb(db);
  const row = await loadCase(db, params.publicToken);

  const result = await verifyCode({
    guestCaseId: row.id,
    purpose: CONTACT_VERIFY_PURPOSE,
    code: params.code,
  });
  if (!result.ok) {
    const messages: Record<string, string> = {
      not_found: "No verification code was found for this case. Request a new code.",
      expired: "That code has expired. Request a new code.",
      already_verified: "Already verified.",
      too_many_attempts: "Too many incorrect attempts. Request a new code.",
      incorrect: "That code isn't right. Please check and try again.",
    };
    throw new TRPCError({ code: "BAD_REQUEST", message: messages[result.reason] ?? "Verification failed." });
  }

  const stored = row.decisionJson as { card?: unknown; freeCaseLimitReached?: boolean } | null;
  if (!stored?.card) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Contact details haven't been submitted for this case yet.",
    });
  }

  await emitEvent(db, row.id, "contact_verified", {});

  return {
    decision: stored.card,
    freeCaseLimitReached: Boolean(stored.freeCaseLimitReached),
    pilotSuggested: Boolean(stored.freeCaseLimitReached),
  };
}

/** Resend a fresh code to the contact already on file for this case. */
export async function resendGuestContactCode(params: { publicToken: string }) {
  const db = await getDb();
  requireDb(db);
  const row = await loadCase(db, params.publicToken);

  const [contact] = await db
    .select()
    .from(guestCaseContacts)
    .where(eq(guestCaseContacts.guestCaseId, row.id))
    .orderBy(desc(guestCaseContacts.id))
    .limit(1);
  if (!contact?.email) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No contact email on file for this case." });
  }

  const issued = await issueVerificationCode({
    guestCaseId: row.id,
    purpose: CONTACT_VERIFY_PURPOSE,
    channel: "email",
    destination: contact.email,
    send: async ({ destination, code, expiresAt }) => {
      const minutesValid = Math.round((expiresAt.getTime() - Date.now()) / 60000);
      await sendEmail({
        to: [destination],
        subject: "Your TruckFixr verification code",
        text: `Your verification code is ${code}. It expires in ${minutesValid} minutes. If you didn't request this, you can ignore this message.`,
      });
    },
  });

  return { codeSent: true, maskedDestination: issued.maskedDestination };
}

/** Guest-safe read by publicToken. Returns only this case — never fleet data. */
export async function getGuestCase(publicToken: string) {
  const db = await getDb();
  requireDb(db);
  const row = await loadCase(db, publicToken);
  // Read back exactly what start/answer/submitContact already computed and
  // stored, rather than recomputing (see assessmentFromRow's comment) — this
  // also means a decided case correctly includes the AI possible-causes that
  // were attached in submitGuestContact, which a fresh recompute would miss.
  const preliminary =
    row.preliminaryJson && typeof row.preliminaryJson === "object"
      ? row.preliminaryJson
      : preliminaryView(assessmentFromRow(row));
  const stored = row.decisionJson as { card?: unknown } | null;
  return {
    publicToken: row.publicToken,
    status: row.status,
    criticalTriggered: row.criticalTriggered,
    preliminary,
    decision: row.status === "decided" ? (stored?.card ?? null) : null,
    reviewStatus: row.reviewStatus,
  };
}

const MAX_GUEST_EVIDENCE_PHOTOS = 5;

/**
 * Store a guest-submitted evidence photo (PRD §4.1/§4.2). Image-only —
 * reuses the same size/MIME validation as the fleet inspection upload path
 * (parseEvidenceImageDataUrl: jpeg/png/webp, 5MB max). Capped per case to
 * bound abuse of the (unauthenticated) public upload surface.
 */
export async function uploadGuestEvidencePhoto(params: { publicToken: string; dataUrl: string }) {
  const db = await getDb();
  requireDb(db);
  const row = await loadCase(db, params.publicToken);

  const existing = await db
    .select()
    .from(guestCaseEvidence)
    .where(eq(guestCaseEvidence.guestCaseId, row.id));
  if (existing.length >= MAX_GUEST_EVIDENCE_PHOTOS) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `You can attach up to ${MAX_GUEST_EVIDENCE_PHOTOS} photos.`,
    });
  }

  const parsed = parseEvidenceImageDataUrl(params.dataUrl);
  const storageKey = `guest-case-evidence/case-${row.id}/${randomUUID()}.${parsed.extension}`;
  const { url } = await storagePut(storageKey, parsed.bytes, parsed.mimeType);

  const [saved] = await db
    .insert(guestCaseEvidence)
    .values({
      guestCaseId: row.id,
      kind: "photo",
      storageKey,
      url,
      mimeType: parsed.mimeType,
      sizeBytes: parsed.sizeBytes,
      createdAt: new Date(),
    })
    .returning();

  await emitEvent(db, row.id, "evidence_photo_uploaded", { sizeBytes: parsed.sizeBytes });

  return { id: saved.id, url, mimeType: parsed.mimeType, sizeBytes: parsed.sizeBytes };
}

export async function listGuestEvidencePhotos(publicToken: string) {
  const db = await getDb();
  requireDb(db);
  const row = await loadCase(db, publicToken);
  const rows = await db
    .select()
    .from(guestCaseEvidence)
    .where(eq(guestCaseEvidence.guestCaseId, row.id));
  return rows.map((r: any) => ({ id: r.id, url: r.url, mimeType: r.mimeType, sizeBytes: r.sizeBytes }));
}

export const __testables = { evaluateFreeCase, decisionCard, preliminaryView };
