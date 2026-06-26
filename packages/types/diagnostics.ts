export type DiagnosticUIState =
  | "idle"
  | "analyzing"
  | "clarifying_question"
  | "processing_answer"
  | "final_result";

export interface VehicleOption {
  id: string;
  label: string;
  vin?: string;
}

export interface DiagnosticIssueInput {
  description: string;
  photoUri?: string;
  audioUri?: string;
  audioPlaceholderEnabled?: boolean;
  faultCodes?: string[];
}

export interface DiagnosticResult {
  mostLikelyIssue: string;
  confidence: number;
  risk: "low" | "medium" | "high";
  tests: string[];
  fix: string;
}

export interface ClarifyingPrompt {
  prompt: string;
  askedAt: string;
  response?: string;
  answeredAt?: string;
}

export interface DiagnosticSessionRecord {
  id: string;
  vehicleId: string;
  userId: string;
  uiState: DiagnosticUIState;
  issueInput: DiagnosticIssueInput;
  clarifications: ClarifyingPrompt[];
  result?: DiagnosticResult;
  createdAt: string;
  updatedAt: string;
}
