import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * First critical integration slice for the maintenance case lifecycle
 * (P1 foundation): a real chain of service calls —
 *
 *   OBSERVATION (defect + AI triage, seeded as already-existing rows)
 *     -> DECISION (addDecision, critical severity / pull_from_service)
 *     -> REPAIR (startRepairCycle -> markCycleStage -> completeCycle)
 *     -> CONFIRMED OUTCOME (reportOutcome -> verifyOutcome -> confirmOutcome)
 *     -> PROVENANCE RECONSTRUCTION (getCaseTimeline)
 *
 * against a generic in-memory drizzle-query-builder stub (same technique as
 * server/services/maintenanceCases.test.ts, generalized to the additional
 * tables this chain touches). No live database; this is a service-level
 * integration test, not an E2E/browser test — the smallest existing test
 * layer that exercises the real, un-mocked business logic across services
 * (see .claude/rules/testing.md).
 *
 * Also covers, in the same lifecycle:
 *   - a cross-tenant negative path (Fleet B cannot read/act on Fleet A's case
 *     or outcome — safe denial via NOT_FOUND/empty result, the existing
 *     convention for a case not found "in this fleet"),
 *   - a safety-escalation regression (a routine case-status transition does
 *     not silently alter or erase a recorded critical decision; a
 *     lower-severity follow-up decision supersedes without destroying the
 *     original critical decision's history; recordCriticalOverride enforces
 *     its existing mandatory-reason / critical-only guard).
 */

const FLEET_A = 1;
const FLEET_B = 2;
const CASE_ID = 500;
const VEHICLE_ID = "veh-500";
const DEFECT_ID = 700;
const MANAGER_ID = 14;
const TECH_ID = 21;

const { store, makeTableProxy, getDbMock } = vi.hoisted(() => {
  const store: Record<string, any[]> = {};
  function rowsFor(name: string) {
    if (!store[name]) store[name] = [];
    return store[name];
  }

  const tableNames = new WeakMap<object, string>();
  function tableNameOf(tbl: unknown): string {
    const name = tableNames.get(tbl as object);
    if (!name) throw new Error(`Unmocked table access: ${String(tbl)}`);
    return name;
  }
  function makeTableProxy(name: string) {
    const proxy = new Proxy(
      {},
      {
        get(_t, prop) {
          if (typeof prop !== "string") return undefined;
          return { __col: prop };
        },
      }
    );
    tableNames.set(proxy, name);
    return proxy;
  }

  let nextId = 10000;
  const DATE_DEFAULT_FIELDS = ["createdAt", "updatedAt", "openedAt", "startedAt"];

  function matches(pred: any, row: any): boolean {
    if (!pred) return true;
    return pred.__match ? pred.__match(row) : true;
  }

  function applyOrder(rows: any[], spec: any) {
    if (!spec?.__orderCol) return rows;
    const { __orderCol: col, __dir: dir } = spec;
    return [...rows].sort((a, b) => {
      const av = a[col] instanceof Date ? a[col].getTime() : a[col];
      const bv = b[col] instanceof Date ? b[col].getTime() : b[col];
      if (av === bv) return 0;
      const cmp = av < bv ? -1 : 1;
      return dir === "desc" ? -cmp : cmp;
    });
  }

  function chain(initialRows: any[]) {
    let current = initialRows;
    const c: any = {
      from(tbl: unknown) {
        current = rowsFor(tableNameOf(tbl)).slice();
        return c;
      },
      where(pred: any) {
        current = current.filter((r) => matches(pred, r));
        return c;
      },
      orderBy(spec: any) {
        current = applyOrder(current, spec);
        return c;
      },
      limit(n: number) {
        current = current.slice(0, n);
        return c;
      },
      then(resolve: any, reject: any) {
        return Promise.resolve(current).then(resolve, reject);
      },
    };
    return c;
  }

  const getDbMock = vi.fn(async () => ({
    select: (_proj?: unknown) => ({ from: (tbl: unknown) => chain(rowsFor(tableNameOf(tbl))) }),
    insert: (tbl: unknown) => ({
      values: (vals: Record<string, unknown>) => ({
        returning: async () => {
          const name = tableNameOf(tbl);
          const row: Record<string, unknown> = { ...vals };
          for (const field of DATE_DEFAULT_FIELDS) {
            if (row[field] === undefined) row[field] = new Date();
          }
          if (row.id === undefined) row.id = nextId++;
          rowsFor(name).push(row);
          return [row];
        },
      }),
    }),
    update: (tbl: unknown) => ({
      set: (patch: Record<string, unknown>) => ({
        where: async (pred: any) => {
          for (const row of rowsFor(tableNameOf(tbl))) {
            if (matches(pred, row)) Object.assign(row, patch);
          }
        },
      }),
    }),
  }));

  return { store, tableNameOf, getDbMock, makeTableProxy };
});

vi.mock("drizzle-orm", () => ({
  and:
    (...preds: any[]) =>
    ({ __match: (row: any) => preds.every((p) => (p?.__match ? p.__match(row) : true)) }),
  eq: (col: any, val: any) => ({ __match: (row: any) => row[col?.__col ?? col] === val }),
  inArray: (col: any, vals: any[]) => ({ __match: (row: any) => vals.includes(row[col?.__col ?? col]) }),
  isNull: (col: any) => ({ __match: (row: any) => row[col?.__col ?? col] == null }),
  desc: (col: any) => ({ __orderCol: col?.__col ?? col, __dir: "desc" }),
  asc: (col: any) => ({ __orderCol: col?.__col ?? col, __dir: "asc" }),
  // Not used by the lifecycle under test — best-effort stand-ins so the
  // best-effort downstream refresh (evidence-quality scoring / TADIS
  // candidate promotion) in outcomeVerification.ts doesn't log noise trying
  // to resolve them; any failure there is already caught and non-fatal.
  count: () => ({}),
  sql: (...args: any[]) => ({ __sql: args }),
  or: (...preds: any[]) => ({ __match: (row: any) => preds.some((p) => (p?.__match ? p.__match(row) : false)) }),
}));

vi.mock("../../drizzle/schema", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../../drizzle/schema");
  const mocked: Record<string, unknown> = {};
  for (const key of Object.keys(actual)) {
    mocked[key] = makeTableProxy(key);
  }
  return mocked;
});

vi.mock("../db", () => ({ getDb: getDbMock }));
vi.mock("./maintenanceActivityLog", () => ({ logMaintenanceActivity: async () => {} }));
vi.mock("./maintenanceCaseReference", () => ({ nextCaseReference: async () => "MC-2026-000500" }));

import { createManualCase, getCaseForFleet, transitionCaseStatus } from "./maintenanceCases";
import { addDecision, listDecisions, recordCriticalOverride } from "./maintenanceDecisions";
import { completeCycle, markCycleStage, startRepairCycle } from "./repairCycles";
import { confirmOutcome, listOutcomesForCase, reportOutcome, verifyOutcome } from "./outcomeVerification";
import { getCaseTimeline } from "./maintenanceBoards";

function resetStore() {
  for (const key of Object.keys(store)) store[key].length = 0;
}

async function seedObservationAndCase() {
  store.defects ??= [];
  store.aiTriageRecords ??= [];
  store.vehicles ??= [];

  store.vehicles.push({ id: VEHICLE_ID, fleetId: FLEET_A });
  store.defects.push({
    id: DEFECT_ID,
    fleetId: FLEET_A,
    vehicleId: VEHICLE_ID,
    driverId: 42,
    title: "Loss of air pressure on brake system",
    description: "Driver reports brake pressure warning light and audible air leak near the trailer connection.",
    severity: "critical",
    symptoms: ["air leak", "brake warning light"],
    createdAt: new Date("2026-01-01T08:00:00Z"),
  });
  store.aiTriageRecords.push({
    id: 900,
    fleetId: FLEET_A,
    vehicleId: VEHICLE_ID,
    defectId: DEFECT_ID,
    mostLikelyCause: "Air brake line leak at trailer glad-hand connection",
    severity: "critical",
    confidenceScore: 88,
    recommendedAction: "pull_from_service",
    safetyWarning: "Do not operate — loss of braking capacity risk.",
    createdAt: new Date("2026-01-01T08:05:00Z"),
  });

  const created = await createManualCase({
    fleetId: FLEET_A,
    vehicleId: VEHICLE_ID,
    origin: "issue",
    summary: "Brake air leak reported by driver",
    severity: "critical",
    sourceDefectId: DEFECT_ID,
    createdByUserId: MANAGER_ID,
  });
  return created!.id as number;
}

beforeEach(() => {
  resetStore();
  vi.clearAllMocks();
});

describe("maintenance case lifecycle — observation through confirmed outcome", () => {
  it("reconstructs the full provenance chain and preserves original evidence/AI output", async () => {
    const caseId = await seedObservationAndCase();

    // DECISION: critical, pull_from_service — the safety-critical recommendation.
    await addDecision({
      fleetId: FLEET_A,
      caseId,
      actorUserId: MANAGER_ID,
      source: "ai",
      severity: "critical",
      proposedAction: "pull_from_service",
      finalAction: "pull_from_service",
      rationale: "Confirmed air leak; unsafe to continue operating.",
      confidence: 88,
    });

    // REPAIR: a cycle is started and completed.
    await startRepairCycle({ fleetId: FLEET_A, caseId, actorUserId: TECH_ID });
    await markCycleStage({
      fleetId: FLEET_A,
      caseId,
      actorUserId: TECH_ID,
      stage: "repair_started",
    });
    await completeCycle({ fleetId: FLEET_A, caseId, actorUserId: TECH_ID, closureResult: "resolved" });

    // CONFIRMED OUTCOME: reported -> verified -> confirmed.
    const outcome = await reportOutcome({
      fleetId: FLEET_A,
      caseId,
      actorUserId: TECH_ID,
      confirmedFault: "Cracked air line at glad-hand connection",
      repairPerformed: "Replaced air line and glad-hand fitting",
      partsReplaced: ["air-line-15ft", "glad-hand-fitting"],
      evidenceSource: "shop_verified",
      vehicleId: VEHICLE_ID,
    });
    expect(outcome).toBeTruthy();
    await verifyOutcome({
      fleetId: FLEET_A,
      outcomeId: outcome!.id,
      actorUserId: TECH_ID,
      verificationMethod: "pressure_test",
    });
    await confirmOutcome({
      fleetId: FLEET_A,
      outcomeId: outcome!.id,
      actorUserId: MANAGER_ID,
      confirmationEvidenceType: "no_comeback_time_elapsed",
    });

    // PROVENANCE RECONSTRUCTION: every stage must be reconstructable from one
    // read model, and the original evidence/AI output must be UNCHANGED.
    const timeline = await getCaseTimeline({ fleetId: FLEET_A, caseId });
    const kinds = timeline.map((e) => e.kind);
    expect(kinds).toEqual(
      expect.arrayContaining([
        "case_opened",
        "original_report",
        "ai_triage",
        "decision",
        "repair_cycle_started",
        "cycle_completed",
        "outcome_reported",
        "outcome_verified",
        "outcome_confirmed",
      ])
    );

    const originalReport = timeline.find((e) => e.kind === "original_report")!;
    expect((originalReport.details as any).description).toBe(
      "Driver reports brake pressure warning light and audible air leak near the trailer connection."
    );

    const aiTriage = timeline.find((e) => e.kind === "ai_triage")!;
    expect((aiTriage.details as any).recommendedAction).toBe("pull_from_service");
    expect((aiTriage.details as any).confidenceScore).toBe(88);
    // The original AI record itself is untouched by everything that happened
    // downstream (decision, repair, outcome) — same row, same values.
    expect(store.aiTriageRecords[0].mostLikelyCause).toBe(
      "Air brake line leak at trailer glad-hand connection"
    );

    const decisions = await listDecisions(FLEET_A, caseId);
    expect(decisions).toHaveLength(1);
    expect(decisions[0].severity).toBe("critical");
    expect(decisions[0].finalAction).toBe("pull_from_service");

    const outcomes = await listOutcomesForCase(FLEET_A, caseId);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].outcomeState).toBe("confirmed");
    expect(outcomes[0].confirmedByUserId).toBe(MANAGER_ID);
    expect(outcomes[0].verifiedByUserId).toBe(TECH_ID);
  });
});

describe("maintenance case lifecycle — safety escalation is not silently degraded", () => {
  it("does not alter the recorded critical decision through a routine case-status transition", async () => {
    const caseId = await seedObservationAndCase();
    await addDecision({
      fleetId: FLEET_A,
      caseId,
      actorUserId: MANAGER_ID,
      source: "ai",
      severity: "critical",
      proposedAction: "pull_from_service",
      finalAction: "pull_from_service",
      rationale: "Confirmed air leak; unsafe to continue operating.",
      confidence: 88,
    });

    // A routine, unrelated case-status transition (allowed by the case
    // workflow's transition map — reported -> monitoring, see
    // shared/maintenance/caseWorkflow.ts) must not touch the decision record.
    await transitionCaseStatus({
      fleetId: FLEET_A,
      caseId,
      toStatus: "monitoring",
      actorUserId: MANAGER_ID,
    });

    const [decision] = await listDecisions(FLEET_A, caseId);
    expect(decision.severity).toBe("critical");
    expect(decision.finalAction).toBe("pull_from_service");
    expect(decision.rationale).toBe("Confirmed air leak; unsafe to continue operating.");

    // The escalation stays visible in the reconstructed timeline too.
    const timeline = await getCaseTimeline({ fleetId: FLEET_A, caseId });
    const decisionEntry = timeline.find((e) => e.kind === "decision")!;
    expect((decisionEntry.details as any).severity).toBe("critical");
    expect((decisionEntry.details as any).finalAction).toBe("pull_from_service");
  });

  it("preserves the original critical decision's history when a later decision supersedes it", async () => {
    const caseId = await seedObservationAndCase();
    await addDecision({
      fleetId: FLEET_A,
      caseId,
      actorUserId: MANAGER_ID,
      source: "ai",
      severity: "critical",
      proposedAction: "pull_from_service",
      finalAction: "pull_from_service",
      rationale: "Confirmed air leak; unsafe to continue operating.",
      confidence: 88,
    });

    // A new, explicit, actor-attributed decision (e.g. after further
    // diagnosis lowered the risk) supersedes the current decision — this is
    // the product's supported way to change severity, and it must not erase
    // the original critical decision's row.
    await addDecision({
      fleetId: FLEET_A,
      caseId,
      actorUserId: TECH_ID,
      source: "manual",
      severity: "attention",
      proposedAction: "schedule_service",
      rationale: "Leak isolated and temporarily clamped; scheduling full repair.",
    });

    const allDecisions = await listDecisions(FLEET_A, caseId);
    expect(allDecisions).toHaveLength(2);
    const critical = allDecisions.find((d: any) => d.version === 1)!;
    const followUp = allDecisions.find((d: any) => d.version === 2)!;
    expect(critical.severity).toBe("critical");
    expect(critical.isCurrent).toBe(false);
    expect(critical.rationale).toBe("Confirmed air leak; unsafe to continue operating.");
    expect(followUp.severity).toBe("attention");
    expect(followUp.isCurrent).toBe(true);
  });

  it("recordCriticalOverride enforces its existing mandatory-reason and critical-only guard", async () => {
    const caseId = await seedObservationAndCase();
    await addDecision({
      fleetId: FLEET_A,
      caseId,
      actorUserId: MANAGER_ID,
      source: "ai",
      severity: "attention",
      proposedAction: "schedule_service",
      rationale: "Non-critical follow-up.",
    });

    // Cannot override a non-critical current decision.
    await expect(
      recordCriticalOverride({
        fleetId: FLEET_A,
        caseId,
        actorUserId: MANAGER_ID,
        finalAction: "continue_monitor",
        overrideReason: "testing",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await addDecision({
      fleetId: FLEET_A,
      caseId,
      actorUserId: MANAGER_ID,
      source: "ai",
      severity: "critical",
      proposedAction: "pull_from_service",
      rationale: "Escalated.",
    });

    // Cannot override without a reason.
    await expect(
      recordCriticalOverride({
        fleetId: FLEET_A,
        caseId,
        actorUserId: MANAGER_ID,
        finalAction: "continue_monitor",
        overrideReason: "   ",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("maintenance case lifecycle — cross-tenant denial", () => {
  it("denies Fleet B from reading or acting on Fleet A's case and outcome", async () => {
    const caseId = await seedObservationAndCase();
    await addDecision({
      fleetId: FLEET_A,
      caseId,
      actorUserId: MANAGER_ID,
      source: "ai",
      severity: "critical",
      proposedAction: "pull_from_service",
      rationale: "Confirmed air leak.",
    });
    const outcome = await reportOutcome({
      fleetId: FLEET_A,
      caseId,
      actorUserId: TECH_ID,
      confirmedFault: "Cracked air line",
      repairPerformed: "Replaced air line",
      evidenceSource: "shop_verified",
      vehicleId: VEHICLE_ID,
    });

    // Reading the case under Fleet B's id: safe denial (undefined/empty),
    // the same convention getCaseForFleet already uses for "not found in
    // this fleet" — not a new response shape.
    await expect(getCaseForFleet(FLEET_B, caseId)).resolves.toBeNull();
    await expect(getCaseTimeline({ fleetId: FLEET_B, caseId })).resolves.toEqual([]);
    await expect(listOutcomesForCase(FLEET_B, caseId)).resolves.toEqual([]);

    // Acting on Fleet A's outcome under Fleet B's id is rejected outright.
    await expect(
      verifyOutcome({
        fleetId: FLEET_B,
        outcomeId: outcome!.id,
        actorUserId: 999,
        verificationMethod: "pressure_test",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    // Fleet A itself is unaffected by the denied cross-fleet attempt.
    await expect(getCaseForFleet(FLEET_A, caseId)).resolves.toBeTruthy();
  });
});
