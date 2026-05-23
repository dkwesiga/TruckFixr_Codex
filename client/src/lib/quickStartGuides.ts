export type QuickStartGuideSlug =
  | "driver"
  | "owner-operator"
  | "fleet-manager"
  | "fleet-owner";

export type QuickStartGuide = {
  slug: QuickStartGuideSlug;
  role: string;
  title: string;
  subtitle: string;
  audience: string;
  tone: "simple" | "practical" | "operational" | "executive";
  firstFiveMinutes: string[];
  setupChecklist: string[];
  dailyWorkflow: string[];
  keyFeatures: {
    title: string;
    description: string;
    actionLabel?: string;
    actionPath?: string;
    screenshotPlaceholder?: string;
  }[];
  permissions: {
    canDo: string[];
    cannotDo: string[];
  };
  safetyWarnings: string[];
  complianceNotes: string[];
  helpNotes: string[];
};

const commonSafetyWarnings = [
  "AI diagnostic guidance is decision support only. It does not replace professional repair advice, a qualified mechanic, certified inspections, or your legal responsibilities.",
  "Do not use AI diagnostics while actively driving. Stop in a safe location before entering symptoms, fault codes, photos, or notes.",
  "For brake, air system, steering, overheating, smoke, fuel leak, stop-engine, electrical burning smell, severe drivability, or unsafe loss-of-power issues, stop operation, report the issue, and seek qualified repair support.",
];

const commonComplianceNote =
  "TruckFixr Fleet AI helps support maintenance, inspection, diagnostic, and compliance workflows. It does not replace legal, regulatory, driver, carrier, mechanic, or certified inspection obligations. Always follow applicable Ontario/MTO requirements and company policies.";

// TODO: Route driver issue and maintenance actions to dedicated pages once those workflows exist outside the dashboards.
export const quickStartGuides: QuickStartGuide[] = [
  {
    slug: "driver",
    role: "Driver",
    title: "Driver Quick Start Guide",
    subtitle:
      "Use TruckFixr to confirm your assigned vehicle, complete inspections, report defects, and use AI diagnostics safely.",
    audience: "Drivers completing daily inspections and reporting vehicle issues.",
    tone: "simple",
    firstFiveMinutes: [
      "Confirm your profile details.",
      "Check your assigned vehicle.",
      "Review today's inspection requirement.",
      "Start an inspection if required.",
      "Report any issue before driving.",
    ],
    setupChecklist: [
      "Open Driver Mode and verify your name, email, and fleet connection.",
      "Confirm the truck or trailer assigned to you matches the unit you are operating.",
      "Request vehicle access if your assigned equipment is missing.",
      "Review open inspection or defect messages before dispatch.",
    ],
    dailyWorkflow: [
      "Before driving, open your assigned vehicle and complete the required inspection.",
      "Report defects honestly with symptoms, photos, fault codes, and notes.",
      "Use AI diagnostics only when parked safely.",
      "Follow fleet manager instructions for repairs, holds, or continued operation.",
    ],
    keyFeatures: [
      {
        title: "Assigned Vehicle",
        description: "See the truck or trailer your fleet manager has assigned to you.",
        actionLabel: "View Assigned Vehicle",
        actionPath: "/driver",
        screenshotPlaceholder: "[Screenshot: Driver dashboard showing assigned vehicle]",
      },
      {
        title: "Daily Inspection",
        description: "Complete a pre-trip or daily inspection and submit defects before operating.",
        actionLabel: "Start Inspection",
        actionPath: "/inspection",
        screenshotPlaceholder: "[Screenshot: Start inspection button]",
      },
      {
        title: "Defect Reporting",
        description: "Tell your fleet what is wrong with clear notes, photos, and symptoms.",
        actionLabel: "Report Issue",
        actionPath: "/driver",
        screenshotPlaceholder: "[Screenshot: Driver defect reporting panel]",
      },
      {
        title: "AI Diagnostics",
        description: "Enter symptoms and fault codes only after stopping in a safe location.",
        actionLabel: "Open AI Diagnostic",
        actionPath: "/diagnosis",
        screenshotPlaceholder: "[Screenshot: AI diagnosis result page]",
      },
    ],
    permissions: {
      canDo: [
        "View assigned vehicles.",
        "Complete inspections.",
        "Report defects and symptoms.",
        "Use AI diagnostics for assigned equipment when safely stopped.",
      ],
      cannotDo: [
        "Change company, billing, or subscription settings.",
        "Change vehicle ownership or fleet-wide records.",
        "Access other companies' fleet data.",
        "Override manager or owner instructions.",
      ],
    },
    safetyWarnings: commonSafetyWarnings,
    complianceNotes: [
      commonComplianceNote,
      "Drivers remain responsible for reporting defects and following company and regulatory inspection procedures.",
    ],
    helpNotes: [
      "Ask your fleet manager if an assigned vehicle is missing or incorrect.",
      "Use support resources if the app does not load your inspection or diagnostic workflow.",
    ],
  },
  {
    slug: "owner-operator",
    role: "Owner Operator",
    title: "Owner Operator Quick Start Guide",
    subtitle:
      "Set up your truck and trailer, complete inspections, run diagnostics, and track maintenance follow-up from one daily workflow.",
    audience: "Owner operators managing their own equipment and uptime.",
    tone: "practical",
    firstFiveMinutes: [
      "Confirm your account and company/profile setup.",
      "Add your truck.",
      "Add your trailer if applicable.",
      "Complete your first inspection.",
      "Run a diagnostic if you have an active issue.",
    ],
    setupChecklist: [
      "Confirm your profile and business details.",
      "Add your powered vehicle with VIN, plate, unit number, and maintenance details.",
      "Add trailer details if you operate with a trailer.",
      "Review reminders and active issues before your next trip.",
    ],
    dailyWorkflow: [
      "Open your dashboard before dispatch.",
      "Complete inspections and capture defects as soon as they appear.",
      "Run AI diagnostics for active symptoms or fault codes while parked safely.",
      "Review maintenance reminders and record follow-up work.",
    ],
    keyFeatures: [
      {
        title: "Vehicle Setup",
        description: "Add and maintain records for your own truck.",
        actionLabel: "Add Vehicle",
        actionPath: "/manager",
        screenshotPlaceholder: "[Screenshot: Add vehicle flow]",
      },
      {
        title: "Trailer Records",
        description: "Track trailer information alongside your truck when applicable.",
        actionLabel: "Add Trailer",
        actionPath: "/manager",
        screenshotPlaceholder: "[Screenshot: Trailer profile setup]",
      },
      {
        title: "Inspections",
        description: "Keep inspection records current before and after trips.",
        actionLabel: "Start Inspection",
        actionPath: "/inspection",
        screenshotPlaceholder: "[Screenshot: Owner operator inspection checklist]",
      },
      {
        title: "Diagnostics and Reminders",
        description: "Use AI diagnostics and review maintenance follow-up to protect uptime.",
        actionLabel: "Run AI Diagnostic",
        actionPath: "/diagnosis",
        screenshotPlaceholder: "[Screenshot: AI diagnostic intake for owner operator]",
      },
      {
        title: "Maintenance Follow-up",
        description: "Use reminders and open issues to plan repairs before downtime grows.",
        actionLabel: "Review Maintenance Reminders",
        actionPath: "/manager",
        screenshotPlaceholder: "[Screenshot: Maintenance reminders list]",
      },
    ],
    permissions: {
      canDo: [
        "Manage your own trucks and trailers.",
        "Complete inspections for your equipment.",
        "Run AI diagnostics for your equipment.",
        "Track defects, reminders, and maintenance follow-up.",
      ],
      cannotDo: [
        "Access other companies' fleet data.",
        "Treat AI diagnostics as certified repair or inspection approval.",
        "Ignore company, regulatory, or certified inspection obligations.",
      ],
    },
    safetyWarnings: commonSafetyWarnings,
    complianceNotes: [
      commonComplianceNote,
      "Use TruckFixr as a compliance-support record and reminder tool, not as legal advice or a replacement for required certified inspections.",
    ],
    helpNotes: [
      "Use the profile and dashboard areas to keep your equipment and subscription details current.",
      "Contact TruckFixr support if vehicle setup, inspections, or diagnostics do not match your workflow.",
    ],
  },
  {
    slug: "fleet-manager",
    role: "Fleet Manager",
    title: "Fleet Manager Quick Start Guide",
    subtitle:
      "Coordinate drivers, assignments, inspections, open defects, diagnostics, and maintenance follow-up.",
    audience: "Managers running daily fleet maintenance and driver workflows.",
    tone: "operational",
    firstFiveMinutes: [
      "Confirm your fleet/company profile.",
      "Review current vehicle list.",
      "Review active drivers.",
      "Assign vehicles to drivers.",
      "Check for overdue inspections or open defects.",
    ],
    setupChecklist: [
      "Review the company profile and active vehicle list.",
      "Invite or confirm drivers.",
      "Assign trucks and trailers to drivers.",
      "Review inspection, defect, and diagnostic queues.",
    ],
    dailyWorkflow: [
      "Start with the fleet dashboard and scan for overdue inspections.",
      "Review open defects and safety-critical issues.",
      "Check AI diagnostic reports and decide the next operational action.",
      "Create or update maintenance follow-up items and escalate major issues to the fleet owner.",
    ],
    keyFeatures: [
      {
        title: "Driver Management",
        description: "Invite drivers and keep the active driver list current.",
        actionLabel: "Add Driver",
        actionPath: "/profile",
        screenshotPlaceholder: "[Screenshot: Fleet manager driver invitation screen]",
      },
      {
        title: "Vehicle Assignment",
        description: "Assign trucks and trailers so drivers only see relevant equipment.",
        actionLabel: "Assign Vehicle",
        actionPath: "/manager",
        screenshotPlaceholder: "[Screenshot: Fleet manager vehicle assignment screen]",
      },
      {
        title: "Inspection Review",
        description: "Review submitted inspections and respond to defects quickly.",
        actionLabel: "Review Inspections",
        actionPath: "/manager",
        screenshotPlaceholder: "[Screenshot: Manager inspection review list]",
      },
      {
        title: "Defects and Diagnostics",
        description: "Monitor open defects and AI diagnostic reports to prioritize repairs.",
        actionLabel: "Review Open Defects",
        actionPath: "/manager",
        screenshotPlaceholder: "[Screenshot: Open defect and diagnostic queue]",
      },
      {
        title: "Maintenance Follow-up",
        description: "Schedule or track repairs and preventive work.",
        actionLabel: "Schedule Maintenance",
        actionPath: "/manager",
        screenshotPlaceholder: "[Screenshot: Maintenance follow-up card]",
      },
    ],
    permissions: {
      canDo: [
        "Manage daily fleet workflow.",
        "Assign vehicles.",
        "Review inspections.",
        "Monitor defects.",
        "Create or update maintenance follow-up items.",
      ],
      cannotDo: [
        "Change company ownership unless existing app permissions allow it.",
        "Manage billing or subscription unless existing app permissions allow it.",
        "Delete the company account.",
        "Override fleet owner-level settings.",
      ],
    },
    safetyWarnings: commonSafetyWarnings,
    complianceNotes: [
      commonComplianceNote,
      "Managers should use TruckFixr to support disciplined follow-up, documentation, and escalation, not to replace certified inspection or carrier obligations.",
    ],
    helpNotes: [
      "Escalate safety-critical or repeated defects to the fleet owner.",
      "Use support resources if driver assignment, inspection review, or diagnostic queues appear out of sync.",
    ],
  },
  {
    slug: "fleet-owner",
    role: "Fleet Owner",
    title: "Fleet Owner Quick Start Guide",
    subtitle:
      "Get company-level visibility into fleet health, compliance status, uptime risk, users, vehicles, and subscription control.",
    audience: "Owners accountable for company setup, operations visibility, and subscription management.",
    tone: "executive",
    firstFiveMinutes: [
      "Confirm company setup.",
      "Review subscription/vehicle limit.",
      "Add or confirm vehicles.",
      "Invite fleet manager or drivers.",
      "Open fleet dashboard and review inspection/compliance status.",
    ],
    setupChecklist: [
      "Confirm company name, contact details, and subscription status.",
      "Review active vehicle count and plan limits.",
      "Invite managers and drivers.",
      "Open the dashboard to review inspection, defect, and compliance signals.",
    ],
    dailyWorkflow: [
      "Review fleet health and compliance status.",
      "Monitor inspection completion and open defect trends.",
      "Check downtime risk and hold managers/drivers accountable for follow-up.",
      "Use subscription and vehicle limits to keep the account aligned with fleet size.",
    ],
    keyFeatures: [
      {
        title: "Fleet Dashboard",
        description: "View company-level fleet health, defects, and inspection status.",
        actionLabel: "View Fleet Dashboard",
        actionPath: "/manager",
        screenshotPlaceholder: "[Screenshot: Fleet owner dashboard showing fleet health and compliance status]",
      },
      {
        title: "Team Setup",
        description: "Invite managers and drivers so work is assigned to the right people.",
        actionLabel: "Invite Manager",
        actionPath: "/profile",
        screenshotPlaceholder: "[Screenshot: Invite manager form]",
      },
      {
        title: "Driver Training",
        description: "Use the driver guide to standardize inspection and defect reporting expectations.",
        actionLabel: "Invite Driver",
        actionPath: "/profile",
        screenshotPlaceholder: "[Screenshot: Driver invite and training resources]",
      },
      {
        title: "Vehicles and Compliance",
        description: "Manage vehicles, review compliance status, and track uptime risk.",
        actionLabel: "Manage Vehicles",
        actionPath: "/manager",
        screenshotPlaceholder: "[Screenshot: Vehicles and compliance status table]",
      },
      {
        title: "Subscription",
        description: "Review plan, billing, and vehicle limits when supported by your account.",
        actionLabel: "Manage Subscription",
        actionPath: "/pricing",
        screenshotPlaceholder: "[Screenshot: Subscription and vehicle limit settings]",
      },
    ],
    permissions: {
      canDo: [
        "Manage the company account.",
        "Manage users.",
        "Manage fleet vehicles.",
        "Review all fleet activity.",
        "Manage subscription and billing if the app supports it.",
        "View company-level reports.",
      ],
      cannotDo: [
        "Access other companies' fleet data.",
        "Treat AI diagnostics as legal or certified inspection replacement.",
        "Ignore regulatory duties or certified inspection requirements.",
      ],
    },
    safetyWarnings: commonSafetyWarnings,
    complianceNotes: [
      commonComplianceNote,
      "Owners should use TruckFixr as a fleet intelligence layer for visibility and accountability, not as legal compliance advice.",
    ],
    helpNotes: [
      "Use the manager and driver guides as training references for your team.",
      "Contact TruckFixr support for subscription, account, or company setup issues.",
    ],
  },
];

export function getQuickStartGuide(slug?: string | null) {
  return quickStartGuides.find((guide) => guide.slug === slug) ?? null;
}

export function getGuideSlugForRole(role?: string | null): QuickStartGuideSlug | null {
  switch (role) {
    case "driver":
      return "driver";
    case "owner_operator":
      return "owner-operator";
    case "manager":
    case "fleet_manager":
      return "fleet-manager";
    case "owner":
    case "fleet_owner":
    case "company_owner":
    case "admin":
      return "fleet-owner";
    default:
      return null;
  }
}

export function getQuickStartGuideForRole(role?: string | null) {
  return getQuickStartGuide(getGuideSlugForRole(role));
}

export function getMyGuidePath() {
  return "/quick-start-guides/my-guide";
}
