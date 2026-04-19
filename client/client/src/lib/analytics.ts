import posthog from 'posthog-js';

/**
 * Initialize PostHog analytics
 * Called once on app startup
 */
export function initializeAnalytics() {
  const apiKey = import.meta.env.VITE_POSTHOG_API_KEY;
  const apiHost = import.meta.env.VITE_POSTHOG_API_HOST || 'https://us.posthog.com';

  if (!apiKey) {
    console.warn('[Analytics] PostHog API key not configured');
    return;
  }

  posthog.init(apiKey, {
    api_host: apiHost,
    loaded: (ph) => {
      console.log('[Analytics] PostHog initialized');
    },
  });
}

/**
 * Identify a user for analytics tracking
 */
export function identifyUser(userId: string, properties?: Record<string, any>) {
  posthog.identify(userId, {
    ...properties,
  });
}

/**
 * Track a custom event
 */
export function trackEvent(eventName: string, properties?: Record<string, any>) {
  posthog.capture(eventName, properties);
}

/**
 * Track user signup event
 */
export function trackSignup(method: 'oauth' | 'email', properties?: Record<string, any>) {
  trackEvent('user_signup', {
    signup_method: method,
    ...properties,
  });
}

/**
 * Track user login event
 */
export function trackLogin(method: 'oauth' | 'email', properties?: Record<string, any>) {
  trackEvent('user_login', {
    login_method: method,
    ...properties,
  });
}

/**
 * Track user logout event
 */
export function trackLogout() {
  trackEvent('user_logout');
  posthog.reset();
}

/**
 * Track fleet creation
 */
export function trackFleetCreated(fleetId: number, properties?: Record<string, any>) {
  trackEvent('fleet_created', {
    fleet_id: fleetId,
    ...properties,
  });
}

/**
 * Track vehicle/truck added to fleet
 */
export function trackVehicleAdded(vehicleId: number, fleetId: number, properties?: Record<string, any>) {
  trackEvent('vehicle_added', {
    vehicle_id: vehicleId,
    fleet_id: fleetId,
    ...properties,
  });
}

/**
 * Track inspection started
 */
export function trackInspectionStarted(inspectionId: number, vehicleId: number, properties?: Record<string, any>) {
  trackEvent('inspection_started', {
    inspection_id: inspectionId,
    vehicle_id: vehicleId,
    ...properties,
  });
}

/**
 * Track inspection submitted
 */
export function trackInspectionSubmitted(inspectionId: number, defectCount: number, properties?: Record<string, any>) {
  trackEvent('inspection_submitted', {
    inspection_id: inspectionId,
    defect_count: defectCount,
    ...properties,
  });
}

/**
 * Track defect created
 */
export function trackDefectCreated(defectId: number, severity: string, properties?: Record<string, any>) {
  trackEvent('defect_created', {
    defect_id: defectId,
    severity,
    ...properties,
  });
}

/**
 * Track defect action (acknowledge, assign, resolve)
 */
export function trackDefectAction(defectId: number, action: string, properties?: Record<string, any>) {
  trackEvent('defect_action', {
    defect_id: defectId,
    action,
    ...properties,
  });
}

/**
 * Track onboarding step completion
 */
export function trackOnboardingStepCompleted(stepName: string, properties?: Record<string, any>) {
  trackEvent('onboarding_step_completed', {
    step_name: stepName,
    ...properties,
  });
}

/**
 * Track feature view/access
 */
export function trackFeatureAccessed(featureName: string, properties?: Record<string, any>) {
  trackEvent('feature_accessed', {
    feature_name: featureName,
    ...properties,
  });
}

/**
 * Set user properties for segmentation
 */
export function setUserProperties(properties: Record<string, any>) {
  posthog.people.set(properties);
}

/**
 * Increment user property (e.g., inspection count)
 */
export function incrementUserProperty(property: string, value: number = 1) {
  // PostHog JS SDK uses set_once or set for properties
  // Increment is available in server-side SDKs
  posthog.people.set({ [property]: value });
}
