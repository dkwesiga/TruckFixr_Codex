import { describe, expect, it } from "vitest";

import { nextDueFollowUp } from "./followUps";

const H = 60 * 60 * 1000;
const D = 24 * H;
const created = new Date("2026-07-01T00:00:00Z");

describe("nextDueFollowUp", () => {
  it("returns the 24h stage once a day has passed and nothing is sent", () => {
    const r = nextDueFollowUp({ createdAt: created, now: new Date(created.getTime() + 25 * H), sentStages: [] });
    expect(r?.stage).toBe("24h");
  });

  it("returns nothing before the first stage is due", () => {
    expect(nextDueFollowUp({ createdAt: created, now: new Date(created.getTime() + 5 * H), sentStages: [] })).toBeNull();
  });

  it("advances to the next unsent, due stage", () => {
    const r = nextDueFollowUp({ createdAt: created, now: new Date(created.getTime() + 4 * D), sentStages: ["24h"] });
    expect(r?.stage).toBe("3d");
  });

  it("returns the earliest still-unsent due stage (one per pass)", () => {
    // 8 days in, nothing sent yet -> the 24h stage is the earliest due.
    const r = nextDueFollowUp({ createdAt: created, now: new Date(created.getTime() + 8 * D), sentStages: [] });
    expect(r?.stage).toBe("24h");
  });

  it("reaches the 30-day recurrence check", () => {
    const r = nextDueFollowUp({ createdAt: created, now: new Date(created.getTime() + 31 * D), sentStages: ["24h", "3d", "7d"] });
    expect(r?.stage).toBe("30d");
  });

  it("stops entirely once the outcome is confirmed", () => {
    expect(
      nextDueFollowUp({ createdAt: created, now: new Date(created.getTime() + 40 * D), sentStages: [], outcomeConfirmed: true })
    ).toBeNull();
  });

  it("returns null when all stages are sent", () => {
    expect(
      nextDueFollowUp({ createdAt: created, now: new Date(created.getTime() + 60 * D), sentStages: ["24h", "3d", "7d", "30d"] })
    ).toBeNull();
  });
});
