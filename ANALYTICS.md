# PostHog Analytics Integration

This document describes the PostHog analytics integration for TruckFixr Fleet AI.

## Overview

PostHog analytics is integrated to track user behavior and key business metrics. The integration includes:

- **Client-side tracking** via `posthog-js` library
- **Server-side event logging** for backend operations
- **User identification** and segmentation
- **Custom event tracking** for key workflows

## Setup

### Environment Variables

Add the following environment variables to your `.env` file:

```env
VITE_POSTHOG_API_KEY=your_posthog_api_key
VITE_POSTHOG_API_HOST=https://us.posthog.com  # Optional, defaults to US cloud
```

Get your API key from your PostHog project settings at https://posthog.com

### Initialization

PostHog is automatically initialized when the app starts. The `initializeAnalytics()` function is called in `client/src/main.tsx`.

## Tracked Events

### Authentication Events

- **user_signup**: User creates a new account
  - Properties: `signup_method` (oauth|email), `email`, `name`
  
- **user_login**: User logs in
  - Properties: `login_method` (oauth|email), `email`
  
- **user_logout**: User logs out
  - Properties: None

### Fleet Management Events

- **fleet_created**: New fleet is created
  - Properties: `fleet_id`, `fleet_name`, `user_id`
  
- **vehicle_added**: New vehicle/truck is added to fleet
  - Properties: `vehicle_id`, `fleet_id`, `vin`, `license_plate`, `user_id`

### Inspection & Defect Events

- **inspection_started**: Driver begins an inspection
  - Properties: `inspection_id`, `vehicle_id`, `user_id`
  
- **inspection_submitted**: Driver submits completed inspection
  - Properties: `inspection_id`, `defect_count`, `vehicle_id`, `user_id`
  
- **defect_created**: New defect is reported
  - Properties: `defect_id`, `severity`, `category`, `vehicle_id`, `fleet_id`, `user_id`
  
- **defect_action**: Manager takes action on defect
  - Properties: `defect_id`, `action` (acknowledge|assign|resolve), `user_id`

### Onboarding Events

- **onboarding_step_completed**: User completes onboarding step
  - Properties: `step_name`, `fleet_id`, `user_id`

### Feature Access Events

- **feature_accessed**: User accesses a feature
  - Properties: `feature_name`, `user_id`

## User Properties

When a user logs in, the following properties are set for segmentation:

- `email`: User email address
- `name`: User full name
- `role`: User role (owner|manager|driver)
- `login_method`: Authentication method (oauth|email)
- `last_signed_in`: Last login timestamp

## Analytics Module API

The analytics module is located at `client/src/lib/analytics.ts` and provides the following functions:

### `initializeAnalytics()`
Initialize PostHog on app startup. Called automatically in `main.tsx`.

### `identifyUser(userId: string, properties?: Record<string, any>)`
Identify a user for analytics tracking.

```typescript
identifyUser('user-123', { email: 'user@example.com', role: 'manager' });
```

### `trackEvent(eventName: string, properties?: Record<string, any>)`
Track a custom event.

```typescript
trackEvent('custom_event', { property: 'value' });
```

### `trackSignup(method: 'oauth' | 'email', properties?: Record<string, any>)`
Track user signup.

```typescript
trackSignup('email', { email: 'user@example.com' });
```

### `trackLogin(method: 'oauth' | 'email', properties?: Record<string, any>)`
Track user login.

```typescript
trackLogin('oauth', { email: 'user@example.com' });
```

### `trackLogout()`
Track user logout and reset analytics session.

```typescript
trackLogout();
```

### `trackFleetCreated(fleetId: number, properties?: Record<string, any>)`
Track fleet creation.

```typescript
trackFleetCreated(123, { fleetName: 'My Fleet' });
```

### `trackVehicleAdded(vehicleId: number, fleetId: number, properties?: Record<string, any>)`
Track vehicle addition.

```typescript
trackVehicleAdded(456, 123, { vin: 'ABC123...', licensePlate: 'XYZ789' });
```

### `trackInspectionSubmitted(inspectionId: number, defectCount: number, properties?: Record<string, any>)`
Track inspection submission.

```typescript
trackInspectionSubmitted(789, 2, { vehicleId: 456 });
```

### `trackDefectCreated(defectId: number, severity: string, properties?: Record<string, any>)`
Track defect creation.

```typescript
trackDefectCreated(101, 'high', { category: 'Engine', vehicleId: 456 });
```

### `trackDefectAction(defectId: number, action: string, properties?: Record<string, any>)`
Track defect action (acknowledge, assign, resolve).

```typescript
trackDefectAction(101, 'resolve', { managerId: 789 });
```

### `setUserProperties(properties: Record<string, any>)`
Set user properties for segmentation.

```typescript
setUserProperties({ subscription_tier: 'premium', fleet_count: 3 });
```

## Dashboard Analytics Views

PostHog provides several built-in views for analyzing your data:

1. **Insights**: Create custom queries and visualizations
2. **Dashboards**: Combine multiple insights into dashboards
3. **Funnels**: Track user progression through workflows
4. **Retention**: Analyze user retention over time
5. **Cohorts**: Segment users by behavior or properties

## Testing

Analytics tracking is tested with Vitest. Run tests with:

```bash
pnpm test client/src/lib/analytics.test.ts
```

## Privacy & Compliance

- PostHog is GDPR compliant
- User data is encrypted in transit
- No PII is sent to PostHog unless explicitly added to event properties
- Users can opt-out of analytics via PostHog's privacy settings

## Troubleshooting

### Events not appearing in PostHog

1. Verify `VITE_POSTHOG_API_KEY` is set correctly
2. Check browser console for initialization errors
3. Verify events are being captured (use browser DevTools Network tab)
4. Check PostHog dashboard for event ingestion status

### PostHog not initializing

If you see "PostHog API key not configured" warning:
1. Ensure `VITE_POSTHOG_API_KEY` environment variable is set
2. Restart the dev server after adding the environment variable
3. Check that the key is valid in your PostHog project settings

## Resources

- [PostHog Documentation](https://posthog.com/docs)
- [PostHog JavaScript SDK](https://posthog.com/docs/libraries/js)
- [PostHog Privacy](https://posthog.com/privacy)
