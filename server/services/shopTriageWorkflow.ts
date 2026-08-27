// Repair-shop diagnostic triage (Phase 1). Distinct from the fleet-side
// "can this vehicle keep operating" engine (server/services/diagnosisWorkflow.ts)
// — this is a technician-facing diagnostic SUPPORT assistant: urgency/safety,
// ranked likely causes, a next-best question/test/check/measurement, and a
// confidence score, iterated turn-by-turn until confidence clears
// SHOP_CONFIDENCE_THRESHOLD or no further evidence can reasonably move it.
//
// It never prescribes or authorizes a repair — "replace X" is not something
// this module is allowed to say. The confirmed diagnosis only becomes
// authoritative later, in the Repair Outcome step (see
// server/services/repairShopWorkflow.ts).
//
// Mirrors the confidence-loop pattern already used by the guest triage flow
// (server/services/guestCaseAi.ts: CONFIDENCE_THRESHOLD/evidenceCompletenessCeiling)
// but with a diagnostic (root-cause) schema instead of a safe-to-drive one,
// and persisted as an append-only maintenanceDecisions version per turn (see
// server/services/maintenanceDecisions.ts) rather than overwriting anything.
import { z } from "zod";
import { extractJsonObject, invokeWithOrchestration } from "./aiOrchestrator";
import { recordObservabilityEvent } from "./observability";
import type { MaintenanceSeverity } from "@shared/maintenance/caseWorkflow";

const AI_TIMEOUT_MS = 12_000;

// Target diagnostic confidence (repair-shop Phase 1 spec §8): keep asking for
// the single highest-value next question/test below this, unless evidence
// genuinely runs out first.
export const SHOP_CONFIDENCE_THRESHOLD = 85;

// Hard backstop on total diagnostic turns per case, independent of
// confidence, so a stuck loop can never run forever. Well above what a real
// diagnosis should need — this is a safety valve, not a target question count.
export const SHOP_TRIAGE_STEP_CAP = 12;

export const DIAGNOSTIC_STEP_TYPES = ["question", "test", "check", "measurement"] as const;
export type DiagnosticStepType = (typeof DIAGNOSTIC_STEP_TYPES)[number];

export type ConfidenceStatus = "insufficient" | "progressing" | "target_reached";

// One entry in the diagnostic trail: a prior next-best question/test/check/
// measurement plus the technician's answer/result. Also allows a free-form
// "observation" the technician volunteers without being asked (spec §9).
export type ShopEvidenceEntry = {
  type: DiagnosticStepType | "observation";
  instruction: string;
  response: string;
  recordedAt: string; // ISO timestamp
};

const likelyCauseSchema = z.object({
  cause: z.string().trim().min(1).max(200),
  rank: z.number().int().min(1).max(3),
  rationale: z.string().trim().min(1).max(400),
});

const nextStepSchema = z.object({
  type: z.enum(DIAGNOSTIC_STEP_TYPES),
  instruction: z.string().trim().min(1).max(300),
  reason: z.string().trim().min(1).max(300),
});

const triageResponseSchema = z.object({
  urgency: z.enum(["stable", "attention", "critical"]),
  safetySummary: z.string().trim().min(1).max(400),
  confidence: z.number().min(0).max(100),
  likelyCauses: z.array(likelyCauseSchema).max(3),
  nextDiagnosticStep: nextStepSchema.nullable(),
  evidenceSummary: z.string().trim().min(1).max(600),
  remainingVerification: z.array(z.string().trim().min(1).max(200)).max(8),
  diagnosticRationale: z.string().trim().min(1).max(600),
});

export type ShopTriageAiResponse = z.infer<typeof triageResponseSchema>;

export type ShopTriageResult = ShopTriageAiResponse & {
  confidenceStatus: ConfidenceStatus;
  severity: MaintenanceSeverity;
};

// Confidence is model-self-reported, which risks false precision off thin
// evidence. Cap it by how much has actually been gathered so far — never a
// floor, only a ceiling — mirroring guestCaseAi.ts's evidenceCompletenessCeiling.
export function evidenceCompletenessCeiling(input: {
  hasFaultCodes: boolean;
  hasMileage: boolean;
  evidenceCount: number;
}): number {
  let ceiling = 55; // a bare complaint, nothing else, caps at "moderate"
  if (input.hasFaultCodes) ceiling += 10;
  if (input.hasMileage) ceiling += 5;
  ceiling += Math.min(30, input.evidenceCount * 10);
  return Math.min(100, ceiling);
}

function evidenceLines(evidence: ShopEvidenceEntry[]): string {
  if (evidence.length === 0) return "None yet.";
  return evidence
    .map((e, i) => `${i + 1}. [${e.type}] ${e.instruction}\n   Result: ${e.response}`)
    .join("\n");
}

function contextBlock(input: {
  complaint: string;
  vehicleLabel: string;
  mileage?: string | null;
  faultCodes?: string[];
  evidence: ShopEvidenceEntry[];
}): string {
  return [
    `Vehicle: ${input.vehicleLabel}`,
    `Mileage: ${input.mileage?.trim() || "not provided"}`,
    `Fault codes on file: ${input.faultCodes?.length ? input.faultCodes.join(", ") : "none given"}`,
    `Original customer complaint (verbatim, never to be altered): "${input.complaint}"`,
    `Diagnostic trail so far (questions/tests/checks/measurements and their results, in order):`,
    evidenceLines(input.evidence),
  ].join("\n");
}

const SYSTEM_PROMPT = `You are a diagnostic support assistant for a professional truck repair shop technician who is standing at the vehicle. You are NOT deciding whether the vehicle can keep driving, and you are NOT a fleet dispatcher — a technician is already working the case.

Your job every turn:
1. Review the customer complaint and all diagnostic evidence gathered so far.
2. Identify up to the top 3 most likely causes, ranked, each with a short rationale grounded in the actual evidence.
3. Report an honest 0-100 confidence that the top-ranked cause is correct GIVEN ONLY the evidence actually gathered. Score conservatively: a bare complaint with no tests/checks yet should usually score well under 60. Never inflate confidence to look decisive — an honest low score is what lets the shop run one more useful check instead of guessing.
4. If confidence is below 85, choose the SINGLE highest-value next diagnostic step: the one question, test, check, or measurement that would most help separate the competing likely causes (a discriminating test), not just confirm your favorite. Avoid asking for anything that would not materially change the diagnosis. Prefer concrete technician-observable evidence: fault codes, connector/component inspection, a voltage/pressure/continuity measurement, whether a symptom occurs hot/cold/loaded, whether a light is active. If confidence is already >= 85, or if you judge that no further test would reasonably move the confidence higher (evidence has plateaued), return null for nextDiagnosticStep.
5. Identify safety-critical conditions early and describe them in safetySummary (e.g. brakes, steering, fuel/fire risk) — this is a support note, not a legal safety clearance.

Hard rules:
- NEVER present a likely cause as a confirmed diagnosis. Use language like "most likely causes include X, Y, Z; check A and measure B next" — never "replace X" or "the problem is X."
- NEVER fabricate a test result or claim evidence that was not actually given to you.
- NEVER claim confidence >= 85 unless the gathered evidence actually justifies it. It is a valid, expected outcome to stay below 85 and say evidence is currently insufficient — this is not a failure.
- Clearly separate, in evidenceSummary and diagnosticRationale: what the customer reported (symptom) vs. what has actually been observed/tested (evidence) vs. what you are inferring (likely cause). Never blend these into one unlabeled claim.
- Do not ask about, or infer from, anything not actually in the provided context.

Return strict JSON only, matching exactly this shape:
{
  "urgency": "stable" | "attention" | "critical",
  "safetySummary": "...",
  "confidence": <0-100>,
  "likelyCauses": [{"cause": "...", "rank": 1, "rationale": "..."}, ...] (0 to 3 entries, ranked),
  "nextDiagnosticStep": {"type": "question"|"test"|"check"|"measurement", "instruction": "...", "reason": "..."} | null,
  "evidenceSummary": "...",
  "remainingVerification": ["...", ...] (checks still worth doing before repair, even if confidence is already high; may be empty),
  "diagnosticRationale": "..."
}`;

function severityFromUrgency(urgency: "stable" | "attention" | "critical"): MaintenanceSeverity {
  return urgency;
}

function confidenceStatusFor(confidence: number, hasNextStep: boolean): ConfidenceStatus {
  if (confidence >= SHOP_CONFIDENCE_THRESHOLD) return "target_reached";
  if (!hasNextStep) return "insufficient"; // below target AND AI judges no further evidence would help
  return "progressing";
}

/**
 * Run one turn of the adaptive shop triage loop. Returns the fallback
 * "insufficient evidence" result (never throws) if the AI call fails or
 * returns invalid output — the technician-facing loop must never stall or
 * error out because of an AI outage.
 */
export async function runShopTriageStep(
  input: {
    complaint: string;
    vehicleLabel: string;
    mileage?: string | null;
    faultCodes?: string[];
    evidence: ShopEvidenceEntry[];
  },
  options?: { fetcher?: typeof fetch }
): Promise<ShopTriageResult> {
  const ceiling = evidenceCompletenessCeiling({
    hasFaultCodes: Boolean(input.faultCodes?.length),
    hasMileage: Boolean(input.mileage?.trim()),
    evidenceCount: input.evidence.length,
  });

  try {
    const result = await invokeWithOrchestration(
      {
        feature: "shop_triage_step",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: contextBlock(input) },
        ],
        responseFormat: { type: "json_object" },
        maxTokens: 700,
        temperature: 0.3,
        timeoutMs: AI_TIMEOUT_MS,
        disableReasoning: true,
      },
      options?.fetcher ? { fetcher: options.fetcher } : undefined
    );

    const raw = result.choices[0]?.message.content;
    const text = typeof raw === "string" ? raw : "";
    const parsed = triageResponseSchema.parse(JSON.parse(extractJsonObject(text)));

    const confidence = Math.min(parsed.confidence, ceiling);
    const nextDiagnosticStep = confidence >= SHOP_CONFIDENCE_THRESHOLD ? null : parsed.nextDiagnosticStep;

    return {
      ...parsed,
      confidence,
      nextDiagnosticStep,
      severity: severityFromUrgency(parsed.urgency),
      confidenceStatus: confidenceStatusFor(confidence, nextDiagnosticStep !== null),
    };
  } catch (error) {
    recordObservabilityEvent({
      category: "ai_provider",
      event: "shop_triage_step_failed",
      severity: "warning",
      message: error instanceof Error ? error.message : String(error),
    });

    return {
      urgency: "attention",
      safetySummary: "Unable to run AI diagnostic support this turn. Use technician judgment.",
      confidence: 0,
      likelyCauses: [],
      nextDiagnosticStep: null,
      evidenceSummary:
        input.evidence.length > 0
          ? "AI diagnostic support is temporarily unavailable; see the diagnostic trail for evidence gathered so far."
          : "AI diagnostic support is temporarily unavailable and no diagnostic evidence has been gathered yet.",
      remainingVerification: [],
      diagnosticRationale: "Insufficient evidence to reach a confidence assessment: diagnostic support is unavailable.",
      severity: "attention",
      confidenceStatus: "insufficient",
    };
  }
}
