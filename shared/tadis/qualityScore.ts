// Configurable, explainable evidence-quality scoring for TADIS knowledge
// records (§14). Deliberately a single weighted table instead of constants
// scattered across the app — tune QUALITY_SCORE_WEIGHTS in one place.
//
// Not all Outcomes are equal: a record's score reflects how much a future
// technician could trust it, not how much it cost or how recently it
// happened. Financial/downtime impact (see roiImpact.ts) is intentionally
// NEVER part of this score.

import type { EvidenceSource, OutcomeState, VerificationMethod } from "./outcomeLifecycle";

export type QualityScoreInput = {
  vinDecoded: boolean;
  vehicleIdentityComplete: boolean; // make + model + year at minimum
  engineInfoPresent: boolean;
  complaintDocumented: boolean;
  symptomsDocumented: boolean;
  faultCodesCaptured: boolean;
  photoOrDocEvidencePresent: boolean;
  diagnosticFindingsDocumented: boolean;
  rootCauseDocumented: boolean;
  repairPerformed: boolean;
  partsDocumented: boolean;
  verificationMethod: VerificationMethod | null;
  technicianVerified: boolean; // an authorized technician (not self-report) verified
  outcomeState: OutcomeState;
  evidenceSource: EvidenceSource;
  recordOrigin: "live" | "historical_import";
  repeatFailureWithinWindow: boolean | null; // null = unknown
};

export type QualityScoreFactor = {
  key: string;
  label: string;
  earnedPoints: number;
  maxPoints: number;
  met: boolean;
};

export type QualityScoreResult = {
  score: number; // 0-100
  tier: "low" | "moderate" | "strong" | "confirmed";
  factors: QualityScoreFactor[];
  explanation: string[];
};

// Every weight lives here. Sum of base factor weights is 100 before the
// historical/self-reported caps are applied.
export const QUALITY_SCORE_WEIGHTS = {
  vinDecoded: 6,
  vehicleIdentityComplete: 6,
  engineInfoPresent: 4,
  complaintDocumented: 6,
  symptomsDocumented: 8,
  faultCodesCaptured: 8,
  photoOrDocEvidencePresent: 6,
  diagnosticFindingsDocumented: 8,
  rootCauseDocumented: 10,
  repairPerformed: 8,
  partsDocumented: 4,
  verificationMethodPresent: 10,
  technicianVerified: 10,
  outcomeConfirmedBonus: 6,
} as const;

// A historical import starts with real evidence stripped down to whatever
// survived in the source document — cap the achievable score so it can never
// look as trustworthy as a live, closed-loop case with the same checklist.
export const HISTORICAL_IMPORT_SCORE_CAP = 70;
// Customer-reported (not shop-verified) evidence caps trust even lower,
// regardless of how many fields happen to be filled in.
export const CUSTOMER_REPORTED_SCORE_CAP = 55;

const TIER_BANDS: Array<{ min: number; tier: QualityScoreResult["tier"] }> = [
  { min: 85, tier: "confirmed" },
  { min: 65, tier: "strong" },
  { min: 40, tier: "moderate" },
  { min: 0, tier: "low" },
];

export function scoreOutcomeEvidence(input: QualityScoreInput): QualityScoreResult {
  const w = QUALITY_SCORE_WEIGHTS;
  const factors: QualityScoreFactor[] = [
    { key: "vinDecoded", label: "VIN decoded", met: input.vinDecoded, maxPoints: w.vinDecoded, earnedPoints: input.vinDecoded ? w.vinDecoded : 0 },
    { key: "vehicleIdentityComplete", label: "Vehicle identity complete", met: input.vehicleIdentityComplete, maxPoints: w.vehicleIdentityComplete, earnedPoints: input.vehicleIdentityComplete ? w.vehicleIdentityComplete : 0 },
    { key: "engineInfoPresent", label: "Engine information present", met: input.engineInfoPresent, maxPoints: w.engineInfoPresent, earnedPoints: input.engineInfoPresent ? w.engineInfoPresent : 0 },
    { key: "complaintDocumented", label: "Complaint documented", met: input.complaintDocumented, maxPoints: w.complaintDocumented, earnedPoints: input.complaintDocumented ? w.complaintDocumented : 0 },
    { key: "symptomsDocumented", label: "Symptoms documented", met: input.symptomsDocumented, maxPoints: w.symptomsDocumented, earnedPoints: input.symptomsDocumented ? w.symptomsDocumented : 0 },
    { key: "faultCodesCaptured", label: "Fault codes captured", met: input.faultCodesCaptured, maxPoints: w.faultCodesCaptured, earnedPoints: input.faultCodesCaptured ? w.faultCodesCaptured : 0 },
    { key: "photoOrDocEvidencePresent", label: "Photo/document evidence present", met: input.photoOrDocEvidencePresent, maxPoints: w.photoOrDocEvidencePresent, earnedPoints: input.photoOrDocEvidencePresent ? w.photoOrDocEvidencePresent : 0 },
    { key: "diagnosticFindingsDocumented", label: "Diagnostic findings documented", met: input.diagnosticFindingsDocumented, maxPoints: w.diagnosticFindingsDocumented, earnedPoints: input.diagnosticFindingsDocumented ? w.diagnosticFindingsDocumented : 0 },
    { key: "rootCauseDocumented", label: "Root cause documented", met: input.rootCauseDocumented, maxPoints: w.rootCauseDocumented, earnedPoints: input.rootCauseDocumented ? w.rootCauseDocumented : 0 },
    { key: "repairPerformed", label: "Repair performed", met: input.repairPerformed, maxPoints: w.repairPerformed, earnedPoints: input.repairPerformed ? w.repairPerformed : 0 },
    { key: "partsDocumented", label: "Parts documented", met: input.partsDocumented, maxPoints: w.partsDocumented, earnedPoints: input.partsDocumented ? w.partsDocumented : 0 },
    { key: "verificationMethodPresent", label: "Verification method recorded", met: input.verificationMethod != null, maxPoints: w.verificationMethodPresent, earnedPoints: input.verificationMethod != null ? w.verificationMethodPresent : 0 },
    { key: "technicianVerified", label: "Authorized technician verified", met: input.technicianVerified, maxPoints: w.technicianVerified, earnedPoints: input.technicianVerified ? w.technicianVerified : 0 },
    { key: "outcomeConfirmedBonus", label: "Outcome confirmed over time", met: input.outcomeState === "confirmed", maxPoints: w.outcomeConfirmedBonus, earnedPoints: input.outcomeState === "confirmed" ? w.outcomeConfirmedBonus : 0 },
  ];

  let rawScore = factors.reduce((sum, factor) => sum + factor.earnedPoints, 0);

  // A known repeat failure within the confirmation window is strong negative
  // evidence against the record's trustworthiness as a "this worked" example,
  // even though the record itself is kept (it becomes negative evidence, see
  // retrieval ranking) rather than deleted.
  if (input.repeatFailureWithinWindow === true) {
    rawScore = Math.round(rawScore * 0.5);
  }
  if (input.outcomeState === "failed") {
    // A failed outcome's "quality" describes how trustworthy the negative
    // evidence is, not whether the repair worked — cap it below "confirmed".
    rawScore = Math.min(rawScore, 80);
  }

  const explanation: string[] = [];
  let cap = 100;
  if (input.recordOrigin === "historical_import") {
    cap = Math.min(cap, HISTORICAL_IMPORT_SCORE_CAP);
    explanation.push(
      `Historical import: score capped at ${HISTORICAL_IMPORT_SCORE_CAP} regardless of checklist completeness.`
    );
  }
  if (input.evidenceSource === "customer_reported" || input.evidenceSource === "unknown") {
    cap = Math.min(cap, CUSTOMER_REPORTED_SCORE_CAP);
    explanation.push(
      `Evidence source is ${input.evidenceSource}, not shop-verified: score capped at ${CUSTOMER_REPORTED_SCORE_CAP}.`
    );
  }

  const score = Math.max(0, Math.min(cap, Math.round(rawScore)));

  let tier = TIER_BANDS.find((band) => score >= band.min)?.tier ?? "low";
  // Never claim "confirmed" tier language unless the Outcome itself reached
  // the Confirmed state — avoids false precision from an accumulated score.
  if (tier === "confirmed" && input.outcomeState !== "confirmed") {
    tier = "strong";
  }

  for (const factor of factors) {
    if (!factor.met) explanation.push(`Missing: ${factor.label}.`);
  }

  return { score, tier, factors, explanation };
}
