import { TRPCError } from "@trpc/server";

/**
 * Lightweight, dependency-free IP rate limiting for public (unauthenticated)
 * endpoints — lead intake, signup, login, and password reset. Mirrors the
 * in-memory Map approach already used for the per-email login cooldown in
 * authSecurity.ts, keeping observability/analytics self-contained (no extra infra).
 *
 * This is a fixed-window counter keyed by `bucket:ip`. It complements — does not
 * replace — the per-email login cooldown: this caps abuse from a single source IP
 * across many emails (enumeration, PII flooding, reset spam).
 *
 * Behind Render the app runs with `trust proxy` set, so `req.ip` reflects the real
 * client. We still fall back to X-Forwarded-For / socket address defensively.
 */

type RateLimitedRequest = {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string | null };
};

type WindowState = { count: number; resetAt: number };

const windows = new Map<string, WindowState>();

// Opportunistic sweep bound so the map cannot grow without limit across many IPs.
const MAX_TRACKED_KEYS = 10_000;

export function getClientIp(req: RateLimitedRequest | null | undefined): string {
  if (!req) return "unknown";
  if (req.ip) return req.ip;

  const forwarded = req.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0]!.trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return String(forwarded[0]).split(",")[0]!.trim();
  }

  return req.socket?.remoteAddress ?? "unknown";
}

function sweepExpired(now: number) {
  if (windows.size < MAX_TRACKED_KEYS) return;
  for (const [key, state] of windows) {
    if (state.resetAt <= now) windows.delete(key);
  }
}

/**
 * Enforce a fixed-window rate limit for the given request + logical bucket.
 * Throws TRPCError TOO_MANY_REQUESTS when the limit is exceeded within the window.
 */
export function enforceIpRateLimit(input: {
  req: RateLimitedRequest | null | undefined;
  bucket: string;
  limit: number;
  windowMs: number;
  message?: string;
}): void {
  const now = Date.now();
  const key = `${input.bucket}:${getClientIp(input.req)}`;
  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    sweepExpired(now);
    windows.set(key, { count: 1, resetAt: now + input.windowMs });
    return;
  }

  existing.count += 1;
  if (existing.count > input.limit) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message:
        input.message ?? "Too many requests. Please wait a few minutes and try again.",
    });
  }
}

/** Test-only: clear all rate-limit windows. */
export function resetRateLimitsForTests() {
  windows.clear();
}
