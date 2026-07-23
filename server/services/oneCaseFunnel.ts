// Gate 3: "One-Case Funnel" reporting over the durable analyticsEvents table.
// Aggregation is pure/testable; the service just loads rows and aggregates.
// Only non-PII analytics fields are stored, so nothing sensitive is exposed.

import { gte } from "drizzle-orm";
import { getDb } from "../db";
import { analyticsEvents } from "../../drizzle/schema";

// Ordered funnel steps (§27).
export const FUNNEL_EVENTS = [
  "homepage_viewed",
  "fleet_health_dashboard_viewed",
  "try_one_case_clicked",
  "case_form_started",
  "case_step_completed",
  "adaptive_question_answered",
  "preliminary_assessment_viewed",
  "contact_gate_completed",
  "case_submitted",
  "decision_card_viewed",
  "critical_escalation_triggered",
  "human_review_completed",
  "case_shared_with_shop",
  "outcome_confirmed",
  "pilot_interest_submitted",
  "pilot_qualified",
  "pilot_payment_completed",
] as const;

export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];

export interface FunnelEventRow {
  event: string;
  intakeSource?: string | null;
  readiness?: string | null;
}

export interface OneCaseFunnel {
  counts: Record<FunnelEvent, number>;
  bySource: Record<string, number>;
  byReadiness: Record<string, number>;
  total: number;
}

export function aggregateFunnel(events: FunnelEventRow[]): OneCaseFunnel {
  const counts = Object.fromEntries(FUNNEL_EVENTS.map((e) => [e, 0])) as Record<FunnelEvent, number>;
  const bySource: Record<string, number> = {};
  const byReadiness: Record<string, number> = {};
  for (const ev of events) {
    if ((counts as Record<string, number>)[ev.event] !== undefined) {
      (counts as Record<string, number>)[ev.event] += 1;
    }
    const source = ev.intakeSource ?? "unknown";
    bySource[source] = (bySource[source] ?? 0) + 1;
    if (ev.readiness) byReadiness[ev.readiness] = (byReadiness[ev.readiness] ?? 0) + 1;
  }
  return { counts, bySource, byReadiness, total: events.length };
}

export async function getOneCaseFunnel(opts?: { sinceDays?: number }): Promise<OneCaseFunnel> {
  const db = await getDb();
  if (!db) return aggregateFunnel([]);
  let rows: FunnelEventRow[];
  if (opts?.sinceDays && opts.sinceDays > 0) {
    const since = new Date(Date.now() - opts.sinceDays * 24 * 60 * 60 * 1000);
    rows = await db.select().from(analyticsEvents).where(gte(analyticsEvents.at, since));
  } else {
    rows = await db.select().from(analyticsEvents);
  }
  return aggregateFunnel(rows);
}
