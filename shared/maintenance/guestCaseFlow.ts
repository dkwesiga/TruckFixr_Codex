// Guest "/try-one-case" adaptive flow — pure, deterministic, shared client/server.
//
// Two guarantees this module exists to enforce at the APPLICATION level (not just UI):
//   1. Critical safety triggers (§18) are detected from the concern + operating status
//      and short-circuit the normal flow (safety guidance before anything else).
//   2. No more than MAX_ADAPTIVE_QUESTIONS questions are ever asked, for any input path.
//
// No DB, no AI. Identical input -> identical output, so it is trivially testable and the
// question cap can be asserted directly (see guestCaseFlow.test.ts).

// PRD v1.1 §4.3: ask up to five clarifying questions, one at a time, stopping
// early once there is enough information for a useful next action.
export const MAX_ADAPTIVE_QUESTIONS = 5;

export const OPERATING_STATUSES = [
  "operating_normally",
  "operating_with_symptoms",
  "reduced_power_derate",
  "stopped",
  "unsafe_to_move",
  "unknown",
] as const;
export type OperatingStatus = (typeof OPERATING_STATUSES)[number];

export const CONCERN_CATEGORIES = [
  "symptom",
  "warning_light",
  "fault_code",
  "defect",
  "inspection_finding",
  "telematics_alert",
  "diagnostic_event",
  "maintenance_concern",
] as const;
export type ConcernCategory = (typeof CONCERN_CATEGORIES)[number];

// ---------------------------------------------------------------------------
// Critical triggers (§18). Ordered most life-threatening first; detection returns
// the first match. Keyword lists are lowercase; matching is case-insensitive
// substring on the concern text. `unsafe_to_move` operating status is itself a
// trigger regardless of text.
// ---------------------------------------------------------------------------

export interface CriticalTrigger {
  code: string;
  label: string;
  keywords: string[];
}

export const CRITICAL_TRIGGERS: CriticalTrigger[] = [
  { code: "fire", label: "Fire", keywords: ["fire", "flames", "burning", "on fire"] },
  { code: "smoke", label: "Smoke", keywords: ["smoke", "smoking"] },
  { code: "collision_risk", label: "Collision-related mechanical risk", keywords: ["collision", "crash", "accident", "rollover", "rolled over"] },
  { code: "immediate_danger", label: "Immediate danger to people", keywords: ["injury", "injured", "someone hurt", "people in danger", "trapped", "hurt"] },
  { code: "brake_performance", label: "Brake performance concern", keywords: ["no brakes", "brake failure", "brakes gone", "brake fade", "won't stop", "cannot stop", "brake"] },
  { code: "steering", label: "Steering concern", keywords: ["can't steer", "cannot steer", "won't steer", "loss of steering", "steering failure", "hard to steer"] },
  { code: "wheel_separation", label: "Wheel-separation concern", keywords: ["wheel coming off", "wheel separation", "wheel off", "studs sheared", "lugs sheared", "sheared studs"] },
  { code: "tire_instability", label: "Tire instability", keywords: ["blowout", "blow out", "tire blew", "tire shredded", "tread separation"] },
  { code: "wheel_instability", label: "Wheel instability", keywords: ["wheel wobble", "wheel loose", "loose wheel", "wheel shaking"] },
  { code: "low_air_pressure", label: "Low air-pressure warning", keywords: ["low air", "air pressure warning", "low air pressure", "air pressure low"] },
  { code: "red_stop_engine", label: "Red stop-engine warning", keywords: ["red stop", "stop engine", "red engine light", "stop lamp", "red warning light"] },
  { code: "low_oil_pressure", label: "Low oil pressure", keywords: ["low oil pressure", "oil pressure warning", "no oil pressure"] },
  { code: "severe_overheating", label: "Severe overheating", keywords: ["overheat", "overheating", "coolant boiling", "engine too hot", "temperature critical"] },
  { code: "dangerous_leak", label: "Dangerous active leak", keywords: ["fuel leak", "leaking fuel", "fuel pouring", "active leak", "coolant pouring", "oil pouring"] },
];

export interface GuestCaseInput {
  concernCategory?: ConcernCategory;
  concernText: string;
  operatingStatus: OperatingStatus;
  faultCodes?: string[];
}

const norm = (s: string): string => s.toLowerCase();

/**
 * Returns the first matching critical trigger, or null. `unsafe_to_move` is
 * always critical (immediate danger). Otherwise matches concern text keywords.
 */
export function detectCriticalTrigger(
  input: GuestCaseInput
): CriticalTrigger | null {
  if (input.operatingStatus === "unsafe_to_move") {
    return (
      CRITICAL_TRIGGERS.find((t) => t.code === "immediate_danger") ?? {
        code: "unsafe_to_move",
        label: "Vehicle reported unsafe to move",
        keywords: [],
      }
    );
  }
  const text = norm(input.concernText ?? "");
  for (const trigger of CRITICAL_TRIGGERS) {
    if (trigger.keywords.some((kw) => text.includes(kw))) {
      return trigger;
    }
  }
  return null;
}

export function isCriticalInput(input: GuestCaseInput): boolean {
  return detectCriticalTrigger(input) !== null;
}

// ---------------------------------------------------------------------------
// Adaptive questions. Each question, if asked, must be capable of changing at
// least one of: internal severity, customer readiness, operating action,
// escalation, required evidence, or the next diagnostic step (see `impacts`).
// ---------------------------------------------------------------------------

export type QuestionImpact =
  | "severity"
  | "readiness"
  | "operating_action"
  | "escalation"
  | "evidence"
  | "next_step";

export interface AdaptiveQuestionOption {
  value: string;
  label: string;
}

export interface AdaptiveQuestion {
  id: string;
  prompt: string;
  options: AdaptiveQuestionOption[];
  impacts: QuestionImpact[];
}

const Q: Record<string, AdaptiveQuestion> = {
  operating_status_clarify: {
    id: "operating_status_clarify",
    prompt: "Right now, can the vehicle be driven safely?",
    options: [
      { value: "yes_normal", label: "Yes, seems normal" },
      { value: "yes_symptoms", label: "Yes, but with symptoms" },
      { value: "reduced", label: "Only with reduced power" },
      { value: "no", label: "No / not sure it is safe" },
    ],
    impacts: ["severity", "readiness", "operating_action", "escalation"],
  },
  warning_light_color: {
    id: "warning_light_color",
    prompt: "What colour is the warning light?",
    options: [
      { value: "red", label: "Red" },
      { value: "amber", label: "Amber / yellow" },
      { value: "flashing", label: "Flashing" },
      { value: "unknown", label: "Not sure" },
    ],
    impacts: ["severity", "readiness", "escalation"],
  },
  fault_code_active: {
    id: "fault_code_active",
    prompt: "Is the fault code active now, or was it stored/historic?",
    options: [
      { value: "active", label: "Active now" },
      { value: "stored", label: "Stored / historic" },
      { value: "recurring", label: "Keeps coming back" },
      { value: "unknown", label: "Not sure" },
    ],
    impacts: ["severity", "next_step", "evidence"],
  },
  symptom_frequency: {
    id: "symptom_frequency",
    prompt: "How often does this happen?",
    options: [
      { value: "constant", label: "Constant" },
      { value: "intermittent", label: "Comes and goes" },
      { value: "once", label: "Just once so far" },
      { value: "worsening", label: "Getting worse" },
    ],
    impacts: ["severity", "readiness", "next_step"],
  },
  defect_safety_system: {
    id: "defect_safety_system",
    prompt: "Does this affect a safety system (brakes, steering, tires, lights)?",
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
      { value: "unknown", label: "Not sure" },
    ],
    impacts: ["severity", "escalation", "operating_action"],
  },
  alert_severity: {
    id: "alert_severity",
    prompt: "How did the alert describe the issue?",
    options: [
      { value: "critical", label: "Critical / severe" },
      { value: "warning", label: "Warning" },
      { value: "info", label: "Informational" },
      { value: "unknown", label: "Not sure" },
    ],
    impacts: ["severity", "readiness", "next_step"],
  },
  service_overdue: {
    id: "service_overdue",
    prompt: "Is scheduled service overdue for this vehicle?",
    options: [
      { value: "overdue", label: "Yes, overdue" },
      { value: "due_soon", label: "Due soon" },
      { value: "current", label: "Up to date" },
      { value: "unknown", label: "Not sure" },
    ],
    impacts: ["readiness", "operating_action", "next_step"],
  },
  safety_sweep: {
    id: "safety_sweep",
    prompt: "Any signs of smoke, fire, fluid leaks, or brake/steering trouble?",
    options: [
      { value: "none", label: "None of these" },
      { value: "leak", label: "Fluid leak" },
      { value: "brake_steer", label: "Brake or steering" },
      { value: "smoke_fire", label: "Smoke or fire" },
    ],
    impacts: ["severity", "escalation", "operating_action"],
  },
};

// The mandatory safety sweep — always asked verbatim by deterministic code
// (see server/services/guestCaseAi.ts), never authored, reworded, or skipped
// by the AI-generated question path. Exported so that layer can force it in.
export const SAFETY_SWEEP_QUESTION: AdaptiveQuestion = Q.safety_sweep;

function categoryQuestion(
  category: ConcernCategory | undefined
): AdaptiveQuestion | null {
  switch (category) {
    case "warning_light":
      return Q.warning_light_color;
    case "fault_code":
    case "diagnostic_event":
      return Q.fault_code_active;
    case "symptom":
      return Q.symptom_frequency;
    case "defect":
    case "inspection_finding":
      return Q.defect_safety_system;
    case "telematics_alert":
      return Q.alert_severity;
    case "maintenance_concern":
      return Q.service_overdue;
    default:
      return null;
  }
}

/**
 * Deterministically select the adaptive questions for this case, capped at
 * MAX_ADAPTIVE_QUESTIONS. A critical input short-circuits to zero questions
 * (the flow shows safety guidance instead).
 */
export function selectAdaptiveQuestions(
  input: GuestCaseInput
): AdaptiveQuestion[] {
  if (isCriticalInput(input)) return [];

  const ordered: AdaptiveQuestion[] = [];
  const push = (q: AdaptiveQuestion | null): void => {
    if (q && !ordered.some((existing) => existing.id === q.id)) ordered.push(q);
  };

  // 1. If we don't yet know whether it is drivable, that dominates.
  if (input.operatingStatus === "unknown") push(Q.operating_status_clarify);
  // 2. A question tailored to the concern category.
  push(categoryQuestion(input.concernCategory));
  // 3. A safety sweep that can still escalate a non-critical-looking report.
  push(Q.safety_sweep);
  // 4. Whether a safety system is affected (skipped if it was already the
  //    category question above — `push` dedupes by id).
  push(Q.defect_safety_system);
  // 5. Whether scheduled service is overdue (same dedupe behaviour).
  push(Q.service_overdue);

  return ordered.slice(0, MAX_ADAPTIVE_QUESTIONS);
}

/**
 * The next question to ask given the ids already answered, or null when the
 * flow is complete. Enforces the hard cap: once MAX_ADAPTIVE_QUESTIONS have
 * been answered, this ALWAYS returns null regardless of selection.
 */
export function nextAdaptiveQuestion(
  input: GuestCaseInput,
  answeredQuestionIds: string[]
): AdaptiveQuestion | null {
  if (isCriticalInput(input)) return null;
  if (answeredQuestionIds.length >= MAX_ADAPTIVE_QUESTIONS) return null;
  const selected = selectAdaptiveQuestions(input);
  return (
    selected.find((q) => !answeredQuestionIds.includes(q.id)) ?? null
  );
}
