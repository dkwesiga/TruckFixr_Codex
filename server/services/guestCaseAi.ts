// AI-tailored adaptive questions + severity/action classification for the
// guest "/try-one-case" flow. Extends the previously fully-deterministic
// engine (shared/maintenance/guestCaseFlow.ts, ./guestCaseAssessment.ts) with
// model-generated content that is actually grounded in what the guest typed,
// while keeping two hard, unconditional safety floors that no AI output can
// weaken or bypass:
//
//   1. Keyword-based critical detection (detectCriticalTrigger) and the
//      safety-sweep-answer escalation ALWAYS run first, synchronously, with
//      no AI involved — an AI call is never made once a case is already
//      critical, exactly as before this module existed.
//   2. The mandatory safety-sweep question (smoke/fire/leak/brake/steering)
//      is always asked verbatim, on the same schedule as before, by
//      deterministic code — it is never authored, reworded, or skipped by
//      the model.
//
// Below those floors, this module replaces the static per-category question
// bank and the four-bucket rule table with model output, but even then the
// customer-facing `recommendation` string is still one of the fixed
// CUSTOMER_READINESS_META strings (never AI-worded) and the readiness itself
// is still computed by the existing deterministic readinessFromDecision()
// safety-floor mapping — the model only chooses which (severity, action)
// pair applies, not what those pairs mean. Any AI failure, timeout, invalid
// output, or missing provider configuration falls back to the original
// deterministic engine — the guest never sees an error or a stalled flow
// because of this.
//
// Confidence review: the assessment call also reports a 0-100 confidence in
// its own classification. Below CONFIDENCE_THRESHOLD, the flow keeps asking
// clarifying questions (still capped — see CONFIDENCE_QUESTION_CAP) instead
// of settling early; guestCaseService.ts flags the case for a technical
// review if confidence is still low once that budget runs out. A critical
// verdict is likewise never trusted from the model alone on the very first
// turn (see hasAnsweredAtLeastOneQuestion below) — always deferred to the
// rule-based (non-critical, since the keyword floor already cleared it)
// result until there's at least one clarifying answer to support it.

import { z } from "zod";
import { invokeWithOrchestration } from "./aiOrchestrator";
import { recordObservabilityEvent } from "./observability";
import {
  MAX_ADAPTIVE_QUESTIONS,
  SAFETY_SWEEP_QUESTION,
  detectCriticalTrigger,
  nextAdaptiveQuestion as ruleBasedNextQuestion,
  type AdaptiveQuestion,
  type GuestCaseInput,
} from "../../shared/maintenance/guestCaseFlow";
import {
  MAINTENANCE_ACTIONS,
  MAINTENANCE_SEVERITIES,
  SAFETY_DISCLAIMERS,
  isCriticalAction,
  type MaintenanceAction,
  type MaintenanceSeverity,
} from "../../shared/maintenance/caseWorkflow";
import {
  customerReadinessMeta,
  readinessFromDecision,
} from "../../shared/maintenance/customerReadiness";
import {
  assessGuestCase as ruleBasedAssessGuestCase,
  type GuestAssessment,
} from "./guestCaseAssessment";

type Answers = Record<string, string>;

// Mirrors guestCaseService.ts's GuestVehicleIdentifier shape. Duplicated
// (rather than imported) so this module has no dependency on
// guestCaseService.ts, which imports from here — avoids a circular import.
export type GuestAiVehicleIdentifier = {
  unitNumber?: string | null;
  vin?: string | null;
  year?: string | null;
  make?: string | null;
  model?: string | null;
};

export type GuestAiContext = {
  input: GuestCaseInput;
  answers: Answers;
  vehicleIdentifier?: GuestAiVehicleIdentifier | null;
  /** Latest AI confidence (0-100) from this turn's generateGuestAssessment
   *  call, if any — passed to generateGuestNextQuestion so it can keep
   *  asking while confidence is low, up to CONFIDENCE_QUESTION_CAP. */
  confidence?: number | null;
};

const AI_TIMEOUT_MS = 12_000;

// Below this confidence (0-100), the flow keeps asking clarifying questions
// instead of settling on the current best guess.
export const CONFIDENCE_THRESHOLD = 85;
// Confidence-driven follow-ups stop after this many total adaptive questions
// have been answered (counting the mandatory safety sweep), even if
// confidence is still low — bounds the flow and gives guestCaseService.ts a
// clear point to flag the case for a technical review instead. This is
// tighter than the absolute MAX_ADAPTIVE_QUESTIONS hard cap, which still
// applies as a backstop regardless of confidence.
export const CONFIDENCE_QUESTION_CAP = 3;

function vehicleLine(vehicle?: GuestAiVehicleIdentifier | null): string {
  if (!vehicle) return "Not provided.";
  const parts = [vehicle.year, vehicle.make, vehicle.model].filter((v) => v && String(v).trim());
  const label = parts.join(" ").trim();
  const extra = [
    vehicle.unitNumber ? `unit ${vehicle.unitNumber}` : null,
    vehicle.vin ? `VIN ${vehicle.vin}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  if (!label && !extra) return "Not provided.";
  return [label, extra].filter(Boolean).join(" — ") || "Not provided.";
}

function answersLines(answers: Answers): string {
  const entries = Object.entries(answers);
  if (entries.length === 0) return "None yet.";
  return entries.map(([id, value]) => `- ${id}: ${value}`).join("\n");
}

function contextBlock(ctx: GuestAiContext): string {
  return [
    `Vehicle: ${vehicleLine(ctx.vehicleIdentifier)}`,
    `Concern category: ${ctx.input.concernCategory ?? "not specified"}`,
    `Operating status: ${ctx.input.operatingStatus}`,
    `Fault codes: ${ctx.input.faultCodes?.length ? ctx.input.faultCodes.join(", ") : "none given"}`,
    `Description in the guest's own words: "${ctx.input.concernText}"`,
    `Follow-up questions already asked and answered this session (id: answer):`,
    answersLines(ctx.answers),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Adaptive next question
// ---------------------------------------------------------------------------

const questionSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[a-z][a-z0-9_]*$/, "id must be lower_snake_case"),
  prompt: z.string().trim().min(3).max(200),
  options: z
    .array(
      z.object({
        value: z.string().trim().min(1).max(40),
        label: z.string().trim().min(1).max(80),
      })
    )
    .min(2)
    .max(5),
});

const QUESTION_SYSTEM_PROMPT = `You are a commercial vehicle maintenance triage assistant helping a fleet contact describe a single vehicle concern before any technician has looked at it.

Your only job right now: propose ONE closed-ended, multiple-choice follow-up question that would meaningfully change how urgent this concern is or what should happen next. It must be specific to what was actually described (the vehicle, the symptom, the category) — never a generic template question.

Rules:
- Return strict JSON only: {"id": "...", "prompt": "...", "options": [{"value": "...", "label": "..."}, ...]}.
- "id" is a short lower_snake_case slug describing the question topic (e.g. "warning_light_pattern"). Never use "safety_sweep" or repeat an id already listed as answered.
- 2 to 5 options, each a short label a driver or fleet manager could pick without typing.
- Do not ask about smoke, fire, fluid leaks, brakes, or steering — a separate mandatory question already covers that.
- Never suggest a diagnosis, a part, or a repair. Only ask a question.
- If you cannot think of a question that would change anything, ask about symptom frequency or duration instead of inventing something irrelevant.`;

export async function generateGuestNextQuestion(
  ctx: GuestAiContext,
  options?: { fetcher?: typeof fetch }
): Promise<AdaptiveQuestion | null> {
  const answeredIds = Object.keys(ctx.answers);

  // Hard floor 1: never call AI, never ask more, once critical.
  if (detectCriticalTrigger(ctx.input)) return null;
  if (answeredIds.length >= MAX_ADAPTIVE_QUESTIONS) return null;

  // Hard floor 2: the mandatory safety sweep is always asked as the second
  // question, and forced in on the final available slot if it still hasn't
  // been asked by then — regardless of what the AI does on other turns.
  const safetySwept = answeredIds.includes(SAFETY_SWEEP_QUESTION.id);
  if (!safetySwept) {
    const remainingSlots = MAX_ADAPTIVE_QUESTIONS - answeredIds.length;
    if (answeredIds.length === 1 || remainingSlots <= 1) {
      return SAFETY_SWEEP_QUESTION;
    }
  }

  // Confidence-driven stop: once the mandatory safety sweep is out of the
  // way (never skipped, regardless of confidence — checked above), stop
  // asking as soon as the model is confident enough, or once the
  // confidence-question budget is used up either way. guestCaseService.ts
  // is the one that turns "still low after the budget ran out" into a
  // technical-review flag, since it's the only layer that knows this was
  // the last question.
  if (safetySwept && typeof ctx.confidence === "number") {
    if (ctx.confidence >= CONFIDENCE_THRESHOLD) return null;
    if (answeredIds.length >= CONFIDENCE_QUESTION_CAP) return null;
  }

  try {
    const result = await invokeWithOrchestration({
      feature: "guest_case_next_question",
      messages: [
        { role: "system", content: QUESTION_SYSTEM_PROMPT },
        { role: "user", content: contextBlock(ctx) },
      ],
      responseFormat: { type: "json_object" },
      maxTokens: 300,
      temperature: 0.4,
      timeoutMs: AI_TIMEOUT_MS,
    }, options?.fetcher ? { fetcher: options.fetcher } : undefined);

    const raw = result.choices[0]?.message.content;
    const text = typeof raw === "string" ? raw : "";
    const parsed = questionSchema.parse(JSON.parse(text));

    if (parsed.id === SAFETY_SWEEP_QUESTION.id) {
      parsed.id = `${parsed.id}_ai`;
    }
    if (answeredIds.includes(parsed.id)) {
      // Would silently overwrite a prior answer (answersJson is keyed by id) —
      // treat as an invalid response rather than risk that.
      throw new Error(`AI reused an already-answered question id: ${parsed.id}`);
    }

    return {
      id: parsed.id,
      prompt: parsed.prompt,
      options: parsed.options,
      impacts: [],
    };
  } catch (error) {
    recordObservabilityEvent({
      category: "ai_provider",
      event: "guest_case_ai_question_failed",
      severity: "warning",
      message: error instanceof Error ? error.message : String(error),
    });
    return ruleBasedNextQuestion(ctx.input, answeredIds);
  }
}

// ---------------------------------------------------------------------------
// Severity / action classification + explanation
// ---------------------------------------------------------------------------

const assessmentSchema = z.object({
  severity: z.enum(MAINTENANCE_SEVERITIES as unknown as [MaintenanceSeverity, ...MaintenanceSeverity[]]),
  action: z.enum(MAINTENANCE_ACTIONS as unknown as [MaintenanceAction, ...MaintenanceAction[]]),
  explanation: z.string().trim().min(3).max(400),
  confidence: z.number().min(0).max(100),
});

const ASSESSMENT_SYSTEM_PROMPT = `You are a commercial vehicle maintenance triage assistant. Classify a guest-submitted vehicle concern that has already passed a keyword-based safety screen (so it is not an obvious fire/brake/steering/collision emergency), and write a short, specific explanation.

Return strict JSON only: {"severity": "...", "action": "...", "explanation": "...", "confidence": <0-100>}.

"severity" must be exactly one of: stable, attention, critical.
"action" must be exactly one of: continue_monitor, complete_trip_then_inspect, schedule_service, pull_from_service, roadside_assistance, tow.
"confidence" is an integer 0-100: how confident you are that this severity/action classification is actually correct given what's been described so far. Score it honestly — lower it whenever a detail that would change your answer is still missing (e.g. you don't know if a noise is constant or occasional, whether a light is red or amber, whether this has happened before). A vague, one-line description with no clarifying answers yet should usually score well under 85; a description with several specific, consistent details supporting the same conclusion can score high. Do not inflate this to seem decisive — an honest low score is what lets the system ask a better follow-up question instead of guessing.

Guidance:
- stable + continue_monitor: nothing about the description suggests a change is needed soon.
- attention + complete_trip_then_inspect: worth finishing the current trip, then getting it looked at.
- attention + schedule_service: should be looked at soon, but can keep running until then. This is the right bucket for a vehicle that simply won't start, cranks but doesn't fire, or is otherwise stuck/immobile with no danger signs — it needs service, but an immobile, non-running vehicle is not endangering anyone right now.
- critical + pull_from_service / roadside_assistance / tow: reserve this for a description that itself names a real, active hazard (e.g. fire, smoke, a fluid actively spraying/pouring, a collision, brakes or steering that failed while driving) — never choose this just because the vehicle is stopped, immobile, or won't start. A vehicle that cannot move cannot run anyone over or lose control; immobility on its own is one of the SAFEST states a vehicle can be in, not a reason to escalate.
- If the description is too vague to tell which non-critical bucket fits, choose attention + schedule_service rather than guessing — a follow-up question will gather more detail before anything is finalized.

"explanation" is 1-2 plain-language sentences a truck driver or small-fleet owner would understand, grounded in the SPECIFIC vehicle/symptom/category described (name the actual symptom or system) — never a generic template sentence, never a confirmed diagnosis, never a specific part or repair recommendation. Do not repeat the raw severity/action words verbatim; explain the reasoning.`;

/**
 * Deterministically assess a guest case, augmented with an AI-driven
 * classification for the non-critical path. The critical safety floor
 * (keyword trigger + safety-sweep answer) is always evaluated first, with no
 * AI involved — see the module doc comment.
 */
export async function generateGuestAssessment(
  ctx: GuestAiContext,
  options?: { fetcher?: typeof fetch }
): Promise<GuestAssessment> {
  // Run the deterministic engine first. If it's already critical (keyword
  // trigger or a safety-sweep answer), that result is authoritative and no
  // AI call is made — identical to the pre-AI behavior.
  const ruleBased = ruleBasedAssessGuestCase(ctx.input, ctx.answers);
  if (ruleBased.criticalTriggered) return ruleBased;

  // Below the keyword floor, the model is reasoning off a single unverified
  // line of free text with zero clarifying context on the very first turn.
  // A model can still misjudge that as critical (e.g. reading "won't start"
  // as urgent, when an immobile vehicle is one of the safest states there
  // is) — and doing so before any adaptive question has been asked would
  // skip the whole clarifying flow entirely (no question is ever asked once
  // a case is critical). So a critical verdict is only trusted once at least
  // one clarifying answer is on record; on the first turn it's treated the
  // same as an invalid AI response — fall back to the rule-based result
  // (never critical here, since the keyword floor above already cleared it)
  // and let the normal adaptive-question flow run for a turn first.
  const hasAnsweredAtLeastOneQuestion = Object.keys(ctx.answers).length > 0;

  try {
    const result = await invokeWithOrchestration({
      feature: "guest_case_assessment",
      messages: [
        { role: "system", content: ASSESSMENT_SYSTEM_PROMPT },
        { role: "user", content: contextBlock(ctx) },
      ],
      responseFormat: { type: "json_object" },
      maxTokens: 400,
      temperature: 0.3,
      timeoutMs: AI_TIMEOUT_MS,
    }, options?.fetcher ? { fetcher: options.fetcher } : undefined);

    const raw = result.choices[0]?.message.content;
    const text = typeof raw === "string" ? raw : "";
    const parsed = assessmentSchema.parse(JSON.parse(text));

    const aiWantsCritical = parsed.severity === "critical" || isCriticalAction(parsed.action);

    if (aiWantsCritical && !hasAnsweredAtLeastOneQuestion) {
      recordObservabilityEvent({
        category: "ai_provider",
        event: "guest_case_ai_critical_deferred",
        severity: "info",
        message: "AI classified the first-turn description as critical with no clarifying answers yet — deferred to the rule-based result for this turn so the adaptive flow still asks a question.",
      });
      return ruleBased;
    }

    // The AI can still land on "critical" (e.g. a description that reads as
    // unsafe without matching a hard-coded keyword) — treat that exactly like
    // a deterministic critical trigger: immediate safety guidance, required
    // review, no possible-causes speculation. criticalTrigger stays null
    // (not keyword-based) — callers already handle that (criticalReason()).
    if (aiWantsCritical) {
      return {
        criticalTrigger: null,
        criticalTriggered: true,
        internalSeverity: "critical",
        operatingAction: isCriticalAction(parsed.action) ? parsed.action : "pull_from_service",
        customerReadiness: "stop",
        recommendation: customerReadinessMeta("stop").operatingRecommendation,
        safetyGuidance: SAFETY_DISCLAIMERS.critical,
        reviewCategory: "critical_safety",
        reviewStatus: "review_required",
        explanation: parsed.explanation,
        confidence: parsed.confidence,
        confidenceLow: false,
      };
    }

    const readiness = readinessFromDecision(parsed.severity, parsed.action);

    return {
      criticalTrigger: null,
      criticalTriggered: false,
      internalSeverity: parsed.severity,
      operatingAction: parsed.action,
      customerReadiness: readiness,
      recommendation: customerReadinessMeta(readiness).operatingRecommendation,
      safetyGuidance: null,
      reviewCategory: null,
      reviewStatus: "automated_guidance_only",
      explanation: parsed.explanation,
      confidence: parsed.confidence,
      confidenceLow: false,
    };
  } catch (error) {
    recordObservabilityEvent({
      category: "ai_provider",
      event: "guest_case_ai_assessment_failed",
      severity: "warning",
      message: error instanceof Error ? error.message : String(error),
    });
    return ruleBased;
  }
}
