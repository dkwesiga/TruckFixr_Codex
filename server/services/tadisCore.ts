import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getDiagnosticRuntimeConfig } from "./diagnosticConfig";
import {
  interpretDiagnosticIntakeWithLlm,
  classifyDiagnosticIssueWithLlm,
  diagnoseDiagnosticIssueWithLlm,
  buildSimpleClassificationPrompt,
  buildSimpleDiagnosisPromptMessage,
  reviewDiagnosticWithLlm,
  type DiagnosticIntakeInterpretation,
  type DiagnosticIntakeInterpretationResult,
  type DiagnosticSimpleClassificationResult,
} from "./diagnosticLlmReview";
import { insertDiagnosticAiRequestLog, updateDiagnosticAiRequestLog } from "./diagnosticAiRequestLogs";
import { queueDiagnosticReviewRecords } from "./diagnosticReviewQueue";

const MAX_CLARIFICATION_ROUNDS = 5;
const DEFAULT_SIMILAR_CASE_LIMIT = 7;

const riskLevelSchema = z.enum(["low", "medium", "high", "critical"]);
const nonZeroIntegerSchema = z.number().int().refine((value) => value !== 0, {
  message: "Expected non-zero vehicle id",
});
const vehicleIdentifierSchema = z
  .union([z.string().trim().min(1), nonZeroIntegerSchema])
  .transform((value) => String(value));

export const DiagnosticVehicleSchema = z.object({
  id: vehicleIdentifierSchema,
  vin: z.string().trim().optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  year: z.number().int().nullable().optional(),
  engine: z.string().optional(),
  mileage: z.number().int().nonnegative().optional(),
  engineHours: z.number().int().nonnegative().optional(),
  status: z.string().optional(),
  configuration: z.record(z.string(), z.unknown()).optional(),
  trailerConfiguration: z.string().optional(),
  brakeConfiguration: z.string().optional(),
  emissionsConfiguration: z.string().optional(),
});

export const DiagnosticHistoryEntrySchema = z.object({
  summary: z.string(),
  category: z.string().optional(),
  status: z.string().optional(),
  occurredAt: z.union([z.date(), z.string()]).optional(),
  outcome: z.string().optional(),
});

export const SimilarCaseSchema = z.object({
  id: z.string(),
  source: z.enum(["library", "historical"]),
  causeId: z.string(),
  cause: z.string(),
  systems_affected: z.array(z.string()).default([]),
  symptomSignals: z.array(z.string()).default([]),
  faultCodes: z.array(z.string()).default([]),
  summary: z.string(),
  resolution: z.string(),
  confirmedFix: z.string().optional(),
  resolutionSuccess: z.boolean().optional(),
  risk_level: riskLevelSchema,
  similarity: z.number().min(0).max(1).default(0),
});

export const ClarificationTurnSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
});

type SimpleDiagnosticClassification = NonNullable<DiagnosticSimpleClassificationResult["parsed"]>;

const RecentPartReplacementSchema = z.object({
  part: z.string(),
  replacedAt: z.string().nullable().default(null),
  days_since_replacement: z.number().min(0).nullable().default(null),
  replacement_effect_direction: z.enum([
    "less_likely_same_part_failed",
    "possible_bad_install",
    "possible_defective_part",
    "possible_incomplete_root_cause_repair",
    "possible_adjacent_failure",
    "unknown",
  ]),
  replacement_decay_weight: z.number().min(0).max(1),
  relevance_score: z.number().min(0).max(100),
});

export const DiagnosticInputSchema = z.object({
  fleetId: z.number().int().positive().optional(),
  vehicleId: vehicleIdentifierSchema,
  symptoms: z.array(z.string().trim().min(1)).min(1),
  faultCodes: z.array(z.string().trim().min(1)).default([]),
  driverNotes: z.string().trim().optional(),
  operatingConditions: z.string().trim().optional(),
  vehicle: DiagnosticVehicleSchema.optional(),
  issueHistory: z.object({
    priorDiagnostics: z.array(DiagnosticHistoryEntrySchema).default([]),
    priorDefects: z.array(DiagnosticHistoryEntrySchema).default([]),
    recentInspections: z.array(DiagnosticHistoryEntrySchema).default([]),
    recentRepairs: z.array(DiagnosticHistoryEntrySchema).default([]),
    repairHistory: z.array(DiagnosticHistoryEntrySchema).default([]),
    maintenanceHistory: z.array(DiagnosticHistoryEntrySchema).default([]),
    recentPartsReplaced: z.array(RecentPartReplacementSchema).default([]),
    complianceHistory: z.array(DiagnosticHistoryEntrySchema).default([]),
  }).default({
    priorDiagnostics: [],
    priorDefects: [],
    recentInspections: [],
    recentRepairs: [],
    repairHistory: [],
    maintenanceHistory: [],
    recentPartsReplaced: [],
    complianceHistory: [],
  }),
  similarCases: z.array(SimilarCaseSchema).default([]),
  clarificationHistory: z.array(ClarificationTurnSchema).max(MAX_CLARIFICATION_ROUNDS).default([]),
});

export type DiagnosticInput = z.infer<typeof DiagnosticInputSchema>;
export type DiagnosticInputRequest = z.input<typeof DiagnosticInputSchema>;
export type SimilarCase = z.infer<typeof SimilarCaseSchema>;
export type ClarificationTurn = z.infer<typeof ClarificationTurnSchema>;

const driverActionSchema = z.enum([
  "keep_running_monitor",
  "drive_to_shop",
  "stop_and_inspect_on_site",
  "stop_and_tow",
  "derate_and_drive_short_distance",
  "do_not_operate_until_repaired",
]);

const llmStatusSchema = z.enum(["ok", "not_configured", "timeout", "invalid_schema", "error"]);

const laborRangeSchema = z.object({
  min: z.number().min(0),
  max: z.number().min(0),
});

const faultCodeInterpretationSchema = z.object({
  code: z.string(),
  interpretation: z.string(),
  role: z.enum(["primary", "secondary", "downstream", "incidental", "uncertain"]),
  signal_strength: z.number().min(0).max(100),
});

const rankedCauseSchema = z.object({
  cause_id: z.string().nullable(),
  cause_name: z.string(),
  is_new_cause: z.boolean(),
  probability: z.number().min(0).max(100),
  evidence_summary: z.array(z.string()).default([]),
  ranking_rationale: z.array(z.string()).default([]),
  symptom_support_score: z.number().min(0).max(100),
  fault_code_support_score: z.number().min(0).max(100),
  repair_history_support_score: z.number().min(0).max(100),
  maintenance_history_support_score: z.number().min(0).max(100),
  recent_parts_support_score: z.number().min(0).max(100),
  recurring_failure_support_score: z.number().min(0).max(100),
  cause_library_fit_score: z.number().min(0).max(100),
  novel_cause_support_score: z.number().min(0).max(100).nullable(),
  candidate_source_reasons: z.array(z.string()).default([]),
});

const candidateUniverseSchema = z.object({
  cause_id: z.string().nullable(),
  cause_name: z.string(),
  source: z.enum([
    "baseline_match",
    "near_match",
    "related_subsystem",
    "similar_case",
    "fault_code_inferred",
    "llm_suggested",
  ]),
  reasons: z.array(z.string()).default([]),
});

const similarConfirmedCaseEvidenceSchema = z.object({
  id: z.string(),
  source: z.enum(["library", "historical"]),
  cause_id: z.string(),
  cause_name: z.string(),
  similarity: z.number().min(0).max(1),
  matched_signals: z.array(z.string()).default([]),
  summary: z.string(),
  confirmed_fix: z.string().nullable().default(null),
  resolution_success: z.boolean().nullable().default(null),
});

const ruleEngineBaselineSchema = z.object({
  systems_affected: z.array(z.string()),
  possible_causes: z.array(
    z.object({
      cause: z.string(),
      probability: z.number().min(0).max(100),
    })
  ),
  confidence_score: z.number().min(0).max(100),
  next_action: z.enum(["ask_question", "proceed"]),
  clarifying_question: z.string(),
  recommended_tests: z.array(z.string()),
  recommended_fix: z.string(),
  risk_level: riskLevelSchema,
  compliance_impact: z.enum(["none", "warning", "critical"]),
  matched_library_causes: z.array(z.string()).default([]),
  partial_library_matches: z.array(z.string()).default([]),
  candidate_universe: z.array(candidateUniverseSchema).default([]),
});

export const TadisOutputSchema = z.object({
  vehicle_id: z.string().min(1),
  systems_affected: z.array(z.string()),
  rule_engine_baseline: ruleEngineBaselineSchema,
  internal_engine_baseline: ruleEngineBaselineSchema,
  final_llm_ranking: z.array(rankedCauseSchema).min(1),
  llm_final_ranking: z.array(rankedCauseSchema).min(1),
  ranked_likely_causes: z.array(rankedCauseSchema).min(1),
  possible_causes: z.array(
    z.object({
      cause: z.string(),
      probability: z.number().min(0).max(100),
    })
  ).min(1),
  ranking_delta: z.object({
    top_cause_changed: z.boolean(),
    baseline_top_cause: z.string().nullable(),
    final_top_cause: z.string().nullable(),
    added_causes: z.array(z.string()).default([]),
    removed_causes: z.array(z.string()).default([]),
  }),
  confidence_delta: z.number(),
  llm_adjustments: z.array(z.string()).default([]),
  evidence_summary: z.array(z.string()).default([]),
  normalized_symptoms: z.array(z.string()).default([]),
  primary_symptoms: z.array(z.string()).default([]),
  secondary_symptoms: z.array(z.string()).default([]),
  symptom_to_system_links: z.array(
    z.object({
      symptom: z.string(),
      linked_systems: z.array(z.string()).default([]),
    })
  ).default([]),
  symptom_score: z.number().min(0).max(100),
  symptom_signal_strength: z.number().min(0).max(100),
  symptom_rationale: z.array(z.string()).default([]),
  fault_code_score: z.number().min(0).max(100),
  fault_code_signal_strength: z.number().min(0).max(100),
  primary_vs_secondary_code_assessment: z.array(z.string()).default([]),
  contextual_code_relevance: z.array(z.string()).default([]),
  code_to_cause_links: z.array(z.string()).default([]),
  fault_code_interpretations: z.array(faultCodeInterpretationSchema).default([]),
  fault_code_rationale: z.array(z.string()).default([]),
  repair_history_score: z.number().min(0).max(100),
  maintenance_history_score: z.number().min(0).max(100),
  history_score: z.number().min(0).max(100),
  repair_history_rationale: z.array(z.string()).default([]),
  maintenance_history_rationale: z.array(z.string()).default([]),
  history_rationale: z.array(z.string()).default([]),
  recent_parts_replaced: z.array(RecentPartReplacementSchema).default([]),
  recent_parts_replaced_score: z.number().min(0).max(100),
  replacement_relevance_to_current_issue: z.array(z.string()).default([]),
  replacement_effect_direction: z.array(z.string()).default([]),
  replacement_decay_weight: z.number().min(0).max(1),
  recent_parts_rationale: z.array(z.string()).default([]),
  recurring_failure_score: z.number().min(0).max(100),
  recurring_pattern_type: z.array(z.string()).default([]),
  repeat_code_frequency: z.record(z.string(), z.number()).default({}),
  repeat_component_frequency: z.record(z.string(), z.number()).default({}),
  repeat_repair_without_resolution: z.array(z.string()).default([]),
  suspected_unresolved_root_cause: z.string().nullable(),
  recurrence_rationale: z.array(z.string()).default([]),
  cause_library_fit_score: z.number().min(0).max(100),
  matched_library_causes: z.array(z.string()).default([]),
  partial_library_matches: z.array(z.string()).default([]),
  new_candidate_causes: z.array(z.string()).default([]),
  new_candidate_causes_review_required: z.boolean(),
  cause_library_rationale: z.array(z.string()).default([]),
  overall_confidence_score: z.number().min(0).max(100),
  confidence_score: z.number().min(0).max(100),
  confidence_rationale: z.array(z.string()).default([]),
  next_action: z.enum(["ask_question", "proceed"]),
  clarifying_question: z.string(),
  question_rationale: z.string().nullable().default(null),
  missing_evidence: z.array(z.string()).default([]),
  ambiguity_drivers: z.array(z.string()).default([]),
  similar_confirmed_cases_used: z.array(similarConfirmedCaseEvidenceSchema).default([]),
  recommended_tests: z.array(z.string()).default([]),
  recommended_fix: z.string(),
  risk_level: riskLevelSchema,
  maintenance_recommendations: z.array(z.string()).default([]),
  compliance_impact: z.enum(["none", "warning", "critical"]),
  top_most_likely_cause: z.string(),
  possible_replacement_parts: z.array(z.string()).default([]),
  likely_replacement_parts: z.array(z.string()).default([]),
  inspection_related_parts: z.array(z.string()).default([]),
  adjacent_parts_to_check: z.array(z.string()).default([]),
  confirm_before_replacement: z.boolean(),
  diagnostic_verification_labor_hours: laborRangeSchema,
  repair_labor_hours: laborRangeSchema,
  total_estimated_labor_hours: laborRangeSchema,
  labor_time_confidence: z.number().min(0).max(100),
  labor_time_basis: z.array(z.string()).default([]),
  driver_action: driverActionSchema,
  driver_action_reason: z.string(),
  risk_summary: z.string(),
  safety_note: z.string(),
  compliance_note: z.string(),
  monitoring_instructions: z.array(z.string()).default([]),
  distance_or_time_limit: z.string().nullable().default(null),
  llm_status: llmStatusSchema,
  llm_provider: z.string().nullable(),
  llm_model: z.string().nullable(),
  fallback_used: z.boolean(),
  fallback_reason: z.string().nullable().default(null),
  safety_override_applied: z.boolean(),
  safety_override_reason: z.string().nullable().default(null),
  review_queue_record_ids: z.array(z.number()).default([]),
});

export type TadisOutput = z.infer<typeof TadisOutputSchema>;

const clarifyingQuestionResponseSchema = z.object({
  question: z.string().trim().min(1),
});

type QuestionDefinition = {
  text: string;
  positiveFor: string[];
  negativeFor?: string[];
  positiveKeywords: string[];
  negativeKeywords: string[];
};

type CauseDefinition = {
  id: string;
  cause: string;
  systems: string[];
  risk: z.infer<typeof riskLevelSchema>;
  symptomKeywords: string[];
  noteKeywords: string[];
  faultCodes: string[];
  historyKeywords?: string[];
  vehicleSignals?: string[];
  recommendedTests: string[];
  recommendedFix: string;
  questions: QuestionDefinition[];
};

type DiagnosticContext = {
  input: DiagnosticInput;
  normalizedSymptoms: string[];
  normalizedFaultCodes: string[];
  notes: string;
  historyText: string;
  similarCases: SimilarCase[];
  matchedSignals: number;
  complaintDomains: string[];
  llmIntakeInterpretation: DiagnosticIntakeInterpretation | null;
  llmInterpretationText: string;
};

const SIMPLE_TADIS_CONFIDENCE_THRESHOLD = 85;
const SIMPLE_TADIS_CLASSIFIER_MAX_CHARS = 1400;
const SIMPLE_TADIS_CLASSIFIER_TARGET_CHARS = 520;
const SIMPLE_TADIS_DIAGNOSIS_MAX_CHARS = 1800;
const SIMPLE_TADIS_DIAGNOSIS_TARGET_CHARS = 720;
const SIMPLE_TADIS_CLASSIFIER_MAX_TOKENS = 80;
const SIMPLE_TADIS_DIAGNOSIS_MAX_TOKENS = 120;

const SIMPLE_CATEGORY_TO_SYSTEMS: Record<string, string[]> = {
  critical_engine_internal: ["engine", "cooling", "lubrication"],
  engine_performance: ["engine", "air_intake", "fuel"],
  oil_lubrication_system: ["lubrication", "engine"],
  cooling_system: ["cooling", "engine"],
  aftertreatment_dpf_def_scr: ["aftertreatment", "emissions"],
  electrical_battery_alternator: ["electrical", "battery", "charging"],
  starting_charging: ["electrical", "starting", "charging"],
  air_brake_system: ["brakes", "air_system"],
  fuel_system: ["fuel", "engine"],
  transmission_driveline: ["transmission", "driveline"],
  hydraulics_pto: ["hydraulics", "pto"],
  suspension_steering: ["suspension", "steering"],
  trailer_lighting: ["trailer", "lighting"],
  abs_wheel_end: ["brakes", "wheel_end"],
  tires_wheels: ["tires", "wheels"],
  unknown_triage: ["unknown"],
};

function truncateForSimpleMode(value: unknown, maxLength: number) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return null;
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}

function trimStringArrayForSimpleMode(value: unknown, limit: number, maxLength: number) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => truncateForSimpleMode(item, maxLength))
    .filter((item): item is string => Boolean(item))
    .slice(0, limit);
}

function removeUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => removeUndefinedDeep(item)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, removeUndefinedDeep(entry)])
    ) as T;
  }

  return value;
}

function estimatePromptCharacterCount(messages: Array<{ role: string; content: string }>) {
  return JSON.stringify(messages).length;
}

function estimatePromptTokenCount(characters: number) {
  return Math.max(1, Math.ceil(characters / 4));
}

function buildSimpleCategoryInput(input: DiagnosticInputRequest) {
  const rawSymptoms = (input.symptoms ?? [])
    .slice(0, 3)
    .map((item) => item.trim())
    .filter(Boolean);
  const symptomDescription =
    truncateForSimpleMode(
      [
        rawSymptoms.join("; "),
        input.driverNotes ? `Driver notes: ${input.driverNotes}` : "",
        input.operatingConditions ? `Operating conditions: ${input.operatingConditions}` : "",
      ]
        .filter(Boolean)
        .join(" | "),
      SIMPLE_TADIS_CLASSIFIER_TARGET_CHARS
    ) ?? "";
  const assetType =
    input.vehicle?.trailerConfiguration ? "trailer" : "tractor";

  return removeUndefinedDeep({
    asset_type: assetType,
    year: input.vehicle?.year ?? null,
    make: input.vehicle?.make ?? null,
      model: input.vehicle?.model ?? null,
      engine: input.vehicle?.engine ?? null,
      driver_selected_category: "",
      symptom_description: symptomDescription,
      fault_codes: (input.faultCodes ?? []).slice(0, 4),
      warning_lights: [] as string[],
    });
}

function buildSimpleDiagnosisInput(
  input: DiagnosticInputRequest,
  classifier: SimpleDiagnosticClassification
) {
  const clarificationSummary = input.clarificationHistory?.length
    ? input.clarificationHistory
        .slice(-5)
        .map((turn, index) => `Q${index + 1}: ${turn.question} A${index + 1}: ${turn.answer}`)
        .join(" | ")
    : "";
  const symptomDescription = truncateForSimpleMode(
    [
      (input.symptoms ?? []).slice(0, 3).join("; "),
      input.driverNotes ? `Driver notes: ${input.driverNotes}` : "",
      input.operatingConditions ? `Operating conditions: ${input.operatingConditions}` : "",
      clarificationSummary ? `Clarifications: ${clarificationSummary}` : "",
    ]
      .filter(Boolean)
      .join(" | "),
    SIMPLE_TADIS_DIAGNOSIS_TARGET_CHARS
  );
  const severity =
    classifier.risk_level === "critical"
      ? "critical"
      : classifier.risk_level === "high"
        ? "high"
        : classifier.risk_level === "medium"
          ? "moderate"
          : "minor";

  return removeUndefinedDeep({
        vehicle: {
          asset_type: input.vehicle?.trailerConfiguration ? "trailer" : "tractor",
          year: input.vehicle?.year ?? null,
          make: input.vehicle?.make ?? null,
          model: input.vehicle?.model ?? null,
          engine: input.vehicle?.engine ?? null,
          mileage: input.vehicle?.mileage ?? null,
        },
        current_issue: {
          symptom_description: symptomDescription,
        fault_codes: (input.faultCodes ?? []).slice(0, 4),
          warning_lights: [] as string[],
        when_it_happens: truncateForSimpleMode(input.operatingConditions, 100),
          can_vehicle_move: null,
          severity,
        },
    classifier: {
      primary_category: classifier.primary_category,
      secondary_category: classifier.secondary_category,
      risk_level: classifier.risk_level,
    },
  });
}

function buildSimpleFallbackClassification(input: DiagnosticInputRequest): SimpleDiagnosticClassification {
  const text = `${(input.symptoms ?? []).slice(0, 3).join(" ")} ${input.driverNotes ?? ""} ${input.operatingConditions ?? ""}`.toLowerCase();
  const faults = (input.faultCodes ?? []).map((code) => code.toUpperCase());

  if (
    /(oil.*coolant|coolant.*oil|milky oil|milky coolant|coolant in oil|oil in coolant|cross contamination|contaminated coolant)/i.test(
      text
    )
  ) {
    return {
      primary_category: "critical_engine_internal",
      secondary_category: "cooling_system",
      risk_level: "critical",
      classification_confidence: 97,
      clarifying_question: null,
    };
  }

  if (/overheat|temperature|coolant|thermostat|radiator|fan/.test(text) || faults.includes("P0128")) {
    return {
      primary_category: "cooling_system",
      secondary_category: "engine_performance",
      risk_level: "high",
      classification_confidence: 88,
      clarifying_question: null,
    };
  }

  if (/oil pressure|low oil|lubrication|oil leak|oil light/.test(text)) {
    return {
      primary_category: "oil_lubrication_system",
      secondary_category: "critical_engine_internal",
      risk_level: "high",
      classification_confidence: 86,
      clarifying_question: null,
    };
  }

  if (/battery|alternator|charging|start|crank|no start|won't start|won.t start/.test(text)) {
    return {
      primary_category: "starting_charging",
      secondary_category: "electrical_battery_alternator",
      risk_level: "medium",
      classification_confidence: 84,
      clarifying_question: "When you try to start it, does the engine crank normally or is it slow/no-crank?",
    };
  }

  if (/air brake|low air|parking brake|brake chamber|air leak|air pressure/.test(text)) {
    return {
      primary_category: "air_brake_system",
      secondary_category: "abs_wheel_end",
      risk_level: "critical",
      classification_confidence: 86,
      clarifying_question: null,
    };
  }

  return {
    primary_category: "unknown_triage",
    secondary_category: null,
    risk_level: "medium",
    classification_confidence: 58,
    clarifying_question: "What is the one symptom that is most repeatable right now?",
  };
}

const CAUSE_LIBRARY: CauseDefinition[] = [
  {
    id: "oil_coolant_cross_contamination",
    cause: "Internal engine oil/coolant cross-contamination",
    systems: ["engine", "cooling", "lubrication"],
    risk: "high",
    symptomKeywords: [
      "oil mixing with coolant",
      "engine oil mixing with coolant",
      "mixing engine oil with coolant",
      "oil with coolant",
      "oil in coolant",
      "coolant in oil",
      "coolant mixing with oil",
      "milky oil",
      "milky coolant",
      "chocolate milk",
      "cross contamination",
      "contaminated coolant",
    ],
    noteKeywords: [
      "oil mixing with coolant",
      "engine oil with coolant",
      "oil in coolant",
      "coolant in oil",
      "milky oil",
      "milky coolant",
      "chocolate milk",
      "cross contamination",
      "contaminated coolant",
    ],
    faultCodes: [],
    historyKeywords: ["head gasket", "oil cooler", "egr cooler", "coolant contamination", "engine oil cooler"],
    recommendedTests: [
      "Do not operate until the coolant and oil are inspected for cross-contamination",
      "Pressure-test the cooling system and inspect the engine oil cooler for internal leakage",
      "Check engine oil condition, coolant reservoir contamination, and combustion gas presence in coolant",
      "Inspect for head gasket, cylinder liner, or EGR/oil cooler failure before replacing parts",
    ],
    recommendedFix:
      "Keep the truck out of service, isolate the internal leak path, repair the failed cooler, gasket, liner, or related component, then flush contaminated oil and coolant circuits before returning to service.",
    questions: [
      {
        text: "Is the coolant reservoir showing an oily film or sludge, or does the engine oil look milky on the dipstick or fill cap?",
        positiveFor: ["oil_coolant_cross_contamination"],
        negativeFor: ["coolant_leak", "thermostat_stuck", "fan_clutch_failure"],
        positiveKeywords: ["yes", "oily", "oil film", "sludge", "milky", "milk", "chocolate", "contaminated"],
        negativeKeywords: ["no", "clean", "normal", "clear"],
      },
      {
        text: "Did the oil/coolant mixing appear suddenly after overheating, a recent cooler repair, or a recent head gasket or EGR cooler repair?",
        positiveFor: ["oil_coolant_cross_contamination"],
        negativeFor: ["radiator_airflow_restriction", "fan_clutch_failure"],
        positiveKeywords: ["yes", "after overheating", "recent", "cooler", "head gasket", "egr", "suddenly"],
        negativeKeywords: ["no", "no repair", "gradual", "unknown"],
      },
    ],
  },
  {
    id: "coolant_leak",
    cause: "Coolant leak or low coolant level",
    systems: ["cooling", "engine"],
    risk: "high",
    symptomKeywords: ["overheating", "coolant", "hot", "temperature", "steam", "smell"],
    noteKeywords: ["puddle", "wet", "leak", "drip", "coolant level", "sweet smell"],
    faultCodes: ["P0128"],
    historyKeywords: ["coolant", "hose", "radiator"],
    recommendedTests: [
      "Pressure-test the cooling system",
      "Inspect hoses, clamps, radiator seams, and surge tank for leakage",
      "Verify coolant level after cooldown",
    ],
    recommendedFix: "Repair the leak source, refill coolant to spec, and retest for stable operating temperature.",
    questions: [
      {
        text: "When the engine temperature rises, is coolant level dropping or do you see wet coolant residue under the truck after shutdown?",
        positiveFor: ["coolant_leak"],
        negativeFor: ["thermostat_stuck", "fan_clutch_failure", "radiator_airflow_restriction"],
        positiveKeywords: ["yes", "dropping", "low", "wet", "puddle", "residue", "leak", "drip", "empty"],
        negativeKeywords: ["no", "dry", "normal", "stable", "full"],
      },
      {
        text: "After the truck cools down, do you need to top up coolant again or notice a sweet coolant smell around the engine bay?",
        positiveFor: ["coolant_leak"],
        negativeFor: ["thermostat_stuck", "fan_clutch_failure"],
        positiveKeywords: ["yes", "top up", "refill", "sweet smell", "coolant smell", "again", "low"],
        negativeKeywords: ["no", "never", "none", "normal", "full"],
      },
    ],
  },
  {
    id: "thermostat_stuck",
    cause: "Thermostat stuck closed or opening late",
    systems: ["cooling", "engine"],
    risk: "high",
    symptomKeywords: ["overheating", "hot", "temperature rise", "runs hot"],
    noteKeywords: ["warms quickly", "heat weak", "surges hot"],
    faultCodes: ["P0128"],
    historyKeywords: ["thermostat", "cooling"],
    recommendedTests: [
      "Monitor upper and lower radiator hose temperatures",
      "Check thermostat opening temperature",
      "Verify heater output when the gauge rises",
    ],
    recommendedFix: "Replace the thermostat and confirm stable coolant temperature under load.",
    questions: [
      {
        text: "When the gauge climbs, does cabin heat stay weak or fluctuate instead of blowing consistently hot air?",
        positiveFor: ["thermostat_stuck"],
        negativeFor: ["coolant_leak"],
        positiveKeywords: ["yes", "weak", "fluctuate", "not hot", "cold", "drops"],
        negativeKeywords: ["no", "steady", "consistent", "hot"],
      },
      {
        text: "Does the engine run hot quickly from a cold start even though you do not see an obvious external coolant leak?",
        positiveFor: ["thermostat_stuck"],
        negativeFor: ["coolant_leak", "fan_clutch_failure"],
        positiveKeywords: ["yes", "quickly", "cold start", "right away", "no leak"],
        negativeKeywords: ["no", "only later", "after idle", "visible leak"],
      },
    ],
  },
  {
    id: "fan_clutch_failure",
    cause: "Cooling fan clutch or fan control failure",
    systems: ["cooling", "engine", "electrical"],
    risk: "high",
    symptomKeywords: ["overheating", "runs hot", "temperature", "idle hot"],
    noteKeywords: ["idling", "low speed", "fan", "not roaring", "traffic"],
    faultCodes: [],
    recommendedTests: [
      "Check if the fan engages when coolant temperature rises",
      "Inspect fan clutch operation and power supply",
      "Compare temperature behavior at idle versus highway speed",
    ],
    recommendedFix: "Repair the fan clutch or fan control circuit and verify airflow under stationary load.",
    questions: [
      {
        text: "Does the truck run hotter mainly while idling or in slow traffic, but cool down once road speed increases?",
        positiveFor: ["fan_clutch_failure", "radiator_airflow_restriction"],
        negativeFor: ["thermostat_stuck"],
        positiveKeywords: ["yes", "idle", "traffic", "slow", "cools at speed", "city"],
        negativeKeywords: ["no", "same at highway", "worse on highway"],
      },
      {
        text: "When temperature rises, do you fail to hear the cooling fan engage strongly or roar the way it normally would?",
        positiveFor: ["fan_clutch_failure"],
        negativeFor: ["radiator_airflow_restriction", "coolant_leak"],
        positiveKeywords: ["yes", "fan not engaging", "no roar", "quiet", "not roaring", "doesn't kick in"],
        negativeKeywords: ["no", "fan roars", "engages", "loud"],
      },
    ],
  },
  {
    id: "radiator_airflow_restriction",
    cause: "Radiator airflow restriction or external blockage",
    systems: ["cooling", "engine"],
    risk: "medium",
    symptomKeywords: ["overheating", "temperature rise", "hot"],
    noteKeywords: ["debris", "dirty radiator", "plugged", "blocked airflow"],
    faultCodes: [],
    recommendedTests: [
      "Inspect radiator and charge-air cooler fins for blockage",
      "Check shroud integrity and airflow path",
      "Verify fan pull across the core",
    ],
    recommendedFix: "Clean or clear airflow restrictions and repair any damaged shrouds or ducting.",
    questions: [
      {
        text: "Is there dirt, road debris, or visible blockage packed into the radiator or cooler fins?",
        positiveFor: ["radiator_airflow_restriction"],
        negativeFor: ["coolant_leak", "thermostat_stuck"],
        positiveKeywords: ["yes", "dirty", "blocked", "debris", "packed", "plugged"],
        negativeKeywords: ["no", "clean", "clear"],
      },
      {
        text: "Does the front of the radiator or charge-air cooler look dirty enough that airflow through the core is restricted?",
        positiveFor: ["radiator_airflow_restriction"],
        negativeFor: ["fan_clutch_failure", "coolant_leak"],
        positiveKeywords: ["yes", "dirty core", "restricted", "blocked airflow", "packed fins", "mud", "bugs"],
        negativeKeywords: ["no", "clean", "clear", "good airflow"],
      },
    ],
  },
  {
    id: "parking_brake_hold_failure",
    cause: "Parking brake chamber, valve, or adjustment fault",
    systems: ["brakes", "air_system", "parking_brake"],
    risk: "high",
    symptomKeywords: [
      "park brake",
      "parking brake",
      "parking brakes",
      "not holding",
      "won't hold",
      "will not hold",
      "rollback",
      "rolls",
      "creep",
    ],
    noteKeywords: ["grade", "slope", "creep", "roll", "spring brake", "dash valve", "parking brake"],
    faultCodes: [],
    vehicleSignals: ["airBrakes"],
    recommendedTests: [
      "Verify spring brake application and pushrod travel with the parking brake set",
      "Check parking brake valve, relay valve, and chamber condition",
      "Confirm the vehicle holds on grade with normal system pressure",
    ],
    recommendedFix: "Repair the parking brake valve, chamber, or out-of-adjustment brake hardware and verify the vehicle holds securely when parked.",
    questions: [
      {
        text: "With the parking brake applied, does the truck still creep or roll even though system air pressure stays in the normal range and no low-air warning is active?",
        positiveFor: ["parking_brake_hold_failure"],
        negativeFor: ["air_brake_leak"],
        positiveKeywords: ["yes", "creep", "roll", "normal pressure", "no low-air", "still moves"],
        negativeKeywords: ["no", "holds", "low air", "pressure drops", "warning buzzer"],
      },
      {
        text: "When you pull the parking brake valve, do you hear the brakes apply normally but the truck still will not hold on a grade?",
        positiveFor: ["parking_brake_hold_failure"],
        negativeFor: ["air_brake_leak", "brake_friction_wear"],
        positiveKeywords: ["yes", "apply normally", "won't hold", "grade", "slope", "still moves"],
        negativeKeywords: ["no", "air leak", "low pressure", "grinding", "holds fine"],
      },
    ],
  },
  {
    id: "brake_friction_wear",
    cause: "Brake friction material wear or rotor/drum damage",
    systems: ["brakes", "wheel_end"],
    risk: "high",
    symptomKeywords: ["brake noise", "grinding", "squeal", "pulsation", "poor braking"],
    noteKeywords: ["metal", "scrape", "pedal pulse", "heat", "smell"],
    faultCodes: [],
    recommendedTests: [
      "Inspect pad and rotor or shoe and drum thickness",
      "Check wheel-end temperatures after braking",
      "Measure rotor/drum condition for scoring or heat damage",
    ],
    recommendedFix: "Replace worn friction components and service damaged rotor or drum hardware.",
    questions: [
      {
        text: "Do you feel pedal pulsation or hear grinding that gets worse only when the brakes are applied?",
        positiveFor: ["brake_friction_wear"],
        negativeFor: ["abs_sensor_fault", "air_brake_leak"],
        positiveKeywords: ["yes", "pulsation", "grinding", "when braking", "pedal", "applied"],
        negativeKeywords: ["no", "steady", "not when braking"],
      },
      {
        text: "Is there a hot wheel end, burning smell, or metal-on-metal brake noise after a stop?",
        positiveFor: ["brake_friction_wear"],
        negativeFor: ["abs_sensor_fault"],
        positiveKeywords: ["yes", "hot wheel", "burning smell", "metal", "metal-on-metal", "hot hub"],
        negativeKeywords: ["no", "cool", "none", "normal"],
      },
    ],
  },
  {
    id: "abs_sensor_fault",
    cause: "ABS wheel speed sensor or tone ring fault",
    systems: ["brakes", "electrical"],
    risk: "medium",
    symptomKeywords: ["brake warning", "abs", "warning light", "traction"],
    noteKeywords: ["abs light", "intermittent warning", "wheel speed"],
    faultCodes: ["C0035", "C0040"],
    recommendedTests: [
      "Scan ABS codes and capture wheel speed data",
      "Inspect the wheel speed sensor and tone ring",
      "Check wiring continuity to the ABS module",
    ],
    recommendedFix: "Repair the ABS sensor or tone ring fault and clear codes after confirmation.",
    questions: [
      {
        text: "Is the ABS or traction control light coming on even when braking feel stays mostly normal?",
        positiveFor: ["abs_sensor_fault"],
        negativeFor: ["brake_friction_wear"],
        positiveKeywords: ["yes", "abs", "traction", "light", "normal braking"],
        negativeKeywords: ["no", "pedal issue", "poor braking"],
      },
      {
        text: "Does the warning appear intermittently while the truck still stops normally without grinding or pulsation?",
        positiveFor: ["abs_sensor_fault"],
        negativeFor: ["brake_friction_wear", "air_brake_leak"],
        positiveKeywords: ["yes", "intermittent", "stops normally", "warning only", "normal stop"],
        negativeKeywords: ["no", "grinding", "pulsation", "air loss"],
      },
    ],
  },
  {
    id: "air_brake_leak",
    cause: "Air brake leak or pressure loss",
    systems: ["brakes", "air_system"],
    risk: "high",
    symptomKeywords: ["air brake", "air leak", "low air", "warning buzzer", "pressure loss", "air pressure"],
    noteKeywords: ["hiss", "losing air", "air tank", "low air"],
    faultCodes: [],
    vehicleSignals: ["airBrakes"],
    recommendedTests: [
      "Measure tractor and trailer air-system leak-down rate with brakes released and applied",
      "Soap-test gladhands, air lines, fittings, relay valves, and brake chambers to pinpoint the leak",
      "Verify compressor cut-in/cut-out and confirm the air dryer purge valve is not leaking",
    ],
    recommendedFix: "Repair leaking air lines or brake components and confirm normal pressure recovery.",
    questions: [
      {
        text: "Do you hear a steady air leak or see air pressure dropping faster than normal with the brakes released?",
        positiveFor: ["air_brake_leak"],
        negativeFor: ["brake_friction_wear", "abs_sensor_fault"],
        positiveKeywords: ["yes", "hiss", "air leak", "pressure dropping", "low air"],
        negativeKeywords: ["no", "pressure steady", "normal"],
      },
      {
        text: "Does the low-air warning or buzzer come on even when you are not actively braking?",
        positiveFor: ["air_brake_leak"],
        negativeFor: ["brake_friction_wear", "abs_sensor_fault"],
        positiveKeywords: ["yes", "low-air", "buzzer", "warning", "not braking", "steady leak"],
        negativeKeywords: ["no", "only when braking", "none", "normal"],
      },
    ],
  },
  {
    id: "steering_linkage_wear",
    cause: "Steering linkage wear or excessive free play",
    systems: ["steering", "suspension"],
    risk: "high",
    symptomKeywords: ["steering play", "pull", "wandering", "loose steering", "free play"],
    noteKeywords: ["center play", "wander", "tie rod", "drag link"],
    faultCodes: [],
    recommendedTests: [
      "Measure steering free play at the wheel",
      "Inspect tie rod ends, drag link, and steering gear lash",
      "Check front axle and kingpin wear",
    ],
    recommendedFix: "Repair worn steering linkage or adjust steering gear, then verify steering free play within spec.",
    questions: [
      {
        text: "Is the looseness strongest on center, with the truck wandering before the front wheels respond?",
        positiveFor: ["steering_linkage_wear"],
        negativeFor: ["tire_or_wheel_issue"],
        positiveKeywords: ["yes", "on center", "wandering", "delay", "before response"],
        negativeKeywords: ["no", "only at speed", "vibration only"],
      },
      {
        text: "Do you need constant steering correction even at moderate speed because the truck feels loose before it takes a set?",
        positiveFor: ["steering_linkage_wear"],
        negativeFor: ["tire_or_wheel_issue"],
        positiveKeywords: ["yes", "constant correction", "loose", "before it responds", "wanders"],
        negativeKeywords: ["no", "just vibration", "only highway shake"],
      },
    ],
  },
  {
    id: "tire_or_wheel_issue",
    cause: "Tire pressure, tire damage, or wheel-end balance issue",
    systems: ["tires", "wheel_end", "steering"],
    risk: "medium",
    symptomKeywords: ["vibration", "pull", "shimmy", "shake"],
    noteKeywords: ["speed related", "tire wear", "cupping", "wheel", "balance"],
    faultCodes: [],
    recommendedTests: [
      "Check tire pressures and inspect tread wear",
      "Inspect wheels and hubs for damage or looseness",
      "Road test for speed-dependent vibration change",
    ],
    recommendedFix: "Correct tire pressure or replace damaged tire/wheel components and rebalance if needed.",
    questions: [
      {
        text: "Does the vibration or pull show up mainly at road speed rather than while stopped or idling?",
        positiveFor: ["tire_or_wheel_issue"],
        negativeFor: ["steering_linkage_wear", "charging_system_fault"],
        positiveKeywords: ["yes", "road speed", "highway", "moving", "faster"],
        negativeKeywords: ["no", "idle", "stopped", "all the time"],
      },
      {
        text: "Is the pull or shake tied to vehicle speed, tire wear, or a recent impact rather than looseness in the steering wheel on center?",
        positiveFor: ["tire_or_wheel_issue"],
        negativeFor: ["steering_linkage_wear"],
        positiveKeywords: ["yes", "speed", "tire wear", "impact", "shake", "wheel"],
        negativeKeywords: ["no", "on center", "loose steering", "wander"],
      },
    ],
  },
  {
    id: "fuel_delivery_issue",
    cause: "Fuel delivery restriction or injector performance issue",
    systems: ["engine", "fuel"],
    risk: "medium",
    symptomKeywords: ["loss of power", "rough idle", "misfire", "hesitation", "stall"],
    noteKeywords: ["under load", "fuel", "filter", "surge"],
    faultCodes: ["P0101", "P0300", "P0301"],
    recommendedTests: [
      "Check fuel pressure and restriction across filters",
      "Inspect injector balance or contribution rates",
      "Verify air intake restriction and MAF readings",
    ],
    recommendedFix: "Service the fuel supply side, replace restricted filters, and correct any injector or intake faults found.",
    questions: [
      {
        text: "Is the loss of power worse under load or climbing, while idle quality also becomes rough or uneven?",
        positiveFor: ["fuel_delivery_issue"],
        negativeFor: ["charging_system_fault"],
        positiveKeywords: ["yes", "under load", "climbing", "rough idle", "hesitation"],
        negativeKeywords: ["no", "electrical only", "lights dim"],
      },
      {
        text: "Does the truck hesitate, surge, or misfire under throttle without also showing battery or voltage symptoms?",
        positiveFor: ["fuel_delivery_issue"],
        negativeFor: ["charging_system_fault"],
        positiveKeywords: ["yes", "hesitate", "surge", "misfire", "under throttle", "no voltage"],
        negativeKeywords: ["no", "voltage", "battery", "dim lights"],
      },
    ],
  },
  {
    id: "charging_system_fault",
    cause: "Charging system fault or weak battery connection",
    systems: ["electrical", "starting", "charging"],
    risk: "medium",
    symptomKeywords: ["warning light", "low voltage", "hard start", "electrical", "battery"],
    noteKeywords: ["dim lights", "slow crank", "alternator", "charging"],
    faultCodes: ["U0100"],
    recommendedTests: [
      "Load-test batteries and inspect cable connections",
      "Verify alternator output under electrical load",
      "Check voltage drop across grounds and main cables",
    ],
    recommendedFix: "Repair charging circuit faults or battery connections and confirm stable charging voltage.",
    questions: [
      {
        text: "Are you seeing dim lights, slow cranking, or voltage warnings at the same time as the complaint?",
        positiveFor: ["charging_system_fault"],
        negativeFor: ["fuel_delivery_issue"],
        positiveKeywords: ["yes", "dim", "slow crank", "voltage", "battery", "charging"],
        negativeKeywords: ["no", "starts fine", "lights normal"],
      },
      {
        text: "Do electrical symptoms like low voltage, weak starting, or charging warnings show up along with the main complaint?",
        positiveFor: ["charging_system_fault"],
        negativeFor: ["fuel_delivery_issue"],
        positiveKeywords: ["yes", "electrical", "low voltage", "weak starting", "charging warning", "battery"],
        negativeKeywords: ["no", "power only", "engine only", "lights normal"],
      },
    ],
  },
];

const BUILT_IN_CASES: SimilarCase[] = [
  {
    id: "case-cooling-contamination-01",
    source: "library",
    causeId: "oil_coolant_cross_contamination",
    cause: "Internal engine oil/coolant cross-contamination",
    systems_affected: ["engine", "cooling", "lubrication"],
    symptomSignals: ["oil in coolant", "coolant in oil", "milky oil", "contaminated coolant"],
    faultCodes: [],
    summary: "Driver found oily sludge in the coolant reservoir and milky engine oil after an overheating complaint.",
    resolution: "Removed the unit from service, pressure-tested the cooling system, confirmed internal oil cooler leakage, repaired the cooler, and flushed both circuits.",
    risk_level: "high",
    similarity: 0,
  },
  {
    id: "case-coolant-01",
    source: "library",
    causeId: "coolant_leak",
    cause: "Coolant leak or low coolant level",
    systems_affected: ["cooling", "engine"],
    symptomSignals: ["overheating", "coolant smell", "wet residue"],
    faultCodes: ["P0128"],
    summary: "High-mileage tractor overheated after highway pull and left coolant residue near the lower hose.",
    resolution: "Replaced split hose, pressure-tested the system, and refilled coolant.",
    risk_level: "high",
    similarity: 0,
  },
  {
    id: "case-coolant-02",
    source: "library",
    causeId: "thermostat_stuck",
    cause: "Thermostat stuck closed or opening late",
    systems_affected: ["cooling", "engine"],
    symptomSignals: ["overheating", "weak cab heat"],
    faultCodes: ["P0128"],
    summary: "Truck ran hot within 20 minutes of dispatch while cabin heat stayed weak on hills.",
    resolution: "Replaced thermostat and verified temperature stability.",
    risk_level: "high",
    similarity: 0,
  },
  {
    id: "case-cooling-03",
    source: "library",
    causeId: "fan_clutch_failure",
    cause: "Cooling fan clutch or fan control failure",
    systems_affected: ["cooling", "engine"],
    symptomSignals: ["overheating", "idle hot", "traffic"],
    faultCodes: [],
    summary: "Day cab overheated only in yard traffic and recovered once road speed increased.",
    resolution: "Repaired failed fan clutch engagement circuit.",
    risk_level: "high",
    similarity: 0,
  },
  {
    id: "case-brake-01",
    source: "library",
    causeId: "brake_friction_wear",
    cause: "Brake friction material wear or rotor/drum damage",
    systems_affected: ["brakes", "wheel_end"],
    symptomSignals: ["brake noise", "pedal pulsation"],
    faultCodes: [],
    summary: "Linehaul tractor reported grinding only under brake application with hot right steer hub.",
    resolution: "Replaced pads and damaged rotor.",
    risk_level: "high",
    similarity: 0,
  },
  {
    id: "case-brake-02",
    source: "library",
    causeId: "abs_sensor_fault",
    cause: "ABS wheel speed sensor or tone ring fault",
    systems_affected: ["brakes", "electrical"],
    symptomSignals: ["abs light", "warning light"],
    faultCodes: ["C0035"],
    summary: "ABS light came on intermittently with normal brake feel after wet-road operation.",
    resolution: "Replaced corroded wheel speed sensor harness.",
    risk_level: "medium",
    similarity: 0,
  },
  {
    id: "case-brake-03",
    source: "library",
    causeId: "air_brake_leak",
    cause: "Air brake leak or pressure loss",
    systems_affected: ["brakes", "air_system"],
    symptomSignals: ["air leak", "low air warning"],
    faultCodes: [],
    summary: "Driver heard steady hissing and saw air pressure drop after parking brake release.",
    resolution: "Replaced leaking chamber hose and retested leak-down rate.",
    risk_level: "high",
    similarity: 0,
  },
  {
    id: "case-brake-04",
    source: "library",
    causeId: "parking_brake_hold_failure",
    cause: "Parking brake chamber, valve, or adjustment fault",
    systems_affected: ["brakes", "air_system", "parking_brake"],
    symptomSignals: ["park brake not holding", "truck creeps on grade"],
    faultCodes: [],
    summary: "Driver reported the tractor rolling slightly on grade with the parking brake set while system air pressure stayed normal.",
    resolution: "Adjusted brake hardware and replaced a sticking parking brake control valve.",
    risk_level: "high",
    similarity: 0,
  },
  {
    id: "case-steering-01",
    source: "library",
    causeId: "steering_linkage_wear",
    cause: "Steering linkage wear or excessive free play",
    systems_affected: ["steering", "suspension"],
    symptomSignals: ["wandering", "free play"],
    faultCodes: [],
    summary: "Regional tractor wandered in lane with excessive free play on center.",
    resolution: "Replaced worn drag link and reset steering lash.",
    risk_level: "high",
    similarity: 0,
  },
  {
    id: "case-steering-02",
    source: "library",
    causeId: "tire_or_wheel_issue",
    cause: "Tire pressure, tire damage, or wheel-end balance issue",
    systems_affected: ["tires", "wheel_end", "steering"],
    symptomSignals: ["vibration", "speed related"],
    faultCodes: [],
    summary: "Tractor developed steering shake above 55 mph from irregular steer tire wear.",
    resolution: "Replaced damaged steer tire and rebalanced wheel end.",
    risk_level: "medium",
    similarity: 0,
  },
  {
    id: "case-engine-01",
    source: "library",
    causeId: "fuel_delivery_issue",
    cause: "Fuel delivery restriction or injector performance issue",
    systems_affected: ["engine", "fuel"],
    symptomSignals: ["loss of power", "rough idle"],
    faultCodes: ["P0101", "P0300"],
    summary: "Unit lost power under load with rough idle after extended fuel filter interval.",
    resolution: "Replaced restricted fuel filters and cleaned intake sensor.",
    risk_level: "medium",
    similarity: 0,
  },
  {
    id: "case-electrical-01",
    source: "library",
    causeId: "charging_system_fault",
    cause: "Charging system fault or weak battery connection",
    systems_affected: ["electrical", "starting", "charging"],
    symptomSignals: ["dim lights", "slow crank", "voltage warning"],
    faultCodes: ["U0100"],
    summary: "Sleeper unit had repeated low-voltage warnings and slow starts due to corroded battery cables.",
    resolution: "Replaced battery cables and confirmed alternator output.",
    risk_level: "medium",
    similarity: 0,
  },
];

function normalizeText(value: string | undefined | null) {
  return (value ?? "").trim().toLowerCase();
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function roundProbability(value: number) {
  return Number(value.toFixed(1));
}

function normalizeProbabilities(probabilities: number[]) {
  const total = probabilities.reduce((sum, value) => sum + value, 0) || 1;
  const normalized = probabilities.map((value) => roundProbability((value / total) * 100));
  const roundedTotal = normalized.reduce((sum, value) => sum + value, 0);
  const delta = roundProbability(100 - roundedTotal);

  if (normalized.length > 0 && Math.abs(delta) > 0) {
    normalized[0] = roundProbability(normalized[0] + delta);
  }

  return normalized;
}

function getComplianceImpact(riskLevel: z.infer<typeof riskLevelSchema>) {
  if (riskLevel === "high") return "critical" as const;
  if (riskLevel === "medium") return "warning" as const;
  return "none" as const;
}

function buildMaintenanceRecommendations(
  topCauses: Array<{ cause: CauseDefinition; probability: number }>,
  riskLevel: z.infer<typeof riskLevelSchema>,
  complianceImpact: "none" | "warning" | "critical"
) {
  const recommendations = uniqueStrings(
    topCauses.flatMap((item) => {
      const base = [
        `Inspect ${item.cause.systems.join(" / ")} components related to ${item.cause.cause.toLowerCase()}.`,
        ...item.cause.recommendedTests.slice(0, 2),
      ];

      if (complianceImpact === "critical") {
        base.unshift("Hold the vehicle out of service until the fault is verified and corrected.");
      } else if (complianceImpact === "warning") {
        base.unshift("Schedule maintenance review before the next dispatch window.");
      }

      if (riskLevel === "high") {
        base.push("Document the defect in the maintenance log and escalate to the fleet manager immediately.");
      }

      return base;
    })
  );

  return recommendations.slice(0, 6);
}

function extractBalancedJsonObject(text: string) {
  let start = -1;
  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (isEscaped) {
      isEscaped = false;
      continue;
    }

    if (char === "\\") {
      isEscaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return "";
}

export function parseClarifyingQuestionResponse(rawText: string) {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new Error("Empty clarifying question response");
  }

  const cleaned = trimmed
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  const candidates = [
    cleaned,
    extractBalancedJsonObject(cleaned),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const parsed = clarifyingQuestionResponseSchema.parse(JSON.parse(candidate));
      return parsed.question.trim();
    } catch {
      // Try the next parse strategy.
    }
  }

  const directQuestionMatch = cleaned.match(/([^.!?\n]*\?)/);
  if (directQuestionMatch?.[1]) {
    return directQuestionMatch[1].trim();
  }

  const normalizedLine = cleaned
    .replace(/^Here is the JSON\s*:?\s*/i, "")
    .replace(/^Question\s*:?\s*/i, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  if (normalizedLine) {
    return normalizedLine;
  }

  throw new Error("Unable to parse clarifying question response");
}

function scoreRisk(value: z.infer<typeof riskLevelSchema>) {
  switch (value) {
    case "high":
      return 3;
    case "medium":
      return 2;
    default:
      return 1;
  }
}

function classifyAnswer(question: QuestionDefinition, answer: string) {
  const normalized = normalizeText(answer);
  if (question.positiveKeywords.some((keyword) => normalized.includes(keyword))) return "positive";
  if (question.negativeKeywords.some((keyword) => normalized.includes(keyword))) return "negative";
  if (/\b(yes|yep|true|correct)\b/.test(normalized)) return "positive";
  if (/\b(no|nope|false|not really)\b/.test(normalized)) return "negative";
  return "unknown";
}

function mapRiskToAction(riskLevel: z.infer<typeof riskLevelSchema>) {
  if (riskLevel === "high") return "Stop Now";
  if (riskLevel === "medium") return "Inspect Soon";
  return "Keep Running";
}

function mapRiskToUrgency(riskLevel: z.infer<typeof riskLevelSchema>) {
  if (riskLevel === "high") return "Critical";
  if (riskLevel === "medium") return "Attention";
  return "Monitor";
}

function inferComplaintDomains(text: string, faultCodes: string[]) {
  const domains = new Set<string>();

  if (/(park brake|parking brake|abs|brake|low air|air leak|air pressure|pedal|stopping|roll|creep|buzzer)/.test(text)) {
    domains.add("brakes");
  }
  if (/(overheat|overheating|coolant|temperature|radiator|fan clutch|steam|hot engine)/.test(text)) {
    domains.add("cooling");
  }
  if (/(oil.*coolant|coolant.*oil|milky oil|milky coolant|chocolate milk|cross contamination|contaminated coolant)/.test(text)) {
    domains.add("lubrication");
    domains.add("engine");
    domains.add("cooling");
  }
  if (/(steering|wander|wandering|pull|free play|tie rod|drag link)/.test(text)) {
    domains.add("steering");
  }
  if (/(tire|tyre|vibration|shimmy|shake|wheel balance|cupping)/.test(text)) {
    domains.add("tires");
  }
  if (/(loss of power|rough idle|misfire|hesitation|stall|fuel)/.test(text)) {
    domains.add("fuel");
  }
  if (/(low voltage|battery|charging|alternator|slow crank|dim lights|electrical)/.test(text)) {
    domains.add("electrical");
  }
  if (faultCodes.some((code) => ["C0035", "C0040"].includes(code))) {
    domains.add("brakes");
  }
  if (faultCodes.some((code) => ["P0128"].includes(code))) {
    domains.add("cooling");
  }
  if (faultCodes.some((code) => ["P0101", "P0300", "P0301"].includes(code))) {
    domains.add("fuel");
  }
  if (faultCodes.some((code) => ["U0100"].includes(code))) {
    domains.add("electrical");
  }

  return Array.from(domains);
}

function getCauseComplaintDomains(cause: CauseDefinition) {
  const domains = new Set<string>();

  if (cause.systems.some((system) => ["brakes", "air_system", "parking_brake"].includes(system))) {
    domains.add("brakes");
  }
  if (cause.systems.includes("cooling")) {
    domains.add("cooling");
  }
  if (cause.systems.includes("lubrication")) {
    domains.add("lubrication");
    domains.add("engine");
  }
  if (cause.systems.includes("steering") || cause.systems.includes("suspension")) {
    domains.add("steering");
  }
  if (cause.systems.includes("tires") || (cause.systems.includes("wheel_end") && !cause.systems.includes("brakes"))) {
    domains.add("tires");
  }
  if (cause.systems.includes("fuel")) {
    domains.add("fuel");
  }
  if (cause.systems.some((system) => ["electrical", "charging", "starting"].includes(system))) {
    domains.add("electrical");
  }

  return Array.from(domains);
}

const KNOWN_PART_KEYWORDS = [
  "hose",
  "radiator",
  "thermostat",
  "head gasket",
  "engine oil cooler",
  "oil cooler",
  "egr cooler",
  "cylinder liner",
  "fan clutch",
  "fan",
  "parking brake chamber",
  "parking brake valve",
  "brake chamber",
  "brake pad",
  "brake shoe",
  "rotor",
  "drum",
  "abs sensor",
  "tone ring",
  "air line",
  "air dryer",
  "tie rod",
  "drag link",
  "steering gear",
  "tire",
  "wheel",
  "hub",
  "bearing",
  "fuel filter",
  "injector",
  "maf",
  "battery cable",
  "battery",
  "alternator",
];

const FAULT_CODE_METADATA: Record<
  string,
  {
    interpretation: string;
    systems: string[];
    likelyCauseIds: string[];
    defaultRole: "primary" | "secondary" | "downstream" | "incidental" | "uncertain";
  }
> = {
  P0128: {
    interpretation: "Coolant temperature is not reaching or maintaining the expected operating range.",
    systems: ["cooling", "engine"],
    likelyCauseIds: [
      "coolant_leak",
      "thermostat_stuck",
      "fan_clutch_failure",
      "radiator_airflow_restriction",
      "oil_coolant_cross_contamination",
    ],
    defaultRole: "primary",
  },
  C0035: {
    interpretation: "Wheel speed signal fault at the ABS system, often tied to the sensor or tone ring.",
    systems: ["brakes", "electrical"],
    likelyCauseIds: ["abs_sensor_fault"],
    defaultRole: "primary",
  },
  C0040: {
    interpretation: "Wheel speed circuit fault affecting ABS and traction control stability logic.",
    systems: ["brakes", "electrical"],
    likelyCauseIds: ["abs_sensor_fault"],
    defaultRole: "primary",
  },
  P0101: {
    interpretation: "Airflow signal is outside expected range and can be secondary to restriction or fueling imbalance.",
    systems: ["engine", "fuel"],
    likelyCauseIds: ["fuel_delivery_issue"],
    defaultRole: "secondary",
  },
  P0300: {
    interpretation: "Random misfire detection consistent with fueling, injector, or air metering issues.",
    systems: ["engine", "fuel"],
    likelyCauseIds: ["fuel_delivery_issue"],
    defaultRole: "primary",
  },
  P0301: {
    interpretation: "Cylinder-specific misfire that can still point back to a wider fuel delivery or injector issue.",
    systems: ["engine", "fuel"],
    likelyCauseIds: ["fuel_delivery_issue"],
    defaultRole: "primary",
  },
  U0100: {
    interpretation: "Loss of communication often associated with low voltage, charging instability, or wiring faults.",
    systems: ["electrical", "starting", "charging"],
    likelyCauseIds: ["charging_system_fault"],
    defaultRole: "secondary",
  },
};

const BASELINE_PARTS_GUIDANCE: Record<
  string,
  {
    likelyReplacementParts: string[];
    inspectionRelatedParts: string[];
    adjacentPartsToCheck: string[];
    diagnosticVerificationLaborHours: { min: number; max: number };
    repairLaborHours: { min: number; max: number };
    laborTimeConfidence: number;
    laborTimeBasis: string[];
  }
> = {
  oil_coolant_cross_contamination: {
    likelyReplacementParts: [
      "engine oil cooler",
      "oil cooler gasket set",
      "head gasket set",
      "EGR cooler",
      "coolant",
      "engine oil and filters",
    ],
    inspectionRelatedParts: ["coolant reservoir", "engine oil sample", "cooling system pressure tester", "combustion leak tester"],
    adjacentPartsToCheck: ["cylinder liners", "water pump", "thermostat housing", "EGR cooler plumbing"],
    diagnosticVerificationLaborHours: { min: 2, max: 5 },
    repairLaborHours: { min: 6, max: 18 },
    laborTimeConfidence: 62,
    laborTimeBasis: [
      "Internal oil/coolant leak path must be isolated before replacement",
      "Labor varies widely between oil cooler, EGR cooler, head gasket, and liner failure",
    ],
  },
  coolant_leak: {
    likelyReplacementParts: ["coolant hose", "hose clamp", "radiator", "surge tank cap"],
    inspectionRelatedParts: ["pressure tester", "coolant level sensor", "hose junctions"],
    adjacentPartsToCheck: ["water pump", "thermostat housing", "radiator seams"],
    diagnosticVerificationLaborHours: { min: 1, max: 2 },
    repairLaborHours: { min: 2, max: 4 },
    laborTimeConfidence: 74,
    laborTimeBasis: ["Cooling-system leak isolation", "Typical Class 8 hose or radiator repair access"],
  },
  thermostat_stuck: {
    likelyReplacementParts: ["thermostat", "thermostat gasket", "coolant"],
    inspectionRelatedParts: ["temperature gun", "upper radiator hose", "heater circuit"],
    adjacentPartsToCheck: ["fan clutch", "radiator flow", "coolant contamination"],
    diagnosticVerificationLaborHours: { min: 1, max: 1.5 },
    repairLaborHours: { min: 2, max: 3 },
    laborTimeConfidence: 78,
    laborTimeBasis: ["Thermostat verification and refill/bleed time", "Moderate access assumptions"],
  },
  fan_clutch_failure: {
    likelyReplacementParts: ["fan clutch", "fan clutch solenoid", "fan control harness"],
    inspectionRelatedParts: ["fan blades", "air control line", "electrical connector"],
    adjacentPartsToCheck: ["radiator fins", "shroud", "engine temperature sensor"],
    diagnosticVerificationLaborHours: { min: 1, max: 2 },
    repairLaborHours: { min: 2, max: 4 },
    laborTimeConfidence: 72,
    laborTimeBasis: ["Engagement verification under heat", "Heavy-duty fan access varies by chassis"],
  },
  radiator_airflow_restriction: {
    likelyReplacementParts: ["shroud hardware", "radiator core supports"],
    inspectionRelatedParts: ["radiator fins", "charge-air cooler", "fan shroud"],
    adjacentPartsToCheck: ["fan clutch", "debris screens", "airflow seals"],
    diagnosticVerificationLaborHours: { min: 0.8, max: 1.5 },
    repairLaborHours: { min: 1, max: 3 },
    laborTimeConfidence: 70,
    laborTimeBasis: ["Inspection and cleaning effort varies with blockage severity"],
  },
  parking_brake_hold_failure: {
    likelyReplacementParts: ["parking brake chamber", "parking brake control valve", "slack adjuster hardware"],
    inspectionRelatedParts: ["pushrod travel gauge", "relay valve", "spring brake lines"],
    adjacentPartsToCheck: ["air supply lines", "foundation brake adjustment", "brake shoes"],
    diagnosticVerificationLaborHours: { min: 1, max: 2 },
    repairLaborHours: { min: 2, max: 4 },
    laborTimeConfidence: 80,
    laborTimeBasis: ["Parking brake hold verification on grade", "Common chamber/valve repair timing"],
  },
  brake_friction_wear: {
    likelyReplacementParts: ["brake pads", "rotor", "brake shoes", "drum hardware kit"],
    inspectionRelatedParts: ["wheel-end temperature check", "caliper slides", "slack adjusters"],
    adjacentPartsToCheck: ["hub seals", "wheel bearings", "ABS tone ring"],
    diagnosticVerificationLaborHours: { min: 1, max: 1.5 },
    repairLaborHours: { min: 2, max: 5 },
    laborTimeConfidence: 76,
    laborTimeBasis: ["Wheel-end inspection and friction replacement", "Labor varies by axle position"],
  },
  abs_sensor_fault: {
    likelyReplacementParts: ["ABS wheel speed sensor", "tone ring", "sensor harness"],
    inspectionRelatedParts: ["ABS connector", "wheel-end harness routing", "sensor mount"],
    adjacentPartsToCheck: ["wheel bearing play", "hub contamination", "brake hardware"],
    diagnosticVerificationLaborHours: { min: 0.8, max: 1.5 },
    repairLaborHours: { min: 1, max: 2.5 },
    laborTimeConfidence: 82,
    laborTimeBasis: ["ABS code capture and wheel-end inspection", "Sensor replacement is usually bounded work"],
  },
  air_brake_leak: {
    likelyReplacementParts: [
      "air line",
      "push-to-connect fitting",
      "service gladhand seal",
      "brake chamber",
      "relay valve",
    ],
    inspectionRelatedParts: [
      "soap solution leak check",
      "dash and tank pressure gauges",
      "service and parking brake chambers",
      "trailer supply and service gladhands",
    ],
    adjacentPartsToCheck: ["air dryer purge valve", "governor lines", "supply tanks", "quick-release valves"],
    diagnosticVerificationLaborHours: { min: 1, max: 2 },
    repairLaborHours: { min: 1.5, max: 4 },
    laborTimeConfidence: 79,
    laborTimeBasis: ["Air-leak isolation and pressure recovery verification"],
  },
  steering_linkage_wear: {
    likelyReplacementParts: ["tie rod end", "drag link", "steering gear adjustment kit"],
    inspectionRelatedParts: ["kingpins", "pitman arm", "front axle linkage"],
    adjacentPartsToCheck: ["steer tires", "wheel bearings", "alignment settings"],
    diagnosticVerificationLaborHours: { min: 1, max: 2 },
    repairLaborHours: { min: 2, max: 5 },
    laborTimeConfidence: 77,
    laborTimeBasis: ["Free-play measurement and linkage inspection", "Front-end repair timing varies by worn components"],
  },
  tire_or_wheel_issue: {
    likelyReplacementParts: ["steer tire", "wheel", "balance weights"],
    inspectionRelatedParts: ["tire pressure", "runout measurement", "wheel studs"],
    adjacentPartsToCheck: ["hub bearings", "alignment", "suspension bushings"],
    diagnosticVerificationLaborHours: { min: 0.5, max: 1.5 },
    repairLaborHours: { min: 1, max: 3 },
    laborTimeConfidence: 75,
    laborTimeBasis: ["Tire/wheel inspection and replacement or rebalance timing"],
  },
  fuel_delivery_issue: {
    likelyReplacementParts: ["fuel filter", "injector", "fuel line seal", "MAF sensor"],
    inspectionRelatedParts: ["fuel pressure gauge", "restriction gauge", "intake plumbing"],
    adjacentPartsToCheck: ["lift pump", "air intake restriction", "wiring to injectors"],
    diagnosticVerificationLaborHours: { min: 1, max: 2.5 },
    repairLaborHours: { min: 2, max: 5 },
    laborTimeConfidence: 71,
    laborTimeBasis: ["Fuel-pressure testing and balance-rate verification", "Repair time depends on supply-side vs injector fault"],
  },
  charging_system_fault: {
    likelyReplacementParts: ["alternator", "battery cable", "battery", "ground strap"],
    inspectionRelatedParts: ["voltage drop meter", "load tester", "main connections"],
    adjacentPartsToCheck: ["starter cable", "battery disconnect", "ECM power feeds"],
    diagnosticVerificationLaborHours: { min: 0.8, max: 1.5 },
    repairLaborHours: { min: 1, max: 3 },
    laborTimeConfidence: 83,
    laborTimeBasis: ["Charging-system load test and common cable repair timing"],
  },
};

type BaselineRankedCause = {
  cause: CauseDefinition;
  probability: number;
  score: number;
  evidenceMatches: number;
  evidenceSummary: string[];
};

type EvidenceStage = {
  normalizedSymptoms: string[];
  primarySymptoms: string[];
  secondarySymptoms: string[];
  symptomToSystemLinks: Array<{ symptom: string; linked_systems: string[] }>;
  symptomScore: number;
  symptomSignalStrength: number;
  symptomRationale: string[];
  faultCodeInterpretations: z.infer<typeof faultCodeInterpretationSchema>[];
  faultCodeScore: number;
  faultCodeSignalStrength: number;
  primaryVsSecondaryCodeAssessment: string[];
  contextualCodeRelevance: string[];
  codeToCauseLinks: string[];
  faultCodeRationale: string[];
  repairHistoryScore: number;
  maintenanceHistoryScore: number;
  historyScore: number;
  repairHistoryRationale: string[];
  maintenanceHistoryRationale: string[];
  historyRationale: string[];
  recentPartsReplaced: z.infer<typeof RecentPartReplacementSchema>[];
  recentPartsReplacedScore: number;
  replacementRelevanceToCurrentIssue: string[];
  replacementEffectDirection: string[];
  replacementDecayWeight: number;
  recentPartsRationale: string[];
  recurringFailureScore: number;
  recurringPatternType: string[];
  repeatCodeFrequency: Record<string, number>;
  repeatComponentFrequency: Record<string, number>;
  repeatRepairWithoutResolution: string[];
  suspectedUnresolvedRootCause: string | null;
  recurrenceRationale: string[];
  vehicleDataGaps: string[];
};

type BaselineStage = {
  context: DiagnosticContext;
  evidence: EvidenceStage;
  ranked: BaselineRankedCause[];
  baseline: z.infer<typeof ruleEngineBaselineSchema>;
  candidateUniverse: z.infer<typeof candidateUniverseSchema>[];
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildHistoryText(input: DiagnosticInput) {
  return [
    ...(input.issueHistory.priorDiagnostics ?? []).map((item) => item.summary),
    ...(input.issueHistory.priorDefects ?? []).map((item) => item.summary),
    ...(input.issueHistory.recentInspections ?? []).map((item) => item.summary),
    ...(input.issueHistory.recentRepairs ?? []).map((item) => item.summary),
    ...(input.issueHistory.repairHistory ?? []).map((item) => item.summary),
    ...(input.issueHistory.maintenanceHistory ?? []).map((item) => item.summary),
    ...(input.issueHistory.complianceHistory ?? []).map((item) => item.summary),
  ]
    .map((item) => normalizeText(item))
    .join(" ");
}

function buildSimilarCaseMatchEvidence(context: DiagnosticContext, item: SimilarCase) {
  const symptomMatches = item.symptomSignals.filter((signal) =>
    context.normalizedSymptoms.some((symptom) => symptom.includes(normalizeText(signal)))
  );
  const faultCodeMatches = item.faultCodes.filter((code) =>
    context.normalizedFaultCodes.includes(code.toUpperCase())
  );
  const caseSystems = item.systems_affected.map((system) => normalizeText(system));
  const subsystemMatches = caseSystems.filter((system) => context.complaintDomains.includes(system));
  const complaintText = `${context.normalizedSymptoms.join(" ")} ${context.notes} ${context.llmInterpretationText}`;
  const componentMatches = KNOWN_PART_KEYWORDS.filter(
    (part) =>
      complaintText.includes(part) &&
      `${normalizeText(item.summary)} ${normalizeText(item.resolution)} ${normalizeText(item.confirmedFix)}`.includes(part)
  );
  const vehicleMatches = [context.input.vehicle?.make, context.input.vehicle?.model, context.input.vehicle?.engine]
    .filter((value): value is string => Boolean(value))
    .filter((value) => normalizeText(item.summary).includes(normalizeText(value)));
  const fixText = normalizeText(`${item.confirmedFix ?? ""} ${item.resolution}`);
  const confirmedFixMatches = uniqueStrings([...context.complaintDomains, ...componentMatches]).filter(
    (signal) => signal && fixText.includes(signal)
  );
  const matchedSignals = uniqueStrings([
    ...symptomMatches.map((signal) => `symptom:${signal}`),
    ...faultCodeMatches.map((code) => `fault_code:${code}`),
    ...subsystemMatches.map((system) => `subsystem:${system}`),
    ...componentMatches.map((part) => `component:${part}`),
    ...vehicleMatches.map((value) => `vehicle:${value}`),
    ...confirmedFixMatches.map((signal) => `confirmed_fix:${signal}`),
    item.resolutionSuccess === true ? "resolution_success:true" : "",
  ]).filter(Boolean);

  const score =
    symptomMatches.length * 2.4 +
    faultCodeMatches.length * 2.8 +
    subsystemMatches.length * 1.5 +
    componentMatches.length * 1.2 +
    vehicleMatches.length * 0.8 +
    confirmedFixMatches.length * 1.4 +
    (item.resolutionSuccess === true ? 0.8 : 0) +
    (item.confirmedFix ? 0.4 : 0);

  return { score, matchedSignals };
}

function scoreCaseSimilarity(context: DiagnosticContext, item: SimilarCase) {
  const { score } = buildSimilarCaseMatchEvidence(context, item);

  if (score > 0) {
    return score;
  }

  if (context.notes && normalizeText(item.summary).includes(context.notes.split(" ")[0] ?? "")) {
    return 0.8;
  }

  return 0;
}

function normalizeInterpretedSignals(interpretation: DiagnosticIntakeInterpretation | null) {
  if (!interpretation) {
    return {
      symptoms: [] as string[],
      domains: [] as string[],
      text: "",
    };
  }

  const symptoms = uniqueStrings([
    ...interpretation.normalized_symptoms,
    ...interpretation.primary_symptoms,
    ...interpretation.secondary_symptoms,
    ...interpretation.likely_failure_modes,
    ...interpretation.candidate_cause_hints,
    ...interpretation.risk_flags,
    ...interpretation.evidence_keywords,
  ].map((item) => normalizeText(item)));
  const domains = uniqueStrings(interpretation.inferred_systems.map((item) => normalizeText(item)));
  const text = uniqueStrings([
    ...symptoms,
    ...domains,
    ...interpretation.maintenance_history_signals.map((item) => normalizeText(item)),
    ...interpretation.repair_history_signals.map((item) => normalizeText(item)),
    ...interpretation.recent_parts_signals.map((item) => normalizeText(item)),
    ...interpretation.recurrence_signals.map((item) => normalizeText(item)),
    ...interpretation.interpretation_rationale.map((item) => normalizeText(item)),
  ])
    .filter(Boolean)
    .join(" ");

  return { symptoms, domains, text };
}

export function buildDiagnosticContext(
  rawInput: DiagnosticInputRequest,
  llmIntakeInterpretation: DiagnosticIntakeInterpretation | null = null
) {
  const input = DiagnosticInputSchema.parse(rawInput);
  const interpretedSignals = normalizeInterpretedSignals(llmIntakeInterpretation);
  const normalizedSymptoms = uniqueStrings([
    ...input.symptoms.map((symptom) => normalizeText(symptom)),
    ...interpretedSignals.symptoms,
  ]);
  const normalizedFaultCodes = uniqueStrings(input.faultCodes.map((code) => code.trim().toUpperCase()));
  const notes = normalizeText(input.driverNotes);
  const historyText = uniqueStrings([buildHistoryText(input), interpretedSignals.text])
    .filter(Boolean)
    .join(" ");
  const complaintDomains = uniqueStrings([
    ...inferComplaintDomains(
      `${normalizedSymptoms.join(" ")} ${notes} ${interpretedSignals.text}`.trim(),
      normalizedFaultCodes
    ),
    ...interpretedSignals.domains,
  ]);

  const allCases = [...BUILT_IN_CASES, ...input.similarCases];
  const baseContext = {
    input,
    normalizedSymptoms,
    normalizedFaultCodes,
    notes,
    historyText,
    similarCases: allCases,
    matchedSignals: 0,
    complaintDomains,
    llmIntakeInterpretation,
    llmInterpretationText: interpretedSignals.text,
  } satisfies DiagnosticContext;

  return {
    ...baseContext,
    similarCases: retrieveSimilarCases(baseContext),
  } satisfies DiagnosticContext;
}

export function retrieveSimilarCases(context: DiagnosticContext, limit: number = DEFAULT_SIMILAR_CASE_LIMIT) {
  const rankedCases = context.similarCases
    .map((item) => ({
      ...item,
      similarity: Math.min(1, scoreCaseSimilarity(context, item) / 6),
    }))
    .sort((left, right) => right.similarity - left.similarity);

  const boundedLimit = Math.max(5, Math.min(10, limit));
  return rankedCases
    .slice(0, boundedLimit)
    .filter((item, index) => item.similarity > 0 || index < Math.min(5, rankedCases.length));
}

function buildSimilarConfirmedCaseEvidence(context: DiagnosticContext) {
  return context.similarCases
    .slice(0, DEFAULT_SIMILAR_CASE_LIMIT)
    .map((item) => ({
      id: item.id,
      source: item.source,
      cause_id: item.causeId,
      cause_name: item.cause,
      similarity: item.similarity,
      matched_signals: buildSimilarCaseMatchEvidence(context, item).matchedSignals,
      summary: item.summary,
      confirmed_fix: item.confirmedFix ?? item.resolution ?? null,
      resolution_success: item.resolutionSuccess ?? null,
    }))
    .filter((item, index) => item.similarity > 0 || index < 3)
    .map((item) => similarConfirmedCaseEvidenceSchema.parse(item));
}

function evaluateCause(context: DiagnosticContext, cause: CauseDefinition) {
  let score = 1;
  let evidenceMatches = 0;
  const evidenceSummary: string[] = [];
  const fullText = `${context.normalizedSymptoms.join(" ")} ${context.notes} ${context.llmInterpretationText}`;
  const causeDomains = getCauseComplaintDomains(cause);
  const hasCrossContaminationSignal = hasOilCoolantCrossContaminationSignal(context);

  if (cause.id === "oil_coolant_cross_contamination" && hasCrossContaminationSignal) {
    score += 8.5;
    evidenceMatches += 3;
    evidenceSummary.push("Oil/coolant cross-contamination was explicitly reported");
  }

  cause.symptomKeywords.forEach((keyword) => {
    if (fullText.includes(keyword)) {
      score += 2.2;
      evidenceMatches += 1;
      evidenceSummary.push(`Symptom phrase matched ${keyword}`);
    }
  });

  cause.noteKeywords.forEach((keyword) => {
    if (context.notes.includes(keyword)) {
      score += 1.6;
      evidenceMatches += 1;
      evidenceSummary.push(`Driver notes support ${keyword}`);
    }
  });

  cause.faultCodes.forEach((faultCode) => {
    if (context.normalizedFaultCodes.includes(faultCode)) {
      score += 3.4;
      evidenceMatches += 1;
      evidenceSummary.push(`Fault code ${faultCode} aligns with this cause`);
    }
  });

  cause.historyKeywords?.forEach((keyword) => {
    if (context.historyText.includes(keyword)) {
      score += 1.1;
      evidenceMatches += 1;
      evidenceSummary.push(`History references ${keyword}`);
    }
  });

  const interpretation = context.llmIntakeInterpretation;
  if (interpretation) {
    const hints = [
      ...interpretation.likely_failure_modes,
      ...interpretation.candidate_cause_hints,
      ...interpretation.risk_flags,
      ...interpretation.evidence_keywords,
    ].map((item) => normalizeText(item));
    const causeText = normalizeText(`${cause.cause} ${cause.systems.join(" ")} ${cause.symptomKeywords.join(" ")}`);
    const hintMatches = hints.filter(
      (hint) => hint.length >= 3 && (causeText.includes(hint) || hint.split(" ").some((part) => part.length >= 5 && causeText.includes(part)))
    );
    const systemMatches = interpretation.inferred_systems
      .map((item) => normalizeText(item))
      .filter((system) => cause.systems.includes(system));

    if (hintMatches.length > 0) {
      score += Math.min(4.2, hintMatches.length * 1.4);
      evidenceMatches += 1;
      evidenceSummary.push(`LLM intake interpretation highlighted ${hintMatches.slice(0, 2).join(", ")}`);
    }

    if (systemMatches.length > 0) {
      score += Math.min(2.4, systemMatches.length * 0.8);
      evidenceMatches += 1;
      evidenceSummary.push(`LLM intake interpretation mapped this into ${systemMatches.join(", ")}`);
    }
  }

  if (context.complaintDomains.length > 0) {
    const hasDomainOverlap = causeDomains.some((domain) => context.complaintDomains.includes(domain));
    if (hasDomainOverlap) {
      score += 1.4;
      evidenceMatches += 1;
      evidenceSummary.push(`Complaint domain overlaps ${causeDomains.join(", ")}`);
    } else {
      score -= context.complaintDomains.length === 1 ? 1.6 : 1.1;
    }
  }

  if (cause.vehicleSignals?.includes("airBrakes") && context.input.vehicle?.configuration?.airBrakes === true) {
    score += 0.8;
    evidenceMatches += 1;
    evidenceSummary.push("Vehicle configuration confirms air brake hardware");
  }

  if (
    (context.input.vehicle?.mileage ?? 0) >= 180000 &&
    (cause.id === "coolant_leak" || cause.id === "brake_friction_wear" || cause.id === "steering_linkage_wear")
  ) {
    score += 0.6;
    evidenceMatches += 1;
    evidenceSummary.push("Vehicle mileage increases wear-related likelihood");
  }

  const caseSupport = context.similarCases
    .filter((item) => item.causeId === cause.id)
    .reduce((total, item) => total + item.similarity, 0);
  if (caseSupport > 0) {
    score += caseSupport * 1.8;
    evidenceSummary.push("Similar historical cases support this cause");
  }

  context.input.clarificationHistory.forEach((turn) => {
    cause.questions.forEach((question) => {
      if (turn.question !== question.text && !turn.question.endsWith(question.text)) return;

      const answerClass = classifyAnswer(question, turn.answer);
      if (answerClass === "positive") {
        if (question.positiveFor.includes(cause.id)) {
          score += 2.8;
          evidenceMatches += 1;
          evidenceSummary.push("Clarifying answer strengthened this cause");
        }
        if (question.negativeFor?.includes(cause.id)) {
          score -= 1.5;
        }
      } else if (answerClass === "negative") {
        if (question.positiveFor.includes(cause.id)) {
          score -= 1.6;
        }
        if (question.negativeFor?.includes(cause.id)) {
          score += 1.1;
          evidenceMatches += 1;
          evidenceSummary.push("Clarifying answer weakened competing causes");
        }
      }
    });
  });

  return {
    cause,
    score: Math.max(score, 0.15),
    evidenceMatches,
    evidenceSummary: uniqueStrings(evidenceSummary),
  };
}

function hasOilCoolantCrossContaminationSignal(context: DiagnosticContext) {
  const fullText = `${context.normalizedSymptoms.join(" ")} ${context.notes} ${context.historyText}`.trim();
  return /(?:oil.*coolant|coolant.*oil|milky oil|milky coolant|chocolate milk|cross contamination|contaminated coolant|oil film.*coolant|sludge.*coolant)/.test(
    fullText
  );
}

function calculateConfidence(scores: Array<{ score: number; evidenceMatches: number }>, clarificationCount: number) {
  const sorted = [...scores].sort((left, right) => right.score - left.score);
  const top = sorted[0]?.score ?? 0;
  const second = sorted[1]?.score ?? 0;
  const total = sorted.reduce((sum, item) => sum + item.score, 0) || 1;
  const topProbability = top / total;
  const separation = topProbability - second / total;
  const evidenceStrength = Math.min(1, (sorted[0]?.evidenceMatches ?? 0) / 5);
  const ambiguityPenalty = Math.max(0, 0.18 - separation) * 120;
  const score =
    35 +
    topProbability * 30 +
    separation * 85 +
    evidenceStrength * 18 +
    clarificationCount * 5 -
    ambiguityPenalty;
  return Math.max(18, Math.min(97, Math.round(score)));
}

function selectClarifyingQuestion(
  context: DiagnosticContext,
  scoredCauses: Array<{ cause: CauseDefinition; probability: number }>,
  clarificationHistory: ClarificationTurn[]
) {
  const topCauseIds = scoredCauses.slice(0, 4).map((item) => item.cause.id);
  const candidates = scoredCauses.slice(0, 4).flatMap((item) =>
    item.cause.questions.map((question) => ({
      text: question.text,
      score:
        question.positiveFor.filter((causeId) => topCauseIds.includes(causeId)).length * 2 +
        (question.negativeFor?.filter((causeId) => topCauseIds.includes(causeId)).length ?? 0) +
        item.probability * 3,
    }))
  );

  const next = candidates
    .filter((candidate) => !hasAskedSimilarQuestion(clarificationHistory, candidate.text))
    .sort((left, right) => right.score - left.score)[0];

  if (!next?.text) {
    return "";
  }

  const leadingCause = scoredCauses[0]?.cause.cause ?? "the leading issue";
  const competingCause = scoredCauses[1]?.cause.cause ?? "other likely causes";
  const symptomCue = context.input.symptoms[0]?.trim() ?? "this complaint";
  const vehicleCue = [context.input.vehicle?.make, context.input.vehicle?.model]
    .filter(Boolean)
    .join(" ")
    .trim();
  const prefixParts = [
    "To separate",
    leadingCause,
    "from",
    competingCause,
    vehicleCue ? `on this ${vehicleCue}` : "on this truck",
    `for ${symptomCue.toLowerCase()}:`,
  ];

  return `${prefixParts.join(" ")} ${next.text}`;
}

function normalizeQuestionForComparison(value: string | null | undefined) {
  const normalizedSource = String(value ?? "");
  const suffix = normalizedSource.includes(":")
    ? normalizedSource.slice(normalizedSource.lastIndexOf(":") + 1)
    : normalizedSource;

  return suffix
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(to separate|from|on this|for|truck|vehicle|does|is|are|the|a|an|this|that|right|now|mainly)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function questionSimilarityScore(left: string, right: string) {
  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let overlap = 0;
  for (const token of Array.from(leftTokens)) {
    if (rightTokens.has(token)) overlap += 1;
  }

  return overlap / Math.max(leftTokens.size, rightTokens.size);
}

function hasAskedSimilarQuestion(history: ClarificationTurn[], question: string) {
  const normalizedQuestion = normalizeQuestionForComparison(question);
  if (!normalizedQuestion) return true;

  return history.some((turn) => {
    const asked = normalizeQuestionForComparison(turn.question);
    if (!asked) return false;
    return (
      asked === normalizedQuestion ||
      asked.includes(normalizedQuestion) ||
      normalizedQuestion.includes(asked) ||
      questionSimilarityScore(asked, normalizedQuestion) >= 0.72
    );
  });
}

function isGenericClarifyingQuestion(question: string) {
  const normalized = question.toLowerCase();
  return [
    /what symptom is most repeatable/,
    /idle,?\s*under load,?\s*or all the time/,
    /what operating condition makes/,
    /what exact dashboard warning lights/,
    /getting better, worse, or staying the same/,
  ].some((pattern) => pattern.test(normalized));
}

function buildSymptomClarifyingQuestionCandidates(
  stage: BaselineStage,
  ranking: z.infer<typeof rankedCauseSchema>[]
) {
  const input = stage.context.input;
  const symptomText = [
    ...input.symptoms,
    input.driverNotes ?? "",
    input.operatingConditions ?? "",
    ...input.faultCodes,
  ]
    .join(" ")
    .toLowerCase();
  const primarySymptom =
    stage.evidence.primarySymptoms[0] ?? input.symptoms[0] ?? "the reported issue";
  const topCause = ranking[0]?.cause_name ?? stage.baseline.possible_causes[0]?.cause ?? "the leading cause";
  const runnerUp = ranking[1]?.cause_name ?? stage.baseline.possible_causes[1]?.cause ?? "the next likely cause";
  const questions: string[] = [];
  const add = (question: string) => {
    const trimmed = question.trim();
    if (trimmed && !questions.some((existing) => normalizeQuestionForComparison(existing) === normalizeQuestionForComparison(trimmed))) {
      questions.push(trimmed);
    }
  };

  if (/(oil.*coolant|coolant.*oil|milky oil|milky coolant|oil in coolant|coolant in oil|cross contamination|white smoke.*coolant|combustion gas)/.test(symptomText)) {
    add("For the oil/coolant contamination, where is it visible right now: milky engine oil, oil in the coolant reservoir, both, or white exhaust smoke with coolant loss?");
    add("Has the engine overheated, lost coolant, or built pressure in the coolant reservoir since the oil and coolant started mixing?");
  }

  if (/(coolant|overheat|temperature|radiator|hose|water pump|thermostat|heater)/.test(symptomText)) {
    add("For the cooling complaint, is coolant level dropping, temperature rising, pressure building in the reservoir, or an external leak visible?");
  }

  if (/(oil pressure|low oil|knock|rod|bearing|metal|lubrication)/.test(symptomText)) {
    add("For the oil system complaint, is the oil pressure warning active at idle, under load, or immediately after startup?");
  }

  if (/(no start|won.t start|crank|click|starter|battery|alternator|charging|voltage)/.test(symptomText)) {
    add("When trying to start it, does the engine crank normally, crank slowly, click once, or have no electrical power?");
  }

  if (/(brake|air pressure|air leak|compressor|chamber|slack|abs)/.test(symptomText)) {
    add("For the brake or air issue, does air pressure fail to build, drop after shutdown, or leak audibly from a wheel end, valve, or air line?");
  }

  if (/(tire|wheel|vibration|shake|hub|bearing|rim|lug)/.test(symptomText)) {
    add("For the tire or wheel-end issue, which position is affected and is there heat, vibration, wobble, noise, or visible damage?");
  }

  if (/(def|dpf|scr|regen|aftertreatment|derate|nox|emissions)/.test(symptomText)) {
    add("For the aftertreatment issue, what message is on the dash and is the truck currently derated, requesting regen, or showing a DEF level warning?");
  }

  if (/(transmission|gear|shift|clutch|driveline|u-joint|slip)/.test(symptomText)) {
    add("For the driveline complaint, does it happen during shifting, acceleration under load, deceleration, or while parked in gear?");
  }

  if (/(steering|suspension|pull|wander|clunk|leaf|shock|spring)/.test(symptomText)) {
    add("For the steering or suspension complaint, is the issue a pull, looseness, clunk, uneven ride height, or loss of steering control?");
  }

  if (/(fuel|power loss|low power|stall|surge|smoke|misfire|rough idle)/.test(symptomText)) {
    add("For the power or fuel complaint, does it occur at idle, under load, during acceleration, or after the engine warms up?");
  }

  if (input.faultCodes.length > 0) {
    add(`With fault code ${input.faultCodes[0]}, what warning light or dash message appeared first, and did it appear before or after ${primarySymptom.toLowerCase()}?`);
  }

  add(`What single observation best separates ${topCause} from ${runnerUp} for ${primarySymptom.toLowerCase()}?`);
  return questions;
}

function chooseFreshClarifyingQuestion(
  stage: BaselineStage,
  ranking: z.infer<typeof rankedCauseSchema>[],
  proposedQuestion: string | null | undefined
) {
  const history = stage.context.input.clarificationHistory;
  const proposed = (proposedQuestion ?? "").trim();
  if (proposed && !isGenericClarifyingQuestion(proposed) && !hasAskedSimilarQuestion(history, proposed)) {
    return proposed;
  }

  const symptomQuestions = buildSymptomClarifyingQuestionCandidates(stage, ranking);
  const symptomQuestion = symptomQuestions.find((question) => !hasAskedSimilarQuestion(history, question));
  if (symptomQuestion) {
    return symptomQuestion;
  }

  const synthesized = synthesizeClarifyingQuestion(stage, ranking).trim();
  if (synthesized && !isGenericClarifyingQuestion(synthesized) && !hasAskedSimilarQuestion(history, synthesized)) {
    return synthesized;
  }

  const primarySymptom =
    stage.evidence.primarySymptoms[0] ?? stage.context.input.symptoms[0] ?? "the reported issue";
  const topCause = ranking[0]?.cause_name ?? stage.baseline.possible_causes[0]?.cause ?? "the leading cause";
  const runnerUp = ranking[1]?.cause_name ?? stage.baseline.possible_causes[1]?.cause ?? "the competing cause";
  const fallbackQuestions = [
    `What changed since this issue first appeared: temperature, load, speed, warning lights, or fluid level?`,
    `For ${primarySymptom.toLowerCase()}, is it currently getting better, worse, or staying the same?`,
    `Which detail best separates ${topCause} from ${runnerUp}: fluid contamination, pressure loss, electrical warning, noise, or drivability change?`,
    `Can the driver safely reproduce the symptom while parked, or does it only appear while driving under load?`,
    `What exact dashboard warning lights or messages are active right now?`,
  ];

  const rotationOffset = history.length % fallbackQuestions.length;
  const rotatedFallbackQuestions = fallbackQuestions
    .slice(rotationOffset)
    .concat(fallbackQuestions.slice(0, rotationOffset));

  return rotatedFallbackQuestions.find((question) => !hasAskedSimilarQuestion(history, question)) ?? "";
}

function extractKnownParts(text: string) {
  const normalized = normalizeText(text);
  return KNOWN_PART_KEYWORDS.filter((part) => normalized.includes(part));
}

function inferRecentPartDirection(part: string, complaintText: string) {
  const normalizedPart = normalizeText(part);
  const normalizedComplaint = normalizeText(complaintText);
  if (!normalizedComplaint.includes(normalizedPart)) {
    return "possible_adjacent_failure" as const;
  }
  if (/(new|recent|just replaced|after repair)/.test(normalizedComplaint)) {
    return "possible_defective_part" as const;
  }
  if (/(still|again|same issue|returned)/.test(normalizedComplaint)) {
    return "possible_incomplete_root_cause_repair" as const;
  }
  return "less_likely_same_part_failed" as const;
}

function computeReplacementDecayWeight(daysSinceReplacement: number | null) {
  if (daysSinceReplacement == null) return 0.45;
  return clamp(1 - daysSinceReplacement / 180, 0.15, 1);
}

function inferVehicleDataGaps(input: DiagnosticInput) {
  const gaps: string[] = [];
  if (!input.vehicle?.make) gaps.push("Vehicle make missing");
  if (!input.vehicle?.model) gaps.push("Vehicle model missing");
  if (!input.vehicle?.year) gaps.push("Vehicle year missing");
  if (!input.vehicle?.engine) gaps.push("Engine configuration missing");
  if (!input.vehicle?.emissionsConfiguration) gaps.push("Emissions or fuel context missing");
  if (!input.vehicle?.trailerConfiguration) gaps.push("Truck or trailer configuration missing");
  return gaps;
}

function buildEvidenceStage(context: DiagnosticContext): EvidenceStage {
  const fullComplaintText = `${context.normalizedSymptoms.join(" ")} ${context.notes}`.trim();
  const symptomToSystemLinks = context.normalizedSymptoms.map((symptom) => ({
    symptom,
    linked_systems: inferComplaintDomains(symptom, context.normalizedFaultCodes),
  }));
  const primarySymptoms = context.normalizedSymptoms
    .slice()
    .sort((left, right) => {
      const leftScore = inferComplaintDomains(left, []).length + (/(overheat|grinding|low air|won't hold|roll|smoke|fire)/.test(left) ? 2 : 0);
      const rightScore = inferComplaintDomains(right, []).length + (/(overheat|grinding|low air|won't hold|roll|smoke|fire)/.test(right) ? 2 : 0);
      return rightScore - leftScore;
    })
    .slice(0, 2);
  const secondarySymptoms = context.normalizedSymptoms.filter((symptom) => !primarySymptoms.includes(symptom));
  const symptomScore = Math.round(
    clamp(
      18 +
        context.normalizedSymptoms.length * 14 +
        uniqueStrings(symptomToSystemLinks.flatMap((item) => item.linked_systems)).length * 12,
      0,
      100
    )
  );
  const symptomSignalStrength = Math.round(
    clamp(symptomScore + (primarySymptoms.length > 0 ? 6 : 0) + (secondarySymptoms.length > 0 ? 4 : 0), 0, 100)
  );
  const symptomRationale = uniqueStrings([
    primarySymptoms.length > 0 ? `Primary symptoms: ${primarySymptoms.join(", ")}` : "",
    secondarySymptoms.length > 0 ? `Secondary symptoms: ${secondarySymptoms.join(", ")}` : "",
    symptomToSystemLinks.some((item) => item.linked_systems.length > 0)
      ? `Symptoms map into ${uniqueStrings(symptomToSystemLinks.flatMap((item) => item.linked_systems)).join(", ")} systems`
      : "Symptoms remain partially ambiguous without stronger subsystem cues",
  ]).filter(Boolean);

  const faultCodeInterpretations = context.normalizedFaultCodes.map((code) => {
    const metadata = FAULT_CODE_METADATA[code];
    const systems = metadata?.systems ?? [];
    const domainOverlap = systems.filter((system) => context.complaintDomains.includes(system)).length;
    const signalStrength = Math.round(
      clamp(
        metadata ? 55 + domainOverlap * 10 + metadata.likelyCauseIds.length * 4 : 28 + domainOverlap * 8,
        0,
        100
      )
    );
    return {
      code,
      interpretation: metadata?.interpretation ?? "No hardcoded interpretation available; use contextual evidence.",
      role:
        domainOverlap > 0
          ? metadata?.defaultRole ?? "primary"
          : metadata?.defaultRole === "primary"
            ? "secondary"
            : metadata?.defaultRole ?? "uncertain",
      signal_strength: signalStrength,
    } satisfies z.infer<typeof faultCodeInterpretationSchema>;
  });

  const faultCodeScore = Math.round(
    clamp(
      average(faultCodeInterpretations.map((item) => item.signal_strength)) + context.normalizedFaultCodes.length * 4,
      0,
      100
    )
  );
  const faultCodeSignalStrength = context.normalizedFaultCodes.length > 0 ? faultCodeScore : 0;
  const primaryVsSecondaryCodeAssessment = faultCodeInterpretations.map(
    (item) => `${item.code} is acting as a ${item.role} signal`
  );
  const contextualCodeRelevance = faultCodeInterpretations.map(
    (item) => `${item.code}: ${item.interpretation}`
  );
  const codeToCauseLinks = uniqueStrings(
    faultCodeInterpretations.flatMap((item) =>
      (FAULT_CODE_METADATA[item.code]?.likelyCauseIds ?? []).map((causeId) => {
        const cause = CAUSE_LIBRARY.find((entry) => entry.id === causeId);
        return cause ? `${item.code} supports ${cause.cause}` : "";
      })
    )
  ).filter(Boolean);
  const faultCodeRationale = uniqueStrings([
    context.normalizedFaultCodes.length > 0
      ? `Fault codes present: ${context.normalizedFaultCodes.join(", ")}`
      : "No fault codes were provided",
    ...primaryVsSecondaryCodeAssessment,
  ]).filter(Boolean);

  const repairHistory = (context.input.issueHistory.repairHistory ?? []).length > 0
    ? (context.input.issueHistory.repairHistory ?? [])
    : (context.input.issueHistory.recentRepairs ?? []);
  const maintenanceHistory = context.input.issueHistory.maintenanceHistory ?? [];
  const repairHistoryText = repairHistory.map((item) => normalizeText(item.summary));
  const maintenanceHistoryText = maintenanceHistory.map((item) => normalizeText(item.summary));
  const currentParts = extractKnownParts(fullComplaintText);
  const repairOverlapCount = repairHistoryText.filter((item) =>
    currentParts.some((part) => item.includes(part)) || context.complaintDomains.some((domain) => item.includes(domain))
  ).length;
  const maintenanceOverlapCount = maintenanceHistoryText.filter((item) =>
    currentParts.some((part) => item.includes(part)) || context.complaintDomains.some((domain) => item.includes(domain))
  ).length;
  const repairHistoryScore = Math.round(clamp(repairOverlapCount * 22 + repairHistory.length * 6, 0, 100));
  const maintenanceHistoryScore = Math.round(
    clamp(maintenanceOverlapCount * 18 + maintenanceHistory.length * 5, 0, 100)
  );
  const historyScore = Math.round(clamp(average([repairHistoryScore, maintenanceHistoryScore]), 0, 100));
  const repairHistoryRationale = uniqueStrings([
    repairHistory.length > 0 ? `${repairHistory.length} repair records reviewed` : "No repair history available",
    repairOverlapCount > 0 ? `${repairOverlapCount} repair records match the current system or component clues` : "",
  ]).filter(Boolean);
  const maintenanceHistoryRationale = uniqueStrings([
    maintenanceHistory.length > 0
      ? `${maintenanceHistory.length} maintenance records reviewed`
      : "No maintenance history available",
    maintenanceOverlapCount > 0
      ? `${maintenanceOverlapCount} maintenance records strengthen the current diagnostic context`
      : "",
  ]).filter(Boolean);
  const historyRationale = uniqueStrings([...repairHistoryRationale, ...maintenanceHistoryRationale]);

  const recentPartsReplaced = (context.input.issueHistory.recentPartsReplaced ?? []).map((item) => {
    const daysSinceReplacement =
      item.days_since_replacement ??
      (item.replacedAt ? Math.max(0, Math.round((Date.now() - new Date(item.replacedAt).getTime()) / 86_400_000)) : null);
    const decayWeight = computeReplacementDecayWeight(daysSinceReplacement);
    const relevanceScore = Math.round(
      clamp(
        item.relevance_score ||
          (normalizeText(fullComplaintText).includes(normalizeText(item.part)) ? 78 : 48) * decayWeight,
        0,
        100
      )
    );
    return RecentPartReplacementSchema.parse({
      part: item.part,
      replacedAt: item.replacedAt ?? null,
      days_since_replacement: daysSinceReplacement,
      replacement_effect_direction: item.replacement_effect_direction ?? inferRecentPartDirection(item.part, fullComplaintText),
      replacement_decay_weight: decayWeight,
      relevance_score: relevanceScore,
    });
  });
  const recentPartsReplacedScore = Math.round(
    clamp(
      average(recentPartsReplaced.map((item) => item.relevance_score * item.replacement_decay_weight)),
      0,
      100
    )
  );
  const replacementRelevanceToCurrentIssue = recentPartsReplaced.map(
    (item) => `${item.part} has relevance score ${item.relevance_score}`
  );
  const replacementEffectDirection = uniqueStrings(
    recentPartsReplaced.map((item) => item.replacement_effect_direction)
  );
  const replacementDecayWeight = recentPartsReplaced.length > 0
    ? Number(average(recentPartsReplaced.map((item) => item.replacement_decay_weight)).toFixed(2))
    : 0;
  const recentPartsRationale = uniqueStrings([
    recentPartsReplaced.length > 0
      ? `${recentPartsReplaced.length} recent part replacements were treated as special weighting signals`
      : "No recent parts replacements were available",
    ...replacementRelevanceToCurrentIssue,
  ]).filter(Boolean);

  const combinedHistoryText = [
    ...(context.input.issueHistory.priorDiagnostics ?? []).map((item) => item.summary),
    ...(context.input.issueHistory.priorDefects ?? []).map((item) => item.summary),
    ...repairHistory.map((item) => item.summary),
  ].map((item) => normalizeText(item));
  const repeatCodeFrequency = combinedHistoryText.reduce<Record<string, number>>((accumulator, item) => {
    for (const code of context.normalizedFaultCodes) {
      if (item.includes(code.toLowerCase())) {
        accumulator[code] = (accumulator[code] ?? 0) + 1;
      }
    }
    return accumulator;
  }, {});
  const repeatComponentFrequency = combinedHistoryText.reduce<Record<string, number>>((accumulator, item) => {
    for (const part of KNOWN_PART_KEYWORDS) {
      if (item.includes(part)) {
        accumulator[part] = (accumulator[part] ?? 0) + 1;
      }
    }
    return accumulator;
  }, {});
  const repeatRepairWithoutResolution = repairHistory
    .filter((item) => !/(resolved|completed|fixed|verified)/i.test(item.outcome ?? item.status ?? ""))
    .map((item) => item.summary);
  const recurringPatternType = uniqueStrings([
    Object.values(repeatCodeFrequency).some((value) => value > 0) ? "repeat_fault_codes" : "",
    Object.values(repeatComponentFrequency).some((value) => value > 1) ? "repeat_components" : "",
    repeatRepairWithoutResolution.length > 0 ? "repeat_repair_without_resolution" : "",
  ]).filter(Boolean);
  const recurringFailureScore = Math.round(
    clamp(
      Object.values(repeatCodeFrequency).reduce((sum, value) => sum + value * 18, 0) +
        Object.values(repeatComponentFrequency).reduce((sum, value) => sum + Math.max(0, value - 1) * 12, 0) +
        repeatRepairWithoutResolution.length * 14,
      0,
      100
    )
  );
  const suspectedUnresolvedRootCause =
    Object.entries(repeatComponentFrequency).sort((left, right) => right[1] - left[1])[0]?.[0] ??
    (Object.entries(repeatCodeFrequency).sort((left, right) => right[1] - left[1])[0]?.[0] ?? null);
  const recurrenceRationale = uniqueStrings([
    recurringPatternType.length > 0
      ? `Recurring patterns detected: ${recurringPatternType.join(", ")}`
      : "No strong recurring failure pattern detected",
    suspectedUnresolvedRootCause ? `Likely unresolved root clue: ${suspectedUnresolvedRootCause}` : "",
  ]).filter(Boolean);

  return {
    normalizedSymptoms: context.normalizedSymptoms,
    primarySymptoms,
    secondarySymptoms,
    symptomToSystemLinks,
    symptomScore,
    symptomSignalStrength,
    symptomRationale,
    faultCodeInterpretations,
    faultCodeScore,
    faultCodeSignalStrength,
    primaryVsSecondaryCodeAssessment,
    contextualCodeRelevance,
    codeToCauseLinks,
    faultCodeRationale,
    repairHistoryScore,
    maintenanceHistoryScore,
    historyScore,
    repairHistoryRationale,
    maintenanceHistoryRationale,
    historyRationale,
    recentPartsReplaced,
    recentPartsReplacedScore,
    replacementRelevanceToCurrentIssue,
    replacementEffectDirection,
    replacementDecayWeight,
    recentPartsRationale,
    recurringFailureScore,
    recurringPatternType,
    repeatCodeFrequency,
    repeatComponentFrequency,
    repeatRepairWithoutResolution,
    suspectedUnresolvedRootCause,
    recurrenceRationale,
    vehicleDataGaps: inferVehicleDataGaps(context.input),
  };
}

function buildCandidateUniverse(
  context: DiagnosticContext,
  ranked: BaselineRankedCause[]
): z.infer<typeof candidateUniverseSchema>[] {
  const entries = new Map<string, z.infer<typeof candidateUniverseSchema>>();

  const addEntry = (entry: z.infer<typeof candidateUniverseSchema>) => {
    const key = entry.cause_id ?? entry.cause_name.toLowerCase();
    const existing = entries.get(key);
    if (existing) {
      existing.reasons = uniqueStrings([...existing.reasons, ...entry.reasons]);
      return;
    }
    entries.set(key, entry);
  };

  ranked.slice(0, 6).forEach((item) =>
    addEntry({
      cause_id: item.cause.id,
      cause_name: item.cause.cause,
      source: "baseline_match",
      reasons: item.evidenceSummary.slice(0, 3),
    })
  );

  ranked.slice(6, 10).forEach((item) =>
    addEntry({
      cause_id: item.cause.id,
      cause_name: item.cause.cause,
      source: "near_match",
      reasons: [`Baseline score ${roundProbability(item.probability)}% kept this as a near-match candidate`],
    })
  );

  const leadingSystems = uniqueStrings(ranked.slice(0, 3).flatMap((item) => item.cause.systems));
  CAUSE_LIBRARY.filter((cause) => cause.systems.some((system) => leadingSystems.includes(system)))
    .slice(0, 8)
    .forEach((cause) =>
      addEntry({
        cause_id: cause.id,
        cause_name: cause.cause,
        source: "related_subsystem",
        reasons: [`Shares subsystem overlap with ${leadingSystems.join(", ")}`],
      })
    );

  context.normalizedFaultCodes.forEach((code) => {
    for (const causeId of FAULT_CODE_METADATA[code]?.likelyCauseIds ?? []) {
      const cause = CAUSE_LIBRARY.find((item) => item.id === causeId);
      if (!cause) continue;
      addEntry({
        cause_id: cause.id,
        cause_name: cause.cause,
        source: "fault_code_inferred",
        reasons: [`Fault code ${code} directly points toward this cause family`],
      });
    }
  });

  context.similarCases.slice(0, 5).forEach((item) =>
    addEntry({
      cause_id: item.causeId,
      cause_name: item.cause,
      source: "similar_case",
      reasons: [`Similar case ${item.id} resolved with related evidence`],
    })
  );

  return Array.from(entries.values()).slice(0, 14);
}

function determineRiskLevel(topCauses: Array<{ causeName: string; causeDef: CauseDefinition | null }>) {
  return topCauses.reduce<z.infer<typeof riskLevelSchema>>((current, item) => {
    const nextRisk = item.causeDef?.risk ?? (/brake|steering|wheel|bearing|overheat|fire|oil pressure/i.test(item.causeName) ? "high" : "medium");
    return scoreRisk(nextRisk) > scoreRisk(current) ? nextRisk : current;
  }, "low");
}

function mapRiskToDriverAction(riskLevel: z.infer<typeof riskLevelSchema>): z.infer<typeof driverActionSchema> {
  if (riskLevel === "high") return "stop_and_inspect_on_site";
  if (riskLevel === "medium") return "drive_to_shop";
  return "keep_running_monitor";
}

function getCauseDefinitionByName(causeName: string): CauseDefinition | null {
  const normalized = normalizeText(causeName);
  return (
    CAUSE_LIBRARY.find((cause) => cause.id === causeName) ??
    CAUSE_LIBRARY.find((cause) => normalizeText(cause.cause) === normalized) ??
    CAUSE_LIBRARY.find((cause) => normalized.includes(normalizeText(cause.cause))) ??
    null
  );
}

function getBaselineGuidance(causeDef: CauseDefinition | null, causeName: string) {
  const guidance = causeDef ? BASELINE_PARTS_GUIDANCE[causeDef.id] : undefined;
  if (guidance) {
    return {
      ...guidance,
      totalEstimatedLaborHours: {
        min: Number((guidance.diagnosticVerificationLaborHours.min + guidance.repairLaborHours.min).toFixed(1)),
        max: Number((guidance.diagnosticVerificationLaborHours.max + guidance.repairLaborHours.max).toFixed(1)),
      },
    };
  }

  return {
    likelyReplacementParts: extractKnownParts(causeName),
    inspectionRelatedParts: ["visual inspection", "connector checks", "follow-up verification"],
    adjacentPartsToCheck: [],
    recommendedTests: ["Verify the complaint with direct inspection"],
    recommendedFix: `Verify ${causeName} with the recommended tests before replacing parts.`,
    diagnosticVerificationLaborHours: { min: 1, max: 2 },
    repairLaborHours: { min: 1, max: 3 },
    totalEstimatedLaborHours: { min: 2, max: 5 },
    laborTimeConfidence: 55,
    laborTimeBasis: ["Generic fallback labor estimate used because no hardcoded cause guidance matched"],
  };
}

function resolveFinalSystemsAffected(
  topCauseDef: CauseDefinition | null,
  baselineSystemsAffected: string[],
  fallbackCategorySystems: string[] = []
) {
  const primarySystems = topCauseDef?.systems?.length ? topCauseDef.systems : baselineSystemsAffected;
  const combined = uniqueStrings([...primarySystems, ...fallbackCategorySystems]).filter(
    (system) => system !== "unknown"
  );
  return combined.length > 0 ? combined : baselineSystemsAffected;
}

function buildBaselineStage(
  rawInput: DiagnosticInputRequest,
  config: ReturnType<typeof getDiagnosticRuntimeConfig>,
  intakeInterpretation: DiagnosticIntakeInterpretation | null = null
): BaselineStage {
  const context = buildDiagnosticContext(rawInput, intakeInterpretation);
  const evidence = buildEvidenceStage(context);
  const evaluated = CAUSE_LIBRARY.map((cause) => evaluateCause(context, cause));
  const totalScore = evaluated.reduce((sum, item) => sum + item.score, 0) || 1;
  const ranked = evaluated
    .map((item) => ({
      cause: item.cause,
      probability: (item.score / totalScore) * 100,
      score: item.score,
      evidenceMatches: item.evidenceMatches,
      evidenceSummary: item.evidenceSummary,
    }))
    .sort((left, right) => right.probability - left.probability);

  const confidenceScore = calculateConfidence(
    evaluated.map((item) => ({ score: item.score, evidenceMatches: item.evidenceMatches })),
    context.input.clarificationHistory.length
  );
  const clarifyingQuestion =
    confidenceScore < config.confidenceThreshold &&
    context.input.clarificationHistory.length < MAX_CLARIFICATION_ROUNDS
      ? selectClarifyingQuestion(context, ranked, context.input.clarificationHistory)
      : "";
  const nextAction = confidenceScore >= config.confidenceThreshold || !clarifyingQuestion ? "proceed" : "ask_question";
  const topCauses = ranked.slice(0, 4);
  const leadingCause = topCauses[0]?.cause ?? CAUSE_LIBRARY[0];
  const normalizedProbabilities = normalizeProbabilities(topCauses.map((item) => item.probability));
  const systemsAffected = uniqueStrings(
    topCauses
      .filter((item) => item.probability >= 12)
      .flatMap((item) => item.cause.systems)
  );
  const recommendedTests = uniqueStrings(topCauses.slice(0, 3).flatMap((item) => item.cause.recommendedTests)).slice(0, 6);
  const riskLevel = determineRiskLevel(
    topCauses.slice(0, 2).map((item) => ({ causeName: item.cause.cause, causeDef: item.cause }))
  );
  const complianceImpact = getComplianceImpact(riskLevel);
  const maintenanceRecommendations = buildMaintenanceRecommendations(topCauses, riskLevel, complianceImpact);
  const candidateUniverse = buildCandidateUniverse(context, ranked);

  const baseline = ruleEngineBaselineSchema.parse({
    systems_affected: systemsAffected.length > 0 ? systemsAffected : leadingCause.systems,
    possible_causes: topCauses.map((item, index) => ({
      cause: item.cause.cause,
      probability: normalizedProbabilities[index] ?? 0,
    })),
    confidence_score: confidenceScore,
    next_action: nextAction,
    clarifying_question: nextAction === "ask_question" ? clarifyingQuestion : "",
    recommended_tests: recommendedTests,
    recommended_fix: leadingCause.recommendedFix,
    risk_level: riskLevel,
    compliance_impact: complianceImpact,
    matched_library_causes: topCauses.slice(0, 3).map((item) => item.cause.cause),
    partial_library_matches: ranked.slice(3, 6).map((item) => item.cause.cause),
    candidate_universe: candidateUniverse,
  });

  return {
    context,
    evidence,
    ranked,
    baseline,
    candidateUniverse,
  };
}

function buildEvidencePackage(
  stage: BaselineStage,
  config: ReturnType<typeof getDiagnosticRuntimeConfig>
) {
  const { context, evidence, baseline, ranked, candidateUniverse } = stage;
  const truncate = (value: string | null | undefined, maxLength: number = 180) => {
    const normalized = (value ?? "").trim();
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, maxLength - 1)}…`;
  };
  const compactStrings = (values: string[], limit: number, maxLength: number = 120) =>
    uniqueStrings(values).slice(0, limit).map((item) => truncate(item, maxLength));
  const compactRecord = (record: Record<string, number>, limit: number) =>
    Object.fromEntries(Object.entries(record).slice(0, limit));
  const compactIntakeInterpretation = context.llmIntakeInterpretation
    ? {
        normalized_symptoms: compactStrings(context.llmIntakeInterpretation.normalized_symptoms, 5),
        primary_symptoms: compactStrings(context.llmIntakeInterpretation.primary_symptoms, 4),
        secondary_symptoms: compactStrings(context.llmIntakeInterpretation.secondary_symptoms, 4),
        inferred_systems: compactStrings(context.llmIntakeInterpretation.inferred_systems, 4),
        likely_failure_modes: compactStrings(context.llmIntakeInterpretation.likely_failure_modes, 4),
        evidence_keywords: compactStrings(context.llmIntakeInterpretation.evidence_keywords, 8, 80),
        candidate_cause_hints: compactStrings(context.llmIntakeInterpretation.candidate_cause_hints, 4),
        risk_flags: compactStrings(context.llmIntakeInterpretation.risk_flags, 4),
        missing_evidence: compactStrings(context.llmIntakeInterpretation.missing_evidence, 4),
        ambiguity_drivers: compactStrings(context.llmIntakeInterpretation.ambiguity_drivers, 4),
        interpretation_rationale: compactStrings(context.llmIntakeInterpretation.interpretation_rationale, 3),
        interpreted_fault_codes: context.llmIntakeInterpretation.interpreted_fault_codes
          .slice(0, 4)
          .map((item) => ({
            code: item.code,
            interpretation: truncate(item.interpretation, 120),
            role: item.role,
            signal_strength: item.signal_strength,
          })),
      }
    : null;
  const compactHistory = (entries: Array<{ summary: string; status?: string; outcome?: string; occurredAt?: unknown }>, limit: number) =>
    entries.slice(0, limit).map((entry) => ({
      summary: truncate(entry.summary, 120),
      status: entry.status ?? null,
      outcome: truncate(entry.outcome, 100) || null,
      occurredAt: entry.occurredAt ?? null,
    }));
  const compactCandidates = candidateUniverse.slice(0, 6).map((entry) => ({
    cause_id: entry.cause_id,
    cause_name: entry.cause_name,
    source: entry.source,
    reasons: entry.reasons.slice(0, 2).map((reason) => truncate(reason, 90)),
  }));
  const compactBaselineRanking = ranked.slice(0, 4).map((item) => ({
    cause_id: item.cause.id,
    cause_name: item.cause.cause,
    probability: roundProbability(item.probability),
    systems: item.cause.systems,
    evidence_summary: item.evidenceSummary.slice(0, 2).map((reason) => truncate(reason, 100)),
  }));
  const compactBaseline = {
    systems_affected: baseline.systems_affected.slice(0, 5),
    possible_causes: baseline.possible_causes.slice(0, 4),
    confidence_score: baseline.confidence_score,
    next_action: baseline.next_action,
    clarifying_question: truncate(baseline.clarifying_question, 140),
    recommended_tests: baseline.recommended_tests.slice(0, 4).map((item) => truncate(item, 120)),
    recommended_fix: truncate(baseline.recommended_fix, 160),
    risk_level: baseline.risk_level,
    compliance_impact: baseline.compliance_impact,
    matched_library_causes: baseline.matched_library_causes.slice(0, 4),
    partial_library_matches: baseline.partial_library_matches.slice(0, 4),
    candidate_universe: compactCandidates,
  };
  const similarConfirmedCases = buildSimilarConfirmedCaseEvidence(context).slice(0, 3).map((item) => ({
    ...item,
    summary: truncate(item.summary, 120),
    confirmed_fix: truncate(item.confirmed_fix, 120) || null,
    matched_signals: item.matched_signals.slice(0, 4),
  }));

  return {
    vehicle_id: context.input.vehicleId,
    fleet_id: context.input.fleetId ?? null,
    confidence_threshold: config.confidenceThreshold,
    llm_intake_interpretation: compactIntakeInterpretation,
    normalized_symptoms: compactStrings(evidence.normalizedSymptoms, 8),
    raw_symptoms: (context.input.symptoms ?? []).slice(0, 4).map((item) => truncate(item, 120)),
    primary_symptoms: compactStrings(evidence.primarySymptoms, 5),
    secondary_symptoms: compactStrings(evidence.secondarySymptoms, 5),
    symptom_to_system_links: evidence.symptomToSystemLinks.slice(0, 5),
    symptom_score: evidence.symptomScore,
    symptom_signal_strength: evidence.symptomSignalStrength,
    fault_codes: context.normalizedFaultCodes,
    fault_code_interpretations: evidence.faultCodeInterpretations.slice(0, 5).map((item) => ({
      ...item,
      interpretation: truncate(item.interpretation, 120),
    })),
    fault_code_score: evidence.faultCodeScore,
    fault_code_signal_strength: evidence.faultCodeSignalStrength,
    primary_vs_secondary_code_assessment: compactStrings(evidence.primaryVsSecondaryCodeAssessment, 5),
    contextual_code_relevance: compactStrings(evidence.contextualCodeRelevance, 5),
    code_to_cause_links: compactStrings(evidence.codeToCauseLinks, 5),
    vehicle_context: {
      make: context.input.vehicle?.make ?? null,
      model: context.input.vehicle?.model ?? null,
      year: context.input.vehicle?.year ?? null,
      vin: context.input.vehicle?.vin ?? null,
      engine: context.input.vehicle?.engine ?? null,
      emissions_configuration: context.input.vehicle?.emissionsConfiguration ?? null,
      transmission: context.input.vehicle?.configuration?.transmission ?? null,
      trailer_configuration: context.input.vehicle?.trailerConfiguration ?? null,
      brake_configuration: context.input.vehicle?.brakeConfiguration ?? null,
      mileage: context.input.vehicle?.mileage ?? null,
      engine_hours: context.input.vehicle?.engineHours ?? null,
    },
    repair_history: compactHistory(
      (context.input.issueHistory.repairHistory ?? []).length > 0
        ? (context.input.issueHistory.repairHistory ?? [])
        : (context.input.issueHistory.recentRepairs ?? []),
      3
    ),
    maintenance_history: compactHistory(context.input.issueHistory.maintenanceHistory ?? [], 3),
    prior_diagnostics: compactHistory(context.input.issueHistory.priorDiagnostics ?? [], 2),
    prior_defects: compactHistory(context.input.issueHistory.priorDefects ?? [], 2),
    recent_inspections: compactHistory(context.input.issueHistory.recentInspections ?? [], 1),
    recent_parts_replaced: evidence.recentPartsReplaced.slice(0, 3),
    recurring_failure_patterns: {
      recurring_failure_score: evidence.recurringFailureScore,
      recurring_pattern_type: compactStrings(evidence.recurringPatternType, 4),
      repeat_code_frequency: compactRecord(evidence.repeatCodeFrequency, 6),
      repeat_component_frequency: compactRecord(evidence.repeatComponentFrequency, 6),
      repeat_repair_without_resolution: compactStrings(evidence.repeatRepairWithoutResolution, 4),
      suspected_unresolved_root_cause: truncate(evidence.suspectedUnresolvedRootCause, 140) || null,
    },
    cause_library_candidates: compactCandidates,
    similar_confirmed_cases: similarConfirmedCases,
    rules_engine_baseline: compactBaseline,
    baseline_ranked_candidates: compactBaselineRanking,
    confidence_signals: {
      baseline_confidence_score: baseline.confidence_score,
      repair_history_score: evidence.repairHistoryScore,
      maintenance_history_score: evidence.maintenanceHistoryScore,
      history_score: evidence.historyScore,
      recent_parts_replaced_score: evidence.recentPartsReplacedScore,
      recurring_failure_score: evidence.recurringFailureScore,
      cause_library_fit_score: Math.round(average(ranked.slice(0, 4).map((item) => item.probability))),
    },
    data_gaps: [
      ...evidence.vehicleDataGaps,
      ...(context.normalizedFaultCodes.length === 0 ? ["No fault codes provided"] : []),
      ...((context.input.issueHistory.maintenanceHistory ?? []).length === 0 ? ["Maintenance history is sparse"] : []),
    ].slice(0, 5),
    ambiguities: baseline.confidence_score < config.confidenceThreshold
      ? [`Baseline confidence is below ${config.confidenceThreshold}`]
      : [],
    clarification_history: (context.input.clarificationHistory ?? []).slice(-3).map((item) => ({
      question: truncate(item.question, 140),
      answer: truncate(item.answer, 120),
    })),
    diagnostic_focus: [
      `Top baseline cause: ${baseline.possible_causes[0]?.cause ?? "unknown"}`,
      `Top symptom focus: ${evidence.primarySymptoms.join(", ") || "symptoms unavailable"}`,
      `Driver notes: ${truncate(context.input.driverNotes, 160) || "none"}`,
      `Operating conditions: ${truncate(context.input.operatingConditions, 120) || "none"}`,
    ],
  };
}

function isGenericDiagnosticText(text: string) {
  const normalized = normalizeText(text);
  if (!normalized) return true;

  const genericPatterns = [
    "symptoms align",
    "evidence supports",
    "issue persists",
    "in context",
    "this cause remains plausible",
    "monitor the vehicle",
    "inspect the system",
    "further inspection is needed",
    "secondary candidate",
    "top cause",
    "current issue",
  ];

  const hasCaseSpecificMarker =
    /[pcb]\d{4}/.test(normalized) ||
    /(coolant|thermostat|radiator|fan clutch|hose|brake|air leak|steering|bearing|hub|sensor|cab heat|temperature|pressure|voltage|alternator|belt|compressor|chamber|valve|wheel end|oil pressure)/.test(
      normalized
    );

  return !hasCaseSpecificMarker || genericPatterns.some((pattern) => normalized.includes(pattern));
}

function mergeSpecificBullets(primary: string[], fallback: string[], maxItems: number) {
  const merged = [
    ...primary.filter((item) => item.trim() && !isGenericDiagnosticText(item)),
    ...fallback.filter((item) => item.trim()),
    ...primary.filter((item) => item.trim() && isGenericDiagnosticText(item)),
  ];

  return uniqueStrings(merged).slice(0, maxItems);
}

function buildCauseSpecificEvidence(
  stage: BaselineStage,
  causeName: string,
  causeId: string | null
) {
  const baselineMatch = stage.ranked.find(
    (item) =>
      (causeId && item.cause.id === causeId) ||
      normalizeText(item.cause.cause) === normalizeText(causeName)
  );
  const causeDef = baselineMatch?.cause ?? getCauseDefinitionByName(causeName);
  const faultEvidence = stage.evidence.faultCodeInterpretations
    .filter((item) => causeDef?.faultCodes.includes(item.code))
    .map((item) => `${item.code} is treated as a ${item.role} code for ${causeName.toLowerCase()}`)
    .slice(0, 2);
  const symptomEvidence =
    stage.evidence.primarySymptoms.length > 0
      ? [`Primary symptoms ${stage.evidence.primarySymptoms.join(", ")} are consistent with ${causeName.toLowerCase()}`]
      : [];
  const historyEvidence =
    stage.evidence.repairHistoryRationale.length > 0
      ? [stage.evidence.repairHistoryRationale[0]]
      : stage.evidence.historyRationale.length > 0
        ? [stage.evidence.historyRationale[0]]
        : [];
  const partsEvidence = stage.evidence.recentPartsRationale.length > 0 ? [stage.evidence.recentPartsRationale[0]] : [];
  const recurrenceEvidence =
    stage.evidence.recurrenceRationale.length > 0 ? [stage.evidence.recurrenceRationale[0]] : [];
  const candidateEvidence =
    stage.candidateUniverse
      .find(
        (entry) =>
          (causeId && entry.cause_id === causeId) ||
          normalizeText(entry.cause_name) === normalizeText(causeName)
      )
      ?.reasons.slice(0, 2) ?? [];

  return uniqueStrings([
    ...(baselineMatch?.evidenceSummary ?? []),
    ...faultEvidence,
    ...symptomEvidence,
    ...historyEvidence,
    ...partsEvidence,
    ...recurrenceEvidence,
    ...candidateEvidence,
  ]).slice(0, 5);
}

function buildCauseSpecificRationale(
  stage: BaselineStage,
  causeName: string,
  causeId: string | null,
  probability: number
) {
  const baselineTop = stage.baseline.possible_causes[0]?.cause ?? "the baseline top cause";
  const baselineMatch = stage.ranked.find(
    (item) =>
      (causeId && item.cause.id === causeId) ||
      normalizeText(item.cause.cause) === normalizeText(causeName)
  );
  const comparison =
    normalizeText(causeName) === normalizeText(baselineTop)
      ? [`This cause stayed on top after the LLM rechecked the baseline ${roundProbability(probability)}% ranking`]
      : [`This cause outranked ${baselineTop} after the LLM reweighted the case evidence`];
  const baselineReasons =
    baselineMatch?.evidenceSummary.map((item) => `${item} for ${causeName.toLowerCase()}`).slice(0, 2) ?? [];
  const faultCodeReason =
    stage.evidence.faultCodeInterpretations.length > 0
      ? [
          `Fault-code context ${stage.evidence.faultCodeInterpretations
            .slice(0, 2)
            .map((item) => item.code)
            .join(", ")} was compared against the leading candidates`,
        ]
      : [];

  return uniqueStrings([...comparison, ...baselineReasons, ...faultCodeReason]).slice(0, 4);
}

function buildConfidenceFallbackRationale(
  stage: BaselineStage,
  finalRanking: z.infer<typeof rankedCauseSchema>[],
  confidenceScore: number
) {
  const topCause = finalRanking[0];
  const runnerUp = finalRanking[1];
  const topEvidence = topCause?.evidence_summary[0];

  return uniqueStrings([
    topEvidence
      ? `${topCause?.cause_name ?? "The top cause"} leads because ${topEvidence.charAt(0).toLowerCase()}${topEvidence.slice(1)}`
      : "",
    runnerUp ? `${runnerUp.cause_name} remains the main competing cause` : "",
    stage.evidence.faultCodeInterpretations[0]
      ? `${stage.evidence.faultCodeInterpretations[0].code} contributes a ${stage.evidence.faultCodeInterpretations[0].role} signal in the current vehicle context`
      : stage.evidence.symptomRationale[0] ?? "",
    `Overall confidence settled at ${confidenceScore}% after comparing symptom, code, and history evidence`,
  ]).slice(0, 4);
}

function synthesizeRecommendedFix(
  topCauseName: string,
  recommendedTests: string[],
  possibleReplacementParts: string[],
  confirmBeforeReplacement: boolean,
  fallbackFix: string
) {
  const testSegment = recommendedTests.slice(0, 2).join(" and ");
  const partSegment = possibleReplacementParts.slice(0, 3).join(", ");

  if (confirmBeforeReplacement && testSegment && partSegment) {
    return `Confirm ${topCauseName.toLowerCase()} with ${testSegment.toLowerCase()} before replacing ${partSegment}.`;
  }

  if (partSegment) {
    return `Repair ${topCauseName.toLowerCase()} by addressing ${partSegment}${testSegment ? ` after ${testSegment.toLowerCase()}` : ""}.`;
  }

  if (testSegment) {
    return `Verify ${topCauseName.toLowerCase()} with ${testSegment.toLowerCase()} before finalizing the repair path.`;
  }

  return fallbackFix;
}

function synthesizeDriverActionReason(
  providedReason: string,
  topCauseName: string,
  topEvidence: string | undefined,
  safetyOverrideReason: string | null
) {
  if (safetyOverrideReason) {
    return topEvidence ? `${safetyOverrideReason} Leading evidence: ${topEvidence}.` : safetyOverrideReason;
  }

  if (!isGenericDiagnosticText(providedReason)) {
    return providedReason;
  }

  if (topEvidence) {
    return `${topCauseName} is leading because ${topEvidence.charAt(0).toLowerCase()}${topEvidence.slice(1)}.`;
  }

  return providedReason;
}

function synthesizeRiskSummary(providedSummary: string, topCauseName: string, topEvidence: string | undefined) {
  if (!isGenericDiagnosticText(providedSummary)) {
    return providedSummary;
  }

  if (topEvidence) {
    return `${topCauseName} remains the main operational risk because ${topEvidence.charAt(0).toLowerCase()}${topEvidence.slice(1)}.`;
  }

  return providedSummary;
}

function toRankedCause(
  item: BaselineRankedCause,
  candidateUniverse: z.infer<typeof candidateUniverseSchema>[],
  evidence: EvidenceStage
) {
  const candidateReasons =
    candidateUniverse.find((candidate) => candidate.cause_id === item.cause.id)?.reasons ?? [];
  const faultSupport = evidence.faultCodeInterpretations.some((code) =>
    item.cause.faultCodes.includes(code.code)
  )
    ? Math.min(100, evidence.faultCodeScore)
    : Math.round(evidence.faultCodeScore * 0.35);
  return rankedCauseSchema.parse({
    cause_id: item.cause.id,
    cause_name: item.cause.cause,
    is_new_cause: false,
    probability: roundProbability(item.probability),
    evidence_summary: item.evidenceSummary,
    ranking_rationale: item.evidenceSummary.slice(0, 4),
    symptom_support_score: Math.min(100, evidence.symptomScore),
    fault_code_support_score: faultSupport,
    repair_history_support_score: Math.min(100, evidence.repairHistoryScore),
    maintenance_history_support_score: Math.min(100, evidence.maintenanceHistoryScore),
    recent_parts_support_score: Math.min(100, evidence.recentPartsReplacedScore),
    recurring_failure_support_score: Math.min(100, evidence.recurringFailureScore),
    cause_library_fit_score: roundProbability(item.probability),
    novel_cause_support_score: null,
    candidate_source_reasons: candidateReasons,
  });
}

function normalizeTopRankingProbabilities(ranking: z.infer<typeof rankedCauseSchema>[]) {
  const normalized = normalizeProbabilities(ranking.map((item) => item.probability));
  return ranking.map((item, index) => ({
    ...item,
    probability: normalized[index] ?? item.probability,
  }));
}

function enrichLlmRanking(
  stage: BaselineStage,
  ranking: Array<{
    cause_id: string | null;
    cause_name: string;
    is_new_cause: boolean;
    probability: number;
    evidence_summary: string[];
    ranking_rationale: string[];
    symptom_support_score: number;
    fault_code_support_score: number;
    repair_history_support_score: number;
    maintenance_history_support_score: number;
    recent_parts_support_score: number;
    recurring_failure_support_score: number;
    cause_library_fit_score: number;
    novel_cause_support_score: number | null;
  }>
) {
  return normalizeTopRankingProbabilities(
    ranking.map((item) => {
      const candidate = stage.candidateUniverse.find(
        (entry) =>
          (item.cause_id && entry.cause_id === item.cause_id) ||
          normalizeText(entry.cause_name) === normalizeText(item.cause_name)
      );
      const specificEvidence = buildCauseSpecificEvidence(stage, item.cause_name, item.cause_id);
      const specificRationale = buildCauseSpecificRationale(
        stage,
        item.cause_name,
        item.cause_id,
        item.probability
      );
      return rankedCauseSchema.parse({
        ...item,
        evidence_summary: mergeSpecificBullets(item.evidence_summary, specificEvidence, 4),
        ranking_rationale: mergeSpecificBullets(item.ranking_rationale, specificRationale, 4),
        candidate_source_reasons: candidate?.reasons ?? (item.is_new_cause ? ["Introduced by the LLM review layer"] : []),
      });
    })
  );
}

function applyCriticalEvidenceRankingOverride(
  stage: BaselineStage,
  ranking: z.infer<typeof rankedCauseSchema>[]
) {
  if (!hasOilCoolantCrossContaminationSignal(stage.context)) {
    return { ranking, applied: false, reason: null as string | null };
  }

  const crossContaminationCause = CAUSE_LIBRARY.find((cause) => cause.id === "oil_coolant_cross_contamination");
  const baselineMatch = stage.ranked.find((item) => item.cause.id === "oil_coolant_cross_contamination");
  if (!crossContaminationCause || !baselineMatch) {
    return { ranking, applied: false, reason: null as string | null };
  }

  const existing = ranking.find((item) => item.cause_id === crossContaminationCause.id);
  const promoted = rankedCauseSchema.parse({
    ...(existing ?? toRankedCause(baselineMatch, stage.candidateUniverse, stage.evidence)),
    cause_id: crossContaminationCause.id,
    cause_name: crossContaminationCause.cause,
    is_new_cause: false,
    probability: Math.max(existing?.probability ?? 0, 82),
    evidence_summary: uniqueStrings([
      "Oil/coolant cross-contamination was explicitly reported",
      "This pattern points to an internal leak path rather than a simple external coolant leak",
      ...(existing?.evidence_summary ?? baselineMatch.evidenceSummary),
    ]).slice(0, 5),
    ranking_rationale: uniqueStrings([
      "Oil in coolant or coolant in oil is a high-specificity internal engine/cooling-system failure signal",
      "Generic thermostat, fan, or external coolant-leak causes should not outrank confirmed fluid cross-contamination",
      ...(existing?.ranking_rationale ?? baselineMatch.evidenceSummary),
    ]).slice(0, 5),
    symptom_support_score: Math.max(existing?.symptom_support_score ?? 0, 96),
    cause_library_fit_score: Math.max(existing?.cause_library_fit_score ?? 0, 95),
  });

  const remaining = ranking
    .filter((item) => item.cause_id !== crossContaminationCause.id)
    .map((item) => ({
      ...item,
      probability: Math.min(item.probability, 18),
      ranking_rationale: uniqueStrings([
        ...item.ranking_rationale,
        "Demoted because explicit oil/coolant cross-contamination is more specific than this competing cause",
      ]).slice(0, 5),
    }));

  return {
    ranking: normalizeTopRankingProbabilities([promoted, ...remaining]).slice(0, Math.max(4, ranking.length)),
    applied: true,
    reason: "Deterministic critical-evidence correction promoted internal oil/coolant cross-contamination.",
  };
}

function buildRankingDelta(
  baseline: z.infer<typeof ruleEngineBaselineSchema>,
  finalRanking: z.infer<typeof rankedCauseSchema>[]
) {
  const baselineNames = baseline.possible_causes.map((item) => item.cause);
  const finalNames = finalRanking.map((item) => item.cause_name);
  return {
    top_cause_changed: (baselineNames[0] ?? null) !== (finalNames[0] ?? null),
    baseline_top_cause: baselineNames[0] ?? null,
    final_top_cause: finalNames[0] ?? null,
    added_causes: finalNames.filter((cause) => !baselineNames.includes(cause)),
    removed_causes: baselineNames.filter((cause) => !finalNames.includes(cause)),
  };
}

function buildLlmAdjustments(
  baseline: z.infer<typeof ruleEngineBaselineSchema>,
  finalRanking: z.infer<typeof rankedCauseSchema>[],
  llmStatus: z.infer<typeof llmStatusSchema>,
  fallbackReason: string | null
) {
  if (llmStatus !== "ok") {
    return [fallbackReason ?? "LLM review unavailable; baseline retained"];
  }

  const baselineTop = baseline.possible_causes[0]?.cause ?? "baseline cause";
  const finalTop = finalRanking[0]?.cause_name ?? "final cause";
  if (baselineTop === finalTop) {
    return ["LLM validated the baseline top cause while refining evidence weighting"];
  }

  return [`LLM reshaped the final ranking from ${baselineTop} to ${finalTop}`];
}

function detectSafetyOverride(args: {
  systemsAffected: string[];
  normalizedSymptoms: string[];
  faultCodes: string[];
  topCause: string;
  proposedDriverAction: z.infer<typeof driverActionSchema>;
}) {
  const complaintText = `${args.normalizedSymptoms.join(" ")} ${args.topCause}`.toLowerCase();
  if (/(oil.*coolant|coolant.*oil|milky oil|milky coolant|chocolate milk|cross-contamination|cross contamination|contaminated coolant)/.test(complaintText)) {
    return {
      applied: true,
      driverAction: "do_not_operate_until_repaired" as const,
      reason: "Oil/coolant cross-contamination can rapidly damage bearings, cooling passages, and engine internals; do not operate until the leak path is isolated and repaired.",
    };
  }

  if (/(parking brake|brake|low air|air leak|roll|creep)/.test(complaintText) || args.systemsAffected.includes("brakes")) {
    return {
      applied: true,
      driverAction: "do_not_operate_until_repaired" as const,
      reason: "Brake-system or air-loss risk requires a hard safety hold before continued operation.",
    };
  }

  if (/(steering|wander|free play)/.test(complaintText) || args.systemsAffected.includes("steering")) {
    return {
      applied: true,
      driverAction: "do_not_operate_until_repaired" as const,
      reason: "Steering-control risk requires the vehicle to remain out of service until inspected.",
    };
  }

  if (/(overheat|coolant|fire|smoke)/.test(complaintText) || args.faultCodes.includes("P0128")) {
    return {
      applied: true,
      driverAction: "stop_and_inspect_on_site" as const,
      reason: "Overheating or fire-risk indicators require an immediate on-site safety inspection.",
    };
  }

  if (/(hub|bearing|wheel end)/.test(complaintText)) {
    return {
      applied: true,
      driverAction: "stop_and_tow" as const,
      reason: "Wheel-end failure risk requires towing rather than continued operation.",
    };
  }

  return {
    applied: false,
    driverAction: args.proposedDriverAction,
    reason: null,
  };
}

function buildFallbackQuestion(stage: BaselineStage, ranking: z.infer<typeof rankedCauseSchema>[]) {
  const mappedRanking = ranking
    .map((item) => ({
      cause: getCauseDefinitionByName(item.cause_name),
      probability: item.probability / 100,
    }))
    .filter((item): item is { cause: CauseDefinition; probability: number } => Boolean(item.cause));
  return mappedRanking.length > 0
    ? selectClarifyingQuestion(stage.context, mappedRanking, stage.context.input.clarificationHistory)
    : stage.baseline.clarifying_question;
}

function synthesizeClarifyingQuestion(stage: BaselineStage, ranking: z.infer<typeof rankedCauseSchema>[]) {
  const fallbackQuestion = buildFallbackQuestion(stage, ranking);
  if (fallbackQuestion.trim()) {
    return fallbackQuestion;
  }

  const topCause = ranking[0]?.cause_name ?? stage.baseline.possible_causes[0]?.cause ?? "the leading cause";
  const runnerUp = ranking[1]?.cause_name ?? stage.baseline.possible_causes[1]?.cause ?? "the competing cause";
  const primarySymptom =
    stage.evidence.primarySymptoms[0] ?? stage.context.input.symptoms[0] ?? "this issue";
  const topFaultCode = stage.context.normalizedFaultCodes[0];

  if (topFaultCode) {
    return `To separate ${topCause} from ${runnerUp} for ${primarySymptom.toLowerCase()}, when ${topFaultCode} appears does the issue start mainly at idle, under load, or all the time?`;
  }

  return `To separate ${topCause} from ${runnerUp} for ${primarySymptom.toLowerCase()}, does the symptom happen mainly at idle, under load, or all the time?`;
}

function buildGuaranteedClarifyingQuestion(
  stage: BaselineStage,
  ranking: z.infer<typeof rankedCauseSchema>[]
) {
  const synthesized = chooseFreshClarifyingQuestion(stage, ranking, null);
  if (synthesized) return synthesized;

  const primarySymptom =
    stage.evidence.primarySymptoms[0] ?? stage.context.input.symptoms[0] ?? "the reported issue";
  return `What operating condition makes ${primarySymptom.toLowerCase()} most repeatable right now: idle, load, braking, startup, or steady cruising?`;
}

function compactHistoryEntries(entries: Array<{ summary: string; status?: string; outcome?: string; occurredAt?: unknown }>) {
  const truncate = (value: string | null | undefined, maxLength: number) => {
    const normalized = (value ?? "").trim();
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, maxLength - 1)}â€¦`;
  };

  return entries.slice(0, 3).map((entry) => ({
    summary: truncate(entry.summary, 120),
    status: entry.status ?? null,
    outcome: truncate(entry.outcome, 100) || null,
    occurredAt: entry.occurredAt ?? null,
  }));
}

function buildIntakeInterpretationPackage(rawInput: DiagnosticInputRequest) {
  const input = DiagnosticInputSchema.parse(rawInput);
  return {
    vehicle_id: input.vehicleId,
    fleet_id: input.fleetId ?? null,
    symptoms: (input.symptoms ?? []).slice(0, 5),
    fault_codes: (input.faultCodes ?? []).slice(0, 8),
    driver_notes: input.driverNotes ? input.driverNotes.slice(0, 220) : null,
    operating_conditions: input.operatingConditions ? input.operatingConditions.slice(0, 160) : null,
    vehicle_context: {
      vin: input.vehicle?.vin ?? null,
      make: input.vehicle?.make ?? null,
      model: input.vehicle?.model ?? null,
      year: input.vehicle?.year ?? null,
      engine: input.vehicle?.engine ?? null,
      mileage: input.vehicle?.mileage ?? null,
      engine_hours: input.vehicle?.engineHours ?? null,
      status: input.vehicle?.status ?? null,
      configuration: input.vehicle?.configuration
        ? {
            transmission: input.vehicle.configuration.transmission ?? null,
            drivetrain: input.vehicle.configuration.drivetrain ?? null,
            fuelType: input.vehicle.configuration.fuelType ?? null,
          }
        : null,
      trailer_configuration: input.vehicle?.trailerConfiguration ?? null,
      brake_configuration: input.vehicle?.brakeConfiguration ?? null,
      emissions_configuration: input.vehicle?.emissionsConfiguration ?? null,
    },
    repair_history: compactHistoryEntries(
      (input.issueHistory.repairHistory ?? []).length > 0
        ? (input.issueHistory.repairHistory ?? [])
        : (input.issueHistory.recentRepairs ?? [])
    ),
    maintenance_history: compactHistoryEntries(input.issueHistory.maintenanceHistory ?? []),
    prior_diagnostics: compactHistoryEntries(input.issueHistory.priorDiagnostics ?? []),
    prior_defects: compactHistoryEntries(input.issueHistory.priorDefects ?? []),
    recent_inspections: compactHistoryEntries(input.issueHistory.recentInspections ?? []),
    recent_parts_replaced: (input.issueHistory.recentPartsReplaced ?? []).slice(0, 3),
    clarification_history: (input.clarificationHistory ?? []).slice(-3).map((item) => ({
      question: (item.question ?? "").slice(0, 140),
      answer: (item.answer ?? "").slice(0, 120),
    })),
  };
}

function mapSimpleCategoryToCauseName(category: string) {
  const mapping: Record<string, string> = {
    critical_engine_internal: "Internal engine oil/coolant cross-contamination",
    engine_performance: "Engine performance fault",
    oil_lubrication_system: "Oil lubrication system fault",
    cooling_system: "Cooling system fault",
    aftertreatment_dpf_def_scr: "Aftertreatment / DPF / DEF / SCR fault",
    electrical_battery_alternator: "Electrical battery or alternator fault",
    starting_charging: "Starting or charging fault",
    air_brake_system: "Air brake system fault",
    fuel_system: "Fuel system fault",
    transmission_driveline: "Transmission or driveline fault",
    hydraulics_pto: "Hydraulics or PTO fault",
    suspension_steering: "Suspension or steering fault",
    trailer_lighting: "Trailer lighting fault",
    abs_wheel_end: "ABS or wheel-end fault",
    tires_wheels: "Tires or wheels fault",
    unknown_triage: "Unknown triage",
  };

  return mapping[category] ?? "Unknown triage";
}

function buildSimpleTadisFallbackRanking(
  baselineStage: BaselineStage,
  topLikelyCause: string
) {
  const matchedCause = getCauseDefinitionByName(topLikelyCause);
  const matchedRanking = baselineStage.ranked.find((item) =>
    item.cause.id === matchedCause?.id || normalizeText(item.cause.cause) === normalizeText(topLikelyCause)
  );

  const topEntry = matchedRanking
    ? toRankedCause(matchedRanking, baselineStage.candidateUniverse, baselineStage.evidence)
    : toRankedCause(
        baselineStage.ranked[0] ?? {
          cause: matchedCause ?? CAUSE_LIBRARY[0],
          probability: 100,
          score: 1,
          evidenceMatches: 1,
          evidenceSummary: [`Simple mode classified the issue as ${topLikelyCause}`],
        },
        baselineStage.candidateUniverse,
        baselineStage.evidence
      );

  const rest = baselineStage.ranked
    .filter((item) => item.cause.cause !== topEntry.cause_name)
    .slice(0, 3)
    .map((item) => toRankedCause(item, baselineStage.candidateUniverse, baselineStage.evidence));

  return normalizeTopRankingProbabilities([topEntry, ...rest].slice(0, 4));
}

function buildSimpleTadisQuestionOutput(input: DiagnosticInputRequest, baselineStage: BaselineStage, details: {
  confidenceScore: number;
  clarifyingQuestion: string;
  fallbackUsed: boolean;
  fallbackReason: string | null;
  llmStatus: TadisOutput["llm_status"];
  topLikelyCause: string;
  driverAction: z.infer<typeof driverActionSchema>;
  riskLevel: z.infer<typeof riskLevelSchema>;
  stageLabel: "classifier" | "diagnosis" | "fallback";
  finalizedAfterClarificationLimit?: boolean;
}) {
  const finalRanking = buildSimpleTadisFallbackRanking(baselineStage, details.topLikelyCause);
  const rankingDelta = buildRankingDelta(baselineStage.baseline, finalRanking);
  const confidenceDelta = details.confidenceScore - baselineStage.baseline.confidence_score;
  const topCause = finalRanking[0];
  const topCauseDef = topCause ? getCauseDefinitionByName(topCause.cause_name) : null;
  const fallbackGuidance = getBaselineGuidance(
    topCauseDef ?? baselineStage.ranked[0]?.cause ?? null,
    topCause?.cause_name ?? baselineStage.baseline.possible_causes[0]?.cause ?? "Unknown cause"
  );
  const recommendedTests = fallbackGuidance.recommendedTests ?? [];
  const likelyReplacementParts = fallbackGuidance.likelyReplacementParts ?? [];
  const inspectionRelatedParts = fallbackGuidance.inspectionRelatedParts ?? [];
  const adjacentPartsToCheck = fallbackGuidance.adjacentPartsToCheck ?? [];
  const laborTimeBasis = fallbackGuidance.laborTimeBasis ?? [];
  const systemsAffected = resolveFinalSystemsAffected(topCauseDef, baselineStage.baseline.systems_affected);
  const complianceImpact = getComplianceImpact(details.riskLevel);
  const maintenanceRecommendations = buildMaintenanceRecommendations(
    baselineStage.ranked.slice(0, 3).map((item) => ({ cause: item.cause, probability: item.probability / 100 })),
    details.riskLevel,
    complianceImpact
  );
  const similarConfirmedCasesUsed = buildSimilarConfirmedCaseEvidence(baselineStage.context);
  const reason = details.finalizedAfterClarificationLimit
    ? `Finalized after ${MAX_CLARIFICATION_ROUNDS} clarification rounds using the current issue, driver answers, and simple AI classification because the diagnosis provider was unavailable.`
    : details.fallbackUsed
    ? `Fallback to rule-engine baseline because ${details.fallbackReason ?? "AI output was not usable"}`
    : details.confidenceScore >= SIMPLE_TADIS_CONFIDENCE_THRESHOLD
      ? "Simple TADIS mode used a minimal classifier and diagnosis packet."
      : "Simple TADIS mode asked a clarifying question before finalizing diagnosis.";
  const freshClarifyingQuestion = chooseFreshClarifyingQuestion(
    baselineStage,
    finalRanking,
    details.clarifyingQuestion
  );
  const shouldAskQuestion =
    details.confidenceScore < SIMPLE_TADIS_CONFIDENCE_THRESHOLD &&
    baselineStage.context.input.clarificationHistory.length < MAX_CLARIFICATION_ROUNDS &&
    freshClarifyingQuestion.length > 0;

  return TadisOutputSchema.parse({
    vehicle_id: String(baselineStage.context.input.vehicleId),
    systems_affected: systemsAffected.length > 0 ? systemsAffected : baselineStage.baseline.systems_affected,
    rule_engine_baseline: baselineStage.baseline,
    internal_engine_baseline: baselineStage.baseline,
    final_llm_ranking: finalRanking,
    llm_final_ranking: finalRanking,
    ranked_likely_causes: finalRanking,
    possible_causes: normalizeTopRankingProbabilities(finalRanking).map((item) => ({
      cause: item.cause_name,
      probability: item.probability,
    })),
    ranking_delta: rankingDelta,
    confidence_delta: confidenceDelta,
    llm_adjustments: [
      "Simple TADIS mode used a minimal classifier and diagnosis packet",
      "History, repair records, maintenance records, and similar cases were withheld from the AI",
      reason,
    ],
    evidence_summary: uniqueStrings([
      ...(topCause?.evidence_summary ?? []),
      ...(details.fallbackUsed ? [reason] : []),
      baselineStage.context.llmIntakeInterpretation ? "Classifier-normalized symptoms were used before scoring" : "",
    ]).slice(0, 6),
    normalized_symptoms: baselineStage.evidence.normalizedSymptoms,
    primary_symptoms: baselineStage.evidence.primarySymptoms,
    secondary_symptoms: baselineStage.evidence.secondarySymptoms,
    symptom_to_system_links: baselineStage.evidence.symptomToSystemLinks,
    symptom_score: baselineStage.evidence.symptomScore,
    symptom_signal_strength: baselineStage.evidence.symptomSignalStrength,
    symptom_rationale: baselineStage.evidence.symptomRationale,
    fault_code_score: baselineStage.evidence.faultCodeScore,
    fault_code_signal_strength: baselineStage.evidence.faultCodeSignalStrength,
    primary_vs_secondary_code_assessment: baselineStage.evidence.primaryVsSecondaryCodeAssessment,
    contextual_code_relevance: baselineStage.evidence.contextualCodeRelevance,
    code_to_cause_links: baselineStage.evidence.codeToCauseLinks,
    fault_code_interpretations: baselineStage.evidence.faultCodeInterpretations,
    fault_code_rationale: baselineStage.evidence.faultCodeRationale,
    repair_history_score: baselineStage.evidence.repairHistoryScore,
    maintenance_history_score: baselineStage.evidence.maintenanceHistoryScore,
    history_score: baselineStage.evidence.historyScore,
    repair_history_rationale: baselineStage.evidence.repairHistoryRationale,
    maintenance_history_rationale: baselineStage.evidence.maintenanceHistoryRationale,
    history_rationale: baselineStage.evidence.historyRationale,
    recent_parts_replaced: baselineStage.evidence.recentPartsReplaced,
    recent_parts_replaced_score: baselineStage.evidence.recentPartsReplacedScore,
    replacement_relevance_to_current_issue: baselineStage.evidence.replacementRelevanceToCurrentIssue,
    replacement_effect_direction: baselineStage.evidence.replacementEffectDirection,
    replacement_decay_weight: baselineStage.evidence.replacementDecayWeight,
    recent_parts_rationale: baselineStage.evidence.recentPartsRationale,
    recurring_failure_score: baselineStage.evidence.recurringFailureScore,
    recurring_pattern_type: baselineStage.evidence.recurringPatternType,
    repeat_code_frequency: baselineStage.evidence.repeatCodeFrequency,
    repeat_component_frequency: baselineStage.evidence.repeatComponentFrequency,
    repeat_repair_without_resolution: baselineStage.evidence.repeatRepairWithoutResolution,
    suspected_unresolved_root_cause: baselineStage.evidence.suspectedUnresolvedRootCause,
    recurrence_rationale: baselineStage.evidence.recurrenceRationale,
    cause_library_fit_score: Math.round(average(finalRanking.slice(0, 3).map((item) => item.cause_library_fit_score))),
    matched_library_causes: baselineStage.baseline.matched_library_causes,
    partial_library_matches: baselineStage.baseline.partial_library_matches,
    new_candidate_causes: [],
    new_candidate_causes_review_required: false,
    cause_library_rationale: [
      "Simple TADIS mode kept the candidate universe small and predictable",
      `Top category: ${details.topLikelyCause}`,
    ],
    overall_confidence_score: details.confidenceScore,
    confidence_score: details.confidenceScore,
      confidence_rationale: details.finalizedAfterClarificationLimit
        ? [
            reason,
            `Confidence is ${details.confidenceScore}% because five clarification answers were considered, but the AI diagnosis provider did not return a usable final JSON result.`,
          ]
        : details.fallbackUsed
        ? [
            reason,
            `Confidence was reduced to ${details.confidenceScore}% because the AI review layer did not return usable structured output`,
          ]
        : [
            `Simple ${details.stageLabel} confidence: ${details.confidenceScore}%`,
            "No repair history or fleet history was sent to the AI in SIMPLE_TADIS_MODE.",
          ],
    next_action: shouldAskQuestion ? "ask_question" : "proceed",
    clarifying_question: shouldAskQuestion ? freshClarifyingQuestion : "",
    question_rationale:
      shouldAskQuestion
        ? "Confidence is below the simple-mode threshold, so this fresh clarifying question is required."
        : null,
    missing_evidence: shouldAskQuestion ? [freshClarifyingQuestion] : [],
    ambiguity_drivers: details.confidenceScore >= SIMPLE_TADIS_CONFIDENCE_THRESHOLD ? [] : ["Simple-mode confidence remained below threshold"],
    similar_confirmed_cases_used: similarConfirmedCasesUsed,
    recommended_tests: recommendedTests,
    recommended_fix: synthesizeRecommendedFix(
      topCause?.cause_name ?? details.topLikelyCause,
      recommendedTests,
      likelyReplacementParts,
      true,
      fallbackGuidance.recommendedFix ?? `Verify ${details.topLikelyCause} before replacing parts.`
    ),
    risk_level: details.riskLevel,
    maintenance_recommendations: maintenanceRecommendations,
    compliance_impact: complianceImpact,
    top_most_likely_cause: details.topLikelyCause,
    possible_replacement_parts: likelyReplacementParts,
    likely_replacement_parts: likelyReplacementParts,
    inspection_related_parts: inspectionRelatedParts,
    adjacent_parts_to_check: adjacentPartsToCheck,
    confirm_before_replacement: true,
    diagnostic_verification_labor_hours: fallbackGuidance.diagnosticVerificationLaborHours,
    repair_labor_hours: fallbackGuidance.repairLaborHours,
    total_estimated_labor_hours: fallbackGuidance.totalEstimatedLaborHours,
    labor_time_confidence: fallbackGuidance.laborTimeConfidence,
    labor_time_basis: laborTimeBasis,
    driver_action: details.driverAction,
    driver_action_reason: details.finalizedAfterClarificationLimit
      ? `After the clarification limit, TruckFixr is using the strongest current-issue signal: ${details.topLikelyCause}.`
      : details.fallbackUsed
      ? `Fallback ${details.riskLevel} risk assessment recommends ${mapRiskToDriverAction(details.riskLevel).toLowerCase()}.`
      : `Simple diagnosis points to ${details.topLikelyCause}.`,
    risk_summary: `Top risk is ${details.riskLevel} based on ${details.topLikelyCause}.`,
    safety_note:
      details.riskLevel === "critical"
        ? "Stop the vehicle and arrange shop or tow support before further operation."
        : "Use simple-mode safety escalation if symptoms worsen during inspection.",
    compliance_note:
      complianceImpact === "critical"
        ? "Potential out-of-service exposure exists until repair verification is complete."
        : "No immediate compliance-critical finding is confirmed yet.",
    monitoring_instructions:
      details.riskLevel === "critical"
        ? ["Do not continue driving or idling the engine", "Capture photos of the issue for the shop"]
        : ["Monitor symptoms and escalate if they worsen"],
    distance_or_time_limit:
      details.riskLevel === "critical" ? "Do not operate until repaired" : "Short distance only if needed",
    llm_status: details.llmStatus,
    llm_provider: "openrouter",
    llm_model: "simple_tadis_mode",
    fallback_used: details.fallbackUsed,
    fallback_reason: details.fallbackReason,
    safety_override_applied: details.riskLevel === "critical",
    safety_override_reason:
      details.riskLevel === "critical"
        ? "Simple mode escalated to a critical safety response."
        : null,
    review_queue_record_ids: [],
  });
}

async function analyzeDiagnosticSimpleMode(input: DiagnosticInputRequest) {
  const config = getDiagnosticRuntimeConfig();
  const normalizedInput = DiagnosticInputSchema.parse(input);
  const diagnosticSessionId = randomUUID();
  const classifierInput = buildSimpleCategoryInput(normalizedInput);
  const classifierPrompt = buildSimpleClassificationPrompt(classifierInput);
  const classifierEstimatedChars = estimatePromptCharacterCount([
    { role: "user", content: classifierPrompt },
  ]);
  const classifierLogId = await insertDiagnosticAiRequestLog({
    companyId: normalizedInput.fleetId ?? 0,
    assetId: String(normalizedInput.vehicleId),
    diagnosticSessionId,
    callType: "classifier",
    provider: "openrouter",
    model: config.openRouterModel,
    estimatedInputCharacters: classifierEstimatedChars,
    estimatedInputTokens: estimatePromptTokenCount(classifierEstimatedChars),
    messageCount: 1,
    maxTokens: SIMPLE_TADIS_CLASSIFIER_MAX_TOKENS,
    temperature: 0.1,
    responseFormatEnabled: false,
    simpleTadisMode: true,
    truncationApplied: classifierEstimatedChars > SIMPLE_TADIS_CLASSIFIER_MAX_CHARS,
    status: "failed",
    fallbackUsed: false,
  });

  const classifierAttempt = await classifyDiagnosticIssueWithLlm({ intakePackage: classifierInput }, config);
  const classifierFallbackUsed = classifierAttempt.status !== "ok";
  const classifier = classifierAttempt.parsed ?? buildSimpleFallbackClassification(normalizedInput);
  const baselineStage = buildBaselineStage(normalizedInput, config, null);
  const simpleClassifierQuestion =
    classifier.classification_confidence >= SIMPLE_TADIS_CONFIDENCE_THRESHOLD
      ? null
      : classifier.clarifying_question ?? "What is the single symptom that is most repeatable right now?";

  if (classifierLogId) {
    await updateDiagnosticAiRequestLog(classifierLogId, {
        companyId: normalizedInput.fleetId ?? 0,
        assetId: String(normalizedInput.vehicleId),
        diagnosticSessionId,
      callType: "classifier",
      provider: classifierAttempt.provider,
      model: classifierAttempt.model,
      estimatedInputCharacters: classifierEstimatedChars,
      estimatedInputTokens: estimatePromptTokenCount(classifierEstimatedChars),
      messageCount: 1,
      maxTokens: SIMPLE_TADIS_CLASSIFIER_MAX_TOKENS,
      temperature: 0.1,
      responseFormatEnabled: false,
      simpleTadisMode: true,
      truncationApplied: classifierEstimatedChars > SIMPLE_TADIS_CLASSIFIER_MAX_CHARS,
      status:
        classifierAttempt.status === "ok"
          ? "success"
          : classifierFallbackUsed
            ? "fallback"
            : "failed",
      errorCode: classifierAttempt.status === "ok" ? null : classifierAttempt.status,
      errorMessage: classifierAttempt.fallbackReason,
      fallbackUsed: classifierFallbackUsed,
    });
  }

  if (classifier.classification_confidence < SIMPLE_TADIS_CONFIDENCE_THRESHOLD && !classifierFallbackUsed) {
      return buildSimpleTadisQuestionOutput(normalizedInput, baselineStage, {
      confidenceScore: classifier.classification_confidence,
      clarifyingQuestion: simpleClassifierQuestion ?? "What symptom is most repeatable right now?",
        fallbackUsed: false,
        fallbackReason: null,
        llmStatus: "ok",
        topLikelyCause: mapSimpleCategoryToCauseName(classifier.primary_category),
        driverAction:
        classifier.risk_level === "critical"
          ? "do_not_operate_until_repaired"
        : classifier.risk_level === "high"
              ? "stop_and_inspect_on_site"
              : "drive_to_shop",
        riskLevel: classifier.risk_level,
        stageLabel: "classifier",
      });
    }

  const diagnosisInput = buildSimpleDiagnosisInput(normalizedInput, classifier);
  const diagnosisPrompt = buildSimpleDiagnosisPromptMessage(diagnosisInput);
  const diagnosisEstimatedChars = estimatePromptCharacterCount([
    { role: "user", content: diagnosisPrompt },
  ]);
  const diagnosisLogId = await insertDiagnosticAiRequestLog({
    companyId: normalizedInput.fleetId ?? 0,
    assetId: String(normalizedInput.vehicleId),
    diagnosticSessionId,
    callType: "diagnosis",
    provider: "openrouter",
    model: config.openRouterModel,
    estimatedInputCharacters: diagnosisEstimatedChars,
    estimatedInputTokens: estimatePromptTokenCount(diagnosisEstimatedChars),
    messageCount: 1,
    maxTokens: SIMPLE_TADIS_DIAGNOSIS_MAX_TOKENS,
    temperature: 0.1,
    responseFormatEnabled: false,
    simpleTadisMode: true,
    truncationApplied: diagnosisEstimatedChars > SIMPLE_TADIS_DIAGNOSIS_MAX_CHARS,
    status: "failed",
    fallbackUsed: false,
  });
  const diagnosisAttempt = await diagnoseDiagnosticIssueWithLlm({ evidencePackage: diagnosisInput }, config);
  const diagnosisFallbackUsed = diagnosisAttempt.status !== "ok";
  const diagnosis = diagnosisAttempt.parsed;

  if (diagnosisLogId) {
    await updateDiagnosticAiRequestLog(diagnosisLogId, {
        companyId: normalizedInput.fleetId ?? 0,
        assetId: String(normalizedInput.vehicleId),
        diagnosticSessionId,
      callType: "diagnosis",
      provider: diagnosisAttempt.provider,
      model: diagnosisAttempt.model,
      estimatedInputCharacters: diagnosisEstimatedChars,
      estimatedInputTokens: estimatePromptTokenCount(diagnosisEstimatedChars),
      messageCount: 1,
      maxTokens: SIMPLE_TADIS_DIAGNOSIS_MAX_TOKENS,
      temperature: 0.1,
      responseFormatEnabled: false,
      simpleTadisMode: true,
      truncationApplied: diagnosisEstimatedChars > SIMPLE_TADIS_DIAGNOSIS_MAX_CHARS,
      status: diagnosisAttempt.status === "ok" ? "success" : diagnosisFallbackUsed ? "fallback" : "failed",
      errorCode: diagnosisAttempt.status === "ok" ? null : diagnosisAttempt.status,
      errorMessage: diagnosisAttempt.fallbackReason,
      fallbackUsed: diagnosisFallbackUsed,
    });
  }

  if (diagnosisAttempt.status !== "ok" || !diagnosis) {
      const clarificationLimitReached =
        normalizedInput.clarificationHistory.length >= MAX_CLARIFICATION_ROUNDS;
      const finalizedConfidence = clarificationLimitReached
        ? Math.min(
            SIMPLE_TADIS_CONFIDENCE_THRESHOLD - 1,
            Math.max(65, classifier.classification_confidence, baselineStage.baseline.confidence_score)
          )
        : Math.min(
            SIMPLE_TADIS_CONFIDENCE_THRESHOLD - 1,
            Math.max(18, Math.min(70, baselineStage.baseline.confidence_score))
          );
      return buildSimpleTadisQuestionOutput(normalizedInput, baselineStage, {
      confidenceScore: finalizedConfidence,
      clarifyingQuestion:
        clarificationLimitReached
          ? ""
          : baselineStage.baseline.next_action === "ask_question"
          ? baselineStage.baseline.clarifying_question
          : "What symptom is most repeatable right now?",
        fallbackUsed: true,
        fallbackReason: diagnosisAttempt.fallbackReason ?? "Simple diagnosis AI failed",
        llmStatus: diagnosisAttempt.status,
        topLikelyCause:
          clarificationLimitReached
            ? mapSimpleCategoryToCauseName(classifier.primary_category)
            : baselineStage.baseline.possible_causes[0]?.cause ?? "Unknown triage",
        driverAction: mapRiskToDriverAction(
          clarificationLimitReached ? classifier.risk_level : baselineStage.baseline.risk_level
        ),
        riskLevel: clarificationLimitReached ? classifier.risk_level : baselineStage.baseline.risk_level,
        stageLabel: "fallback",
        finalizedAfterClarificationLimit: clarificationLimitReached,
      });
    }

  if (!diagnosis || diagnosis.confidence_score < SIMPLE_TADIS_CONFIDENCE_THRESHOLD) {
    const clarifyingQuestion =
      diagnosis?.clarifying_question ??
      "What symptom is most repeatable right now, and does it happen while moving, idling, or starting?";

      return buildSimpleTadisQuestionOutput(normalizedInput, baselineStage, {
      confidenceScore: diagnosis?.confidence_score ?? classifier.classification_confidence,
      clarifyingQuestion,
        fallbackUsed: diagnosisFallbackUsed,
        fallbackReason: diagnosisAttempt.fallbackReason,
        llmStatus: "ok",
        topLikelyCause: diagnosis?.top_likely_cause ?? mapSimpleCategoryToCauseName(classifier.primary_category),
        driverAction: diagnosis?.driver_action ?? mapRiskToDriverAction(classifier.risk_level),
        riskLevel: classifier.risk_level,
        stageLabel: "diagnosis",
      });
    }

    return buildSimpleTadisQuestionOutput(normalizedInput, baselineStage, {
    confidenceScore: diagnosis.confidence_score,
    clarifyingQuestion: diagnosis.confidence_score >= SIMPLE_TADIS_CONFIDENCE_THRESHOLD ? "" : diagnosis.clarifying_question ?? "",
      fallbackUsed: diagnosisFallbackUsed,
      fallbackReason: diagnosisAttempt.fallbackReason,
      llmStatus: diagnosisAttempt.status,
      topLikelyCause: diagnosis.top_likely_cause,
      driverAction: diagnosis.driver_action,
      riskLevel: classifier.risk_level,
      stageLabel: "diagnosis",
    });
  }

function buildSimpleTadisEmergencyFallback(input: DiagnosticInputRequest, error: unknown) {
  const config = getDiagnosticRuntimeConfig();
  const normalizedInput = DiagnosticInputSchema.parse(input);
  const baselineStage = buildBaselineStage(normalizedInput, config, null);
  const errorMessage = error instanceof Error ? error.message : String(error);
  const fallbackConfidence = Math.min(
    SIMPLE_TADIS_CONFIDENCE_THRESHOLD - 1,
    Math.max(18, Math.min(70, baselineStage.baseline.confidence_score))
  );
  const clarifyingQuestion =
    baselineStage.baseline.clarifying_question ||
    buildGuaranteedClarifyingQuestion(
      baselineStage,
      baselineStage.ranked
        .slice(0, 4)
        .map((item) => toRankedCause(item, baselineStage.candidateUniverse, baselineStage.evidence))
    );

  console.warn("[Simple TADIS] Emergency fallback used after simple pipeline error.", {
    vehicleId: String(normalizedInput.vehicleId),
    reason: errorMessage,
  });

  return buildSimpleTadisQuestionOutput(normalizedInput, baselineStage, {
    confidenceScore: fallbackConfidence,
    clarifyingQuestion,
    fallbackUsed: true,
    fallbackReason: `Simple TADIS pipeline error: ${errorMessage}`,
    llmStatus: "error",
    topLikelyCause: baselineStage.baseline.possible_causes[0]?.cause ?? "Unknown triage",
    driverAction: mapRiskToDriverAction(baselineStage.baseline.risk_level),
    riskLevel: baselineStage.baseline.risk_level,
    stageLabel: "fallback",
  });
}

async function analyzeDiagnosticDetailed(input: DiagnosticInputRequest) {
  const config = getDiagnosticRuntimeConfig();
  if (config.simpleTadisMode) {
    try {
      return await analyzeDiagnosticSimpleMode(input);
    } catch (error) {
      return buildSimpleTadisEmergencyFallback(input, error);
    }
  }
  const intakeInterpretation = await interpretDiagnosticIntakeWithLlm(
    { intakePackage: buildIntakeInterpretationPackage(input) },
    config
  );
  if (shouldUseSimpleTadisEmergencyFallback(intakeInterpretation.fallbackReason)) {
    return analyzeDiagnosticSimpleMode(input);
  }
  const baselineStage = buildBaselineStage(input, config, intakeInterpretation.parsed);
  const baselineRanking = baselineStage.ranked.slice(0, 4).map((item) =>
    toRankedCause(item, baselineStage.candidateUniverse, baselineStage.evidence)
  );
  const llmReview = await reviewDiagnosticWithLlm(
    { evidencePackage: buildEvidencePackage(baselineStage, config) },
    config
  );
  if (shouldUseSimpleTadisEmergencyFallback(llmReview.fallbackReason)) {
    return analyzeDiagnosticSimpleMode(input);
  }

  let finalRanking =
    llmReview.status === "ok"
      ? enrichLlmRanking(baselineStage, llmReview.parsed.top_ranked_causes)
      : normalizeTopRankingProbabilities(baselineRanking);
  const criticalEvidenceOverride = applyCriticalEvidenceRankingOverride(baselineStage, finalRanking);
  finalRanking = criticalEvidenceOverride.ranking;
  const topCause = finalRanking[0];
  const topCauseDef = topCause ? getCauseDefinitionByName(topCause.cause_name) : null;
  const fallbackGuidance = getBaselineGuidance(topCauseDef ?? baselineStage.ranked[0]?.cause ?? null, topCause?.cause_name ?? baselineStage.baseline.possible_causes[0]?.cause ?? "Unknown cause");
  const llmRepairGuidance =
    llmReview.status === "ok" && !criticalEvidenceOverride.applied
      ? llmReview.parsed.top_cause_repair_guidance
      : null;
  const systemsAffected = resolveFinalSystemsAffected(topCauseDef, baselineStage.baseline.systems_affected);
  const initialRiskLevel = determineRiskLevel(
    finalRanking.slice(0, 2).map((item) => ({
      causeName: item.cause_name,
      causeDef: getCauseDefinitionByName(item.cause_name) ?? null,
    }))
  );
  const proposedDriverAction =
    llmReview.status === "ok"
      ? llmReview.parsed.driver_action_recommendation.llm_driver_action
      : mapRiskToDriverAction(initialRiskLevel);
  const safetyOverride = detectSafetyOverride({
    systemsAffected,
    normalizedSymptoms: baselineStage.evidence.normalizedSymptoms,
    faultCodes: baselineStage.context.normalizedFaultCodes,
    topCause: topCause?.cause_name ?? "",
    proposedDriverAction,
  });
  const finalRiskLevel =
    safetyOverride.applied && scoreRisk(initialRiskLevel) < scoreRisk("high") ? "high" : initialRiskLevel;
  const complianceImpact = getComplianceImpact(finalRiskLevel);
  const fallbackConfidenceScore = Math.max(
    18,
    Math.min(baselineStage.baseline.confidence_score, config.confidenceThreshold - 5)
  );
  const confidenceScore =
    llmReview.status === "ok"
      ? criticalEvidenceOverride.applied
        ? Math.max(82, Math.round(llmReview.parsed.overall_confidence_score))
        : Math.round(llmReview.parsed.overall_confidence_score)
      : fallbackConfidenceScore;
  const shouldForceFallbackClarification =
    llmReview.status !== "ok" && confidenceScore < config.confidenceThreshold;
  const fallbackQuestion = shouldForceFallbackClarification
    ? buildGuaranteedClarifyingQuestion(baselineStage, finalRanking)
    : synthesizeClarifyingQuestion(baselineStage, finalRanking);
  const llmQuestion =
    llmReview.status === "ok" ? (llmReview.parsed.clarifying_question ?? "").trim() : "";
  const clarifyingQuestion = chooseFreshClarifyingQuestion(
    baselineStage,
    finalRanking,
    llmQuestion || fallbackQuestion
  );
  const nextAction =
    shouldForceFallbackClarification
      ? clarifyingQuestion
        ? "ask_question"
        : "proceed"
      : llmReview.status === "ok"
      ? confidenceScore >= config.confidenceThreshold
        ? "proceed"
        : llmReview.parsed.next_action === "ask_question" || Boolean(clarifyingQuestion)
        ? "ask_question"
        : "proceed"
      : confidenceScore < config.confidenceThreshold && Boolean(clarifyingQuestion)
        ? "ask_question"
        : baselineStage.baseline.next_action;
  const possibleCauses = normalizeTopRankingProbabilities(finalRanking.slice(0, 4)).map((item) => ({
    cause: item.cause_name,
    probability: item.probability,
  }));
  const maintenanceRecommendations = buildMaintenanceRecommendations(
    baselineStage.ranked.slice(0, 3).map((item) => ({ cause: item.cause, probability: item.probability / 100 })),
    finalRiskLevel,
    complianceImpact
  );
  const newCandidateCauses = finalRanking
    .filter((item) => item.is_new_cause)
    .map((item) => item.cause_name);
  const newCandidateCausesReviewRequired =
    newCandidateCauses.length > 0 &&
    (llmReview.status === "ok"
      ? llmReview.parsed.overall_confidence_score >= config.newCauseMinConfidence
      : false);
  const rankingDelta = buildRankingDelta(baselineStage.baseline, finalRanking);
  const confidenceDelta = confidenceScore - baselineStage.baseline.confidence_score;
  const llmAdjustments = [
    intakeInterpretation.status === "ok"
      ? "LLM interpreted raw symptoms, codes, notes, operating conditions, and history before rule-engine scoring"
      : `LLM intake interpretation unavailable before scoring: ${intakeInterpretation.fallbackReason}`,
    ...buildLlmAdjustments(
      baselineStage.baseline,
      finalRanking,
      llmReview.status,
      llmReview.fallbackReason
    ),
    ...(criticalEvidenceOverride.applied && criticalEvidenceOverride.reason
      ? [criticalEvidenceOverride.reason]
      : []),
  ];
  const confidenceRationale =
    llmReview.status === "ok"
      ? mergeSpecificBullets(
          [
            ...(criticalEvidenceOverride.applied
              ? ["Confidence was anchored by the explicit oil/coolant cross-contamination report."]
              : []),
            ...llmReview.parsed.confidence_rationale,
          ],
          buildConfidenceFallbackRationale(baselineStage, finalRanking, confidenceScore),
          4
        )
      : [
          `Fallback to rule-engine baseline because ${llmReview.fallbackReason ?? "the OpenRouter review was unavailable"}`,
          `Confidence was reduced to ${fallbackConfidenceScore}% because the AI review layer did not return usable structured output`,
        ];
  const combinedFallbackReasons = uniqueStrings([
    intakeInterpretation.fallbackReason ?? "",
    llmReview.fallbackReason ?? "",
  ]).filter(Boolean);
  const recommendedTests =
    llmRepairGuidance?.recommended_tests?.length
      ? llmRepairGuidance.recommended_tests
      : (fallbackGuidance.recommendedTests ?? []);
  const possibleReplacementParts =
    llmRepairGuidance?.likely_replacement_parts?.length
      ? llmRepairGuidance.likely_replacement_parts
      : (fallbackGuidance.likelyReplacementParts ?? []);
  const inspectionRelatedParts =
    llmRepairGuidance?.inspection_related_parts?.length
      ? llmRepairGuidance.inspection_related_parts
      : (fallbackGuidance.inspectionRelatedParts ?? []);
  const adjacentPartsToCheck =
    llmRepairGuidance?.adjacent_parts_to_check?.length
      ? llmRepairGuidance.adjacent_parts_to_check
      : (fallbackGuidance.adjacentPartsToCheck ?? []);
  const diagnosticVerificationLaborHours =
    llmRepairGuidance?.diagnostic_verification_labor_hours ?? fallbackGuidance.diagnosticVerificationLaborHours;
  const repairLaborHours = llmRepairGuidance?.repair_labor_hours ?? fallbackGuidance.repairLaborHours;
  const totalEstimatedLaborHours =
    llmRepairGuidance?.total_estimated_labor_hours ?? fallbackGuidance.totalEstimatedLaborHours;
  const laborTimeConfidence = llmRepairGuidance?.labor_time_confidence ?? fallbackGuidance.laborTimeConfidence;
  const laborTimeBasis = llmRepairGuidance?.labor_time_basis ?? fallbackGuidance.laborTimeBasis;
  const topEvidence = topCause?.evidence_summary[0];
  const driverActionReason =
    llmReview.status === "ok"
      ? synthesizeDriverActionReason(
          llmReview.parsed.driver_action_recommendation.driver_action_reason,
          topCause?.cause_name ?? baselineStage.baseline.possible_causes[0]?.cause ?? "the leading cause",
          topEvidence,
          safetyOverride.reason
        )
      : `Baseline ${finalRiskLevel} risk assessment recommends ${mapRiskToAction(finalRiskLevel).toLowerCase()}.`;
  const riskSummary =
    llmReview.status === "ok"
      ? synthesizeRiskSummary(
          llmReview.parsed.driver_action_recommendation.risk_summary,
          topCause?.cause_name ?? baselineStage.baseline.possible_causes[0]?.cause ?? "the leading cause",
          topEvidence
        )
      : `Top risk is ${finalRiskLevel} based on ${topCause?.cause_name ?? "the leading cause"}.`;
  const safetyNote =
    criticalEvidenceOverride.applied
      ? "Do not run the engine with suspected oil/coolant cross-contamination; contaminated oil can rapidly damage bearings and contaminated coolant can damage cooling-system components."
      : llmReview.status === "ok"
      ? llmReview.parsed.driver_action_recommendation.safety_note
      : "Use normal fleet safety escalation if symptoms worsen during inspection.";
  const complianceNote =
    llmReview.status === "ok"
      ? llmReview.parsed.driver_action_recommendation.compliance_note
      : complianceImpact === "critical"
        ? "Potential out-of-service exposure exists until repair verification is complete."
        : "No immediate compliance-critical finding is confirmed yet.";
  const monitoringInstructions =
    criticalEvidenceOverride.applied
      ? ["Do not continue driving or idling the engine", "Capture oil and coolant condition photos/samples for the shop", "Tow or service on-site after confirming contamination"]
      : llmReview.status === "ok"
      ? llmReview.parsed.driver_action_recommendation.monitoring_instructions
      : nextAction === "ask_question"
        ? ["Capture the clarifying symptom detail before finalizing the repair path."]
        : ["Monitor temperature, pressure, and warning lamp behavior during verification."];
  const distanceOrTimeLimit =
    criticalEvidenceOverride.applied
      ? "Do not operate until repaired and fluids are flushed"
      : llmReview.status === "ok"
      ? llmReview.parsed.driver_action_recommendation.distance_or_time_limit
      : null;
  const fallbackRecommendedFix = topCauseDef?.recommendedFix
    ? topCauseDef.recommendedFix
    : `Verify ${topCause?.cause_name ?? "the leading cause"} with the recommended tests before replacing parts.`;
  const recommendedFix = synthesizeRecommendedFix(
    topCause?.cause_name ?? baselineStage.baseline.possible_causes[0]?.cause ?? "the leading cause",
    recommendedTests,
    possibleReplacementParts,
    llmRepairGuidance?.confirm_before_replacement ?? true,
    fallbackRecommendedFix
  );
  const similarConfirmedCasesUsed = buildSimilarConfirmedCaseEvidence(baselineStage.context);
  const overallEvidenceSummary = uniqueStrings([
    ...(topCause?.evidence_summary ?? []),
    ...similarConfirmedCasesUsed.slice(0, 2).map((item) =>
      `Similar confirmed case ${item.id} supports ${item.cause_name} with signals ${item.matched_signals.join(", ") || "related repair evidence"}`
    ),
    baselineStage.context.llmIntakeInterpretation
      ? "LLM intake interpretation normalized the raw report before internal evidence scoring"
      : "",
  ]).slice(0, 6);

  const parsed = TadisOutputSchema.parse({
    vehicle_id: String(baselineStage.context.input.vehicleId),
    systems_affected: systemsAffected.length > 0 ? systemsAffected : baselineStage.baseline.systems_affected,
    rule_engine_baseline: baselineStage.baseline,
    internal_engine_baseline: baselineStage.baseline,
    final_llm_ranking: finalRanking,
    llm_final_ranking: finalRanking,
    ranked_likely_causes: finalRanking,
    possible_causes: possibleCauses,
    ranking_delta: rankingDelta,
    confidence_delta: confidenceDelta,
    llm_adjustments: llmAdjustments,
    evidence_summary: overallEvidenceSummary,
    normalized_symptoms: baselineStage.evidence.normalizedSymptoms,
    primary_symptoms: baselineStage.evidence.primarySymptoms,
    secondary_symptoms: baselineStage.evidence.secondarySymptoms,
    symptom_to_system_links: baselineStage.evidence.symptomToSystemLinks,
    symptom_score: baselineStage.evidence.symptomScore,
    symptom_signal_strength: baselineStage.evidence.symptomSignalStrength,
    symptom_rationale: baselineStage.evidence.symptomRationale,
    fault_code_score: baselineStage.evidence.faultCodeScore,
    fault_code_signal_strength: baselineStage.evidence.faultCodeSignalStrength,
    primary_vs_secondary_code_assessment: baselineStage.evidence.primaryVsSecondaryCodeAssessment,
    contextual_code_relevance: baselineStage.evidence.contextualCodeRelevance,
    code_to_cause_links: baselineStage.evidence.codeToCauseLinks,
    fault_code_interpretations: baselineStage.evidence.faultCodeInterpretations,
    fault_code_rationale: baselineStage.evidence.faultCodeRationale,
    repair_history_score: baselineStage.evidence.repairHistoryScore,
    maintenance_history_score: baselineStage.evidence.maintenanceHistoryScore,
    history_score: baselineStage.evidence.historyScore,
    repair_history_rationale: baselineStage.evidence.repairHistoryRationale,
    maintenance_history_rationale: baselineStage.evidence.maintenanceHistoryRationale,
    history_rationale: baselineStage.evidence.historyRationale,
    recent_parts_replaced: baselineStage.evidence.recentPartsReplaced,
    recent_parts_replaced_score: baselineStage.evidence.recentPartsReplacedScore,
    replacement_relevance_to_current_issue: baselineStage.evidence.replacementRelevanceToCurrentIssue,
    replacement_effect_direction: baselineStage.evidence.replacementEffectDirection,
    replacement_decay_weight: baselineStage.evidence.replacementDecayWeight,
    recent_parts_rationale: baselineStage.evidence.recentPartsRationale,
    recurring_failure_score: baselineStage.evidence.recurringFailureScore,
    recurring_pattern_type: baselineStage.evidence.recurringPatternType,
    repeat_code_frequency: baselineStage.evidence.repeatCodeFrequency,
    repeat_component_frequency: baselineStage.evidence.repeatComponentFrequency,
    repeat_repair_without_resolution: baselineStage.evidence.repeatRepairWithoutResolution,
    suspected_unresolved_root_cause: baselineStage.evidence.suspectedUnresolvedRootCause,
    recurrence_rationale: baselineStage.evidence.recurrenceRationale,
    cause_library_fit_score: Math.round(average(finalRanking.slice(0, 3).map((item) => item.cause_library_fit_score))),
    matched_library_causes: baselineStage.baseline.matched_library_causes,
    partial_library_matches: baselineStage.baseline.partial_library_matches,
    new_candidate_causes: newCandidateCauses,
    new_candidate_causes_review_required: newCandidateCausesReviewRequired,
    cause_library_rationale: [
      `${baselineStage.baseline.matched_library_causes.length} hardcoded library causes were included in the candidate universe`,
      newCandidateCauses.length > 0 ? `${newCandidateCauses.length} new LLM-proposed causes require review` : "No new causes were proposed outside the library",
    ],
    overall_confidence_score: confidenceScore,
    confidence_score: confidenceScore,
    confidence_rationale: confidenceRationale,
    next_action: nextAction,
    clarifying_question: nextAction === "ask_question" ? clarifyingQuestion : "",
    question_rationale:
      llmReview.status === "ok"
        ? llmReview.parsed.question_rationale ??
          (nextAction === "ask_question"
            ? "Confidence is below the configured threshold, so this question is required before finalizing the diagnosis."
            : null)
        : nextAction === "ask_question"
          ? "Baseline clarification path used because the LLM review did not supply a valid question."
          : null,
    missing_evidence:
      llmReview.status === "ok"
        ? uniqueStrings([...llmReview.parsed.missing_evidence, ...baselineStage.evidence.vehicleDataGaps])
        : baselineStage.evidence.vehicleDataGaps,
    ambiguity_drivers:
      llmReview.status === "ok"
        ? llmReview.parsed.ambiguity_drivers
        : confidenceScore < config.confidenceThreshold
          ? ["Baseline confidence remained below the configured threshold"]
          : [],
    similar_confirmed_cases_used: similarConfirmedCasesUsed,
    recommended_tests: recommendedTests,
    recommended_fix: recommendedFix,
    risk_level: finalRiskLevel,
    maintenance_recommendations: maintenanceRecommendations,
    compliance_impact: complianceImpact,
    top_most_likely_cause:
      llmRepairGuidance?.top_most_likely_cause ?? topCause?.cause_name ?? baselineStage.baseline.possible_causes[0]?.cause ?? "Unknown cause",
    possible_replacement_parts: possibleReplacementParts,
    likely_replacement_parts: possibleReplacementParts,
    inspection_related_parts: inspectionRelatedParts,
    adjacent_parts_to_check: adjacentPartsToCheck,
    confirm_before_replacement: llmRepairGuidance?.confirm_before_replacement ?? true,
    diagnostic_verification_labor_hours: diagnosticVerificationLaborHours,
    repair_labor_hours: repairLaborHours,
    total_estimated_labor_hours: totalEstimatedLaborHours,
    labor_time_confidence: laborTimeConfidence,
    labor_time_basis: laborTimeBasis,
    driver_action: safetyOverride.driverAction,
    driver_action_reason: driverActionReason,
    risk_summary: riskSummary,
    safety_note: safetyNote,
    compliance_note: complianceNote,
    monitoring_instructions: monitoringInstructions,
    distance_or_time_limit: distanceOrTimeLimit,
    llm_status: llmReview.status,
    llm_provider: llmReview.provider,
    llm_model: llmReview.model,
    fallback_used: intakeInterpretation.fallbackUsed || llmReview.fallbackUsed,
    fallback_reason: combinedFallbackReasons.length > 0 ? combinedFallbackReasons.join("; ") : null,
    safety_override_applied: safetyOverride.applied,
    safety_override_reason: safetyOverride.reason,
    review_queue_record_ids: [],
  });

  const reviewQueueRecordIds = await queueDiagnosticReviewRecords({
    fleetId: baselineStage.context.input.fleetId ?? null,
    vehicleId: baselineStage.context.input.vehicleId,
    baseline: parsed.rule_engine_baseline,
    finalRanking: parsed.final_llm_ranking,
    confidenceDelta: parsed.confidence_delta,
    llmStatus: parsed.llm_status,
    llmAdjustments: parsed.llm_adjustments,
    confidenceRationale: parsed.confidence_rationale,
    newCandidateCauses: parsed.new_candidate_causes,
    rankingDelta: parsed.ranking_delta,
    evidenceSnapshot: {
      normalized_symptoms: parsed.normalized_symptoms,
      fault_codes: baselineStage.context.normalizedFaultCodes,
      vehicle_context: baselineStage.context.input.vehicle ?? null,
      issue_history: baselineStage.context.input.issueHistory,
    },
  });

  return TadisOutputSchema.parse({
    ...parsed,
    review_queue_record_ids: reviewQueueRecordIds,
  });
}

export class TadisEngine {
  buildContext(input: DiagnosticInputRequest) {
    return buildDiagnosticContext(input);
  }

  async analyze(input: DiagnosticInputRequest): Promise<TadisOutput> {
    return analyzeDiagnosticDetailed(input);
  }
}

export const tadisEngine = new TadisEngine();

export async function analyzeDiagnostic(input: DiagnosticInputRequest): Promise<TadisOutput> {
  return tadisEngine.analyze(input);
}

export async function analyzeDiagnosticWithAi(input: DiagnosticInputRequest): Promise<TadisOutput> {
  return analyzeDiagnosticDetailed(input);
}

export function mapDiagnosticRiskToUrgency(riskLevel: z.infer<typeof riskLevelSchema>) {
  return mapRiskToUrgency(riskLevel);
}

export function mapDiagnosticRiskToAction(riskLevel: z.infer<typeof riskLevelSchema>) {
  return mapRiskToAction(riskLevel);
}

function shouldUseSimpleTadisEmergencyFallback(reason: string | null | undefined) {
  return Boolean(
    reason &&
      /429|402|Provider returned error|Bad Request|prompt tokens|rate limit|overloaded|too many requests|Unable to parse|invalid schema|JSON/i.test(
        reason
      )
  );
}
