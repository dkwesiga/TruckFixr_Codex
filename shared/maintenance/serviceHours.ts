// Timezone-aware service-hours + SLA math for case review (§20).
//
// Published service hours: Monday–Friday, 8:00 a.m.–6:00 p.m. Eastern Time.
// Target: a critical case submitted DURING service hours is targeted for review
// within one business hour. Cases submitted after hours start the clock at the
// next service-window open.
//
// Pure (no DB, no network). DST is handled via Intl offset resolution so the
// arithmetic is correct in both EST and EDT.

export interface ServiceHoursConfig {
  timeZone: string; // IANA, e.g. "America/Toronto" (Eastern Time)
  businessDays: number[]; // JS getUTCDay values: 0=Sun … 6=Sat
  startHour: number; // window opens (local)
  endHour: number; // window closes (local)
}

export const DEFAULT_SERVICE_HOURS: ServiceHoursConfig = {
  timeZone: "America/Toronto",
  businessDays: [1, 2, 3, 4, 5],
  startHour: 8,
  endHour: 18,
};

// Critical review SLA target, in minutes of business time.
export const CRITICAL_SLA_TARGET_MINUTES = 60;

interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function zonedParts(date: Date, timeZone: string): ZonedParts {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = dtf.formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

// Day-of-week (0=Sun) of a local calendar date — independent of time of day.
function weekdayOf(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

// Offset (ms) such that: localWallClockAsUtc - actualUtc = offset.
function offsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - date.getTime();
}

// Convert a local wall-clock time (in timeZone) to a UTC instant.
function zonedToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  // Resolve using the offset at the guessed instant, then refine once for DST.
  const off1 = offsetMs(new Date(guess), timeZone);
  const off2 = offsetMs(new Date(guess - off1), timeZone);
  return new Date(guess - off2);
}

export function isWithinServiceHours(
  date: Date,
  cfg: ServiceHoursConfig = DEFAULT_SERVICE_HOURS
): boolean {
  const p = zonedParts(date, cfg.timeZone);
  const weekday = weekdayOf(p.year, p.month, p.day);
  return (
    cfg.businessDays.includes(weekday) &&
    p.hour >= cfg.startHour &&
    p.hour < cfg.endHour
  );
}

// The UTC instant of the next service-window opening at or after `date`.
export function nextServiceOpen(
  date: Date,
  cfg: ServiceHoursConfig = DEFAULT_SERVICE_HOURS
): Date {
  const p = zonedParts(date, cfg.timeZone);
  const base = new Date(Date.UTC(p.year, p.month - 1, p.day));
  for (let addDays = 0; addDays < 8; addDays++) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + addDays);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const dd = d.getUTCDate();
    if (!cfg.businessDays.includes(d.getUTCDay())) continue;
    const openUtc = zonedToUtc(y, m, dd, cfg.startHour, 0, cfg.timeZone);
    if (openUtc.getTime() >= date.getTime()) return openUtc;
  }
  // Unreachable within a normal week, but return a safe fallback.
  return date;
}

// Add `minutes` of BUSINESS time to a start instant that is within service hours,
// rolling across the daily close to the next open as needed.
function addBusinessMinutes(
  start: Date,
  minutes: number,
  cfg: ServiceHoursConfig
): Date {
  let cursor = start;
  let remaining = minutes;
  // Guard against pathological loops.
  for (let i = 0; i < 60 && remaining > 0; i++) {
    const p = zonedParts(cursor, cfg.timeZone);
    const endUtc = zonedToUtc(p.year, p.month, p.day, cfg.endHour, 0, cfg.timeZone);
    const minsLeftToday = Math.floor((endUtc.getTime() - cursor.getTime()) / 60000);
    if (remaining <= minsLeftToday) {
      return new Date(cursor.getTime() + remaining * 60000);
    }
    remaining -= minsLeftToday;
    cursor = nextServiceOpen(new Date(endUtc.getTime() + 60000), cfg);
  }
  return cursor;
}

export interface SlaTarget {
  afterHours: boolean;
  slaDueAt: Date;
}

/**
 * Compute the SLA due instant for a case submitted at `submittedAt`, targeting
 * `targetMinutes` of business time. The clock starts at submission if within
 * service hours, otherwise at the next service-window open.
 */
export function computeSlaTarget(
  submittedAt: Date,
  targetMinutes: number = CRITICAL_SLA_TARGET_MINUTES,
  cfg: ServiceHoursConfig = DEFAULT_SERVICE_HOURS
): SlaTarget {
  const within = isWithinServiceHours(submittedAt, cfg);
  const clockStart = within ? submittedAt : nextServiceOpen(submittedAt, cfg);
  return {
    afterHours: !within,
    slaDueAt: addBusinessMinutes(clockStart, targetMinutes, cfg),
  };
}
