import { inArray } from "drizzle-orm";
import { getDb } from "../db";
import { tadisLearningRecords } from "../../drizzle/schema";

// Evidence-weighted retrieval over de-identified TADIS learning records
// (§15). Standalone and additive: it does not modify tadisCore.ts's existing
// hardcoded case library. `toSimilarCaseInputs()` below maps ranked results
// into tadisCore's own `SimilarCaseSchema` shape so a caller building a
// DiagnosticInputRequest can simply spread these into `similarCases` — see
// the integration note in the deliverables summary for the one remaining
// wiring step at the live diagnosis call site.

export type LearningRetrievalQuery = {
  make?: string | null;
  model?: string | null;
  modelYear?: number | null;
  engineMake?: string | null;
  symptoms?: string[];
  faultCodes?: string[];
  affectedSystem?: string | null;
  limit?: number;
};

export type RankedLearningRecord = {
  record: typeof tadisLearningRecords.$inferSelect;
  score: number;
  matchedSignals: string[];
};

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

// Single scoring function, fully explainable via `matchedSignals`. Evidence
// state and quality dominate the score so a Confirmed, high-quality record
// outranks a merely-plausible vehicle match; a Failed outcome still scores
// (it is retrievable as negative evidence) but is flagged as such.
function scoreRecord(query: LearningRetrievalQuery, record: RankedLearningRecord["record"]) {
  const matched: string[] = [];
  let score = 0;

  if (query.make && normalize(query.make) === normalize(record.make)) {
    score += 3;
    matched.push("make");
  }
  if (query.model && normalize(query.model) === normalize(record.model)) {
    score += 3;
    matched.push("model");
  }
  if (query.modelYear && record.modelYear && Math.abs(query.modelYear - record.modelYear) <= 1) {
    score += 1.5;
    matched.push("model_year");
  }
  if (query.engineMake && normalize(query.engineMake) === normalize(record.engineMake)) {
    score += 2;
    matched.push("engine_make");
  }
  if (query.affectedSystem && normalize(query.affectedSystem) === normalize(record.affectedSystem)) {
    score += 2.5;
    matched.push("affected_system");
  }

  const recordFaultCodes = (Array.isArray(record.faultCodesJson) ? record.faultCodesJson : []) as string[];
  const faultCodeMatches = (query.faultCodes ?? []).filter((code) =>
    recordFaultCodes.some((rc) => normalize(rc) === normalize(code))
  );
  if (faultCodeMatches.length > 0) {
    score += faultCodeMatches.length * 3;
    matched.push(...faultCodeMatches.map((c) => `fault_code:${c}`));
  }

  const recordSymptoms = (Array.isArray(record.symptomsJson) ? record.symptomsJson : []) as string[];
  const symptomMatches = (query.symptoms ?? []).filter((symptom) =>
    recordSymptoms.some((rs) => normalize(rs).includes(normalize(symptom)) || normalize(symptom).includes(normalize(rs)))
  );
  if (symptomMatches.length > 0) {
    score += symptomMatches.length * 1.2;
    matched.push(...symptomMatches.map((s) => `symptom:${s}`));
  }

  // Evidence-quality weighting: a Confirmed, high-quality record should
  // outrank a plausible-but-thin match on vehicle fields alone.
  const qualityBoost = (record.evidenceQualityScore ?? 0) / 100;
  score *= 0.6 + 0.4 * qualityBoost;

  if (record.outcomeState === "confirmed") score *= 1.25;
  else if (record.outcomeState === "verified") score *= 1.1;
  else if (record.outcomeState === "failed") {
    // Kept as negative evidence, not dropped — flagged distinctly so a
    // caller can present it as "this did not work" rather than a positive
    // match.
    matched.push("negative_evidence");
  }

  // A promoted record has cleared human review; a bare candidate has not.
  if (record.eligibilityStatus === "promoted") score *= 1.15;

  return { score: Math.round(score * 100) / 100, matched };
}

// Ranks promoted + candidate learning records for a query context. Excluded
// records are never returned. Historical-import records are still eligible
// (their capped evidenceQualityScore already discounts them naturally).
export async function rankLearningRecordsForQuery(
  query: LearningRetrievalQuery
): Promise<RankedLearningRecord[]> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select()
    .from(tadisLearningRecords)
    .where(inArray(tadisLearningRecords.eligibilityStatus, ["promoted", "candidate"]))
    .limit(500);

  const ranked = rows
    .map((record) => {
      const { score, matched } = scoreRecord(query, record);
      return { record, score, matchedSignals: matched };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const limit = Math.max(1, Math.min(20, query.limit ?? 8));
  return ranked.slice(0, limit);
}

// Maps ranked learning records into tadisCore's SimilarCaseSchema shape
// (server/services/tadisCore.ts `SimilarCaseSchema`) so a caller can pass
// them straight into a DiagnosticInputRequest's `similarCases` array.
export function toSimilarCaseInputs(ranked: RankedLearningRecord[]) {
  const maxScore = Math.max(1, ...ranked.map((item) => item.score));
  return ranked.map((item) => ({
    id: `tadis-learning-${item.record.id}`,
    source: "historical" as const,
    causeId: item.record.rootCause ? item.record.rootCause.slice(0, 64) : `record-${item.record.id}`,
    cause: item.record.rootCause ?? "Unspecified root cause",
    systems_affected: item.record.affectedSystem ? [item.record.affectedSystem] : [],
    symptomSignals: Array.isArray(item.record.symptomsJson) ? (item.record.symptomsJson as string[]) : [],
    faultCodes: Array.isArray(item.record.faultCodesJson) ? (item.record.faultCodesJson as string[]) : [],
    summary: [item.record.make, item.record.model, item.record.modelYear].filter(Boolean).join(" "),
    resolution: item.record.repairAction ?? "",
    confirmedFix: item.record.outcomeState !== "failed" ? item.record.repairAction ?? undefined : undefined,
    resolutionSuccess: item.record.outcomeState === "confirmed" || item.record.outcomeState === "verified",
    // tadisCore.ts riskLevelSchema = z.enum(["low","medium","high","critical"]).
    risk_level: item.record.outcomeState === "failed" ? ("high" as const) : ("medium" as const),
    similarity: Math.min(1, item.score / maxScore),
  }));
}
