export type AspectRatio = "landscape" | "vertical";

export type DurationKey = "30" | "60" | "90";

export type AudioProfile = "voiceover" | "autoplay" | "silent";

export type SceneKey =
  | "problem"
  | "productIntro"
  | "driverWorkflow"
  | "aiTriage"
  | "managerVisibility"
  | "outcome"
  | "cta";

export type ScreenshotAsset =
  | "desktopLogin"
  | "desktopMainDashboard"
  | "desktopFleetDashboard"
  | "desktopVehicleList"
  | "desktopVehicleProfile"
  | "desktopMaintenanceHistory"
  | "desktopOpenIssues"
  | "desktopAiDiagnosis"
  | "desktopManagerPriority"
  | "desktopCtaBackground"
  | "mobileDriverDashboard"
  | "mobileVehicleSelection"
  | "mobileInspection"
  | "mobileIssueReport"
  | "mobileSymptomEntry"
  | "mobileAiResult"
  | "mobileNextAction";

export type ScenePlan = {
  key: SceneKey;
  label: string;
  startFrame: number;
  durationInFrames: number;
  headline: string;
  body: string;
};

export type CaptionCue = {
  startMs: number;
  endMs: number;
  text: string;
};

export type VideoCompositionProps = {
  aspect: AspectRatio;
  durationKey: DurationKey;
  audioProfile?: AudioProfile;
  voiceoverSrc?: string | null;
  musicSrc?: string | null;
  showCaptions?: boolean;
};
