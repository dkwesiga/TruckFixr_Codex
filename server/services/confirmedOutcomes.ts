import { normalizeFaultCodes } from "./diagnosisWorkflow";

/**
 * TADIS confirmed-outcome retrieval (TFX-CR-0003 / Rec #3).
 *
 * Pure, deterministic logic that turns a fleet's confirmed repair outcomes into
 * the compact `confirmed_outcome_references` the diagnosis prompt consumes. This
 * is the heart of the learning loop: a confirmed repair on one truck should make
 * the next similar diagnosis in the SAME fleet better.
 *
 * Tenant safety: callers load rows scoped to a fleet via SQL, but
 * `buildConfirmedOutcomeReferences` re-asserts the fleet match as a defensive
 * guard so a future query regression cannot leak another fleet's outcomes into
 * an AI prompt. Dropped foreign-fleet rows are reported back to the caller.
 */

export function tokenizeDiagnosticText(text: string) {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2)
  );
}

export function jaccardSimilarity(a: Set<string>, b: Set<string>) {
  if (a.size === 0 || b.size === 0) return 0;

  let intersection = 0;
  for (const token of Array.from(a)) {
    if (b.has(token)) intersection += 1;
  }

  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

export function scoreHistoricalDiagnosticCase(input: {
  caseSignals: string[];
  caseFaultCodes: string[];
  currentSymptoms: string[];
  currentFaultCodes: string[];
}) {
  const symptomScore = jaccardSimilarity(
    tokenizeDiagnosticText(input.caseSignals.join(" ")),
    tokenizeDiagnosticText(input.currentSymptoms.join(" "))
  );

  const normalizedCaseCodes = new Set(normalizeFaultCodes(input.caseFaultCodes));
  const normalizedCurrentCodes = new Set(normalizeFaultCodes(input.currentFaultCodes));
  let codeMatches = 0;
  for (const code of Array.from(normalizedCaseCodes)) {
    if (normalizedCurrentCodes.has(code)) codeMatches += 1;
  }
  const codeUnion = normalizedCaseCodes.size + normalizedCurrentCodes.size - codeMatches;
  const codeScore = codeUnion > 0 ? codeMatches / codeUnion : 0;

  return Math.min(1, symptomScore * 0.7 + codeScore * 0.3);
}

function stringArrayFromUnknown(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

export function getStoredSolvedCaseSignals(metadata: Record<string, unknown> | null | undefined) {
  const diagnosisContext =
    metadata?.diagnosisContext && typeof metadata.diagnosisContext === "object"
      ? (metadata.diagnosisContext as Record<string, unknown>)
      : {};
  const feedback =
    metadata?.feedback && typeof metadata.feedback === "object"
      ? (metadata.feedback as Record<string, unknown>)
      : {};

  const symptoms = stringArrayFromUnknown(diagnosisContext.symptoms);
  const faultCodes = normalizeFaultCodes(stringArrayFromUnknown(diagnosisContext.faultCodes));
  const partsReplaced = stringArrayFromUnknown(feedback.partsReplaced);
  const cause = typeof feedback.cause === "string" ? feedback.cause : "";
  const confirmedFix = typeof feedback.confirmedFix === "string" ? feedback.confirmedFix : "";
  const summary = [cause, confirmedFix, ...partsReplaced].filter(Boolean).join(" - ");

  return {
    symptoms,
    faultCodes,
    partsReplaced,
    cause,
    confirmedFix,
    summary,
  };
}

export type ConfirmedRepairOutcomeRow = {
  fleetId: number | string;
  confirmedFault: string;
  repairPerformed: string;
  repairNotes?: string | null;
  partsReplaced?: unknown;
  aiDiagnosisCorrect?: string | null;
  diagnosticCaseId?: string | null;
  returnedToServiceAt?: Date | null;
  createdAt?: Date | null;
};

export type OutcomeReference = { date: string; summary: string };

export type BuildConfirmedOutcomeReferencesResult = {
  references: OutcomeReference[];
  /** Rows dropped because their fleetId did not match the requested fleet. */
  droppedForeignFleetCount: number;
};

function isoDate(value: Date | null | undefined) {
  return value?.toISOString?.().slice(0, 10) ?? "";
}

/**
 * Build the ranked `confirmed_outcome_references` for one fleet's current
 * diagnosis request. Normalized `repairOutcomes` are the authoritative source
 * and are ranked by similarity; optional `confirmedFeedbackReferences` (a looser
 * activity-log trail) are appended only to fill remaining slots.
 */
export function buildConfirmedOutcomeReferences(input: {
  fleetId: number | string;
  repairOutcomeRows: ConfirmedRepairOutcomeRow[];
  reviewMetadataByCaseId?: Map<string, Record<string, unknown> | null | undefined>;
  currentSymptoms: string[];
  currentFaultCodes: string[];
  confirmedFeedbackReferences?: OutcomeReference[];
  limit?: number;
}): BuildConfirmedOutcomeReferencesResult {
  const limit = input.limit ?? 3;
  const requestedFleetId = String(input.fleetId);
  const reviewMetadataByCaseId = input.reviewMetadataByCaseId ?? new Map();
  const currentFaultCodes = normalizeFaultCodes(input.currentFaultCodes);

  let droppedForeignFleetCount = 0;
  const sameFleetRows = input.repairOutcomeRows.filter((row) => {
    if (String(row.fleetId) === requestedFleetId) return true;
    droppedForeignFleetCount += 1;
    return false;
  });

  const normalizedRepairReferences = sameFleetRows
    .map((row) => {
      const storedSignals = getStoredSolvedCaseSignals(
        row.diagnosticCaseId ? reviewMetadataByCaseId.get(row.diagnosticCaseId) : null
      );
      const parts = Array.isArray(row.partsReplaced)
        ? row.partsReplaced.filter((value): value is string => typeof value === "string")
        : [];
      const partsSummary = parts.length > 0 ? ` Parts: ${parts.join(", ")}.` : "";
      const aiAccuracy =
        row.aiDiagnosisCorrect && row.aiDiagnosisCorrect !== "unknown"
          ? ` AI diagnosis: ${row.aiDiagnosisCorrect}.`
          : "";
      const caseLink = row.diagnosticCaseId ? ` Case: ${row.diagnosticCaseId}.` : "";
      const similarity = scoreHistoricalDiagnosticCase({
        caseSignals: [
          ...storedSignals.symptoms,
          row.confirmedFault,
          row.repairPerformed,
          row.repairNotes ?? "",
          ...storedSignals.partsReplaced,
          ...parts,
        ].filter(Boolean),
        caseFaultCodes: storedSignals.faultCodes,
        currentSymptoms: input.currentSymptoms,
        currentFaultCodes,
      });

      return {
        date: isoDate(row.returnedToServiceAt) || isoDate(row.createdAt),
        summary: `${row.confirmedFault}: ${row.repairPerformed}.${partsSummary}${aiAccuracy}${caseLink}`.slice(0, 180),
        similarity,
      };
    })
    .filter((row) => row.summary)
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, limit)
    .map(({ date, summary }) => ({ date, summary }));

  const references = [
    ...normalizedRepairReferences,
    ...(input.confirmedFeedbackReferences ?? []),
  ].slice(0, limit);

  return { references, droppedForeignFleetCount };
}
