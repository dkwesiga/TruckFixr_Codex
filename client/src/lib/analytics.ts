type AnalyticsProperties = Record<string, unknown> | undefined;

// Opaque, anonymous per-browser id used only to stitch a funnel together. It is
// NOT a user identity and carries no PII. Persisted so a visitor's steps in one
// session correlate; regenerated if storage is unavailable.
const SESSION_STORAGE_KEY = "tfx_sid";

function getAnonymousSessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const existing = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `s_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    window.localStorage.setItem(SESSION_STORAGE_KEY, id);
    return id;
  } catch {
    return null;
  }
}

// Fire-and-forget the event to the privacy-first server endpoint. The server
// allowlists event names and redacts PII; this never throws or blocks the UI.
function sendServerEvent(eventName: string, properties?: AnalyticsProperties) {
  if (typeof window === "undefined") return;
  try {
    const payload = JSON.stringify({
      name: eventName,
      sessionId: getAnonymousSessionId(),
      path: window.location.pathname,
      properties: properties ?? {},
    });
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.sendBeacon === "function"
    ) {
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon("/api/events", blob);
      return;
    }
    void fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Analytics must never break the app.
  }
}

function logAnalyticsEvent(
  eventName: string,
  properties?: AnalyticsProperties
) {
  if (import.meta.env.DEV) {
    console.debug(`[Analytics] ${eventName}`, properties ?? {});
  }
}

/**
 * Analytics is intentionally a no-op in the MVP security build.
 * This keeps the app from loading extra client-side telemetry bundles
 * while preserving the same call sites across the app.
 */
export function initializeAnalytics() {
  return;
}

export function identifyUser(
  _userId: string,
  _properties?: AnalyticsProperties
) {
  return;
}

export function trackEvent(
  eventName: string,
  properties?: AnalyticsProperties
) {
  logAnalyticsEvent(eventName, properties);
  sendServerEvent(eventName, properties);
}

export function trackSignup(
  method: "oauth" | "email",
  properties?: AnalyticsProperties
) {
  trackEvent("user_signup", {
    signup_method: method,
    ...properties,
  });
}

export function trackLogin(
  method: "oauth" | "email",
  properties?: AnalyticsProperties
) {
  trackEvent("user_login", {
    login_method: method,
    ...properties,
  });
}

export function trackLogout() {
  trackEvent("user_logout");
}

export function trackFleetCreated(
  fleetId: number,
  properties?: AnalyticsProperties
) {
  trackEvent("fleet_created", {
    fleet_id: fleetId,
    ...properties,
  });
}

export function trackVehicleAdded(
  vehicleId: number,
  fleetId: number,
  properties?: AnalyticsProperties
) {
  trackEvent("vehicle_added", {
    vehicle_id: vehicleId,
    fleet_id: fleetId,
    ...properties,
  });
}

export function trackInspectionStarted(
  inspectionId: number,
  vehicleId: number,
  properties?: AnalyticsProperties
) {
  trackEvent("inspection_started", {
    inspection_id: inspectionId,
    vehicle_id: vehicleId,
    ...properties,
  });
}

export function trackInspectionSubmitted(
  inspectionId: number,
  defectCount: number,
  properties?: AnalyticsProperties
) {
  trackEvent("inspection_submitted", {
    inspection_id: inspectionId,
    defect_count: defectCount,
    ...properties,
  });
}

export function trackDefectCreated(
  defectId: number,
  severity: string,
  properties?: AnalyticsProperties
) {
  trackEvent("defect_created", {
    defect_id: defectId,
    severity,
    ...properties,
  });
}

export function trackDefectAction(
  defectId: number,
  action: string,
  properties?: AnalyticsProperties
) {
  trackEvent("defect_action", {
    defect_id: defectId,
    action,
    ...properties,
  });
}

export function trackOnboardingStepCompleted(
  stepName: string,
  properties?: AnalyticsProperties
) {
  trackEvent("onboarding_step_completed", {
    step_name: stepName,
    ...properties,
  });
}

export function trackFeatureAccessed(
  featureName: string,
  properties?: AnalyticsProperties
) {
  trackEvent("feature_accessed", {
    feature_name: featureName,
    ...properties,
  });
}

export function setUserProperties(properties: Record<string, unknown>) {
  logAnalyticsEvent("user_properties", properties);
}

export function incrementUserProperty(property: string, value: number = 1) {
  logAnalyticsEvent("user_property_increment", { property, value });
}
