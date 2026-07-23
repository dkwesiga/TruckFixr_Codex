// Scoped, expiring, signed guest links for the public "/try-one-case" workflow.
//
// Two token kinds:
//   - The DB `publicToken` (opaque random handle) identifies a guest case and is
//     revocable by rotating/expiring the row. Use `generateOpaqueToken()`.
//   - A SIGNED token wraps a publicToken with a PURPOSE + EXPIRY so we can hand out
//     purpose-scoped, expiring links (e.g. a repair-shop or driver continuation
//     link) without extra DB rows. Verified statelessly here; the caller still
//     checks the case row's status for revocation.
//
// Pure crypto over Node's built-ins — no DB, no network — so it is fully testable.

import { createHmac, randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { ENV } from "../_core/env";

const VERSION = "v1";

export const GUEST_TOKEN_PURPOSES = [
  "case_access",
  "driver_link",
  "repair_shop_link",
] as const;
export type GuestTokenPurpose = (typeof GUEST_TOKEN_PURPOSES)[number];

export interface GuestTokenPayload {
  /** The case's opaque publicToken. */
  t: string;
  /** Purpose scope. */
  p: GuestTokenPurpose;
  /** Expiry, epoch ms. */
  e: number;
}

export type VerifyGuestTokenResult =
  | { ok: true; caseToken: string; purpose: GuestTokenPurpose; exp: number }
  | {
      ok: false;
      reason:
        | "malformed"
        | "bad_version"
        | "bad_signature"
        | "expired"
        | "purpose_mismatch";
    };

function secret(): string {
  // ENV is captured at module load; also consult live process.env so the value
  // is resilient to load order (and testable without re-importing the module).
  const s =
    ENV.guestTokenSecret ||
    process.env.GUEST_TOKEN_SECRET?.trim() ||
    process.env.JWT_SECRET?.trim() ||
    "";
  if (!s) {
    throw new Error(
      "Guest token secret is not configured (set GUEST_TOKEN_SECRET or JWT_SECRET)."
    );
  }
  return s;
}

function sign(data: string): string {
  return createHmac("sha256", secret()).update(data).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  // timingSafeEqual throws on length mismatch; guard first (length is not secret).
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Opaque, URL-safe, unguessable handle for a guest case's `publicToken`. */
export function generateOpaqueToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

/** SHA-256 hex — for hashing IPs / free-case match keys so no raw PII is stored. */
export function hashIdentifier(value: string): string {
  return createHash("sha256")
    .update(`${secret()}:${value.trim().toLowerCase()}`)
    .digest("hex");
}

export function signGuestToken(opts: {
  caseToken: string;
  purpose: GuestTokenPurpose;
  ttlMs: number;
  now?: number;
}): string {
  const now = opts.now ?? Date.now();
  const payload: GuestTokenPayload = {
    t: opts.caseToken,
    p: opts.purpose,
    e: now + opts.ttlMs,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = sign(`${VERSION}.${body}`);
  return `${VERSION}.${body}.${sig}`;
}

export function verifyGuestToken(
  token: string,
  opts?: { purpose?: GuestTokenPurpose; now?: number }
): VerifyGuestTokenResult {
  const now = opts?.now ?? Date.now();
  const parts = (token ?? "").split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [version, body, sig] = parts;
  if (version !== VERSION) return { ok: false, reason: "bad_version" };

  const expectedSig = sign(`${VERSION}.${body}`);
  if (!safeEqual(sig, expectedSig)) return { ok: false, reason: "bad_signature" };

  let payload: GuestTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (
    typeof payload?.t !== "string" ||
    typeof payload?.e !== "number" ||
    !GUEST_TOKEN_PURPOSES.includes(payload?.p)
  ) {
    return { ok: false, reason: "malformed" };
  }
  if (payload.e <= now) return { ok: false, reason: "expired" };
  if (opts?.purpose && payload.p !== opts.purpose) {
    return { ok: false, reason: "purpose_mismatch" };
  }
  return { ok: true, caseToken: payload.t, purpose: payload.p, exp: payload.e };
}
