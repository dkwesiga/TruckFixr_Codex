import { and, inArray } from "drizzle-orm";
import { faultCodeReferences } from "../../drizzle/schema";
import { getDb } from "../db";

export type FaultCodePattern =
  | "SPN_FMI"
  | "MID_PID_SID_FMI"
  | "OBD_DTC"
  | "ABS"
  | "transmission"
  | "aftertreatment"
  | "derate_shutdown"
  | "oil_pressure"
  | "coolant_temperature"
  | "brake_air"
  | "no_start"
  | "electrical_fire";

export type FaultCodeReferenceMatchStatus =
  | "none"
  | "approved_match"
  | "needs_review_internal"
  | "no_match";

export type FaultCodeReferenceContext = {
  match_status: FaultCodeReferenceMatchStatus;
  references: Array<{
    id: number;
    code: string;
    code_system: string;
    category: string;
    title: string;
    summary: string;
    recommended_checks: string[];
    risk_level: string;
    review_status: string;
    source_id: number | null;
  }>;
};

export type DiagnosticPreprocessingResult = {
  detectedPatterns: FaultCodePattern[];
  extractedFaultCodes: string[];
  normalizedFaultCodes: string[];
  referenceLookupRequired: boolean;
  safetySignals: string[];
};

const SPN_FMI_PATTERN = /\bSPN\s*[:#-]?\s*(\d{2,6})\s*(?:,|\s|-)*FMI\s*[:#-]?\s*(\d{1,2})\b/gi;
const MID_PID_SID_FMI_PATTERN =
  /\bMID\s*[:#-]?\s*(\d{1,3}).{0,16}\b(?:PID|SID)\s*[:#-]?\s*(\d{1,4}).{0,16}\bFMI\s*[:#-]?\s*(\d{1,2})\b/gi;
const OBD_DTC_PATTERN = /\b[PCBU][0-3][0-9A-F]{3}\b/gi;

const PATTERN_RULES: Array<{
  pattern: FaultCodePattern;
  regex: RegExp;
  safety?: boolean;
}> = [
  { pattern: "derate_shutdown", regex: /\b(?:derate|shutdown countdown|limp mode|reduced power)\b/i, safety: true },
  { pattern: "aftertreatment", regex: /\b(?:aftertreatment|emissions?|DEF|SCR|DPF|regen|NOx)\b/i },
  { pattern: "ABS", regex: /\b(?:ABS|wheel speed sensor|tone ring)\b/i, safety: true },
  { pattern: "brake_air", regex: /\b(?:brake|air pressure|low air|air leak|brake pedal)\b/i, safety: true },
  { pattern: "oil_pressure", regex: /\b(?:oil pressure|low oil|oil light)\b/i, safety: true },
  { pattern: "coolant_temperature", regex: /\b(?:coolant temp|overheat|overheating|hot engine|coolant.*oil|oil.*coolant|milky oil)\b/i, safety: true },
  { pattern: "transmission", regex: /\b(?:transmission|gear|shift|clutch|driveline)\b/i },
  { pattern: "no_start", regex: /\b(?:no[- ]?start|crank no start|won't start|will not start)\b/i },
  { pattern: "electrical_fire", regex: /\b(?:electrical smoke|burning smell|wire smoke|fire|sparks)\b/i, safety: true },
];

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export function normalizeFaultCodeForLookup(value: string) {
  const normalized = normalizeCode(value);
  const spn = normalized.match(/\bSPN (\d{2,6}) FMI (\d{1,2})\b/);
  if (spn) return `SPN ${spn[1]} FMI ${spn[2]}`;

  const mid = normalized.match(/\bMID (\d{1,3}) (PID|SID) (\d{1,4}) FMI (\d{1,2})\b/);
  if (mid) return `MID ${mid[1]} ${mid[2]} ${mid[3]} FMI ${mid[4]}`;

  const dtc = normalized.match(/\b[PCBU][0-3][0-9A-F]{3}\b/);
  if (dtc) return dtc[0];

  return normalized;
}

export function preprocessDiagnosticInput(input: {
  symptoms: string;
  faultCodes?: string[];
}): DiagnosticPreprocessingResult {
  const text = [input.symptoms, ...(input.faultCodes ?? [])].join(" ");
  const extractedFaultCodes: string[] = [];
  const detectedPatterns: FaultCodePattern[] = [];

  SPN_FMI_PATTERN.lastIndex = 0;
  let spnMatch: RegExpExecArray | null;
  while ((spnMatch = SPN_FMI_PATTERN.exec(text)) !== null) {
    extractedFaultCodes.push(`SPN ${spnMatch[1]} FMI ${spnMatch[2]}`);
    detectedPatterns.push("SPN_FMI");
  }

  MID_PID_SID_FMI_PATTERN.lastIndex = 0;
  let midMatch: RegExpExecArray | null;
  while ((midMatch = MID_PID_SID_FMI_PATTERN.exec(text)) !== null) {
    extractedFaultCodes.push(`MID ${midMatch[1]} PID/SID ${midMatch[2]} FMI ${midMatch[3]}`);
    detectedPatterns.push("MID_PID_SID_FMI");
  }

  OBD_DTC_PATTERN.lastIndex = 0;
  let dtcMatch: RegExpExecArray | null;
  while ((dtcMatch = OBD_DTC_PATTERN.exec(text)) !== null) {
    extractedFaultCodes.push(dtcMatch[0].toUpperCase());
    detectedPatterns.push("OBD_DTC");
  }

  for (const rule of PATTERN_RULES) {
    if (rule.regex.test(text)) {
      detectedPatterns.push(rule.pattern);
    }
  }

  const normalizedFaultCodes = unique(
    [...(input.faultCodes ?? []), ...extractedFaultCodes].map(normalizeFaultCodeForLookup)
  );
  const safetySignals = PATTERN_RULES
    .filter((rule) => rule.safety && rule.regex.test(text))
    .map((rule) => rule.pattern);

  return {
    detectedPatterns: unique(detectedPatterns) as FaultCodePattern[],
    extractedFaultCodes: unique(extractedFaultCodes),
    normalizedFaultCodes,
    referenceLookupRequired:
      normalizedFaultCodes.length > 0 ||
      detectedPatterns.some((pattern) =>
        [
          "SPN_FMI",
          "MID_PID_SID_FMI",
          "OBD_DTC",
          "ABS",
          "transmission",
          "aftertreatment",
          "derate_shutdown",
          "oil_pressure",
          "coolant_temperature",
          "brake_air",
        ].includes(pattern)
      ),
    safetySignals,
  };
}

function recommendedChecksFromJson(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").slice(0, 6)
    : [];
}

export async function lookupFaultCodeReferences(input: {
  normalizedFaultCodes: string[];
  includeNeedsReview?: boolean;
}): Promise<FaultCodeReferenceContext> {
  if (input.normalizedFaultCodes.length === 0) {
    return { match_status: "none", references: [] };
  }

  const db = await getDb();
  if (!db) {
    return { match_status: "no_match", references: [] };
  }

  try {
    const allowedStatuses = input.includeNeedsReview
      ? ["approved", "needs_review"]
      : ["approved"];
    const rows = await db
      .select()
      .from(faultCodeReferences)
      .where(
        and(
          inArray(faultCodeReferences.normalizedCode, input.normalizedFaultCodes),
          inArray(faultCodeReferences.reviewStatus, allowedStatuses)
        )
      )
      .limit(8);

    const approved = rows.filter((row) => row.reviewStatus === "approved");
    const references = (input.includeNeedsReview ? rows : approved).map((row) => ({
      id: row.id,
      code: row.code,
      code_system: row.codeSystem,
      category: row.category,
      title: row.title,
      summary: row.summary,
      recommended_checks: recommendedChecksFromJson(row.recommendedChecks),
      risk_level: row.riskLevel,
      review_status: row.reviewStatus,
      source_id: row.sourceId ?? null,
    }));

    if (approved.length > 0) {
      return { match_status: "approved_match", references };
    }

    if (rows.length > 0 && input.includeNeedsReview) {
      return { match_status: "needs_review_internal", references };
    }

    return { match_status: "no_match", references: [] };
  } catch (error) {
    console.warn("[FaultCodeReferences] lookup failed:", error);
    return { match_status: "no_match", references: [] };
  }
}
