export type FitQuestion = {
  id: "fleetSize" | "challenge" | "reporting" | "maintenance" | "pilotInterest";
  question: string;
  options: string[];
  defaultAnswer: string;
};

export type ReadinessColumn = {
  title: "Ready" | "Monitor" | "Service Soon" | "Stop";
  tone: "ready" | "monitor" | "service" | "stop";
  units: { unit: string; issue?: string }[];
};

export const readinessColumns: ReadinessColumn[] = [
  {
    title: "Ready",
    tone: "ready",
    units: [{ unit: "Unit 102" }, { unit: "Unit 115" }, { unit: "Unit 140" }],
  },
  {
    title: "Monitor",
    tone: "monitor",
    units: [
      { unit: "Unit 118", issue: "Low battery voltage" },
      { unit: "Unit 031", issue: "Intermittent warning light" },
    ],
  },
  {
    title: "Service Soon",
    tone: "service",
    units: [
      { unit: "Unit 204", issue: "DEF no-restart warning" },
      { unit: "Unit 226", issue: "Inspection due" },
    ],
  },
  {
    title: "Stop",
    tone: "stop",
    units: [{ unit: "Unit 077", issue: "Brake warning reported" }],
  },
];

export const priorityActions = [
  {
    unit: "Unit 077",
    issue: "Brake warning reported",
    action: "Stop / Do Not Dispatch",
  },
  {
    unit: "Unit 204",
    issue: "DEF no-restart warning",
    action: "Service Soon",
  },
  {
    unit: "Unit 118",
    issue: "Low battery voltage",
    action: "Monitor",
  },
];

export const painPoints = [
  "Warning lights without clear next steps",
  "Driver issues reported through calls and texts",
  "Missed inspections or overdue service",
  "Repair history scattered across invoices and memory",
  "Trucks sitting while managers decide what to do",
  "Maintenance decisions made under dispatch pressure",
];

export const workflowSteps = [
  {
    title: "Driver reports the issue",
    body: "Drivers submit warning lights, symptoms, photos, videos, or voice notes in under 60 seconds.",
  },
  {
    title: "TruckFixr asks the right follow-up questions",
    body: "The system guides drivers to capture the details managers and repair teams need.",
  },
  {
    title: "Manager gets a readiness recommendation",
    body: "TruckFixr turns the report into a clear action: Ready, Monitor, Service Soon, or Stop.",
  },
  {
    title: "Outcome is captured",
    body: "After inspection or repair, the manager records what happened and uploads evidence.",
  },
  {
    title: "Future decisions improve",
    body: "Repair outcomes and fleet history help TruckFixr make better recommendations over time.",
  },
];

export const fitQuestions: FitQuestion[] = [
  {
    id: "fleetSize",
    question: "How many vehicles do you operate?",
    options: ["1-5", "6-20", "21-50", "51-100", "100+"],
    defaultAnswer: "6-20",
  },
  {
    id: "challenge",
    question: "What is your biggest maintenance challenge right now?",
    options: [
      "Warning lights without clear next steps",
      "Breakdowns and downtime",
      "Missed inspections",
      "Driver reporting gaps",
      "Repair delays",
      "Poor maintenance records",
    ],
    defaultAnswer: "Warning lights without clear next steps",
  },
  {
    id: "reporting",
    question: "How do drivers report issues today?",
    options: [
      "Phone call / text",
      "Paper DVIR",
      "ELD / telematics system",
      "Spreadsheet",
      "Maintenance software",
      "Informal / inconsistent",
    ],
    defaultAnswer: "Phone call / text",
  },
  {
    id: "maintenance",
    question: "How is maintenance handled?",
    options: ["In-house shop", "External repair shop", "Mixed", "Dealer", "Mobile mechanic"],
    defaultAnswer: "Mixed",
  },
  {
    id: "pilotInterest",
    question: "Would you test TruckFixr on 5-10 vehicles for 30 days?",
    options: ["Yes", "Maybe", "Not yet"],
    defaultAnswer: "Maybe",
  },
];

export const snapshotInsights = [
  "Driver issue visibility",
  "Warning-light triage",
  "Pre-dispatch maintenance decisions",
  "Repair outcome tracking",
  "Fleet readiness reporting",
];

export const recommendedPilotSetup = [
  "5-10 vehicles",
  "30 days",
  "Driver issue reporting",
  "Fleet Readiness Board",
  "AI-assisted triage",
  "Manager closeout",
  "End-of-pilot report",
];

export const optionalPilotAddOns = [
  "Telematics / ELD integration review",
  "Driver photo/video reporting",
  "Repair invoice upload",
  "Weekly pilot review",
  "Multi-location setup",
  "Shop coordination workflow",
];

export const pilotIncludes = [
  "Setup support",
  "Driver issue reporting workflow",
  "Fleet Readiness Board",
  "AI-assisted triage recommendations",
  "Ready / Monitor / Service Soon / Stop action categories",
  "Manager closeout and outcome tracking",
  "End-of-pilot readiness report",
];

export const proofCards = [
  {
    title: "Real repair workflow foundation",
    body: "Built from heavy-duty truck inspection, diagnosis, and repair operations.",
  },
  {
    title: "Early fleet validation",
    body: "Tested with small and mid-sized fleets through pilot use cases.",
  },
  {
    title: "Diagnostic intelligence loop",
    body: "Driver reports, warning signs, inspections, and repair outcomes help improve future recommendations.",
  },
  {
    title: "Designed for dispatch decisions",
    body: "Helps managers decide which vehicles are ready, which need monitoring, and which should not be dispatched.",
  },
  {
    title: "Works with existing maintenance partners",
    body: "Use TruckFixr with in-house shops, external repair providers, dealers, mobile mechanics, or current maintenance partners.",
  },
];

export const closeoutOutcomes = [
  "Truck dispatched safely",
  "Truck monitored",
  "Sent to shop",
  "Stopped / not dispatched",
  "Issue confirmed",
  "No fault found",
  "Repair completed",
  "Still unresolved",
];

export const evidenceOptions = [
  "Invoice",
  "Photo",
  "Shop note",
  "Driver update",
  "Repair cost estimate",
  "Downtime estimate",
];

export const supporters = [
  {
    name: "Black Founders Network",
    href: "https://www.blackfounders.network/",
    logoSrc: "/partner-bfn.svg",
    logoAlt: "Black Founders Network logo",
    logoClassName: "h-8 w-auto",
    logoWrapperClassName: "rounded-lg bg-slate-950 px-3 py-2",
  },
  {
    name: "DMZ",
    href: "https://www.dmzlaunchpad.ca/",
    logoSrc: "/partner-dmz.png",
    logoAlt: "DMZ logo",
    logoClassName: "h-7 w-auto",
    logoWrapperClassName: "rounded-lg bg-slate-100 px-3 py-2",
  },
];
