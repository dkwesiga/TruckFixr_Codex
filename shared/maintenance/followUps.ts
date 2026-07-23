// Follow-up automation schedule (§26). Pure and configurable so the cadence is
// testable and easy to tune. Defaults: 24h, 3 days, 7 days, then a 30-day
// recurrence check. Reminders stop once the required outcome is confirmed.

export const FOLLOW_UP_STAGES = [
  { stage: "24h", offsetMs: 24 * 60 * 60 * 1000 },
  { stage: "3d", offsetMs: 3 * 24 * 60 * 60 * 1000 },
  { stage: "7d", offsetMs: 7 * 24 * 60 * 60 * 1000 },
  { stage: "30d", offsetMs: 30 * 24 * 60 * 60 * 1000 },
] as const;

export type FollowUpStage = (typeof FOLLOW_UP_STAGES)[number]["stage"];

export interface FollowUpDecision {
  stage: FollowUpStage;
  scheduledFor: Date;
}

/**
 * The earliest follow-up stage that is now DUE for a case and has not yet been
 * sent, or null. Returns null immediately once the outcome is confirmed, so
 * confirmed cases never receive further reminders. Only one stage is returned
 * per call (send one, then re-evaluate on the next pass).
 */
export function nextDueFollowUp(params: {
  createdAt: Date | string;
  outcomeConfirmed?: boolean;
  sentStages?: string[];
  now?: Date;
  stages?: ReadonlyArray<{ stage: string; offsetMs: number }>;
}): FollowUpDecision | null {
  if (params.outcomeConfirmed) return null;
  const created = new Date(params.createdAt).getTime();
  if (Number.isNaN(created)) return null;
  const now = (params.now ?? new Date()).getTime();
  const sent = new Set(params.sentStages ?? []);
  const stages = params.stages ?? FOLLOW_UP_STAGES;
  for (const s of stages) {
    if (sent.has(s.stage)) continue;
    const scheduledFor = created + s.offsetMs;
    if (scheduledFor <= now) {
      return { stage: s.stage as FollowUpStage, scheduledFor: new Date(scheduledFor) };
    }
  }
  return null;
}
