// Pure pilot readiness evaluation (§42). Derives an overall state, blocking
// items, warnings, and TARGETED degradation flags. Degradation never disables
// the whole pilot — it disables only the affected capability.

export type ReadinessState = "ready" | "needs_attention" | "optional";

export interface ReadinessInput {
  // Blocking prerequisites.
  hasValidDates: boolean;
  hasPrimaryAuthorizedManager: boolean;
  hasEnrolledVehicle: boolean;
  diagnosisAvailable: boolean;
  requiredFeaturesEnabled: boolean;
  // Conditional prerequisites.
  documentsEnabled: boolean;
  storageOperational: boolean;
  externalProcessingEnabled: boolean;
  consentDecisionMade: boolean;
  // Warning-level.
  hasBackupManager: boolean;
  baselineComplete: boolean;
  hasAuthorizationLimit: boolean;
}

export interface DegradationFlags {
  blockApprovals: boolean;
  blockAiCaseCreation: boolean;
  blockUploads: boolean;
  blockNewPilotCases: boolean;
  stopMetricCounting: boolean;
  manualDocumentMode: boolean;
}

export interface ReadinessResult {
  state: ReadinessState;
  blocking: string[];
  warnings: string[];
  degradation: DegradationFlags;
}

export function evaluatePilotReadiness(input: ReadinessInput): ReadinessResult {
  const blocking: string[] = [];
  const warnings: string[] = [];

  if (!input.hasValidDates) blocking.push("Pilot start/end dates are missing or invalid.");
  if (!input.hasPrimaryAuthorizedManager) blocking.push("No primary authorized manager is set.");
  if (!input.hasEnrolledVehicle) blocking.push("No vehicles are enrolled in the pilot.");
  if (!input.diagnosisAvailable) blocking.push("Diagnosis is not currently available.");
  if (!input.requiredFeaturesEnabled) blocking.push("Required pilot features are not all enabled.");
  if (input.documentsEnabled && !input.storageOperational)
    blocking.push("Document review is enabled but storage is not operational.");
  if (input.externalProcessingEnabled && !input.consentDecisionMade)
    blocking.push("External AI processing is enabled but no consent decision has been recorded.");

  if (!input.hasBackupManager) warnings.push("No backup manager is assigned.");
  if (!input.baselineComplete) warnings.push("Baseline fields are incomplete.");
  if (!input.hasAuthorizationLimit) warnings.push("No repair authorization limit is configured.");

  // Targeted degradation — each flag disables only its own capability.
  const degradation: DegradationFlags = {
    blockApprovals: !input.hasPrimaryAuthorizedManager,
    blockAiCaseCreation: !input.hasPrimaryAuthorizedManager || !input.diagnosisAvailable,
    blockUploads: input.documentsEnabled && !input.storageOperational,
    blockNewPilotCases: !input.hasEnrolledVehicle,
    stopMetricCounting: !input.hasValidDates,
    manualDocumentMode: input.externalProcessingEnabled && !input.consentDecisionMade,
  };

  const state: ReadinessState =
    blocking.length > 0 ? "needs_attention" : warnings.length > 0 ? "optional" : "ready";

  return { state, blocking, warnings, degradation };
}
