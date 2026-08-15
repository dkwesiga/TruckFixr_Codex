import { beforeEach, describe, expect, it, vi } from "vitest";

// §27 "Historical Import": imported records must start at a lower evidence
// status than a live closed-loop case — enforced by tagging recordOrigin
// "historical_import" (which shared/tadis/qualityScore.ts then caps below
// HISTORICAL_IMPORT_SCORE_CAP regardless of how complete the fields are).

const { store, mockDb } = vi.hoisted(() => {
  const store = { vehicles: [] as any[], maintenanceCases: [] as any[], maintenanceDecisions: [] as any[], seq: 0, refSeq: 0 };
  const tableFor = (name: string) => (store as any)[name] as any[];
  const chain = (rows: any[]) => {
    const c: any = {
      _rows: rows,
      from() { return c; },
      where(pred: any) { c._rows = c._rows.filter(pred?.__match ?? (() => true)); return c; },
      orderBy() { return c; },
      limit(n?: number) { return Promise.resolve(typeof n === "number" ? c._rows.slice(0, n) : c._rows); },
      then(res: any) { return Promise.resolve(c._rows).then(res); },
    };
    return c;
  };
  return {
    store,
    mockDb: {
      getDb: async () => ({
        select: () => ({ from: (tbl: any) => chain([...tableFor(tbl._name)]) }),
        insert: (tbl: any) => ({
          values: (vals: any) => {
            const row = { id: ++store.seq, createdAt: new Date(), updatedAt: new Date(), ...vals };
            tableFor(tbl._name).push(row);
            const p = Promise.resolve([row]);
            return { returning: async () => [row], then: p.then.bind(p) };
          },
        }),
        update: (tbl: any) => ({
          set: (patch: any) => ({
            where: async (pred: any) => {
              for (const r of tableFor(tbl._name)) if (pred?.__match ? pred.__match(r) : true) Object.assign(r, patch);
            },
          }),
        }),
        // Backs maintenanceCaseReference.ts's `nextval('maintenance_case_seq')`.
        execute: async () => ({ rows: [{ seq: ++store.refSeq }] }),
      }),
      reset: () => {
        store.vehicles = [];
        store.maintenanceCases = [];
        store.maintenanceDecisions = [];
        store.seq = 0;
        store.refSeq = 0;
      },
    },
  };
});

vi.mock("drizzle-orm", () => ({
  and: (...ps: any[]) => ({ __match: (r: any) => ps.every((p) => (p?.__match ? p.__match(r) : true)) }),
  eq: (col: any, val: any) => ({ __match: (r: any) => r[col?.__col ?? col] === val }),
  desc: () => ({}),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
}));
vi.mock("../../drizzle/schema", () => {
  const mk = (name: string) =>
    new Proxy({ _name: name }, { get: (t: any, prop: string) => (prop === "_name" ? name : { __col: prop }) });
  return { vehicles: mk("vehicles"), maintenanceCases: mk("maintenanceCases"), maintenanceDecisions: mk("maintenanceDecisions") };
});
vi.mock("../db", () => ({ getDb: mockDb.getDb }));
vi.mock("./maintenanceActivityLog", () => ({ logMaintenanceActivity: async () => {} }));

const invokeMock = vi.fn();
vi.mock("./aiOrchestrator", () => ({
  invokeWithOrchestration: (...args: unknown[]) => invokeMock(...args),
  extractJsonObject: (text: string) => text,
}));

import { extractHistoricalCaseDraft, importHistoricalCase } from "./historicalCaseImport";

beforeEach(() => {
  mockDb.reset();
  invokeMock.mockReset();
});

describe("extractHistoricalCaseDraft", () => {
  it("returns an empty draft for blank input without calling the AI provider", async () => {
    const draft = await extractHistoricalCaseDraft("   ");
    expect(draft.complaint).toBe("");
    expect(draft.confidence).toBe(0);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("degrades to an empty draft for manual entry if the AI call fails", async () => {
    invokeMock.mockRejectedValue(new Error("provider down"));
    const draft = await extractHistoricalCaseDraft("Invoice #4821: replaced NOx sensor, truck derated on highway.");
    expect(draft.complaint).toBe("");
    expect(draft.caseType).toBe("other");
  });

  it("parses a well-formed AI JSON response into a proposed draft", async () => {
    invokeMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              vin: "1fujgedv13lw12345",
              make: "Freightliner",
              model: "Cascadia",
              year: 2019,
              complaint: "Check engine + derate",
              symptoms: ["derate on highway"],
              faultCodes: ["SPN3226/FMI4"],
              diagnosis: "Failed outlet NOx sensor",
              rootCause: "Sensor circuit open",
              repairPerformed: "Replaced outlet NOx sensor",
              partsReplaced: ["NOx sensor"],
              caseType: "corrective_repair",
              resolutionCategory: "replace_component",
              confidence: 82,
            }),
          },
        },
      ],
    });

    const draft = await extractHistoricalCaseDraft("Invoice text here");
    expect(draft.vin).toBe("1FUJGEDV13LW12345");
    expect(draft.caseType).toBe("corrective_repair");
    expect(draft.confidence).toBe(82);
  });
});

describe("importHistoricalCase", () => {
  it("tags the persisted case recordOrigin: historical_import so it starts at a lower evidence ceiling", async () => {
    const draft = await extractHistoricalCaseDraft(""); // empty draft, filled in manually below
    const result = await importHistoricalCase({
      fleetId: 1,
      actorUserId: 9,
      draft: {
        ...draft,
        vin: "1FUJGEDV13LW12345",
        make: "Freightliner",
        model: "Cascadia",
        year: 2019,
        complaint: "Check engine + derate (from invoice)",
        rootCause: "Sensor circuit open",
        repairPerformed: "Replaced outlet NOx sensor",
        caseType: "corrective_repair",
        resolutionCategory: "replace_component",
      },
    });

    expect(result.case.recordOrigin).toBe("historical_import");
    expect(store.maintenanceCases[0].recordOrigin).toBe("historical_import");
    expect(result.decision?.resolutionCategory).toBe("replace_component");
  });
});
