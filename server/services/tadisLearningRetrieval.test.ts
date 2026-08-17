import { beforeEach, describe, expect, it, vi } from "vitest";

const { store, mockDb } = vi.hoisted(() => {
  const store = { tadisLearningRecords: [] as any[] };
  const realGetDb = async () => ({
    select: () => ({
      from: () => ({
        where: (pred: any) => ({
          limit: async (n: number) =>
            store.tadisLearningRecords.filter((r) => (pred?.__match ? pred.__match(r) : true)).slice(0, n),
        }),
      }),
    }),
  });
  return {
    store,
    mockDb: {
      getDb: realGetDb,
      reset: () => {
        store.tadisLearningRecords = [];
        mockDb.getDb = realGetDb;
      },
    },
  };
});

vi.mock("drizzle-orm", () => ({
  eq: (col: any, val: any) => ({ __match: (r: any) => r[col?.__col ?? col] === val }),
}));
vi.mock("../../drizzle/schema", () => ({
  tadisLearningRecords: new Proxy(
    { _name: "tadisLearningRecords" },
    { get: (t: any, prop: string) => (prop === "_name" ? "tadisLearningRecords" : { __col: prop }) }
  ),
}));
vi.mock("../db", () => ({ getDb: (...args: unknown[]) => mockDb.getDb(...(args as [])) }));

import {
  getSimilarCasesForDiagnosis,
  rankLearningRecordsForQuery,
  toSimilarCaseInputs,
} from "./tadisLearningRetrieval";

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    eligibilityStatus: "promoted",
    make: "Freightliner",
    model: "Cascadia",
    modelYear: 2021,
    engineMake: "Detroit",
    affectedSystem: "emissions_aftertreatment",
    faultCodesJson: ["SPN3226/FMI4"],
    symptomsJson: ["derate on highway"],
    evidenceQualityScore: 90,
    outcomeState: "confirmed",
    rootCause: "Failed outlet NOx sensor",
    repairAction: "Replaced outlet NOx sensor",
    ...overrides,
  };
}

beforeEach(() => {
  mockDb.reset();
});

describe("rankLearningRecordsForQuery", () => {
  it("never returns a candidate — only promoted records are retrievable evidence", async () => {
    store.tadisLearningRecords.push(record({ id: 1, eligibilityStatus: "candidate" }));
    const ranked = await rankLearningRecordsForQuery({ make: "Freightliner" });
    expect(ranked).toHaveLength(0);
  });

  it("never returns an excluded record", async () => {
    store.tadisLearningRecords.push(record({ id: 1, eligibilityStatus: "excluded" }));
    const ranked = await rankLearningRecordsForQuery({ make: "Freightliner" });
    expect(ranked).toHaveLength(0);
  });

  it("ranks a matching make/model/fault-code record above a non-matching one", async () => {
    store.tadisLearningRecords.push(
      record({ id: 1, make: "Freightliner", model: "Cascadia", faultCodesJson: ["SPN3226/FMI4"] }),
      record({ id: 2, make: "Kenworth", model: "T680", faultCodesJson: ["SPN100/FMI1"] })
    );

    const ranked = await rankLearningRecordsForQuery({
      make: "Freightliner",
      model: "Cascadia",
      faultCodes: ["SPN3226/FMI4"],
    });

    expect(ranked[0].record.id).toBe(1);
    expect(ranked.find((r) => r.record.id === 2)?.score ?? 0).toBeLessThan(ranked[0].score);
  });

  it("weights a confirmed, high-quality record above an otherwise-identical verified one", async () => {
    store.tadisLearningRecords.push(
      record({ id: 1, outcomeState: "confirmed", evidenceQualityScore: 95 }),
      record({ id: 2, outcomeState: "verified", evidenceQualityScore: 95 })
    );

    const ranked = await rankLearningRecordsForQuery({ make: "Freightliner", model: "Cascadia" });
    const confirmed = ranked.find((r) => r.record.id === 1)!;
    const verified = ranked.find((r) => r.record.id === 2)!;
    expect(confirmed.score).toBeGreaterThan(verified.score);
  });

  it("still surfaces a failed outcome as flagged negative evidence rather than dropping it", async () => {
    store.tadisLearningRecords.push(record({ id: 1, outcomeState: "failed" }));
    const ranked = await rankLearningRecordsForQuery({ make: "Freightliner", model: "Cascadia" });
    expect(ranked).toHaveLength(1);
    expect(ranked[0].matchedSignals).toContain("negative_evidence");
  });
});

describe("toSimilarCaseInputs", () => {
  it("maps a failed record to risk_level high and resolutionSuccess false", async () => {
    store.tadisLearningRecords.push(record({ id: 1, outcomeState: "failed" }));
    const ranked = await rankLearningRecordsForQuery({ make: "Freightliner", model: "Cascadia" });
    const [mapped] = toSimilarCaseInputs(ranked);
    expect(mapped.risk_level).toBe("high");
    expect(mapped.resolutionSuccess).toBe(false);
    expect(mapped.confirmedFix).toBeUndefined();
  });

  it("maps a confirmed record with a confirmedFix and resolutionSuccess true", async () => {
    store.tadisLearningRecords.push(record({ id: 1, outcomeState: "confirmed" }));
    const ranked = await rankLearningRecordsForQuery({ make: "Freightliner", model: "Cascadia" });
    const [mapped] = toSimilarCaseInputs(ranked);
    expect(mapped.resolutionSuccess).toBe(true);
    expect(mapped.confirmedFix).toBe("Replaced outlet NOx sensor");
  });
});

describe("getSimilarCasesForDiagnosis", () => {
  it("returns an empty array (never throws) when the database is unavailable", async () => {
    mockDb.getDb = (async () => null) as never;
    const result = await getSimilarCasesForDiagnosis({ make: "Freightliner" });
    expect(result).toEqual([]);
  });
});
