import {
  DiagnosticIssueInput,
  DiagnosticResult,
  DiagnosticSessionRecord,
  DiagnosticUIState,
} from "../../../../packages/types/diagnostics";

export interface SupabaseLikeClient {
  from: (table: string) => {
    insert: (payload: Record<string, unknown>) => {
      select: () => {
        single: () => Promise<{ data: Record<string, unknown> | null; error: Error | null }>;
      };
    };
    update: (payload: Record<string, unknown>) => {
      eq: (column: string, value: string) => {
        select: () => {
          single: () => Promise<{ data: Record<string, unknown> | null; error: Error | null }>;
        };
      };
    };
  };
}

function parseRecord(data: Record<string, unknown>): DiagnosticSessionRecord {
  return {
    id: String(data.id),
    vehicleId: String(data.vehicle_id),
    userId: String(data.user_id),
    uiState: data.ui_state as DiagnosticUIState,
    issueInput: (data.issue_input as DiagnosticIssueInput) ?? { description: "" },
    clarifications: (data.clarifications as DiagnosticSessionRecord["clarifications"]) ?? [],
    result: data.result as DiagnosticResult,
    createdAt: String(data.created_at),
    updatedAt: String(data.updated_at),
  };
}

export async function createDiagnosticSession(
  client: SupabaseLikeClient,
  input: {
    userId: string;
    vehicleId: string;
    issueInput: DiagnosticIssueInput;
  },
): Promise<DiagnosticSessionRecord> {
  const { data, error } = await client
    .from("diagnostic_sessions")
    .insert({
      user_id: input.userId,
      vehicle_id: input.vehicleId,
      ui_state: "analyzing",
      issue_input: input.issueInput,
      clarifications: [],
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create diagnostic session.");
  }

  return parseRecord(data);
}

export async function updateDiagnosticSessionState(
  client: SupabaseLikeClient,
  input: {
    sessionId: string;
    uiState: DiagnosticUIState;
    clarifications?: DiagnosticSessionRecord["clarifications"];
    result?: DiagnosticResult;
  },
): Promise<DiagnosticSessionRecord> {
  const { data, error } = await client
    .from("diagnostic_sessions")
    .update({
      ui_state: input.uiState,
      clarifications: input.clarifications,
      result: input.result,
    })
    .eq("id", input.sessionId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update diagnostic session.");
  }

  return parseRecord(data);
}
