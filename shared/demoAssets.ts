export type DemoCaptureEnvironment = "local" | "staging" | "demo";

export type DemoDiagnosisCaseKey = "abs_warning" | "def_derate" | "air_leak";

export type DemoDiagnosisResult = {
  next_action: "proceed" | "ask_question";
  risk_level: "low" | "medium" | "high";
  confidence_score: number;
  confidence_rationale: string[];
  compliance_impact: string;
  top_most_likely_cause: string;
  driver_action: string;
  driver_action_reason: string;
  risk_summary: string;
  systems_affected: string[];
  recommended_fix: string;
  recommended_tests: string[];
  possible_replacement_parts: string[];
  confirm_before_replacement: boolean;
  diagnostic_verification_labor_hours: { min: number; max: number };
  repair_labor_hours: { min: number; max: number };
  total_estimated_labor_hours: { min: number; max: number };
  possible_causes: Array<{ cause: string; probability: number }>;
  final_llm_ranking: Array<{
    cause_id: string;
    cause_name: string;
    probability: number;
    evidence_summary: string[];
    ranking_rationale: string;
    is_new_cause?: boolean;
    cause_library_fit_score?: number;
  }>;
  maintenance_recommendations: string[];
  llm_status: "ok";
  fallback_used: boolean;
  fallback_reason: string | null;
  question_rationale?: string | null;
  clarifying_question?: string | null;
  driver_message: string;
  manager_summary: string;
  distance_or_time_limit?: string | null;
};

export type DemoDiagnosisCase = {
  key: DemoDiagnosisCaseKey;
  label: string;
  symptom: string;
  faultCodes: string[];
  warningLights: string[];
  result: DemoDiagnosisResult;
};

export type DemoFleetSeed = {
  fleetName: string;
  companyEmail: string;
  companyPhone: string;
  address: string;
  inviteCode: string;
  ownerEmail: string;
  managerEmail: string;
  driverEmail: string;
  password: string;
  poweredVehicleCount: number;
  trailerCount: number;
};

export const DEMO_FLEET_SEED: DemoFleetSeed = {
  fleetName: "Brampton Transit Inc.",
  companyEmail: "info@bramptontransit.example",
  companyPhone: "905-555-0144",
  address: "10 Demo Logistics Way, Brampton, ON",
  inviteCode: "BRAMPTON55",
  ownerEmail: "demo.owner@bramptontransit.example",
  managerEmail: "demo.manager@bramptontransit.example",
  driverEmail: "demo.driver@bramptontransit.example",
  password: "TruckFixrDemo!2026",
  poweredVehicleCount: 55,
  trailerCount: 18,
};

export const DEMO_DIAGNOSIS_CASES: Record<DemoDiagnosisCaseKey, DemoDiagnosisCase> = {
  abs_warning: {
    key: "abs_warning",
    label: "ABS warning light",
    symptom: "ABS warning light stays on after start-up",
    faultCodes: ["C1234"],
    warningLights: ["ABS"],
    result: {
      next_action: "proceed",
      risk_level: "medium",
      confidence_score: 87,
      confidence_rationale: [
        "ABS warning and wheel-speed behavior match a sensor signal issue more than a braking hydraulic failure.",
        "The condition is still driveable to a depot, but extended dispatch should wait until the ABS module is scanned.",
      ],
      compliance_impact: "Attention required before long-haul dispatch.",
      top_most_likely_cause: "Wheel speed sensor signal loss",
      driver_action: "Inspect sensor wiring and scan ABS module before dispatching on a long route.",
      driver_action_reason:
        "The braking system appears usable, but the ABS lamp suggests the truck should not be assigned to extended service until the fault is checked.",
      risk_summary:
        "Vehicle can return to depot if braking feels normal, but it should not be assigned to an extended route until inspected.",
      systems_affected: ["ABS", "Wheel speed sensors", "Brake control"],
      recommended_fix: "Inspect sensor wiring and scan the ABS module before dispatching on a long route.",
      recommended_tests: [
        "Inspect wheel speed sensor wiring and connectors for rub-through or corrosion.",
        "Scan the ABS module and clear codes only after the fault is confirmed repaired.",
        "Check the affected wheel for damaged tone ring or sensor gap issues.",
      ],
      possible_replacement_parts: [
        "Wheel speed sensor",
        "Sensor harness",
        "ABS connector pigtail",
      ],
      confirm_before_replacement: true,
      diagnostic_verification_labor_hours: { min: 0.5, max: 1 },
      repair_labor_hours: { min: 0.5, max: 1.5 },
      total_estimated_labor_hours: { min: 1, max: 2.5 },
      possible_causes: [
        { cause: "Wheel speed sensor signal loss", probability: 87 },
        { cause: "Damaged sensor wiring or connector", probability: 69 },
        { cause: "ABS module communication fault", probability: 42 },
      ],
      final_llm_ranking: [
        {
          cause_id: "wheel_speed_sensor_signal_loss",
          cause_name: "Wheel speed sensor signal loss",
          probability: 87,
          evidence_summary: [
            "ABS light present after start-up.",
            "No hydraulic brake failure symptoms were described.",
            "Sensor-related faults are the most common cause in this pattern.",
          ],
          ranking_rationale:
            "The symptom pattern fits a sensor-level issue more strongly than a system-wide brake fault.",
          is_new_cause: true,
        },
        {
          cause_id: "sensor_wiring_damage",
          cause_name: "Damaged sensor wiring or connector",
          probability: 69,
          evidence_summary: [
            "Intermittent light behavior can come from vibration or harness damage.",
            "Connector faults often present alongside sensor signal loss.",
          ],
          ranking_rationale: "A close second because it produces the same warning profile.",
        },
        {
          cause_id: "abs_module_comm_fault",
          cause_name: "ABS module communication fault",
          probability: 42,
          evidence_summary: [
            "Module faults are possible but less common than sensor or wiring issues.",
          ],
          ranking_rationale: "Lower probability until wiring and sensor checks are completed.",
        },
      ],
      maintenance_recommendations: [
        "Rescan the ABS module after wiring checks.",
        "Verify wheel speed sensor gap and tone ring condition.",
        "Document the fault before clearing codes.",
      ],
      llm_status: "ok",
      fallback_used: false,
      fallback_reason: null,
      driver_message:
        "The truck can return to the depot if braking feels normal, but it should not be assigned to a long route until the ABS fault is checked.",
      manager_summary:
        "ABS warning likely traces to wheel speed sensor signal loss; verify wiring, scan the module, and confirm before dispatch.",
    },
  },
  def_derate: {
    key: "def_derate",
    label: "DEF / emissions derate warning",
    symptom: "DEF warning light with reduced power message",
    faultCodes: ["SPN 1761"],
    warningLights: ["DEF", "Check Engine"],
    result: {
      next_action: "proceed",
      risk_level: "high",
      confidence_score: 82,
      confidence_rationale: [
        "The derate warning and emissions light pattern point to an SCR or DEF quality issue.",
        "Repeated ignition cycles can worsen the event if the fault is active.",
      ],
      compliance_impact: "Do not dispatch on a revenue route until derate risk is assessed.",
      top_most_likely_cause: "Possible DEF quality sensor or SCR fault",
      driver_action: "Prioritize diagnostic scan and avoid repeated ignition cycles.",
      driver_action_reason:
        "The vehicle may enter or deepen derate if the emissions fault remains active, so it should be inspected before dispatch.",
      risk_summary:
        "A derate condition can limit road speed and create a missed-load risk if ignored.",
      systems_affected: ["Aftertreatment", "DEF system", "SCR"],
      recommended_fix: "Scan the aftertreatment system and verify DEF quality, level, and sensor readings.",
      recommended_tests: [
        "Check DEF level and quality with a service tool.",
        "Scan SCR and aftertreatment fault codes for stored or active emissions faults.",
        "Inspect DEF dosing and sensor data before clearing codes.",
      ],
      possible_replacement_parts: [
        "DEF quality sensor",
        "SCR sensor",
        "DEF injector",
      ],
      confirm_before_replacement: true,
      diagnostic_verification_labor_hours: { min: 0.75, max: 1.25 },
      repair_labor_hours: { min: 1, max: 3 },
      total_estimated_labor_hours: { min: 1.75, max: 4.25 },
      possible_causes: [
        { cause: "Possible DEF quality sensor or SCR fault", probability: 82 },
        { cause: "DEF contamination or incorrect fluid", probability: 61 },
        { cause: "Aftertreatment dosing or sensor data fault", probability: 48 },
      ],
      final_llm_ranking: [
        {
          cause_id: "def_quality_sensor_scr_fault",
          cause_name: "Possible DEF quality sensor or SCR fault",
          probability: 82,
          evidence_summary: [
            "DEF warning and reduced-power messaging are present.",
            "The emissions system is the first place to verify when a derate warning appears.",
          ],
          ranking_rationale:
            "Most consistent with a derate-producing emissions system fault.",
          is_new_cause: true,
        },
        {
          cause_id: "def_contamination",
          cause_name: "DEF contamination or incorrect fluid",
          probability: 61,
          evidence_summary: [
            "Contamination often produces the same derate behavior as sensor faults.",
          ],
          ranking_rationale: "Common alternate cause worth checking before replacing parts.",
        },
        {
          cause_id: "aftertreatment_dosing_fault",
          cause_name: "Aftertreatment dosing or sensor data fault",
          probability: 48,
          evidence_summary: [
            "A dosing issue can escalate to a full derate if left unresolved.",
          ],
          ranking_rationale: "Lower than the quality sensor path but still relevant to verify.",
        },
      ],
      maintenance_recommendations: [
        "Check the DEF tank and sensor readings.",
        "Document any contamination signs before refilling.",
        "Avoid repeated restarts until the scan is complete.",
      ],
      llm_status: "ok",
      fallback_used: false,
      fallback_reason: null,
      driver_message:
        "Do not dispatch on a revenue route until the derate risk is assessed by a scan.",
      manager_summary:
        "DEF warning indicates a high-risk emissions fault; scan immediately and confirm DEF quality before continued service.",
    },
  },
  air_leak: {
    key: "air_leak",
    label: "Air brake leak",
    symptom: "Air pressure drops too quickly after shutdown",
    faultCodes: ["B1000"],
    warningLights: ["Air Pressure"],
    result: {
      next_action: "proceed",
      risk_level: "high",
      confidence_score: 91,
      confidence_rationale: [
        "The pressure drop pattern fits a service brake air line or fitting leak.",
        "The vehicle should not be sent into service until the air system is inspected.",
      ],
      compliance_impact: "Remove from service until the leak is repaired.",
      top_most_likely_cause: "Service brake air line or fitting leak",
      driver_action: "Remove from service and inspect air system immediately.",
      driver_action_reason:
        "Air pressure that cannot build or hold creates a critical braking safety issue.",
      risk_summary:
        "Do not drive if air pressure cannot build or hold.",
      systems_affected: ["Air brake system", "Service air lines", "Fittings and chambers"],
      recommended_fix: "Inspect the air system immediately and repair the leak before the vehicle returns to service.",
      recommended_tests: [
        "Soap-test the air lines, fittings, and chambers for leaks.",
        "Check the governor cut-in and cut-out behavior after repairs.",
        "Confirm air pressure holds with the engine off before release.",
      ],
      possible_replacement_parts: [
        "Air line fitting",
        "Service brake hose",
        "Brake chamber diaphragm",
      ],
      confirm_before_replacement: true,
      diagnostic_verification_labor_hours: { min: 0.75, max: 1.25 },
      repair_labor_hours: { min: 1, max: 2.5 },
      total_estimated_labor_hours: { min: 1.75, max: 3.75 },
      possible_causes: [
        { cause: "Service brake air line or fitting leak", probability: 91 },
        { cause: "Brake chamber diaphragm leak", probability: 63 },
        { cause: "Compressor or governor fault", probability: 37 },
      ],
      final_llm_ranking: [
        {
          cause_id: "service_brake_air_line_fitting_leak",
          cause_name: "Service brake air line or fitting leak",
          probability: 91,
          evidence_summary: [
            "Rapid pressure loss strongly matches a line or fitting leak.",
            "Safety risk is immediate when air cannot hold pressure.",
          ],
          ranking_rationale:
            "This is the most direct explanation for the observed pressure loss.",
          is_new_cause: true,
        },
        {
          cause_id: "brake_chamber_leak",
          cause_name: "Brake chamber diaphragm leak",
          probability: 63,
          evidence_summary: [
            "Chamber leaks can produce the same pressure decay pattern.",
          ],
          ranking_rationale: "A likely alternate source if lines test clean.",
        },
        {
          cause_id: "compressor_governor_fault",
          cause_name: "Compressor or governor fault",
          probability: 37,
          evidence_summary: [
            "A supply-side fault is possible, but line leakage is still more common.",
          ],
          ranking_rationale: "Lower probability until leak checks are completed.",
        },
      ],
      maintenance_recommendations: [
        "Remove the unit from service until the leak is repaired.",
        "Pressure-test the air system after repair.",
        "Document the leak location in the maintenance log.",
      ],
      llm_status: "ok",
      fallback_used: false,
      fallback_reason: null,
      driver_message:
        "Do not drive if air pressure cannot build or hold.",
      manager_summary:
        "Air leak is a critical service brake concern; inspect the air system immediately and hold the unit from dispatch.",
    },
  },
};

export function getDemoDiagnosisCase(key: string | null | undefined) {
  if (key === "abs_warning" || key === "def_derate" || key === "air_leak") {
    return DEMO_DIAGNOSIS_CASES[key];
  }
  return null;
}

export function isDemoCaptureEnvironment(value: string | null | undefined): value is DemoCaptureEnvironment {
  return value === "local" || value === "staging" || value === "demo";
}

export function resolveDemoCaptureEnvironment(): DemoCaptureEnvironment {
  const explicit = process.env.DEMO_CAPTURE_ENV?.trim().toLowerCase();
  if (isDemoCaptureEnvironment(explicit)) return explicit;
  return "local";
}

export function assertSafeDemoMode() {
  const environment = resolveDemoCaptureEnvironment();
  if (!environment) {
    throw new Error("DEMO_CAPTURE_ENV is required and must be local, staging, or demo.");
  }

  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_PRODUCTION_SEED !== "true") {
    throw new Error("Demo capture is blocked in production unless ALLOW_DEMO_PRODUCTION_SEED=true is set.");
  }
}

export function assertSafeDemoDatabaseTarget() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for demo seeding.");
  }

  let hostname = "";
  try {
    hostname = new URL(databaseUrl).hostname.toLowerCase();
  } catch {
    throw new Error("DATABASE_URL is invalid.");
  }

  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!localHosts.has(hostname) && process.env.ALLOW_DEMO_REMOTE_SEED !== "true") {
    throw new Error(
      "Demo seeding is blocked for remote DATABASE_URL targets unless ALLOW_DEMO_REMOTE_SEED=true is set."
    );
  }
}

export function getDemoBaseUrl() {
  const environment = resolveDemoCaptureEnvironment();
  const baseUrl =
    environment === "staging"
      ? process.env.STAGING_BASE_URL?.trim()
      : process.env.LOCAL_BASE_URL?.trim() || process.env.APP_BASE_URL?.trim() || "http://localhost:3000";

  if (!baseUrl) {
    throw new Error("Unable to resolve a demo capture base URL.");
  }

  return baseUrl.replace(/\/+$/, "");
}

export function makeDemoVin(index: number) {
  return `1HGBH41JXMN${String(index).padStart(6, "0")}`;
}

export function makeDemoPlate(index: number) {
  return `BT-${String(index).padStart(4, "0")}`;
}

export function makeDemoUnitNumber(index: number) {
  return `BRM-${String(index).padStart(3, "0")}`;
}

export function makeDemoVehicleId(index: number) {
  return `demo-brampton-${String(index).padStart(3, "0")}`;
}

export function buildPlaceholderSvgDataUri(label: string) {
  const safeLabel = label.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
    <rect width="1200" height="900" fill="#f8fafc"/>
    <rect x="80" y="80" width="1040" height="740" rx="40" fill="#ffffff" stroke="#dbe4f0" stroke-width="8"/>
    <text x="600" y="410" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="54" font-weight="700" fill="#0f172a">${safeLabel}</text>
    <text x="600" y="480" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="#475569">TruckFixr demo proof photo</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
