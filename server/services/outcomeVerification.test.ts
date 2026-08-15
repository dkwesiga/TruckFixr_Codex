import { beforeEach, describe, expect, it, vi } from "vitest";

// Stateful in-memory mock of the drizzle query builder, following the same
// pattern as maintenanceDecisions.test.ts: replace drizzle-orm's and/eq with
// tagged matchers, and proxy schema tables so property access yields a
// `{ __col }` tag the mock chain can apply against plain-object rows.
const { store, mockDb } = vi.hoisted(() => {
  const store = {
    maintenanceCases: [] as any[],
    repairCycles: [] as any[],
    repairOutcomes: [] as any[],
    outcomeRevisions: [] as any[],
    seq: 0,
  };

  const tableFor = (name: string) => (store as any)[name] as any[];

  const chain = (rows: any[]) => {
    const c: any = {
      _rows: rows,
      from() {
        return c;
      },
      where(pred: any) {
        c._rows = c._rows.filter(pred?.__match ?? (() => true));
        return c;
      },
      orderBy() {
        return c;
      },
      limit(n?: number) {
        return Promise.resolve(typeof n === "number" ? c._rows.slice(0, n) : c._rows);
      },
      then(res: any) {
        return Promise.resolve(c._rows).then(res);
      },
    };
    return c;
  };

  const mockDb = {
    getDb: async () => ({
      select: () => ({
        from: (tbl: any) => chain([...tableFor(tbl._name)]),
      }),
      insert: (tbl: any) => ({
        values: (vals: any) => {
          const row = { id: ++store.seq, createdAt: new Date(), updatedAt: new Date(), ...vals };
          tableFor(tbl._name).push(row);
          const resultPromise = Promise.resolve([row]);
          return {
            returning: async () => [row],
            then: resultPromise.then.bind(resultPromise),
            catch: resultPromise.catch.bind(resultPromise),
          };
        },
      }),
      update: (tbl: any) => ({
        set: (patch: any) => ({
          where: async (pred: any) => {
            const rows = tableFor(tbl._name);
            for (const r of rows) {
              if (!pred || (pred.__match ? pred.__match(r) : true)) Object.assign(r, patch);
            }
          },
        }),
      }),
    }),
    reset: () => {
      store.maintenanceCases = [];
      store.repairCycles = [];
      store.repairOutcomes = [];
      store.outcomeRevisions = [];
      store.seq = 0;
    },
  };
  return { store, mockDb };
});

vi.mock("drizzle-orm", () => ({
  and: (...ps: any[]) => ({ __match: (r: any) => ps.every((p) => (p?.__match ? p.__match(r) : true)) }),
  eq: (col: any, val: any) => ({ __match: (r: any) => r[col?.__col ?? col] === val }),
}));

vi.mock("../../drizzle/schema", () => {
  const mk = (name: string) =>
    new Proxy(
      { _name: name },
      { get: (t: any, prop: string) => (prop === "_name" ? name : { __col: prop }) }
    );
  return {
    maintenanceCases: mk("maintenanceCases"),
    repairCycles: mk("repairCycles"),
    repairOutcomes: mk("repairOutcomes"),
    outcomeRevisions: mk("outcomeRevisions"),
  };
});

vi.mock("../db", () => ({ getDb: mockDb.getDb }));
vi.mock("./maintenanceActivityLog", () => ({ logMaintenanceActivity: async () => {} }));
vi.mock("./knowledgeQuality", () => ({ computeOutcomeEvidenceQuality: async () => null }));
vi.mock("./tadisLearningPromotion", () => ({ evaluateAndUpsertCandidate: async () => null }));

import {
  confirmOutcome,
  markOutcomeFailed,
  recordOutcomeImpact,
  reportOutcome,
  reviseVerifiedOutcome,
  verifyOutcome,
} from "./outcomeVerification";

const FLEET = 1;
const CASE = 100;

beforeEach(() => {
  mockDb.reset();
  store.maintenanceCases.push({ id: CASE, fleetId: FLEET, reference: "MC-2026-000001" });
});

describe("reportOutcome", () => {
  it("creates a Reported outcome (never auto-verified)", async () => {
    const outcome = await reportOutcome({
      fleetId: FLEET,
      caseId: CASE,
      actorUserId: 5,
      confirmedFault: "Failed NOx sensor",
      repairPerformed: "Replaced outlet NOx sensor",
      evidenceSource: "shop_verified",
      vehicleId: "veh-1",
    });
    expect(outcome.outcomeState).toBe("reported");
    expect(outcome.verifiedAt).toBeFalsy();
  });
});

describe("verifyOutcome", () => {
  it("only a resolved-eligible transition succeeds (unknown/reported -> verified)", async () => {
    const outcome = await reportOutcome({
      fleetId: FLEET,
      caseId: CASE,
      actorUserId: 5,
      confirmedFault: "Failed NOx sensor",
      repairPerformed: "Replaced outlet NOx sensor",
      evidenceSource: "shop_verified",
      vehicleId: "veh-1",
    });

    const result = await verifyOutcome({
      fleetId: FLEET,
      outcomeId: outcome.id,
      actorUserId: 9,
      verificationMethod: "fault_code_cleared",
    });

    expect(result.outcomeState).toBe("verified");
    expect(store.repairOutcomes[0].verifiedByUserId).toBe(9);
    expect(store.repairOutcomes[0].verificationMethod).toBe("fault_code_cleared");
  });

  it("rejects verifying an already-verified outcome (no-op transition)", async () => {
    const outcome = await reportOutcome({
      fleetId: FLEET,
      caseId: CASE,
      actorUserId: 5,
      confirmedFault: "x",
      repairPerformed: "y",
      evidenceSource: "shop_verified",
      vehicleId: "veh-1",
    });
    await verifyOutcome({ fleetId: FLEET, outcomeId: outcome.id, actorUserId: 9, verificationMethod: "road_test" });

    await expect(
      verifyOutcome({ fleetId: FLEET, outcomeId: outcome.id, actorUserId: 9, verificationMethod: "road_test" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("confirmOutcome", () => {
  it("requires the outcome to already be verified", async () => {
    const outcome = await reportOutcome({
      fleetId: FLEET,
      caseId: CASE,
      actorUserId: 5,
      confirmedFault: "x",
      repairPerformed: "y",
      evidenceSource: "shop_verified",
      vehicleId: "veh-1",
    });

    await expect(
      confirmOutcome({
        fleetId: FLEET,
        outcomeId: outcome.id,
        actorUserId: 9,
        confirmationEvidenceType: "no_comeback_time_elapsed",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await verifyOutcome({ fleetId: FLEET, outcomeId: outcome.id, actorUserId: 9, verificationMethod: "road_test" });
    const confirmed = await confirmOutcome({
      fleetId: FLEET,
      outcomeId: outcome.id,
      actorUserId: 9,
      confirmationEvidenceType: "no_comeback_time_elapsed",
    });
    expect(confirmed.outcomeState).toBe("confirmed");
  });
});

describe("markOutcomeFailed", () => {
  it("keeps the failed outcome row rather than deleting it, and logs a revision when downgrading from verified", async () => {
    const outcome = await reportOutcome({
      fleetId: FLEET,
      caseId: CASE,
      actorUserId: 5,
      confirmedFault: "x",
      repairPerformed: "y",
      evidenceSource: "shop_verified",
      vehicleId: "veh-1",
    });
    await verifyOutcome({ fleetId: FLEET, outcomeId: outcome.id, actorUserId: 9, verificationMethod: "road_test" });

    const result = await markOutcomeFailed({
      fleetId: FLEET,
      outcomeId: outcome.id,
      actorUserId: 9,
      failureNotes: "Comeback: same fault code within a week.",
    });

    expect(result.outcomeState).toBe("failed");
    expect(store.repairOutcomes).toHaveLength(1);
    expect(store.repairOutcomes[0].outcomeState).toBe("failed");
    expect(store.outcomeRevisions).toHaveLength(1);
    expect(store.outcomeRevisions[0].changeType).toBe("technical_correction");
  });
});

describe("recordOutcomeImpact", () => {
  it("records optional financial/downtime fields without touching technical evidence quality or outcome state", async () => {
    const outcome = await reportOutcome({
      fleetId: FLEET,
      caseId: CASE,
      actorUserId: 5,
      confirmedFault: "x",
      repairPerformed: "y",
      evidenceSource: "shop_verified",
      vehicleId: "veh-1",
    });
    await verifyOutcome({ fleetId: FLEET, outcomeId: outcome.id, actorUserId: 9, verificationMethod: "road_test" });
    store.repairOutcomes[0].evidenceQualityScore = 91;
    store.repairOutcomes[0].evidenceQualityTier = "confirmed";

    await recordOutcomeImpact({
      fleetId: FLEET,
      outcomeId: outcome.id,
      actorUserId: 9,
      estimatedDowntimeAvoidedHours: 6,
      estimatedTowAvoidedCents: 45000,
      estimateSource: "customer_entered",
    });

    const row = store.repairOutcomes[0];
    expect(row.estimatedDowntimeAvoidedHours).toBe("6");
    expect(row.estimatedTowAvoidedCents).toBe(45000);
    expect(row.estimateSource).toBe("customer_entered");
    // Untouched by the ROI write:
    expect(row.outcomeState).toBe("verified");
    expect(row.evidenceQualityScore).toBe(91);
    expect(row.evidenceQualityTier).toBe("confirmed");
  });
});

describe("reviseVerifiedOutcome", () => {
  it("never mutates the verified row in place: it supersedes and forces re-verification", async () => {
    const outcome = await reportOutcome({
      fleetId: FLEET,
      caseId: CASE,
      actorUserId: 5,
      confirmedFault: "Original fault text",
      repairPerformed: "y",
      evidenceSource: "shop_verified",
      vehicleId: "veh-1",
    });
    await verifyOutcome({ fleetId: FLEET, outcomeId: outcome.id, actorUserId: 9, verificationMethod: "road_test" });

    const revised = await reviseVerifiedOutcome({
      fleetId: FLEET,
      outcomeId: outcome.id,
      actorUserId: 42,
      reason: "Corrected fault description after admin review.",
      patch: { confirmedFault: "Corrected fault text" },
    });

    const original = store.repairOutcomes.find((r) => r.id === outcome.id);
    expect(original.supersededAt).toBeTruthy();
    expect(original.supersededByOutcomeId).toBe(revised.id);
    expect(original.confirmedFault).toBe("Original fault text"); // never overwritten in place

    expect(revised.outcomeState).toBe("reported"); // forced back for re-verification
    expect(revised.confirmedFault).toBe("Corrected fault text");
    expect(revised.technicalRevisionOfId).toBe(outcome.id);

    expect(store.outcomeRevisions).toHaveLength(1);
    expect(store.outcomeRevisions[0].requiresReVerification).toBe(true);
    expect(store.outcomeRevisions[0].changedByUserId).toBe(42);
  });

  it("refuses to revise an outcome that isn't verified/confirmed yet", async () => {
    const outcome = await reportOutcome({
      fleetId: FLEET,
      caseId: CASE,
      actorUserId: 5,
      confirmedFault: "x",
      repairPerformed: "y",
      evidenceSource: "shop_verified",
      vehicleId: "veh-1",
    });

    await expect(
      reviseVerifiedOutcome({
        fleetId: FLEET,
        outcomeId: outcome.id,
        actorUserId: 42,
        reason: "test",
        patch: { confirmedFault: "changed" },
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("requires a reason", async () => {
    const outcome = await reportOutcome({
      fleetId: FLEET,
      caseId: CASE,
      actorUserId: 5,
      confirmedFault: "x",
      repairPerformed: "y",
      evidenceSource: "shop_verified",
      vehicleId: "veh-1",
    });
    await verifyOutcome({ fleetId: FLEET, outcomeId: outcome.id, actorUserId: 9, verificationMethod: "road_test" });

    await expect(
      reviseVerifiedOutcome({
        fleetId: FLEET,
        outcomeId: outcome.id,
        actorUserId: 42,
        reason: "  ",
        patch: { confirmedFault: "changed" },
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
