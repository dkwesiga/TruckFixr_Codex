import { z } from "zod";

const MAX_CLARIFICATION_ROUNDS = 4;
const DEFAULT_SIMILAR_CASE_LIMIT = 7;

const riskLevelSchema = z.enum(["low", "medium", "high"]);

export const DiagnosticVehicleSchema = z.object({
  id: z.number().int().positive(),
  make: z.string().optional(),
  model: z.string().optional(),
  year: z.number().int().nullable().optional(),
  mileage: z.number().int().nonnegative().optional(),
  engineHours: z.number().int().nonnegative().optional(),
  status: z.string().optional(),
  configuration: z.record(z.string(), z.unknown()).optional(),
});

export const DiagnosticHistoryEntrySchema = z.object({
  summary: z.string(),
  category: z.string().optional(),
  status: z.string().optional(),
  occurredAt: z.union([z.date(), z.string()]).optional(),
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
  risk_level: riskLevelSchema,
  similarity: z.number().min(0).max(1).default(0),
});

export const ClarificationTurnSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
});

export const DiagnosticInputSchema = z.object({
  vehicleId: z.number().int().positive(),
  symptoms: z.array(z.string().trim().min(1)).min(1),
  faultCodes: z.array(z.string().trim().min(1)).default([]),
  driverNotes: z.string().trim().optional(),
  vehicle: DiagnosticVehicleSchema.optional(),
  issueHistory: z.object({
    priorDefects: z.array(DiagnosticHistoryEntrySchema).default([]),
    recentInspections: z.array(DiagnosticHistoryEntrySchema).default([]),
    recentRepairs: z.array(DiagnosticHistoryEntrySchema).default([]),
  }).default({
    priorDefects: [],
    recentInspections: [],
    recentRepairs: [],
  }),
  similarCases: z.array(SimilarCaseSchema).default([]),
  clarificationHistory: z.array(ClarificationTurnSchema).max(MAX_CLARIFICATION_ROUNDS).default([]),
});

export type DiagnosticInput = z.infer<typeof DiagnosticInputSchema>;
export type DiagnosticInputRequest = z.input<typeof DiagnosticInputSchema>;
export type SimilarCase = z.infer<typeof SimilarCaseSchema>;
export type ClarificationTurn = z.infer<typeof ClarificationTurnSchema>;

export const TadisOutputSchema = z.object({
  systems_affected: z.array(z.string()),
  possible_causes: z.array(
    z.object({
      cause: z.string(),
      probability: z.number().min(0).max(1),
    })
  ).min(1),
  confidence_score: z.number().min(0).max(100),
  next_action: z.enum(["ask_question", "proceed"]),
  clarifying_question: z.string(),
  recommended_tests: z.array(z.string()),
  recommended_fix: z.string(),
  risk_level: riskLevelSchema,
});

export type TadisOutput = z.infer<typeof TadisOutputSchema>;

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
};

const CAUSE_LIBRARY: CauseDefinition[] = [
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
    ],
  },
  {
    id: "brake_friction_wear",
    cause: "Brake friction material wear or rotor/drum damage",
    systems: ["brakes", "wheel_end"],
    risk: "high",
    symptomKeywords: ["brake noise", "grinding", "squeal", "brake", "pulsation"],
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
    ],
  },
  {
    id: "air_brake_leak",
    cause: "Air brake leak or pressure loss",
    systems: ["brakes", "air_system"],
    risk: "high",
    symptomKeywords: ["brake", "air", "warning buzzer", "pressure loss"],
    noteKeywords: ["hiss", "losing air", "air tank", "low air"],
    faultCodes: [],
    vehicleSignals: ["airBrakes"],
    recommendedTests: [
      "Check air pressure build and leak-down rates",
      "Listen for leaks at lines, fittings, and chambers",
      "Inspect the dryer and governor function",
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
    ],
  },
];

const BUILT_IN_CASES: SimilarCase[] = [
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
  return Number(value.toFixed(4));
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

export function buildDiagnosticContext(rawInput: DiagnosticInputRequest) {
  const input = DiagnosticInputSchema.parse(rawInput);
  const normalizedSymptoms = input.symptoms.map((symptom) => normalizeText(symptom));
  const normalizedFaultCodes = input.faultCodes.map((code) => code.trim().toUpperCase());
  const notes = normalizeText(input.driverNotes);
  const historyText = [
    ...input.issueHistory.priorDefects.map((item) => item.summary),
    ...input.issueHistory.recentInspections.map((item) => item.summary),
    ...input.issueHistory.recentRepairs.map((item) => item.summary),
  ].map((item) => normalizeText(item)).join(" ");

  const allCases = [...BUILT_IN_CASES, ...input.similarCases];
  const baseContext = {
    input,
    normalizedSymptoms,
    normalizedFaultCodes,
    notes,
    historyText,
    similarCases: allCases,
    matchedSignals: 0,
  } satisfies DiagnosticContext;

  return {
    ...baseContext,
    similarCases: retrieveSimilarCases(baseContext),
  } satisfies DiagnosticContext;
}

function scoreCaseSimilarity(context: DiagnosticContext, item: SimilarCase) {
  const symptomMatches = item.symptomSignals.filter((signal) =>
    context.normalizedSymptoms.some((symptom) => symptom.includes(normalizeText(signal)))
  ).length;
  const faultCodeMatches = item.faultCodes.filter((code) =>
    context.normalizedFaultCodes.includes(code.toUpperCase())
  ).length;

  let score = symptomMatches * 2.4 + faultCodeMatches * 2.8;

  if (context.notes && normalizeText(item.summary).includes(context.notes.split(" ")[0] ?? "")) {
    score += 0.8;
  }

  if (context.input.vehicle?.make && item.summary.toLowerCase().includes(context.input.vehicle.make.toLowerCase())) {
    score += 0.6;
  }

  return score;
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

function evaluateCause(context: DiagnosticContext, cause: CauseDefinition) {
  let score = 1;
  let evidenceMatches = 0;
  const fullText = `${context.normalizedSymptoms.join(" ")} ${context.notes}`;

  cause.symptomKeywords.forEach((keyword) => {
    if (fullText.includes(keyword)) {
      score += 2.2;
      evidenceMatches += 1;
    }
  });

  cause.noteKeywords.forEach((keyword) => {
    if (context.notes.includes(keyword)) {
      score += 1.6;
      evidenceMatches += 1;
    }
  });

  cause.faultCodes.forEach((faultCode) => {
    if (context.normalizedFaultCodes.includes(faultCode)) {
      score += 3.4;
      evidenceMatches += 1;
    }
  });

  cause.historyKeywords?.forEach((keyword) => {
    if (context.historyText.includes(keyword)) {
      score += 1.1;
      evidenceMatches += 1;
    }
  });

  if (cause.vehicleSignals?.includes("airBrakes") && context.input.vehicle?.configuration?.airBrakes === true) {
    score += 0.8;
    evidenceMatches += 1;
  }

  if ((context.input.vehicle?.mileage ?? 0) >= 180000 && (cause.id === "coolant_leak" || cause.id === "brake_friction_wear" || cause.id === "steering_linkage_wear")) {
    score += 0.6;
    evidenceMatches += 1;
  }

  const caseSupport = context.similarCases
    .filter((item) => item.causeId === cause.id)
    .reduce((total, item) => total + item.similarity, 0);
  score += caseSupport * 1.8;

  context.input.clarificationHistory.forEach((turn) => {
    cause.questions.forEach((question) => {
      if (question.text !== turn.question) return;

      const answerClass = classifyAnswer(question, turn.answer);
      if (answerClass === "positive") {
        if (question.positiveFor.includes(cause.id)) {
          score += 2.8;
          evidenceMatches += 1;
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
        }
      }
    });
  });

  return {
    cause,
    score: Math.max(score, 0.15),
    evidenceMatches,
  };
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
  const score = 35 + topProbability * 30 + separation * 85 + evidenceStrength * 18 + clarificationCount * 5 - ambiguityPenalty;
  return Math.max(18, Math.min(97, Math.round(score)));
}

function selectClarifyingQuestion(
  scoredCauses: Array<{ cause: CauseDefinition; probability: number }>,
  clarificationHistory: ClarificationTurn[]
) {
  const asked = new Set(clarificationHistory.map((turn) => turn.question));
  const topCauseIds = scoredCauses.slice(0, 3).map((item) => item.cause.id);
  const candidates = scoredCauses.slice(0, 3).flatMap((item) =>
    item.cause.questions.map((question) => ({
      text: question.text,
      score:
        question.positiveFor.filter((causeId) => topCauseIds.includes(causeId)).length * 2 +
        (question.negativeFor?.filter((causeId) => topCauseIds.includes(causeId)).length ?? 0),
    }))
  );

  const next = candidates
    .filter((candidate) => !asked.has(candidate.text))
    .sort((left, right) => right.score - left.score)[0];

  return next?.text ?? "";
}

export class TadisEngine {
  buildContext(input: DiagnosticInputRequest) {
    return buildDiagnosticContext(input);
  }

  analyze(input: DiagnosticInputRequest): TadisOutput {
    const context = this.buildContext(input);
    const evaluated = CAUSE_LIBRARY.map((cause) => evaluateCause(context, cause));
    const totalScore = evaluated.reduce((sum, item) => sum + item.score, 0) || 1;
    const ranked = evaluated
      .map((item) => ({
        cause: item.cause,
        probability: item.score / totalScore,
        evidenceMatches: item.evidenceMatches,
      }))
      .sort((left, right) => right.probability - left.probability);

    const confidenceScore = calculateConfidence(
      evaluated.map((item) => ({ score: item.score, evidenceMatches: item.evidenceMatches })),
      context.input.clarificationHistory.length
    );

    const clarifyingQuestion =
      confidenceScore < 75 && context.input.clarificationHistory.length < MAX_CLARIFICATION_ROUNDS
        ? selectClarifyingQuestion(ranked, context.input.clarificationHistory)
        : "";

    const nextAction = confidenceScore >= 75 || !clarifyingQuestion ? "proceed" : "ask_question";
    const topCauses = ranked.slice(0, 4);
    const leadingCause = topCauses[0]?.cause ?? CAUSE_LIBRARY[0];
    const systemsAffected = uniqueStrings(
      topCauses
        .filter((item) => item.probability >= 0.12)
        .flatMap((item) => item.cause.systems)
    );
    const recommendedTests = uniqueStrings(
      topCauses
        .slice(0, 3)
        .flatMap((item) => item.cause.recommendedTests)
    ).slice(0, 6);
    const riskLevel = topCauses
      .slice(0, 2)
      .reduce<z.infer<typeof riskLevelSchema>>((current, item) => {
        return scoreRisk(item.cause.risk) > scoreRisk(current) ? item.cause.risk : current;
      }, leadingCause.risk);

    return TadisOutputSchema.parse({
      systems_affected: systemsAffected.length > 0 ? systemsAffected : leadingCause.systems,
      possible_causes: topCauses.map((item) => ({
        cause: item.cause.cause,
        probability: roundProbability(item.probability),
      })),
      confidence_score: confidenceScore,
      next_action: nextAction,
      clarifying_question: nextAction === "ask_question" ? clarifyingQuestion : "",
      recommended_tests: recommendedTests,
      recommended_fix: leadingCause.recommendedFix,
      risk_level: riskLevel,
    });
  }
}

export const tadisEngine = new TadisEngine();

export function analyzeDiagnostic(input: DiagnosticInputRequest): TadisOutput {
  return tadisEngine.analyze(input);
}

export function mapDiagnosticRiskToUrgency(riskLevel: z.infer<typeof riskLevelSchema>) {
  return mapRiskToUrgency(riskLevel);
}

export function mapDiagnosticRiskToAction(riskLevel: z.infer<typeof riskLevelSchema>) {
  return mapRiskToAction(riskLevel);
}
