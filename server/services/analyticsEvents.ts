import { gte } from "drizzle-orm";
import { z } from "zod";
import { analyticsEvents } from "../../drizzle/schema";
import { getDb } from "../db";

const allowedEvents = z.string().trim().min(1).max(48).regex(/^[a-z0-9_:-]+$/i);
const safeValue = z.string().trim().max(120).regex(/^[^<>]*$/);

export const analyticsEventInputSchema = z.object({
  event: allowedEvents,
  anonSessionId: z.string().trim().max(64).regex(/^[a-zA-Z0-9_-]+$/).optional(),
  intakeSource: safeValue.optional(),
  role: safeValue.optional(),
  deviceCategory: z.enum(["mobile", "tablet", "desktop", "unknown"]).optional(),
  referralSource: safeValue.optional(),
  guestCaseId: z.number().int().positive().optional(),
  readiness: safeValue.optional(),
  severity: safeValue.optional(),
  reviewRequirement: safeValue.optional(),
  funnelStep: safeValue.optional(),
  metadata: z.record(z.string(), z.union([z.string().max(120), z.number(), z.boolean()])).optional(),
});

export type AnalyticsEventInput = z.infer<typeof analyticsEventInputSchema>;

export async function recordAnalyticsEvent(input: AnalyticsEventInput) {
  const db = await getDb();
  if (!db) return null;
  const metadata = input.metadata
    ? Object.fromEntries(
        Object.entries(input.metadata).filter(([key]) =>
          /^(cta_location|source_page|question_id|feature_name|method|status|interest_type|source|plan|device)$/.test(key)
        )
      )
    : null;
  try {
    const [row] = await db.insert(analyticsEvents).values({
      event: input.event,
      anonSessionId: input.anonSessionId ?? null,
      intakeSource: input.intakeSource ?? null,
      role: input.role ?? null,
      deviceCategory: input.deviceCategory ?? null,
      referralSource: input.referralSource ?? null,
      guestCaseId: input.guestCaseId ?? null,
      readiness: input.readiness ?? null,
      severity: input.severity ?? null,
      reviewRequirement: input.reviewRequirement ?? null,
      funnelStep: input.funnelStep ?? null,
      metadataJson: metadata && Object.keys(metadata).length > 0 ? metadata : null,
      at: new Date(),
    }).returning({ id: analyticsEvents.id });
    return row?.id ?? null;
  } catch {
    return null;
  }
}

export async function getAnalyticsEventCounts(since?: Date) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ event: analyticsEvents.event }).from(analyticsEvents).where(since ? gte(analyticsEvents.at, since) : undefined);
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.event, (counts.get(row.event) ?? 0) + 1);
  return Array.from(counts, ([event, count]) => ({ event, count })).sort((a, b) => b.count - a.count);
}
