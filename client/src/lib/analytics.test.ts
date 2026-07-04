import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initializeAnalytics, trackEvent, identifyUser, trackSignup, trackLogin } from './analytics';

describe('Analytics Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment variables
    delete (import.meta.env as any).VITE_POSTHOG_API_KEY;
    delete (import.meta.env as any).VITE_POSTHOG_API_HOST;
  });

  it('should initialize safely', () => {
    expect(() => {
      initializeAnalytics();
    }).not.toThrow();
  });

  it('should track events', () => {
    expect(() => {
      trackEvent('test_event', { property: 'value' });
    }).not.toThrow();
  });

  it('should track signup events', () => {
    expect(() => {
      trackSignup('email', { email: 'test@example.com' });
    }).not.toThrow();
  });

  it('should track login events', () => {
    expect(() => {
      trackLogin('oauth', { email: 'test@example.com' });
    }).not.toThrow();
  });

  it('should identify users', () => {
    expect(() => {
      identifyUser('user-123', { email: 'test@example.com', name: 'Test User' });
    }).not.toThrow();
  });

  it('redacts email before logging signup/login events', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    trackSignup('email', { email: 'test@example.com', name: 'Test User' });
    trackLogin('oauth', { email: 'test@example.com' });

    for (const call of debugSpy.mock.calls) {
      const properties = call[1] as Record<string, unknown> | undefined;
      if (properties && 'email' in properties) {
        expect(properties.email).toBe('[redacted]');
      }
    }
    expect(debugSpy).toHaveBeenCalled();

    debugSpy.mockRestore();
  });
});
