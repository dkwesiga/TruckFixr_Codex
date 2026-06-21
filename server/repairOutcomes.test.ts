import { beforeEach, describe, expect, it, vi } from "vitest";

// Chainable Drizzle query-builder mock. The terminal call resolves to `rows`.
const state: { rows: unknown[] } = { rows: [] };

const db = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        groupBy: vi.fn(async () => state.rows),
        orderBy: vi.fn(() => ({ limit: vi.fn(async () => state.rows) })),
        limit: vi.fn(async () => state.rows),
      })),
    })),
  })),
};

vi.mock("./db", () => ({ getDb: vi.fn(async () => db) }));

import { getFleetDiagnosisAgreement } from "./services/repairOutcomes";

describe("getFleetDiagnosisAgreement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.rows = [];
  });

  it("aggregates the stored verdicts (yes/partially/no/unknown) with partial credit", () => {
    state.rows = [
      { verdict: "yes", count: 6 },
      { verdict: "partially", count: 2 },
      { verdict: "no", count: 2 },
      { verdict: "unknown", count: 5 },
    ];

    return getFleetDiagnosisAgreement(3).then(stats => {
      expect(stats.total).toBe(15);
      expect(stats.correct).toBe(6);
      expect(stats.partiallyCorrect).toBe(2);
      expect(stats.incorrect).toBe(2);
      expect(stats.unknown).toBe(5);
      // scored = 10; (6 + 2*0.5) / 10 = 0.7
      expect(stats.agreementRate).toBe(0.7);
    });
  });

  it("treats any legacy/non-canonical verdict as unscored", async () => {
    state.rows = [
      { verdict: "yes", count: 1 },
      { verdict: "correct", count: 3 }, // legacy value, must not be scored as a hit
    ];

    const stats = await getFleetDiagnosisAgreement(3);
    expect(stats.total).toBe(4);
    expect(stats.correct).toBe(1);
    expect(stats.unknown).toBe(3);
    expect(stats.agreementRate).toBe(1); // only the single "yes" is scored
  });

  it("returns a null agreement rate when nothing is scored yet", async () => {
    state.rows = [{ verdict: "unknown", count: 4 }];

    const stats = await getFleetDiagnosisAgreement(3);
    expect(stats.total).toBe(4);
    expect(stats.agreementRate).toBeNull();
  });

  it("returns empty stats when the fleet has no outcomes", async () => {
    state.rows = [];
    const stats = await getFleetDiagnosisAgreement(3);
    expect(stats.total).toBe(0);
    expect(stats.agreementRate).toBeNull();
  });
});
