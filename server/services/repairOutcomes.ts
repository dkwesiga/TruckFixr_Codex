import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { repairOutcomes } from "../../drizzle/schema";

// The manager's verdict on whether the AI/TADIS diagnosis matched the confirmed
// repair. These are the values the existing capture path
// (`inspections.recordRepairOutcome`) already writes — the reporting below must
// stay aligned to them so old and new rows aggregate together.
export const AI_DIAGNOSIS_VERDICTS = [
  "yes",
  "partially",
  "no",
  "unknown",
] as const;
export type AiDiagnosisVerdict = (typeof AI_DIAGNOSIS_VERDICTS)[number];

export async function getRepairOutcomeByDefect(defectId: number) {
  const db = await getDb();
  if (!db) return null;

  const [outcome] = await db
    .select()
    .from(repairOutcomes)
    .where(eq(repairOutcomes.defectId, defectId))
    .orderBy(desc(repairOutcomes.createdAt))
    .limit(1);

  return outcome ?? null;
}

export type DiagnosisAgreementStats = {
  total: number;
  correct: number;
  partiallyCorrect: number;
  incorrect: number;
  unknown: number;
  // Agreement rate over outcomes where the manager gave a verdict (excludes
  // "unknown"); null when there is nothing to score yet.
  agreementRate: number | null;
};

/**
 * Aggregates confirmed-outcome verdicts for a fleet so TADIS quality is
 * measurable over time — the labeled signal that turns captured outcomes into
 * a data moat. Caller MUST have already authorized fleet access.
 */
export async function getFleetDiagnosisAgreement(
  fleetId: number
): Promise<DiagnosisAgreementStats> {
  const empty: DiagnosisAgreementStats = {
    total: 0,
    correct: 0,
    partiallyCorrect: 0,
    incorrect: 0,
    unknown: 0,
    agreementRate: null,
  };

  const db = await getDb();
  if (!db) return empty;

  const rows = await db
    .select({
      verdict: repairOutcomes.aiDiagnosisCorrect,
      count: sql<number>`count(*)::int`,
    })
    .from(repairOutcomes)
    .where(eq(repairOutcomes.fleetId, fleetId))
    .groupBy(repairOutcomes.aiDiagnosisCorrect);

  const stats = { ...empty };
  for (const row of rows) {
    const n = Number(row.count) || 0;
    stats.total += n;
    // "yes"/"partially"/"no" are the canonical verdicts; anything else
    // (including "unknown" and any legacy value) counts as unscored.
    if (row.verdict === "yes") stats.correct = n;
    else if (row.verdict === "partially") stats.partiallyCorrect = n;
    else if (row.verdict === "no") stats.incorrect = n;
    else stats.unknown += n;
  }

  const scored = stats.correct + stats.partiallyCorrect + stats.incorrect;
  if (scored > 0) {
    // Partial credit of 0.5 keeps the rate honest without discarding partials.
    stats.agreementRate =
      Math.round(
        ((stats.correct + stats.partiallyCorrect * 0.5) / scored) * 100
      ) / 100;
  }

  return stats;
}
