// Pure preventive-maintenance next-due calculation. No DB, no clock except the
// injected `now`. Missing data yields `insufficient_data` — it MUST NOT create a
// false `overdue`.

export const PM_STATUSES = [
  "not_due",
  "due_soon",
  "overdue",
  "insufficient_data",
  "inactive",
] as const;

export type PmStatus = (typeof PM_STATUSES)[number];

export interface PmEffectiveIntervals {
  intervalKm: number | null;
  intervalEngineHours: number | null;
  intervalDays: number | null;
  warningKm: number | null;
  warningEngineHours: number | null;
  warningDays: number | null;
  whicheverComesFirst: boolean;
}

export interface PmCalcInput {
  active: boolean;
  intervals: PmEffectiveIntervals;
  lastCompletedDate: Date | null;
  lastCompletedOdometerKm: number | null;
  lastCompletedEngineHours: number | null;
  currentOdometerKm: number | null;
  currentEngineHours: number | null;
  now: Date;
}

// Merge a template's intervals with an assignment's overrides (override wins
// when set). Any dimension with no interval is treated as not tracked.
export function resolveEffectiveIntervals(
  template: {
    intervalKm: number | null;
    intervalEngineHours: number | null;
    intervalDays: number | null;
    warningKm: number | null;
    warningEngineHours: number | null;
    warningDays: number | null;
    whicheverComesFirst: boolean;
  },
  override?: {
    overrideIntervalKm?: number | null;
    overrideIntervalEngineHours?: number | null;
    overrideIntervalDays?: number | null;
    overrideWarningKm?: number | null;
    overrideWarningEngineHours?: number | null;
    overrideWarningDays?: number | null;
  }
): PmEffectiveIntervals {
  const pick = (o: number | null | undefined, t: number | null) =>
    o == null ? t : o;
  return {
    intervalKm: pick(override?.overrideIntervalKm, template.intervalKm),
    intervalEngineHours: pick(
      override?.overrideIntervalEngineHours,
      template.intervalEngineHours
    ),
    intervalDays: pick(override?.overrideIntervalDays, template.intervalDays),
    warningKm: pick(override?.overrideWarningKm, template.warningKm),
    warningEngineHours: pick(
      override?.overrideWarningEngineHours,
      template.warningEngineHours
    ),
    warningDays: pick(override?.overrideWarningDays, template.warningDays),
    whicheverComesFirst: template.whicheverComesFirst,
  };
}

type DimensionResult = {
  status: "not_due" | "due_soon" | "overdue" | "insufficient_data";
  remaining: number | null;
  dimension: "km" | "engineHours" | "days";
};

function evaluateDimension(args: {
  interval: number | null;
  warning: number | null;
  used: number | null; // consumed since last completion (km/hours/days)
}): DimensionResult | null {
  const { interval, warning, used } = args;
  if (interval == null || interval <= 0) return null; // dimension not tracked
  if (used == null) {
    return { status: "insufficient_data", remaining: null, dimension: "km" };
  }
  const remaining = interval - used;
  const warn = warning != null && warning > 0 ? warning : Math.max(1, Math.round(interval * 0.1));
  if (remaining <= 0) return { status: "overdue", remaining, dimension: "km" };
  if (remaining <= warn) return { status: "due_soon", remaining, dimension: "km" };
  return { status: "not_due", remaining, dimension: "km" };
}

const SEVERITY: Record<DimensionResult["status"], number> = {
  overdue: 3,
  due_soon: 2,
  not_due: 1,
  insufficient_data: 0,
};

export interface PmStatusResult {
  status: PmStatus;
  // Most-constraining tracked dimension driving the status, if any.
  drivingDimension: "km" | "engineHours" | "days" | null;
  remaining: number | null;
  reasons: string[];
}

export function calculatePmStatus(input: PmCalcInput): PmStatusResult {
  if (!input.active) {
    return { status: "inactive", drivingDimension: null, remaining: null, reasons: [] };
  }

  const { intervals } = input;
  const MS_PER_DAY = 1000 * 60 * 60 * 24;

  const kmUsed =
    intervals.intervalKm != null &&
    input.currentOdometerKm != null &&
    input.lastCompletedOdometerKm != null
      ? input.currentOdometerKm - input.lastCompletedOdometerKm
      : null;

  const hoursUsed =
    intervals.intervalEngineHours != null &&
    input.currentEngineHours != null &&
    input.lastCompletedEngineHours != null
      ? input.currentEngineHours - input.lastCompletedEngineHours
      : null;

  const daysUsed =
    intervals.intervalDays != null && input.lastCompletedDate != null
      ? Math.floor(
          (input.now.getTime() - input.lastCompletedDate.getTime()) / MS_PER_DAY
        )
      : null;

  const dims: Array<{ res: DimensionResult | null; name: "km" | "engineHours" | "days" }> = [
    {
      res: intervals.intervalKm != null
        ? evaluateDimension({ interval: intervals.intervalKm, warning: intervals.warningKm, used: kmUsed })
        : null,
      name: "km",
    },
    {
      res: intervals.intervalEngineHours != null
        ? evaluateDimension({ interval: intervals.intervalEngineHours, warning: intervals.warningEngineHours, used: hoursUsed })
        : null,
      name: "engineHours",
    },
    {
      res: intervals.intervalDays != null
        ? evaluateDimension({ interval: intervals.intervalDays, warning: intervals.warningDays, used: daysUsed })
        : null,
      name: "days",
    },
  ];

  const tracked = dims.filter((d) => d.res != null) as Array<{
    res: DimensionResult;
    name: "km" | "engineHours" | "days";
  }>;

  if (tracked.length === 0) {
    return {
      status: "insufficient_data",
      drivingDimension: null,
      remaining: null,
      reasons: ["No PM interval is configured for this assignment."],
    };
  }

  // If any tracked dimension lacks the data to evaluate, and no dimension is
  // conclusively overdue/due, report insufficient_data rather than a false
  // not_due — but a genuine overdue on a dimension we CAN evaluate still wins.
  const evaluable = tracked.filter((d) => d.res.status !== "insufficient_data");
  const hasInsufficient = tracked.some((d) => d.res.status === "insufficient_data");

  if (evaluable.length === 0) {
    return {
      status: "insufficient_data",
      drivingDimension: null,
      remaining: null,
      reasons: ["Missing current readings to evaluate PM status."],
    };
  }

  // "whichever comes first": most severe tracked dimension drives the status.
  let winner = evaluable[0];
  for (const d of evaluable) {
    if (SEVERITY[d.res.status] > SEVERITY[winner.res.status]) winner = d;
  }

  const reasons: string[] = [];
  if (hasInsufficient && winner.res.status === "not_due") {
    // Some dimension couldn't be evaluated; surface it but don't fabricate due.
    reasons.push("Some PM dimensions could not be evaluated due to missing data.");
  }

  return {
    status: winner.res.status,
    drivingDimension: winner.name,
    remaining: winner.res.remaining,
    reasons,
  };
}
