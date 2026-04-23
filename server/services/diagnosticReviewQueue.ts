import { diagnosticReviewQueue } from "../../drizzle/schema";
import { getDb } from "../db";

type QueueInput = {
  fleetId: number | null;
  vehicleId: number;
  baseline: {
    possible_causes: Array<{ cause: string; probability: number }>;
  };
  finalRanking: Array<{ cause_name: string; probability: number; is_new_cause: boolean }>;
  confidenceDelta: number;
  llmStatus: string;
  llmAdjustments: string[];
  confidenceRationale: string[];
  newCandidateCauses: string[];
  rankingDelta: {
    top_cause_changed: boolean;
    baseline_top_cause: string | null;
    final_top_cause: string | null;
  };
  evidenceSnapshot: Record<string, unknown>;
};

function buildQueueItems(input: QueueInput) {
  const items: Array<{
    reviewType: string;
    summary: string;
  }> = [];

  if (input.newCandidateCauses.length > 0) {
    items.push({
      reviewType: "new_cause",
      summary: `New causes proposed: ${input.newCandidateCauses.join(", ")}`,
    });
  }

  if (input.rankingDelta.top_cause_changed) {
    items.push({
      reviewType: "ranking_override",
      summary: `LLM changed the top cause from ${input.rankingDelta.baseline_top_cause ?? "unknown"} to ${input.rankingDelta.final_top_cause ?? "unknown"}`,
    });
  }

  if (Math.abs(input.confidenceDelta) >= 15) {
    items.push({
      reviewType: "confidence_delta",
      summary: `Confidence changed by ${input.confidenceDelta} points`,
    });
  }

  return items;
}

export async function queueDiagnosticReviewRecords(input: QueueInput) {
  const items = buildQueueItems(input);
  if (items.length === 0) {
    return [];
  }

  const db = await getDb();
  if (!db) {
    return [];
  }

  try {
    const inserted = await db
      .insert(diagnosticReviewQueue)
      .values(
        items.map((item) => ({
          fleetId: input.fleetId,
          vehicleId: input.vehicleId,
          reviewType: item.reviewType,
          status: "review_pending",
          summary: item.summary,
          baselineTopCause: input.rankingDelta.baseline_top_cause,
          finalTopCause: input.rankingDelta.final_top_cause,
          confidenceDelta: input.confidenceDelta.toFixed(2),
          evidenceSnapshot: input.evidenceSnapshot,
          baselineRanking: input.baseline.possible_causes,
          finalRanking: input.finalRanking,
          rationale: {
            llmStatus: input.llmStatus,
            llmAdjustments: input.llmAdjustments,
            confidenceRationale: input.confidenceRationale,
            newCandidateCauses: input.newCandidateCauses,
          },
        }))
      )
      .returning({ id: diagnosticReviewQueue.id });

    return inserted.map((row) => row.id);
  } catch (error) {
    console.warn("[TADIS] Failed to queue diagnostic review records:", error);
    return [];
  }
}
