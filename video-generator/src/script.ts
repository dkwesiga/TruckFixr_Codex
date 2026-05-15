import type {AspectRatio, DurationKey, ScenePlan, ScreenshotAsset} from "./types";

export const FPS = 30;

export const brandNarrative = {
  subtitle:
    "TruckFixr Fleet AI helps fleets turn inspections, driver reports, fault symptoms, and maintenance history into faster maintenance decisions.",
  cta: "Start a TruckFixr Fleet AI pilot.",
};

export const voiceoverScripts: Record<DurationKey, string> = {
  "30": `Commercial fleet maintenance is too often scattered across driver messages, inspections, phone calls, and repair notes.

TruckFixr Fleet AI brings it into one intelligent workflow.

Drivers report issues. TruckFixr analyzes symptoms, fault codes, inspections, and vehicle history. Managers see what needs attention and act faster.

Built from real commercial truck repair experience, TruckFixr helps fleets improve visibility, strengthen inspection follow-up, and reduce preventable downtime.

Start a TruckFixr Fleet AI pilot.`,
  "60": `Commercial fleets lose time and money when maintenance decisions are scattered across phone calls, paper inspections, driver messages, and mechanic memory.

A warning light appears. A driver reports a defect. A manager has to decide fast: keep moving, schedule service, or pull the vehicle off the road.

TruckFixr Fleet AI brings those signals into one intelligent maintenance workflow.

Built from real commercial truck repair experience, TruckFixr helps fleets turn inspections, driver reports, fault symptoms, and maintenance history into faster repair decisions.

Drivers can submit inspections, report issues, and capture symptoms from the road.

Instead of loose messages and incomplete notes, every issue becomes structured maintenance information.

TruckFixr analyzes symptoms, fault codes, inspection results, and vehicle history to help prioritize the next step.

It helps managers understand what may be urgent, what can be monitored, and what should be sent for repair.

Fleet managers get a clearer view of vehicle condition, open issues, repair history, and maintenance priorities.

Drivers report issues. Managers act faster. Repair teams receive better information.

The result is better visibility, faster decisions, stronger inspection follow-up, and fewer preventable surprises.

Start a TruckFixr Fleet AI pilot and turn daily fleet issues into faster maintenance decisions.`,
  "90": `Commercial fleets lose time and money when maintenance decisions are reactive.

A driver reports a defect. A warning light comes on. An inspection is missed. A repair note gets buried in a text message. By the time the issue becomes urgent, the fleet may already be facing downtime.

TruckFixr Fleet AI helps fleets manage those signals before they turn into preventable breakdowns.

Built from real commercial truck repair experience, TruckFixr turns inspections, driver reports, fault symptoms, and maintenance history into a structured maintenance workflow.

Drivers can complete inspections, report defects, and submit symptoms from the road.

Fleet managers can see open issues, vehicle status, maintenance history, and repair priorities in one place.

TruckFixr’s AI helps triage reported issues by reviewing symptoms, fault codes, inspection results, and previous maintenance records.

That helps managers decide what needs immediate attention, what can be monitored, and what should be sent for repair.

Instead of relying on scattered messages and memory, fleets get clearer information, better follow-up, and faster maintenance decisions.

Drivers report issues. Managers act faster. Repair teams receive better information. Fleet owners gain visibility across their vehicles.

TruckFixr Fleet AI is built for commercial fleets that want fewer surprises, stronger inspection discipline, and better control over maintenance decisions.

Start a TruckFixr Fleet AI pilot and turn daily fleet issues into faster maintenance decisions.`,
};

type SceneSeed = {
  key: ScenePlan["key"];
  label: string;
  headline: string;
  body: string;
  seconds: number;
};

const sceneSeeds: Record<DurationKey, SceneSeed[]> = {
  "30": [
    {
      key: "problem",
      label: "Fleet Pain",
      headline: "Fleet maintenance is still too scattered.",
      body: "Messages, inspections, warning lights, and repair notes often live in different places.",
      seconds: 4,
    },
    {
      key: "productIntro",
      label: "Product Intro",
      headline: "Meet TruckFixr Fleet AI.",
      body: "One workflow for field reports, inspections, and maintenance decisions.",
      seconds: 4,
    },
    {
      key: "driverWorkflow",
      label: "Driver Workflow",
      headline: "Drivers report issues from the road.",
      body: "Inspections, defects, and symptoms become structured maintenance information.",
      seconds: 6,
    },
    {
      key: "aiTriage",
      label: "AI Triage",
      headline: "AI reviews symptoms, fault codes, and history.",
      body: "TruckFixr helps sort what looks urgent from what can be monitored.",
      seconds: 6,
    },
    {
      key: "managerVisibility",
      label: "Manager Visibility",
      headline: "Managers see what needs attention and act faster.",
      body: "Priority, vehicle status, and next steps show up in one place.",
      seconds: 5,
    },
    {
      key: "outcome",
      label: "Outcome",
      headline: "Better visibility. Better follow-up. Less preventable downtime.",
      body: "Built for practical fleet operations, not hype.",
      seconds: 3,
    },
    {
      key: "cta",
      label: "CTA",
      headline: "Start a TruckFixr Fleet AI pilot.",
      body: "Turn daily fleet issues into faster maintenance decisions.",
      seconds: 2,
    },
  ],
  "60": [
    {
      key: "problem",
      label: "Fleet Pain",
      headline: "Fleet maintenance is still too scattered.",
      body: "Commercial fleets juggle warning lights, phone calls, paper inspections, texts, and mechanic memory.",
      seconds: 6,
    },
    {
      key: "productIntro",
      label: "Product Intro",
      headline: "Meet TruckFixr Fleet AI.",
      body: "A practical maintenance workflow built from real truck repair experience.",
      seconds: 6,
    },
    {
      key: "driverWorkflow",
      label: "Driver Workflow",
      headline: "Drivers submit inspections and report issues.",
      body: "Symptoms, photos, and notes move from loose messages into structured fleet information.",
      seconds: 9,
    },
    {
      key: "aiTriage",
      label: "AI Triage",
      headline: "AI triages symptoms, fault codes, and history.",
      body: "TruckFixr helps managers decide what may be urgent, what can be monitored, and what should be sent for repair.",
      seconds: 11,
    },
    {
      key: "managerVisibility",
      label: "Manager Visibility",
      headline: "Managers see priority, status, and next steps.",
      body: "Dashboards, vehicle context, and maintenance history are visible in one place.",
      seconds: 10,
    },
    {
      key: "outcome",
      label: "Outcome",
      headline: "Faster decisions. Better follow-up. Less preventable downtime.",
      body: "Drivers report issues, managers act faster, and repair teams receive better information.",
      seconds: 7,
    },
    {
      key: "cta",
      label: "CTA",
      headline: "Start a TruckFixr Fleet AI pilot.",
      body: "Turn daily fleet issues into faster maintenance decisions.",
      seconds: 5,
    },
  ],
  "90": [
    {
      key: "problem",
      label: "Fleet Pain",
      headline: "Reactive maintenance creates preventable downtime.",
      body: "Defects, missed inspections, and buried repair notes all slow down maintenance decisions.",
      seconds: 12,
    },
    {
      key: "productIntro",
      label: "Product Intro",
      headline: "TruckFixr brings those signals into one workflow.",
      body: "Built for commercial fleets that need operational clarity instead of more scattered communication.",
      seconds: 12,
    },
    {
      key: "driverWorkflow",
      label: "Driver Workflow",
      headline: "Drivers complete inspections, report defects, and submit symptoms from the road.",
      body: "That creates structured maintenance information the rest of the team can actually act on.",
      seconds: 14,
    },
    {
      key: "aiTriage",
      label: "AI Triage",
      headline: "TruckFixr’s AI reviews symptoms, fault codes, inspection results, and maintenance history.",
      body: "That helps separate issues that need immediate attention from those that can be monitored or scheduled.",
      seconds: 18,
    },
    {
      key: "managerVisibility",
      label: "Manager Visibility",
      headline: "Fleet managers see open issues, vehicle status, repair history, and priorities in one place.",
      body: "The workflow supports stronger follow-up and faster decision-making across the fleet.",
      seconds: 16,
    },
    {
      key: "outcome",
      label: "Outcome",
      headline: "Fewer surprises. Stronger inspection discipline. Better control over maintenance decisions.",
      body: "Better information helps owners, dispatchers, managers, and repair teams stay aligned.",
      seconds: 11,
    },
    {
      key: "cta",
      label: "CTA",
      headline: "Start a TruckFixr Fleet AI pilot.",
      body: "Turn daily fleet issues into faster maintenance decisions.",
      seconds: 7,
    },
  ],
};

export const screenshotLibrary: Record<ScreenshotAsset, string> = {
  desktopLogin: "screenshots/desktop/01-login-screen.png",
  desktopMainDashboard: "screenshots/desktop/02-main-dashboard.png",
  desktopFleetDashboard: "screenshots/desktop/03-fleet-dashboard.png",
  desktopVehicleList: "screenshots/desktop/04-vehicle-list.png",
  desktopVehicleProfile: "screenshots/desktop/05-vehicle-profile.png",
  desktopMaintenanceHistory: "screenshots/desktop/06-maintenance-history.png",
  desktopOpenIssues: "screenshots/desktop/07-open-issues-defects.png",
  desktopAiDiagnosis: "screenshots/desktop/08-ai-diagnosis-result.png",
  desktopManagerPriority: "screenshots/desktop/09-manager-action-priority-view.png",
  desktopCtaBackground: "screenshots/desktop/10-cta-dashboard-clean.png",
  mobileDriverDashboard: "screenshots/mobile/01-driver-dashboard.png",
  mobileVehicleSelection: "screenshots/mobile/02-vehicle-selection.png",
  mobileInspection: "screenshots/mobile/03-digital-inspection-screen.png",
  mobileIssueReport: "screenshots/mobile/04-issue-report-screen.png",
  mobileSymptomEntry: "screenshots/mobile/05-symptom-entry-screen.png",
  mobileAiResult: "screenshots/mobile/06-ai-diagnosis-triage-result.png",
  mobileNextAction: "screenshots/mobile/07-recommended-next-action-screen.png",
};

export const brandAssets = {
  logo: "brand/truckfixr-logo.png",
  logoSquare: "brand/truckfixr-logo-square.png",
};

export const sceneShotPreferences: Record<
  ScenePlan["key"],
  Record<AspectRatio, ScreenshotAsset[]>
> = {
  problem: {
    landscape: ["desktopLogin", "desktopOpenIssues", "desktopManagerPriority"],
    vertical: ["mobileDriverDashboard", "mobileIssueReport", "mobileAiResult"],
  },
  productIntro: {
    landscape: ["desktopMainDashboard", "desktopFleetDashboard"],
    vertical: ["mobileDriverDashboard", "mobileVehicleSelection"],
  },
  driverWorkflow: {
    landscape: ["desktopFleetDashboard", "desktopVehicleList", "desktopVehicleProfile"],
    vertical: ["mobileDriverDashboard", "mobileInspection", "mobileIssueReport"],
  },
  aiTriage: {
    landscape: ["desktopAiDiagnosis", "desktopOpenIssues"],
    vertical: ["mobileSymptomEntry", "mobileAiResult", "mobileNextAction"],
  },
  managerVisibility: {
    landscape: ["desktopMainDashboard", "desktopVehicleProfile", "desktopMaintenanceHistory", "desktopManagerPriority"],
    vertical: ["mobileAiResult", "mobileNextAction", "desktopManagerPriority"],
  },
  outcome: {
    landscape: ["desktopFleetDashboard", "desktopVehicleList", "desktopMaintenanceHistory"],
    vertical: ["mobileDriverDashboard", "mobileAiResult", "mobileNextAction"],
  },
  cta: {
    landscape: ["desktopCtaBackground"],
    vertical: ["mobileAiResult"],
  },
};

export const safeLabels = {
  fleet: "Brampton Transit Inc.",
  manager: "Demo Fleet Manager",
  driver: "Demo Driver",
  units: ["Vehicle Unit 104", "Vehicle Unit 207", "Vehicle Unit 315"],
};

export function secondsToFrames(seconds: number) {
  return Math.round(seconds * FPS);
}

export function getScenePlan(durationKey: DurationKey): ScenePlan[] {
  let cursor = 0;
  return sceneSeeds[durationKey].map((seed) => {
    const durationInFrames = secondsToFrames(seed.seconds);
    const plan: ScenePlan = {
      ...seed,
      startFrame: cursor,
      durationInFrames,
    };
    cursor += durationInFrames;
    return plan;
  });
}

export function getTotalFrames(durationKey: DurationKey) {
  return getScenePlan(durationKey).reduce((sum, scene) => sum + scene.durationInFrames, 0);
}

export function getCompositionId(durationKey: DurationKey, aspect: AspectRatio) {
  const label = aspect === "landscape" ? "Landscape" : "Vertical";
  return `Explainer${durationKey}${label}`;
}
