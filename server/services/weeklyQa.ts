// Gate 3: weekly QA queue selection (§28). Pure classification + a deterministic
// 10% sample of routine completed cases, plus a thin DB loader.

import { desc } from "drizzle-orm";
import { getDb } from "../db";
import { caseReviewQueueItems, guestCases } from "../../drizzle/schema";

export interface QaCaseLike {
  id: number;
  status?: string | null;
  criticalTriggered?: boolean | null;
  repeatIssueWithin30Days?: boolean | null;
  // Review-derived signals (optional — absent signals are simply not flagged):
  reviewSlaMet?: boolean | null;
  readinessChangedAfterReview?: boolean | null;
  conflictingInformation?: boolean | null;
  highCost?: boolean | null;
  outcomeContradicted?: boolean | null;
}

/** All QA reasons that apply to a case (§28 selection criteria). */
export function qaReasons(c: QaCaseLike): string[] {
  const reasons: string[] = [];
  if (c.criticalTriggered) reasons.push("critical");
  if (c.reviewSlaMet === false) reasons.push("missed_sla");
  if (c.readinessChangedAfterReview) reasons.push("readiness_changed_after_review");
  if (c.conflictingInformation) reasons.push("conflicting_information");
  if (c.highCost) reasons.push("high_cost");
  if (c.outcomeContradicted) reasons.push("outcome_contradicted_recommendation");
  if (c.repeatIssueWithin30Days) reasons.push("repeat_issue_within_30d");
  return reasons;
}

export interface WeeklyQaSelection {
  flagged: Array<{ id: number; reasons: string[] }>;
  routineSample: number[];
}

/**
 * Split cases into always-review (flagged by any criterion) and a deterministic
 * ~10% sample of routine completed cases (every Nth by position).
 */
export function selectWeeklyQa(
  cases: QaCaseLike[],
  opts?: { routineSampleRate?: number }
): WeeklyQaSelection {
  const rate = opts?.routineSampleRate ?? 0.1;
  const step = Math.max(1, Math.round(1 / rate));
  const flagged: Array<{ id: number; reasons: string[] }> = [];
  const routine: number[] = [];
  for (const c of cases) {
    const reasons = qaReasons(c);
    if (reasons.length > 0) {
      flagged.push({ id: c.id, reasons });
    } else if (c.status === "closed") {
      routine.push(c.id);
    }
  }
  const routineSample = routine.filter((_, i) => i % step === 0);
  return { flagged, routineSample };
}

export async function listWeeklyQa(opts?: { limit?: number }): Promise<WeeklyQaSelection> {
  const db = await getDb();
  if (!db) return { flagged: [], routineSample: [] };

  const cases = await db
    .select()
    .from(guestCases)
    .orderBy(desc(guestCases.createdAt));
  const reviewItems = await db.select().from(caseReviewQueueItems);
  const slaByCase = new Map<number, boolean | null>();
  for (const it of reviewItems as any[]) {
    if (it.guestCaseId != null) slaByCase.set(it.guestCaseId, it.slaMet ?? null);
  }

  const mapped: QaCaseLike[] = (cases as any[])
    .slice(0, opts?.limit ?? 500)
    .map((c) => ({
      id: c.id,
      status: c.status,
      criticalTriggered: c.criticalTriggered,
      repeatIssueWithin30Days: c.repeatIssueWithin30Days,
      reviewSlaMet: slaByCase.has(c.id) ? slaByCase.get(c.id) : undefined,
    }));

  return selectWeeklyQa(mapped);
}
