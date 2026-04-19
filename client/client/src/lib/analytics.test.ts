import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initializeAnalytics, trackEvent, identifyUser, trackSignup, trackLogin } from './analytics';

// Mock posthog-js
vi.mock('posthog-js', () => ({
  default: {
    init: vi.fn(),
    capture: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn(),
    people: {
      set: vi.fn(),
      set_once: vi.fn(),
    },
  },
}));

describe('Analytics Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment variables
    delete (import.meta.env as any).VITE_POSTHOG_API_KEY;
    delete (import.meta.env as any).VITE_POSTHOG_API_HOST;
  });

  it('should initialize PostHog with API key', () => {
    // Set environment variable
    (import.meta.env as any).VITE_POSTHOG_API_KEY = 'test-api-key';
    
    // This would normally initialize PostHog
    // For testing, we just verify the function doesn't throw
    expect(() => {
      initializeAnalytics();
    }).not.toThrow();
  });

  it('should warn when API key is not configured', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    initializeAnalytics();
    
    expect(warnSpy).toHaveBeenCalledWith('[Analytics] PostHog API key not configured');
    
    warnSpy.mockRestore();
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
});
