import { aiRequestLogs } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { getDb } from "../db";

export type DiagnosticAiRequestLogStatus = "success" | "failed" | "fallback";

export type DiagnosticAiRequestLogInput = {
  id?: number;
  companyId: number;
  assetId: string;
  diagnosticSessionId: string;
  callType: "classifier" | "diagnosis";
  provider: string | null;
  model: string | null;
  estimatedInputCharacters: number;
  estimatedInputTokens: number;
  messageCount: number;
  maxTokens: number;
  temperature: number;
  responseFormatEnabled: boolean;
  simpleTadisMode: boolean;
  truncationApplied: boolean;
  status: DiagnosticAiRequestLogStatus;
  errorCode?: string | null;
  errorMessage?: string | null;
  fallbackUsed: boolean;
};

export async function insertDiagnosticAiRequestLog(input: DiagnosticAiRequestLogInput) {
  const db = await getDb();
  if (!db) {
    return null;
  }

  try {
    const [row] = await db
      .insert(aiRequestLogs)
      .values({
        companyId: input.companyId,
        assetId: input.assetId,
        diagnosticSessionId: input.diagnosticSessionId,
        callType: input.callType,
        provider: input.provider,
        model: input.model,
        estimatedInputCharacters: input.estimatedInputCharacters,
        estimatedInputTokens: input.estimatedInputTokens,
        messageCount: input.messageCount,
        maxTokens: input.maxTokens,
        temperature: input.temperature,
        responseFormatEnabled: input.responseFormatEnabled,
        simpleTadisMode: input.simpleTadisMode,
        truncationApplied: input.truncationApplied,
        status: input.status,
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
        fallbackUsed: input.fallbackUsed,
      })
      .returning({ id: aiRequestLogs.id });

    return row?.id ?? null;
  } catch (error) {
    console.warn("[TADIS] Unable to persist AI request log:", error);
    return null;
  }
}

export async function updateDiagnosticAiRequestLog(
  id: number,
  input: Partial<DiagnosticAiRequestLogInput>
) {
  const db = await getDb();
  if (!db) {
    return false;
  }

  try {
    const updates = Object.fromEntries(
      Object.entries({
        companyId: input.companyId,
        assetId: input.assetId,
        diagnosticSessionId: input.diagnosticSessionId,
        callType: input.callType,
        provider: input.provider,
        model: input.model,
        estimatedInputCharacters: input.estimatedInputCharacters,
        estimatedInputTokens: input.estimatedInputTokens,
        messageCount: input.messageCount,
        maxTokens: input.maxTokens,
        temperature: input.temperature,
        responseFormatEnabled: input.responseFormatEnabled,
        simpleTadisMode: input.simpleTadisMode,
        truncationApplied: input.truncationApplied,
        status: input.status,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
        fallbackUsed: input.fallbackUsed,
      }).filter(([, value]) => value !== undefined)
    );

    await db
      .update(aiRequestLogs)
      .set(updates as any)
      .where(eq(aiRequestLogs.id, id));

    return true;
  } catch (error) {
    console.warn("[TADIS] Unable to update AI request log:", error);
    return false;
  }
}
