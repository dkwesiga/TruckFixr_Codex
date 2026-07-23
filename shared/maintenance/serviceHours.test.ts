import { describe, expect, it } from "vitest";

import {
  computeSlaTarget,
  isWithinServiceHours,
  nextServiceOpen,
} from "./serviceHours";

// All instants are constructed in UTC. America/Toronto is UTC-5 (EST) in January
// and UTC-4 (EDT) in July. 2026-01-14 and 2026-07-15 are both Wednesdays;
// 2026-01-17 is a Saturday; 2026-01-19 is the following Monday.

describe("isWithinServiceHours (America/Toronto)", () => {
  it("is true during a weekday window (EST)", () => {
    // Wed 10:00 EST = 15:00 UTC
    expect(isWithinServiceHours(new Date(Date.UTC(2026, 0, 14, 15, 0)))).toBe(true);
  });
  it("is false before open, after close, and on weekends", () => {
    expect(isWithinServiceHours(new Date(Date.UTC(2026, 0, 14, 12, 0)))).toBe(false); // 07:00 EST (before open)
    expect(isWithinServiceHours(new Date(Date.UTC(2026, 0, 14, 13, 0)))).toBe(true); // 08:00 EST (open)
    expect(isWithinServiceHours(new Date(Date.UTC(2026, 0, 14, 10, 0)))).toBe(false); // 05:00 EST (before open)
    expect(isWithinServiceHours(new Date(Date.UTC(2026, 0, 15, 1, 0)))).toBe(false); // Wed 20:00 EST (after close)
    expect(isWithinServiceHours(new Date(Date.UTC(2026, 0, 17, 17, 0)))).toBe(false); // Sat 12:00 EST
  });
  it("is true during a weekday window in summer (EDT)", () => {
    // Wed 10:00 EDT = 14:00 UTC
    expect(isWithinServiceHours(new Date(Date.UTC(2026, 6, 15, 14, 0)))).toBe(true);
  });
});

describe("computeSlaTarget", () => {
  it("within hours (EST): due = submission + 60 business minutes", () => {
    const r = computeSlaTarget(new Date(Date.UTC(2026, 0, 14, 15, 0))); // 10:00 EST
    expect(r.afterHours).toBe(false);
    expect(r.slaDueAt.getTime()).toBe(Date.UTC(2026, 0, 14, 16, 0)); // 11:00 EST
  });

  it("before open (EST): clock starts at 08:00, due 09:00", () => {
    const r = computeSlaTarget(new Date(Date.UTC(2026, 0, 14, 10, 0))); // 05:00 EST
    expect(r.afterHours).toBe(true);
    expect(r.slaDueAt.getTime()).toBe(Date.UTC(2026, 0, 14, 14, 0)); // 09:00 EST
  });

  it("after close (EST): rolls to next business day 08:00, due 09:00", () => {
    const r = computeSlaTarget(new Date(Date.UTC(2026, 0, 15, 1, 0))); // Wed 20:00 EST
    expect(r.afterHours).toBe(true);
    expect(r.slaDueAt.getTime()).toBe(Date.UTC(2026, 0, 15, 14, 0)); // Thu 09:00 EST
  });

  it("weekend: rolls to Monday 08:00, due 09:00", () => {
    const r = computeSlaTarget(new Date(Date.UTC(2026, 0, 17, 17, 0))); // Sat 12:00 EST
    expect(r.afterHours).toBe(true);
    expect(r.slaDueAt.getTime()).toBe(Date.UTC(2026, 0, 19, 14, 0)); // Mon 09:00 EST
  });

  it("overflows the daily close into the next business morning", () => {
    const r = computeSlaTarget(new Date(Date.UTC(2026, 0, 14, 22, 30))); // Wed 17:30 EST
    expect(r.afterHours).toBe(false);
    // 30 min left today (to 18:00), then 30 min Thu 08:00–08:30.
    expect(r.slaDueAt.getTime()).toBe(Date.UTC(2026, 0, 15, 13, 30)); // Thu 08:30 EST
  });

  it("within hours (EDT summer): due = submission + 60 minutes", () => {
    const r = computeSlaTarget(new Date(Date.UTC(2026, 6, 15, 14, 0))); // 10:00 EDT
    expect(r.afterHours).toBe(false);
    expect(r.slaDueAt.getTime()).toBe(Date.UTC(2026, 6, 15, 15, 0)); // 11:00 EDT
  });
});

describe("nextServiceOpen", () => {
  it("returns today's open when called before open on a business day", () => {
    const open = nextServiceOpen(new Date(Date.UTC(2026, 0, 14, 10, 0))); // Wed 05:00 EST
    expect(open.getTime()).toBe(Date.UTC(2026, 0, 14, 13, 0)); // Wed 08:00 EST
  });
  it("skips the weekend to Monday", () => {
    const open = nextServiceOpen(new Date(Date.UTC(2026, 0, 17, 17, 0))); // Sat
    expect(open.getTime()).toBe(Date.UTC(2026, 0, 19, 13, 0)); // Mon 08:00 EST
  });
});
