import { beforeEach, describe, expect, it, vi } from "vitest";

// §27 "TADIS Eligibility": operational records must never automatically
// become learning records, and only partner tenants with a
// deidentified_learning (or broader) contribution policy may produce one at
// all — private-only tenants and non-partner fleets must never leak a
// candidate row.

const { store, mockDb } = vi.hoisted(() => {
  const store = {
    fleets: [] as any[],
    partnerProfiles: [] as any[],
    maintenanceCases: [] as any[],
    maintenanceDecisions: [] as any[],
    repairOutcomes: [] as any[],
    tadisLearningRecords: [] as any[],
    vehicles: [] as any[],
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
          where: (pred: any) => {
            const rows = tableFor(tbl._name);
            const affected = rows.filter((r) => (pred?.__match ? pred.__match(r) : true));
            for (const r of affected) Object.assign(r, patch);
            return { returning: async () => affected };
          },
        }),
      }),
    }),
    reset: () => {
      store.fleets = [];
      store.partnerProfiles = [];
      store.maintenanceCases = [];
      store.maintenanceDecisions = [];
      store.repairOutcomes = [];
      store.tadisLearningRecords = [];
      store.vehicles = [];
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
    new Proxy({ _name: name }, { get: (t: any, prop: string) => (prop === "_name" ? name : { __col: prop }) });
  return {
    fleets: mk("fleets"),
    partnerProfiles: mk("partnerProfiles"),
    maintenanceCases: mk("maintenanceCases"),
    maintenanceDecisions: mk("maintenanceDecisions"),
    repairOutcomes: mk("repairOutcomes"),
    tadisLearningRecords: mk("tadisLearningRecords"),
    vehicles: mk("vehicles"),
  };
});
vi.mock("../db", () => ({ getDb: mockDb.getDb }));
vi.mock("./maintenanceActivityLog", () => ({ logMaintenanceActivity: async () => {} }));
// Real implementation (not mocked) so the PII-scan-scope fix is actually
// exercised end to end, not just assumed.
vi.mock("./partnerKnowledge", async () => {
  const actual = await vi.importActual<typeof import("./partnerKnowledge")>("./partnerKnowledge");
  return { detectLikelyPii: actual.detectLikelyPii };
});

import { evaluateAndUpsertCandidate, promoteCandidate } from "./tadisLearningPromotion";

const FLEET = 1;
const CASE = 100;
const OUTCOME = 200;

function seedCommon(overrides: { isPartner?: boolean; contributionPolicy?: string; caseType?: string } = {}) {
  store.fleets.push({ id: FLEET, isPartner: overrides.isPartner ?? true });
  if (overrides.contributionPolicy) {
    store.partnerProfiles.push({ fleetId: FLEET, contributionPolicy: overrides.contributionPolicy });
  } else {
    store.partnerProfiles.push({ fleetId: FLEET, contributionPolicy: "deidentified_learning" });
  }
  store.maintenanceCases.push({
    id: CASE,
    fleetId: FLEET,
    caseType: overrides.caseType ?? "diagnostic_troubleshooting",
    currentDecisionId: 1,
    tadisEligibilityOverriddenAt: null,
    recordOrigin: "live",
  });
  store.maintenanceDecisions.push({ id: 1, caseId: CASE, rationale: "Checked NOx sensor circuit", resolutionCategory: "recommended_repair" });
  store.vehicles.push({ id: "veh-1", make: "Freightliner", model: "Cascadia", year: 2021, engineMake: "Detroit", assetType: "tractor" });
}

beforeEach(() => {
  mockDb.reset();
});

describe("evaluateAndUpsertCandidate", () => {
  it("never creates a candidate for a non-partner fleet", async () => {
    seedCommon({ isPartner: false });
    store.repairOutcomes.push({
      id: OUTCOME, fleetId: FLEET, vehicleId: "veh-1", maintenanceCaseId: CASE,
      outcomeState: "confirmed", confirmedFault: "Failed NOx sensor", repairPerformed: "Replaced sensor",
      evidenceQualityTier: "strong", verifiedByUserId: 9, recordedByUserId: 5,
    });

    await evaluateAndUpsertCandidate({ fleetId: FLEET, outcomeId: OUTCOME });
    expect(store.tadisLearningRecords).toHaveLength(0);
  });

  it("never creates a candidate for a private-only contribution policy", async () => {
    seedCommon({ contributionPolicy: "private_only" });
    store.repairOutcomes.push({
      id: OUTCOME, fleetId: FLEET, vehicleId: "veh-1", maintenanceCaseId: CASE,
      outcomeState: "confirmed", confirmedFault: "Failed NOx sensor", repairPerformed: "Replaced sensor",
      evidenceQualityTier: "strong", verifiedByUserId: 9, recordedByUserId: 5,
    });

    await evaluateAndUpsertCandidate({ fleetId: FLEET, outcomeId: OUTCOME });
    expect(store.tadisLearningRecords).toHaveLength(0);
  });

  it("does not turn a routine preventive-maintenance visit into a learning record", async () => {
    seedCommon({ caseType: "preventive_maintenance" });
    store.repairOutcomes.push({
      id: OUTCOME, fleetId: FLEET, vehicleId: "veh-1", maintenanceCaseId: CASE,
      outcomeState: "verified", confirmedFault: "Routine oil change", repairPerformed: "Changed oil",
      evidenceQualityTier: "strong", verifiedByUserId: 9, recordedByUserId: 5,
    });

    await evaluateAndUpsertCandidate({ fleetId: FLEET, outcomeId: OUTCOME });
    expect(store.tadisLearningRecords).toHaveLength(0);
    expect(store.maintenanceCases[0].tadisEligibility).toBe("operational_record");
  });

  it("creates a de-identified candidate for a confirmed, strong-evidence diagnostic repair on a partner fleet", async () => {
    seedCommon();
    store.repairOutcomes.push({
      id: OUTCOME, fleetId: FLEET, vehicleId: "veh-1", maintenanceCaseId: CASE,
      outcomeState: "confirmed", confirmedFault: "Failed outlet NOx sensor", repairPerformed: "Replaced outlet NOx sensor",
      evidenceQualityScore: 92, evidenceQualityTier: "confirmed",
      verifiedByUserId: 9, recordedByUserId: 5, systemCategory: "emissions_aftertreatment",
      confirmedFaultCode: "SPN3226/FMI4", partsReplaced: ["outlet NOx sensor"],
    });

    const created = await evaluateAndUpsertCandidate({ fleetId: FLEET, outcomeId: OUTCOME });
    expect(created).toBeTruthy();
    expect(store.tadisLearningRecords).toHaveLength(1);
    const record = store.tadisLearningRecords[0];
    expect(record.eligibilityStatus).toBe("candidate");
    expect(record.make).toBe("Freightliner");
    expect(record.outcomeState).toBe("confirmed");
    // De-identified: no customer/fleet-identifying fields on the record itself.
    expect(record).not.toHaveProperty("customerName");
    expect(record).not.toHaveProperty("customerEmail");
  });

  it("does not silently un-exclude a record a platform admin already excluded", async () => {
    seedCommon();
    store.repairOutcomes.push({
      id: OUTCOME, fleetId: FLEET, vehicleId: "veh-1", maintenanceCaseId: CASE,
      outcomeState: "confirmed", confirmedFault: "Failed outlet NOx sensor", repairPerformed: "Replaced outlet NOx sensor",
      evidenceQualityScore: 92, evidenceQualityTier: "confirmed", verifiedByUserId: 9, recordedByUserId: 5,
    });
    await evaluateAndUpsertCandidate({ fleetId: FLEET, outcomeId: OUTCOME });
    store.tadisLearningRecords[0].eligibilityStatus = "excluded";

    await evaluateAndUpsertCandidate({ fleetId: FLEET, outcomeId: OUTCOME });
    expect(store.tadisLearningRecords).toHaveLength(1);
    expect(store.tadisLearningRecords[0].eligibilityStatus).toBe("excluded");
  });

  it("scans symptoms, fault codes, and parts for PII, not just fault/repair/rationale text", async () => {
    seedCommon();
    // A phone number smuggled into a "symptom" field — must be caught even
    // though it never touches confirmedFault/repairPerformed/rationale.
    store.maintenanceDecisions[0].likelyCausesJson = ["call customer at 416-555-0199 for details"];
    store.repairOutcomes.push({
      id: OUTCOME, fleetId: FLEET, vehicleId: "veh-1", maintenanceCaseId: CASE,
      outcomeState: "confirmed", confirmedFault: "Failed outlet NOx sensor", repairPerformed: "Replaced outlet NOx sensor",
      evidenceQualityScore: 92, evidenceQualityTier: "confirmed",
      verifiedByUserId: 9, recordedByUserId: 5, systemCategory: "emissions_aftertreatment",
      confirmedFaultCode: "SPN3226/FMI4", partsReplaced: ["outlet NOx sensor"],
    });

    await evaluateAndUpsertCandidate({ fleetId: FLEET, outcomeId: OUTCOME });
    const record = store.tadisLearningRecords[0];
    expect(record.rootCause).toBe("[withheld pending PII review]");
    expect(record.repairAction).toBe("[withheld pending PII review]");
    expect(record.symptomsJson).toEqual([]);
  });
});

describe("promoteCandidate", () => {
  it("refuses to promote a record a platform admin already excluded", async () => {
    seedCommon();
    store.repairOutcomes.push({
      id: OUTCOME, fleetId: FLEET, vehicleId: "veh-1", maintenanceCaseId: CASE,
      outcomeState: "confirmed", confirmedFault: "Failed outlet NOx sensor", repairPerformed: "Replaced outlet NOx sensor",
      evidenceQualityScore: 92, evidenceQualityTier: "confirmed", verifiedByUserId: 9, recordedByUserId: 5,
    });
    await evaluateAndUpsertCandidate({ fleetId: FLEET, outcomeId: OUTCOME });
    const learningRecordId = store.tadisLearningRecords[0].id;
    store.tadisLearningRecords[0].eligibilityStatus = "excluded";

    await expect(promoteCandidate({ learningRecordId, actorUserId: 7 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(store.tadisLearningRecords[0].eligibilityStatus).toBe("excluded");
  });

  it("promotes a live candidate", async () => {
    seedCommon();
    store.repairOutcomes.push({
      id: OUTCOME, fleetId: FLEET, vehicleId: "veh-1", maintenanceCaseId: CASE,
      outcomeState: "confirmed", confirmedFault: "Failed outlet NOx sensor", repairPerformed: "Replaced outlet NOx sensor",
      evidenceQualityScore: 92, evidenceQualityTier: "confirmed", verifiedByUserId: 9, recordedByUserId: 5,
    });
    await evaluateAndUpsertCandidate({ fleetId: FLEET, outcomeId: OUTCOME });
    const learningRecordId = store.tadisLearningRecords[0].id;

    const updated = await promoteCandidate({ learningRecordId, actorUserId: 7 });
    expect(updated.eligibilityStatus).toBe("promoted");
    expect(store.tadisLearningRecords[0].eligibilityStatus).toBe("promoted");
  });
});
