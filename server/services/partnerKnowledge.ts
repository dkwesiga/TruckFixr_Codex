import { normalizeFaultCodeForLookup } from "./faultCodeReferences";

/**
 * Partner knowledge-base promotion (repair shop partner profile MVP).
 *
 * Pure, deterministic logic that turns a partner shop's confirmed repair
 * outcome into a `needs_review` fault-code reference candidate. This is the one
 * new bridge between Loop A (private per-fleet `repairOutcomes`) and Loop B (the
 * global curated `faultCodeReferences`). Only partner tenants may cross it, and
 * every candidate still flows through the existing `/admin/fault-codes`
 * needs_review -> approved curator gate before it can reach diagnosis.
 *
 * Two guards live here so the router stays thin and the rules stay tested:
 *  - eligibility (partner tenant, outcome owned by that tenant, not already
 *    promoted), and
 *  - a PII boundary that keeps customer/VIN specifics out of a record destined
 *    to become global, shared knowledge.
 */

export const RISK_LEVELS = ["low", "medium", "high", "critical"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export type PromotableOutcome = {
  id: number;
  fleetId: number | string;
  source?: string | null;
  confirmedFault: string;
  repairPerformed: string;
  repairNotes?: string | null;
  partsReplaced?: unknown;
  aiDiagnosisCorrect?: string | null;
  diagnosticCaseId?: string | null;
  promotedReferenceId?: number | null;
};

export type ReferenceDraft = {
  codeSystem: string;
  code: string;
  category: string;
  title: string;
  riskLevel: RiskLevel;
  recommendedChecks: string[];
  /** Optional extra generalizable notes; must not contain customer specifics. */
  summaryNotes?: string;
};

export type BuildReferenceCandidateInput = {
  fleetId: number | string;
  isPartnerFleet: boolean;
  outcome: PromotableOutcome;
  reference: ReferenceDraft;
  promotedByUserId: number;
};

export type ReferenceCandidate = {
  sourceId: null;
  codeSystem: string;
  code: string;
  normalizedCode: string;
  category: string;
  title: string;
  summary: string;
  recommendedChecks: string[];
  riskLevel: RiskLevel;
  reviewStatus: "needs_review";
  metadata: {
    originRepairOutcomeId: number;
    partnerFleetId: string;
    promotedByUserId: number;
    diagnosticCaseId: string | null;
    aiDiagnosisCorrect: string | null;
    partsReplaced: string[];
  };
};

export type BuildReferenceCandidateResult =
  | { ok: true; candidate: ReferenceCandidate }
  | {
      ok: false;
      error:
        | "not_partner"
        | "wrong_fleet"
        | "already_promoted"
        | "missing_fields"
        | "pii_detected";
      details?: string[];
    };

export function normalizePartsReplaced(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Lightweight PII detector. It is intentionally conservative — it flags the
 * shapes most likely to leak from a walk-in truck (VINs, emails, phone numbers,
 * long digit runs like plates/RO numbers) so the promote step blocks them
 * before they become shared knowledge. Curator review remains the backstop.
 */
export function detectLikelyPii(text: string): string[] {
  const found = new Set<string>();
  if (!text) return [];

  // VIN: 17 chars, no I/O/Q, must include at least one digit and one letter.
  const vinPattern = /\b(?=[A-HJ-NPR-Z0-9]*\d)(?=[A-HJ-NPR-Z0-9]*[A-HJ-NPR-Z])[A-HJ-NPR-Z0-9]{17}\b/gi;
  if (vinPattern.test(text)) found.add("vin");

  if (/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/.test(text)) found.add("email");

  // Phone: 10+ digits allowing separators, or a +country prefix.
  if (/(?:\+?\d[\s().-]?){10,}/.test(text)) found.add("phone");

  // Bare long digit run (plate / RO / customer id) not part of a fault code.
  if (/\b\d{7,}\b/.test(text)) found.add("long_number");

  return Array.from(found);
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

/**
 * Build a `needs_review` reference candidate from a partner's confirmed
 * outcome, or an error describing why the promotion is not allowed.
 */
export function buildReferenceCandidate(
  input: BuildReferenceCandidateInput
): BuildReferenceCandidateResult {
  if (!input.isPartnerFleet) {
    return { ok: false, error: "not_partner" };
  }

  if (String(input.outcome.fleetId) !== String(input.fleetId)) {
    return { ok: false, error: "wrong_fleet" };
  }

  if (input.outcome.promotedReferenceId != null) {
    return { ok: false, error: "already_promoted" };
  }

  const codeSystem = input.reference.codeSystem?.trim() ?? "";
  const code = input.reference.code?.trim() ?? "";
  const category = input.reference.category?.trim() ?? "";
  const title = input.reference.title?.trim() ?? "";
  const confirmedFault = input.outcome.confirmedFault?.trim() ?? "";
  const repairPerformed = input.outcome.repairPerformed?.trim() ?? "";

  const missing: string[] = [];
  if (!codeSystem) missing.push("codeSystem");
  if (!code) missing.push("code");
  if (!category) missing.push("category");
  if (!title) missing.push("title");
  if (!confirmedFault) missing.push("confirmedFault");
  if (!repairPerformed) missing.push("repairPerformed");
  if (!RISK_LEVELS.includes(input.reference.riskLevel)) missing.push("riskLevel");
  if (missing.length > 0) {
    return { ok: false, error: "missing_fields", details: missing };
  }

  const parts = normalizePartsReplaced(input.outcome.partsReplaced);
  const partsSummary = parts.length > 0 ? ` Parts commonly replaced: ${parts.join(", ")}.` : "";
  const notes = input.reference.summaryNotes?.trim() ?? "";
  const summary = truncate(
    [
      `Confirmed fault: ${confirmedFault}.`,
      `Confirmed fix: ${repairPerformed}.`,
      partsSummary.trim(),
      notes,
    ]
      .filter(Boolean)
      .join(" "),
    2_000
  );

  const recommendedChecks = (input.reference.recommendedChecks ?? [])
    .map((check) => check.trim())
    .filter(Boolean);

  // PII boundary: scan every user-entered field that would become global —
  // including code/codeSystem/category, where a pasted VIN or phone number
  // would otherwise slip through. Legitimate fault codes (SPN/FMI, DTCs) do
  // not match the VIN/phone/long-number patterns.
  const piiScanTargets = [codeSystem, code, category, title, summary, ...recommendedChecks].join(
    " \n "
  );
  const piiKinds = detectLikelyPii(piiScanTargets);
  if (piiKinds.length > 0) {
    return { ok: false, error: "pii_detected", details: piiKinds };
  }

  return {
    ok: true,
    candidate: {
      sourceId: null,
      codeSystem,
      code,
      normalizedCode: normalizeFaultCodeForLookup(code),
      category,
      title,
      summary,
      recommendedChecks,
      riskLevel: input.reference.riskLevel,
      reviewStatus: "needs_review",
      metadata: {
        originRepairOutcomeId: input.outcome.id,
        partnerFleetId: String(input.fleetId),
        promotedByUserId: input.promotedByUserId,
        diagnosticCaseId: input.outcome.diagnosticCaseId ?? null,
        aiDiagnosisCorrect: input.outcome.aiDiagnosisCorrect ?? null,
        partsReplaced: parts,
      },
    },
  };
}

/** Human-readable reason for a failed promotion, for API error messages. */
export function describePromotionError(
  error: Exclude<BuildReferenceCandidateResult, { ok: true }>["error"],
  details?: string[]
): string {
  switch (error) {
    case "not_partner":
      return "Only partner repair shops can promote outcomes to the knowledge base.";
    case "wrong_fleet":
      return "This repair outcome does not belong to your shop.";
    case "already_promoted":
      return "This outcome has already been proposed for the knowledge base.";
    case "missing_fields":
      return `Missing required reference fields: ${(details ?? []).join(", ")}.`;
    case "pii_detected":
      return `Remove customer-specific details (${(details ?? []).join(
        ", "
      )}) before promoting. Knowledge-base references must be generalizable.`;
    default:
      return "Unable to promote this outcome.";
  }
}
