import { aiQualityReviews } from "../../drizzle/schema";
import { getDb } from "../db";

export type AiQualityReviewLogInput = {
  diagnosticCaseId: string;
  fleetId: number | null;
  userId: number | null;
  vehicleId: string | null;
  planType: string | null;
  modelUsed: string | null;
  providerUsed: string | null;
  fallbackModelUsed: string | null;
  fallbackUsed: boolean;
  caseType: string;
  escalationReason: string | null;
  classificationConfidence: number | null;
  finalDiagnosisConfidence: number | null;
  referenceLookupUsed: boolean;
  referenceMatchStatus: string;
  clarificationCount: number;
  totalAiCalls: number;
  estimatedPromptTokens: number;
  estimatedCompletionTokens: number;
  estimatedTotalTokens: number;
  estimatedCostUsd: number | null;
  finalSafeToDriveDecision: string | null;
  confirmedOutcomeStatus?: string | null;
  managerConfirmed?: boolean;
  mechanicConfirmed?: boolean;
  adminComparisonUsed?: boolean;
  metadata?: Record<string, unknown> | null;
};

export async function insertAiQualityReviewLog(input: AiQualityReviewLogInput) {
  const db = await getDb();
  if (!db) return null;

  try {
    const [row] = await db
      .insert(aiQualityReviews)
      .values({
        diagnosticCaseId: input.diagnosticCaseId,
        fleetId: input.fleetId,
        userId: input.userId,
        vehicleId: input.vehicleId,
        planType: input.planType,
        modelUsed: input.modelUsed,
        providerUsed: input.providerUsed,
        fallbackModelUsed: input.fallbackModelUsed,
        fallbackUsed: input.fallbackUsed,
        caseType: input.caseType,
        escalationReason: input.escalationReason,
        classificationConfidence: input.classificationConfidence,
        finalDiagnosisConfidence: input.finalDiagnosisConfidence,
        referenceLookupUsed: input.referenceLookupUsed,
        referenceMatchStatus: input.referenceMatchStatus,
        clarificationCount: input.clarificationCount,
        totalAiCalls: input.totalAiCalls,
        estimatedPromptTokens: input.estimatedPromptTokens,
        estimatedCompletionTokens: input.estimatedCompletionTokens,
        estimatedTotalTokens: input.estimatedTotalTokens,
        estimatedCostUsd:
          input.estimatedCostUsd == null ? null : String(input.estimatedCostUsd),
        finalSafeToDriveDecision: input.finalSafeToDriveDecision,
        confirmedOutcomeStatus: input.confirmedOutcomeStatus ?? null,
        managerConfirmed: input.managerConfirmed ?? false,
        mechanicConfirmed: input.mechanicConfirmed ?? false,
        adminComparisonUsed: input.adminComparisonUsed ?? false,
        metadata: input.metadata ?? null,
      })
      .returning({ id: aiQualityReviews.id });

    return row?.id ?? null;
  } catch (error) {
    console.warn("[AI Quality] Unable to persist quality review log:", error);
    return null;
  }
}
