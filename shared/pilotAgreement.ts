// Centralized, PROVISIONAL pilot agreement copy (§30–§31). Legal-sensitive text
// lives here so it can be reviewed and versioned in one place. This is provisional
// and subject to Ontario legal review before broad public rollout.

export const PILOT_AGREEMENT_VERSION = "2026-07-provisional-1";

export const PILOT_AGREEMENT_TERMS: string[] = [
  "30-day assisted pilot for up to five (5) vehicles.",
  "One-time fee of CAD $99. One pilot per fleet.",
  "At least three genuine vehicle cases are expected during the pilot.",
  "No integration is required.",
  "Human review is provided for qualifying escalations (not every case is reviewed by a technician).",
  "A weekly summary and a final outcome review are included.",
  "The CAD $99 fee is credited toward your first monthly subscription if you continue within 14 days after the pilot ends.",
];

export const PILOT_AGREEMENT_DISCLAIMERS: string[] = [
  "TruckFixr provides decision support only. It does not replace inspection, diagnosis, or the judgment of a qualified technician, and does not provide roadworthiness certification.",
  "TruckFixr is not an emergency service and does not provide emergency dispatch, roadside assistance, or continuous monitoring.",
  "Operational and marketing communications are separate. Marketing consent is optional.",
];

// Separated consents captured with the agreement (§30). None are preselected.
export const PILOT_CONSENTS = [
  { key: "pilotTerms", label: "I accept the pilot terms above.", required: true },
  { key: "outcomeMeasurement", label: "I consent to outcome measurement for this pilot.", required: true },
  { key: "caseStudy", label: "TruckFixr may use anonymized results as a case study.", required: false },
  { key: "marketing", label: "Send me occasional TruckFixr product news (marketing).", required: false },
] as const;

export type PilotConsentKey = (typeof PILOT_CONSENTS)[number]["key"];
