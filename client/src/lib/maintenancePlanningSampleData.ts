/**
 * Sample (non-production) data + lightweight heuristics for the internal,
 * feature-flagged Maintenance Planning area.
 *
 * IMPORTANT: The compliance values here are CLEARLY-LABELED SAMPLE DATA. The
 * vehicle schema does not yet store inspection-expiry / annual / semi-annual
 * dates (see the proposed schema change in the PR summary), so the compliance
 * widget is illustrative only. This data is never written to the database and
 * is only rendered behind VITE_ENABLE_MAINTENANCE_PLANNING for owner/manager
 * users. Pending Issues themselves use REAL defect data via tRPC.
 */

export type ComplianceState = "current" | "due_soon" | "overdue";

export type SampleCompliance = {
  isSample: true;
  dailyInspection: "complete" | "missing";
  annualInspectionDate: string; // human-readable, sample
  annualDaysRemaining: number;
  semiAnnualInspectionDate: string | null;
  semiAnnualDaysRemaining: number | null;
  state: ComplianceState;
};

// A small rotation of realistic sample compliance scenarios. These are mapped
// deterministically onto whatever real vehicles exist so the widget is
// demonstrable without inventing fake vehicles.
const SAMPLE_COMPLIANCE_SCENARIOS: Omit<SampleCompliance, "isSample">[] = [
  {
    dailyInspection: "complete",
    annualInspectionDate: "in 21 days",
    annualDaysRemaining: 21,
    semiAnnualInspectionDate: "in 113 days",
    semiAnnualDaysRemaining: 113,
    state: "due_soon",
  },
  {
    dailyInspection: "missing",
    annualInspectionDate: "in 96 days",
    annualDaysRemaining: 96,
    semiAnnualInspectionDate: null,
    semiAnnualDaysRemaining: null,
    state: "due_soon",
  },
  {
    dailyInspection: "complete",
    annualInspectionDate: "in 168 days",
    annualDaysRemaining: 168,
    semiAnnualInspectionDate: "in 12 days",
    semiAnnualDaysRemaining: 12,
    state: "due_soon",
  },
  {
    dailyInspection: "complete",
    annualInspectionDate: "5 days ago",
    annualDaysRemaining: -5,
    semiAnnualInspectionDate: null,
    semiAnnualDaysRemaining: null,
    state: "overdue",
  },
  {
    dailyInspection: "complete",
    annualInspectionDate: "in 240 days",
    annualDaysRemaining: 240,
    semiAnnualInspectionDate: "in 58 days",
    semiAnnualDaysRemaining: 58,
    state: "current",
  },
];

/**
 * Deterministically pick a sample compliance scenario for a vehicle, so the
 * same vehicle always shows the same sample values within a session.
 */
export function getSampleComplianceForVehicle(
  vehicleId: string,
  index: number
): SampleCompliance {
  const slot =
    SAMPLE_COMPLIANCE_SCENARIOS[index % SAMPLE_COMPLIANCE_SCENARIOS.length];
  return { isSample: true, ...slot };
}

export type BundlingLabel =
  | "Fix Now"
  | "Bundle With Next Service"
  | "Monitor"
  | "Do Not Operate";

export type DefectLike = {
  severity?: string | null;
  status?: string | null;
  safetyRelated?: boolean | null;
  isBlockingOperationally?: boolean | null;
};

/**
 * Lightweight, transparent heuristic that turns a vehicle's open defects plus
 * its (sample) compliance state into a single suggested planning action. This
 * is a planning suggestion only — it is intentionally simple and is NOT a
 * safety determination or a guarantee. Final judgment stays with the fleet and
 * its qualified technicians.
 */
export function recommendBundlingLabel(
  defects: DefectLike[],
  compliance: SampleCompliance
): { label: BundlingLabel; rationale: string } {
  const openDefects = defects.filter(
    (d) => d.status !== "resolved" && d.status !== "dismissed"
  );

  const hasBlocking = openDefects.some(
    (d) =>
      d.isBlockingOperationally === true ||
      (d.safetyRelated === true && d.severity === "critical")
  );
  if (hasBlocking || compliance.state === "overdue") {
    return {
      label: "Do Not Operate",
      rationale:
        compliance.state === "overdue"
          ? "Inspection appears overdue (sample) and/or a blocking safety defect is open. Confirm before dispatch."
          : "A blocking or critical safety defect is open. Confirm before dispatch.",
    };
  }

  const hasHighSeverity = openDefects.some(
    (d) => d.severity === "high" || d.severity === "critical"
  );

  if (compliance.state === "due_soon" && openDefects.length > 0) {
    return {
      label: "Bundle With Next Service",
      rationale: `Inspection due soon (sample) with ${openDefects.length} open issue${
        openDefects.length === 1 ? "" : "s"
      } — consider one planned shop visit.`,
    };
  }

  if (hasHighSeverity) {
    return {
      label: "Fix Now",
      rationale: "A high-severity issue is open and should be addressed soon.",
    };
  }

  if (openDefects.length > 0) {
    return {
      label: "Monitor",
      rationale: "Open issues are low/medium severity — keep monitoring.",
    };
  }

  return {
    label: "Monitor",
    rationale: "No open issues. Keep monitoring upcoming inspection dates.",
  };
}
