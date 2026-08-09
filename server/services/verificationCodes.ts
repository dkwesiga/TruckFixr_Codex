// OTP issue/verify primitives (PRD v1.1 §4.5). The raw code is never
// persisted — only an HMAC over (destination, code) using the same server
// secret as guestTokens.ts. DB-backed (unlike guestTokens.ts's stateless
// signed links) so attempts, resends, and expiry are enforceable server-side.

import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { verificationCodes } from "../../drizzle/schema";
import { ENV } from "../_core/env";

const CODE_LENGTH = 6;
const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // 1 minute
const MAX_ATTEMPTS = 5;
const MAX_RESENDS = 5;

function requireDb(db: unknown): asserts db {
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
}

function secret(): string {
  const s = ENV.guestTokenSecret || process.env.GUEST_TOKEN_SECRET?.trim() || process.env.JWT_SECRET?.trim() || "";
  if (!s) throw new Error("Verification-code secret is not configured (set GUEST_TOKEN_SECRET or JWT_SECRET).");
  return s;
}

function hashCode(destination: string, code: string): string {
  return createHmac("sha256", secret())
    .update(`${destination.trim().toLowerCase()}:${code}`)
    .digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function generateCode(): string {
  // Zero-padded, uniformly distributed 6-digit code.
  return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, "0");
}

export function maskDestination(destination: string, channel: "email" | "sms"): string {
  if (channel === "sms") {
    return destination.length > 4 ? `•••${destination.slice(-4)}` : "••••";
  }
  const [user, domain] = destination.split("@");
  if (!domain) return "•••";
  const visible = user.slice(0, 1);
  return `${visible}${"•".repeat(Math.max(1, user.length - 1))}@${domain}`;
}

export interface IssueCodeResult {
  destination: string;
  maskedDestination: string;
  expiresAt: Date;
}

/**
 * Issue (or resend) a code for a case+purpose. Enforces a resend cooldown and
 * a cap on total resends per case+purpose; superseding a prior unverified code.
 */
export async function issueVerificationCode(params: {
  guestCaseId: number;
  purpose: string;
  channel: "email" | "sms";
  destination: string;
  send: (input: { destination: string; code: string; expiresAt: Date }) => Promise<void>;
}): Promise<IssueCodeResult> {
  const db = await getDb();
  requireDb(db);

  const [latest] = await db
    .select()
    .from(verificationCodes)
    .where(and(eq(verificationCodes.guestCaseId, params.guestCaseId), eq(verificationCodes.purpose, params.purpose)))
    .orderBy(desc(verificationCodes.createdAt))
    .limit(1);

  const now = new Date();
  if (latest && !latest.verifiedAt) {
    const sinceCreated = now.getTime() - new Date(latest.createdAt).getTime();
    if (sinceCreated < RESEND_COOLDOWN_MS) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Please wait a moment before requesting another code.",
      });
    }
    if (latest.resendCount >= MAX_RESENDS) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Too many codes requested. Please try again later or use a different contact method.",
      });
    }
  }

  const code = generateCode();
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS);
  const destination = params.destination.trim();

  await db.insert(verificationCodes).values({
    guestCaseId: params.guestCaseId,
    purpose: params.purpose,
    channel: params.channel,
    destination,
    codeHash: hashCode(destination, code),
    attempts: 0,
    maxAttempts: MAX_ATTEMPTS,
    resendCount: latest ? latest.resendCount + 1 : 0,
    expiresAt,
    createdAt: now,
  });

  await params.send({ destination, code, expiresAt });

  return { destination, maskedDestination: maskDestination(destination, params.channel), expiresAt };
}

export type VerifyCodeResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "expired" | "already_verified" | "too_many_attempts" | "incorrect" };

export async function verifyCode(params: {
  guestCaseId: number;
  purpose: string;
  code: string;
}): Promise<VerifyCodeResult> {
  const db = await getDb();
  requireDb(db);

  const [latest] = await db
    .select()
    .from(verificationCodes)
    .where(and(eq(verificationCodes.guestCaseId, params.guestCaseId), eq(verificationCodes.purpose, params.purpose)))
    .orderBy(desc(verificationCodes.createdAt))
    .limit(1);

  if (!latest) return { ok: false, reason: "not_found" };
  if (latest.verifiedAt) return { ok: true }; // idempotent re-check after success
  if (new Date(latest.expiresAt).getTime() <= Date.now()) return { ok: false, reason: "expired" };
  if (latest.attempts >= latest.maxAttempts) return { ok: false, reason: "too_many_attempts" };

  const candidateHash = hashCode(latest.destination, params.code.trim());
  const matches = safeEqual(candidateHash, latest.codeHash);

  if (!matches) {
    await db
      .update(verificationCodes)
      .set({ attempts: latest.attempts + 1 })
      .where(eq(verificationCodes.id, latest.id));
    return { ok: false, reason: "incorrect" };
  }

  await db
    .update(verificationCodes)
    .set({ verifiedAt: new Date() })
    .where(eq(verificationCodes.id, latest.id));
  return { ok: true };
}
