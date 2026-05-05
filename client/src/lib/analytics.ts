type AnalyticsProperties = Record<string, unknown> | undefined;

function logAnalyticsEvent(eventName: string, properties?: AnalyticsProperties) {
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

export function identifyUser(_userId: string, _properties?: AnalyticsProperties) {
  return;
}

export function trackEvent(eventName: string, properties?: AnalyticsProperties) {
  logAnalyticsEvent(eventName, properties);
}

export function trackSignup(method: 'oauth' | 'email', properties?: AnalyticsProperties) {
  trackEvent('user_signup', {
    signup_method: method,
    ...properties,
  });
}

export function trackLogin(method: 'oauth' | 'email', properties?: AnalyticsProperties) {
  trackEvent('user_login', {
    login_method: method,
    ...properties,
  });
}

export function trackLogout() {
  trackEvent('user_logout');
}

export function trackFleetCreated(fleetId: number, properties?: AnalyticsProperties) {
  trackEvent('fleet_created', {
    fleet_id: fleetId,
    ...properties,
  });
}

export function trackVehicleAdded(vehicleId: number, fleetId: number, properties?: AnalyticsProperties) {
  trackEvent('vehicle_added', {
    vehicle_id: vehicleId,
    fleet_id: fleetId,
    ...properties,
  });
}

export function trackInspectionStarted(inspectionId: number, vehicleId: number, properties?: AnalyticsProperties) {
  trackEvent('inspection_started', {
    inspection_id: inspectionId,
    vehicle_id: vehicleId,
    ...properties,
  });
}

export function trackInspectionSubmitted(inspectionId: number, defectCount: number, properties?: AnalyticsProperties) {
  trackEvent('inspection_submitted', {
    inspection_id: inspectionId,
    defect_count: defectCount,
    ...properties,
  });
}

export function trackDefectCreated(defectId: number, severity: string, properties?: AnalyticsProperties) {
  trackEvent('defect_created', {
    defect_id: defectId,
    severity,
    ...properties,
  });
}

export function trackDefectAction(defectId: number, action: string, properties?: AnalyticsProperties) {
  trackEvent('defect_action', {
    defect_id: defectId,
    action,
    ...properties,
  });
}

export function trackOnboardingStepCompleted(stepName: string, properties?: AnalyticsProperties) {
  trackEvent('onboarding_step_completed', {
    step_name: stepName,
    ...properties,
  });
}

export function trackFeatureAccessed(featureName: string, properties?: AnalyticsProperties) {
  trackEvent('feature_accessed', {
    feature_name: featureName,
    ...properties,
  });
}

export function setUserProperties(properties: Record<string, unknown>) {
  logAnalyticsEvent('user_properties', properties);
}

export function incrementUserProperty(property: string, value: number = 1) {
  logAnalyticsEvent('user_property_increment', { property, value });
}
