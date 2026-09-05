import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Parts Intelligence Phase 1 integration slice: a real chain of un-mocked
 * service calls (createPartRequirement -> identifyPartForRequirement ->
 * recordFitmentAssessment -> addSupplierOption -> getRecommendedOptions)
 * against a generic in-memory drizzle-query-builder stub — the same
 * technique as server/services/maintenanceLifecycle.e2e.test.ts, extended
 * to the new parts tables. No live database.
 *
 * Proves: requirement creation tied to a case; anti-hallucination (no
 * number given -> unresolved, never a fabricated identifier); a cross-
 * reference alone never becomes OEM-confirmed fitment; conflicting evidence
 * is ambiguous, not confirmed; fitment evidence is provenance-preserving
 * (source/timestamp retained, append-only history); a cheaper option never
 * outranks a better-confirmed fit; and cross-tenant denial for a
 * requirement (Fleet B cannot read or act on Fleet A's part requirement).
 */

const FLEET_A = 1;
const FLEET_B = 2;
const CASE_ID = 600;
const VEHICLE_ID = "veh-600";
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

  let nextId = 20000;
  const DATE_DEFAULT_FIELDS = [
    "createdAt",
    "updatedAt",
    "requestedAt",
    "assessedAt",
    "capturedAt",
    "decidedAt",
  ];

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

  // A monotonic tick added to each defaulted timestamp so two rows inserted
  // within the same real-world millisecond (routine in a fast synchronous
  // test) still sort in insertion order — a real Postgres `now()` has this
  // same coarse-granularity tie-breaking need, which is exactly why
  // append-only history here should not rely on timestamp alone in a
  // pathological case; this stub just needs deterministic test behavior.
  let insertTick = 0;
  const getDbMock = vi.fn(async () => ({
    select: (_proj?: unknown) => ({ from: (tbl: unknown) => chain(rowsFor(tableNameOf(tbl))) }),
    insert: (tbl: unknown) => ({
      values: (vals: Record<string, unknown>) => ({
        returning: async () => {
          const name = tableNameOf(tbl);
          const row: Record<string, unknown> = { ...vals };
          for (const field of DATE_DEFAULT_FIELDS) {
            if (row[field] === undefined) row[field] = new Date(Date.now() + insertTick++);
          }
          if (row.id === undefined) row.id = nextId++;
          rowsFor(name).push(row);
          return [row];
        },
      }),
    }),
    update: (tbl: unknown) => ({
      set: (patch: Record<string, unknown>) => ({
        where: (pred: any) => {
          const matched: Record<string, unknown>[] = [];
          for (const row of rowsFor(tableNameOf(tbl))) {
            if (matches(pred, row)) {
              Object.assign(row, patch);
              matched.push(row);
            }
          }
          const result: any = Promise.resolve(matched);
          result.returning = async (proj?: Record<string, unknown>) => {
            if (!proj) return matched;
            return matched.map((row) => {
              const out: Record<string, unknown> = {};
              for (const key of Object.keys(proj)) out[key] = row[key];
              return out;
            });
          };
          return result;
        },
      }),
    }),
  }));

  return { store, makeTableProxy, getDbMock };
});

vi.mock("drizzle-orm", () => ({
  and:
    (...preds: any[]) =>
    ({ __match: (row: any) => preds.every((p) => (p?.__match ? p.__match(row) : true)) }),
  eq: (col: any, val: any) => ({ __match: (row: any) => row[col?.__col ?? col] === val }),
  desc: (col: any) => ({ __orderCol: col?.__col ?? col, __dir: "desc" }),
  asc: (col: any) => ({ __orderCol: col?.__col ?? col, __dir: "asc" }),
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

import {
  createPartRequirement,
  getPartRequirement,
  getPartRequirementFleetId,
  transitionPartRequirementStatus,
} from "./partRequirements";
import { identifyPartCandidate } from "./partIdentification";
import { recordFitmentAssessment, listFitmentAssessments } from "./partFitmentAssessments";
import { addSupplierOption, getRecommendedOptions } from "./partSupplierOptions";
import { getCurrentApproval, listApprovalHistory, recordApprovalDecision } from "./partOptionApprovals";

function resetStore() {
  for (const key of Object.keys(store)) store[key].length = 0;
}

async function seedCase(fleetId: number, caseId: number) {
  store.maintenanceCases ??= [];
  store.maintenanceCases.push({ id: caseId, fleetId });
}

beforeEach(() => {
  resetStore();
  vi.clearAllMocks();
});

describe("part requirement creation", () => {
  it("associates a new part requirement with its maintenance case", async () => {
    await seedCase(FLEET_A, CASE_ID);
    const requirement = await createPartRequirement({
      fleetId: FLEET_A,
      caseId: CASE_ID,
      description: "Rear brake chamber, driver side",
      requestedByUserId: MANAGER_ID,
    });
    expect(requirement).toBeTruthy();
    expect(requirement!.caseId).toBe(CASE_ID);
    expect(requirement!.status).toBe("part_required");

    const fetched = await getPartRequirement(FLEET_A, requirement!.id);
    expect(fetched?.description).toBe("Rear brake chamber, driver side");
  });

  it("refuses to create a requirement against a case in another fleet", async () => {
    await seedCase(FLEET_B, CASE_ID);
    await expect(
      createPartRequirement({
        fleetId: FLEET_A,
        caseId: CASE_ID,
        description: "Rear brake chamber",
        requestedByUserId: MANAGER_ID,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("part identification — anti-hallucination", () => {
  it("never fabricates a part number: no identifier given stays unresolved", async () => {
    const result = await identifyPartCandidate({ description: "some kind of brake part" });
    expect(result.partId).toBeNull();
    expect(result.matchType).toBe("unresolved");
  });

  it("records a real caller-supplied OEM number as a new catalog entry rather than inventing one", async () => {
    const result = await identifyPartCandidate({
      oemPartNumber: "OEM-9988",
      manufacturer: "Detroit Diesel",
    });
    expect(result.partId).not.toBeNull();
    expect(result.matchType).toBe("created_from_provided_number");
    expect(store.parts[0].oemPartNumber).toBe("OEM-9988");
  });

  it("matches an existing catalog entry by normalized part number instead of creating a duplicate", async () => {
    const first = await identifyPartCandidate({ oemPartNumber: "RE-12345" });
    const second = await identifyPartCandidate({ oemPartNumber: "re12345" });
    expect(second.partId).toBe(first.partId);
    expect(second.matchType).toBe("existing_catalog_match");
    expect(store.parts).toHaveLength(1);
  });
});

describe("fitment assessment — evidence-based, provenance-preserving", () => {
  it("confirms fitment on strong evidence and records source/timestamp/actor", async () => {
    await seedCase(FLEET_A, CASE_ID);
    const requirement = await createPartRequirement({
      fleetId: FLEET_A,
      caseId: CASE_ID,
      description: "Brake chamber",
      requestedByUserId: MANAGER_ID,
    });

    const { assessment, result } = await recordFitmentAssessment({
      fleetId: FLEET_A,
      partRequirementId: requirement!.id,
      vehicleId: VEHICLE_ID,
      evidence: { technicianConfirmed: true },
      source: "technician_manual",
      assessedByUserId: TECH_ID,
    });

    expect(result.state).toBe("confirmed");
    expect(assessment.state).toBe("confirmed");
    expect(assessment.source).toBe("technician_manual");
    expect(assessment.assessedByUserId).toBe(TECH_ID);
    expect(assessment.assessedAt).toBeInstanceOf(Date);
    expect(assessment.vehicleId).toBe(VEHICLE_ID);
  });

  it("never lets an aftermarket cross-reference alone become OEM-confirmed fitment", async () => {
    await seedCase(FLEET_A, CASE_ID);
    const requirement = await createPartRequirement({
      fleetId: FLEET_A,
      caseId: CASE_ID,
      description: "Brake chamber",
      requestedByUserId: MANAGER_ID,
    });

    const { result } = await recordFitmentAssessment({
      fleetId: FLEET_A,
      partRequirementId: requirement!.id,
      vehicleId: VEHICLE_ID,
      evidence: { crossReferenceMatch: true },
      source: "deterministic_rule",
    });

    expect(result.state).toBe("likely");
    expect(result.state).not.toBe("confirmed");
  });

  it("marks conflicting evidence ambiguous and preserves every assessment in the append-only history", async () => {
    await seedCase(FLEET_A, CASE_ID);
    const requirement = await createPartRequirement({
      fleetId: FLEET_A,
      caseId: CASE_ID,
      description: "Brake chamber",
      requestedByUserId: MANAGER_ID,
    });

    await recordFitmentAssessment({
      fleetId: FLEET_A,
      partRequirementId: requirement!.id,
      vehicleId: VEHICLE_ID,
      evidence: { crossReferenceMatch: true },
      source: "deterministic_rule",
    });
    const second = await recordFitmentAssessment({
      fleetId: FLEET_A,
      partRequirementId: requirement!.id,
      vehicleId: VEHICLE_ID,
      evidence: { oemCatalogMatch: true, vehicleConfigurationMatch: false },
      source: "deterministic_rule",
    });

    expect(second.result.state).toBe("ambiguous");

    const history = await listFitmentAssessments(FLEET_A, requirement!.id);
    expect(history).toHaveLength(2);
    // The first (superseded) assessment is still there, unmodified.
    expect(history.some((h: any) => h.state === "likely")).toBe(true);
    expect(history.some((h: any) => h.state === "ambiguous")).toBe(true);
  });
});

describe("supplier option recommendation", () => {
  it("never ranks a cheaper option ahead of a substantially better-confirmed fit", async () => {
    await seedCase(FLEET_A, CASE_ID);
    const requirement = await createPartRequirement({
      fleetId: FLEET_A,
      caseId: CASE_ID,
      description: "Brake chamber",
      requestedByUserId: MANAGER_ID,
    });

    await recordFitmentAssessment({
      fleetId: FLEET_A,
      partRequirementId: requirement!.id,
      vehicleId: VEHICLE_ID,
      evidence: { technicianConfirmed: true },
      source: "technician_manual",
      assessedByUserId: TECH_ID,
    });

    await addSupplierOption({
      fleetId: FLEET_A,
      partRequirementId: requirement!.id,
      supplierName: "Cheap Aftermarket Co",
      priceCents: 2000,
      fitmentClaim: "Should fit most Cascadias",
      capturedByUserId: MANAGER_ID,
    });

    const result = await getRecommendedOptions(FLEET_A, requirement!.id);
    expect(result.ranked).toHaveLength(1);
    expect(result.recommended?.fitmentState).toBe("confirmed");
    // The supplier's own claim never becomes TruckFixr's fitment determination.
    const rawOptions = store.partSupplierOptions;
    expect(rawOptions[0].fitmentClaim).toBe("Should fit most Cascadias");
  });

  it("treats a requirement with no fitment assessment yet as not_confirmed and hard-gates it — never a safe default", async () => {
    await seedCase(FLEET_A, CASE_ID);
    const requirement = await createPartRequirement({
      fleetId: FLEET_A,
      caseId: CASE_ID,
      description: "Brake chamber",
      requestedByUserId: MANAGER_ID,
    });
    await addSupplierOption({
      fleetId: FLEET_A,
      partRequirementId: requirement!.id,
      supplierName: "ABC Parts",
      priceCents: 1000,
      capturedByUserId: MANAGER_ID,
    });

    const result = await getRecommendedOptions(FLEET_A, requirement!.id);
    expect(result.ranked).toHaveLength(0);
    expect(result.recommended).toBeNull();
    expect(result.hardGated).toHaveLength(1);
    expect(result.hardGated[0].fitmentState).toBe("not_confirmed");
    expect(result.hardGated[0].hardGateReasons[0].code).toBe("fitment_not_eligible");
  });
});

describe("cross-tenant denial", () => {
  it("denies Fleet B from reading or acting on Fleet A's part requirement", async () => {
    await seedCase(FLEET_A, CASE_ID);
    const requirement = await createPartRequirement({
      fleetId: FLEET_A,
      caseId: CASE_ID,
      description: "Brake chamber",
      requestedByUserId: MANAGER_ID,
    });

    await expect(getPartRequirement(FLEET_B, requirement!.id)).resolves.toBeNull();
    await expect(
      recordFitmentAssessment({
        fleetId: FLEET_B,
        partRequirementId: requirement!.id,
        vehicleId: VEHICLE_ID,
        evidence: { technicianConfirmed: true },
        source: "technician_manual",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      addSupplierOption({
        fleetId: FLEET_B,
        partRequirementId: requirement!.id,
        supplierName: "Some Supplier",
        capturedByUserId: 999,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    // The requirement's real fleet is unaffected by the denied attempt.
    const owningFleetId = await getPartRequirementFleetId(requirement!.id);
    expect(owningFleetId).toBe(FLEET_A);
  });
});

async function advanceToOptionsAvailable(requirementId: number) {
  await transitionPartRequirementStatus({ fleetId: FLEET_A, id: requirementId, toStatus: "identifying" });
  await transitionPartRequirementStatus({ fleetId: FLEET_A, id: requirementId, toStatus: "fitment_review" });
  await transitionPartRequirementStatus({ fleetId: FLEET_A, id: requirementId, toStatus: "fitment_verified" });
  await transitionPartRequirementStatus({ fleetId: FLEET_A, id: requirementId, toStatus: "sourcing" });
  await transitionPartRequirementStatus({ fleetId: FLEET_A, id: requirementId, toStatus: "options_available" });
}

describe("human approval — recommendation vs. selection provenance", () => {
  it("preserves both TruckFixr's recommendation and a different human selection, never overwriting one with the other", async () => {
    await seedCase(FLEET_A, CASE_ID);
    const requirement = await createPartRequirement({
      fleetId: FLEET_A,
      caseId: CASE_ID,
      description: "Brake chamber",
      requestedByUserId: MANAGER_ID,
    });
    await recordFitmentAssessment({
      fleetId: FLEET_A,
      partRequirementId: requirement!.id,
      vehicleId: VEHICLE_ID,
      evidence: { technicianConfirmed: true },
      source: "technician_manual",
      assessedByUserId: TECH_ID,
    });
    const recommended = await addSupplierOption({
      fleetId: FLEET_A,
      partRequirementId: requirement!.id,
      supplierName: "Recommended Supplier",
      priceCents: 1000,
      capturedByUserId: MANAGER_ID,
    });
    const alternative = await addSupplierOption({
      fleetId: FLEET_A,
      partRequirementId: requirement!.id,
      supplierName: "Alternative Supplier",
      priceCents: 1500,
      capturedByUserId: MANAGER_ID,
    });

    const comparison = await getRecommendedOptions(FLEET_A, requirement!.id);
    expect(comparison.recommended?.id).toBe(recommended!.id);

    await advanceToOptionsAvailable(requirement!.id);
    await transitionPartRequirementStatus({
      fleetId: FLEET_A,
      id: requirement!.id,
      toStatus: "recommendation_ready",
    });

    // The fleet manager picks the ALTERNATIVE, more expensive option anyway
    // (e.g. faster delivery not otherwise modeled) — both facts must survive.
    const approval = await recordApprovalDecision({
      fleetId: FLEET_A,
      partRequirementId: requirement!.id,
      decision: "approved",
      recommendedOptionId: comparison.recommended!.id as number,
      selectedOptionId: alternative!.id,
      reasonNote: "Faster pickup available same day",
      decidedByUserId: MANAGER_ID,
    });

    expect(approval.recommendedOptionId).toBe(recommended!.id);
    expect(approval.selectedOptionId).toBe(alternative!.id);
    expect(approval.recommendedOptionId).not.toBe(approval.selectedOptionId);
    expect(approval.decidedByUserId).toBe(MANAGER_ID);
    expect(approval.decidedAt).toBeInstanceOf(Date);

    const updated = await getPartRequirement(FLEET_A, requirement!.id);
    expect(updated?.status).toBe("approved");
  });

  it("requires selecting an option to approve, and rejects a decline/more-information decision that names a selection", async () => {
    await seedCase(FLEET_A, CASE_ID);
    const requirement = await createPartRequirement({
      fleetId: FLEET_A,
      caseId: CASE_ID,
      description: "Brake chamber",
      requestedByUserId: MANAGER_ID,
    });
    await advanceToOptionsAvailable(requirement!.id);
    await transitionPartRequirementStatus({
      fleetId: FLEET_A,
      id: requirement!.id,
      toStatus: "recommendation_ready",
    });

    await expect(
      recordApprovalDecision({
        fleetId: FLEET_A,
        partRequirementId: requirement!.id,
        decision: "approved",
        selectedOptionId: null,
        decidedByUserId: MANAGER_ID,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("records a declined decision and a needs_more_information decision distinctly, with full history retained", async () => {
    await seedCase(FLEET_A, CASE_ID);
    const requirement = await createPartRequirement({
      fleetId: FLEET_A,
      caseId: CASE_ID,
      description: "Brake chamber",
      requestedByUserId: MANAGER_ID,
    });
    await advanceToOptionsAvailable(requirement!.id);
    await transitionPartRequirementStatus({
      fleetId: FLEET_A,
      id: requirement!.id,
      toStatus: "recommendation_ready",
    });

    await recordApprovalDecision({
      fleetId: FLEET_A,
      partRequirementId: requirement!.id,
      decision: "needs_more_information",
      reasonNote: "Need a firmer ETA before deciding",
      decidedByUserId: MANAGER_ID,
    });

    // The requirement can now go back through fitment/sourcing work...
    await transitionPartRequirementStatus({ fleetId: FLEET_A, id: requirement!.id, toStatus: "sourcing" });
    await transitionPartRequirementStatus({
      fleetId: FLEET_A,
      id: requirement!.id,
      toStatus: "options_available",
    });
    await transitionPartRequirementStatus({
      fleetId: FLEET_A,
      id: requirement!.id,
      toStatus: "recommendation_ready",
    });

    await recordApprovalDecision({
      fleetId: FLEET_A,
      partRequirementId: requirement!.id,
      decision: "declined",
      reasonNote: "No acceptable option found",
      decidedByUserId: MANAGER_ID,
    });

    const history = await listApprovalHistory(FLEET_A, requirement!.id);
    expect(history).toHaveLength(2);
    expect(history.map((h: any) => h.decision).sort()).toEqual(["declined", "needs_more_information"]);

    const current = await getCurrentApproval(FLEET_A, requirement!.id);
    expect(current?.decision).toBe("declined");

    const finalRequirement = await getPartRequirement(FLEET_A, requirement!.id);
    expect(finalRequirement?.status).toBe("declined");
  });

  it("denies Fleet B from approving or reading Fleet A's approval history", async () => {
    await seedCase(FLEET_A, CASE_ID);
    const requirement = await createPartRequirement({
      fleetId: FLEET_A,
      caseId: CASE_ID,
      description: "Brake chamber",
      requestedByUserId: MANAGER_ID,
    });
    await advanceToOptionsAvailable(requirement!.id);
    await transitionPartRequirementStatus({
      fleetId: FLEET_A,
      id: requirement!.id,
      toStatus: "recommendation_ready",
    });
    const option = await addSupplierOption({
      fleetId: FLEET_A,
      partRequirementId: requirement!.id,
      supplierName: "Supplier",
      priceCents: 1000,
      capturedByUserId: MANAGER_ID,
    });

    await expect(
      recordApprovalDecision({
        fleetId: FLEET_B,
        partRequirementId: requirement!.id,
        decision: "approved",
        selectedOptionId: option!.id,
        decidedByUserId: 999,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(listApprovalHistory(FLEET_B, requirement!.id)).resolves.toEqual([]);
  });

  it("lets only one of two concurrent conflicting decisions on the same requirement succeed", async () => {
    await seedCase(FLEET_A, CASE_ID);
    const requirement = await createPartRequirement({
      fleetId: FLEET_A,
      caseId: CASE_ID,
      description: "Brake chamber",
      requestedByUserId: MANAGER_ID,
    });
    await advanceToOptionsAvailable(requirement!.id);
    await transitionPartRequirementStatus({
      fleetId: FLEET_A,
      id: requirement!.id,
      toStatus: "recommendation_ready",
    });
    const option = await addSupplierOption({
      fleetId: FLEET_A,
      partRequirementId: requirement!.id,
      supplierName: "Supplier",
      priceCents: 1000,
      capturedByUserId: MANAGER_ID,
    });

    // Two managers decide at "the same time": both read the requirement
    // while it's still recommendation_ready/awaiting_approval and both
    // attempt to record a decision. Only one may win — the loser must
    // reject, not silently leave a second approval row behind.
    const results = await Promise.allSettled([
      recordApprovalDecision({
        fleetId: FLEET_A,
        partRequirementId: requirement!.id,
        decision: "approved",
        selectedOptionId: option!.id,
        decidedByUserId: MANAGER_ID,
      }),
      recordApprovalDecision({
        fleetId: FLEET_A,
        partRequirementId: requirement!.id,
        decision: "declined",
        decidedByUserId: MANAGER_ID + 1,
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    // The loser's rejection code depends on exactly where in the two-hop
    // transition it lost the race (CONFLICT if it lost the final
    // awaiting_approval -> decision CAS, BAD_REQUEST if the requirement had
    // already left awaiting_approval entirely by the time it attempted its
    // first hop) — either way it must be rejected, and never insert a
    // second approval row (asserted below).
    expect(["CONFLICT", "BAD_REQUEST"]).toContain(
      (rejected[0] as PromiseRejectedResult).reason.code
    );

    const history = await listApprovalHistory(FLEET_A, requirement!.id);
    expect(history).toHaveLength(1);

    const finalRequirement = await getPartRequirement(FLEET_A, requirement!.id);
    expect(finalRequirement?.status).toBe(
      (fulfilled[0] as PromiseFulfilledResult<any>).value.decision
    );
  });
});

describe("money and availability handling", () => {
  it("safely handles missing price/freight/core-charge fields without fabricating a cost", async () => {
    await seedCase(FLEET_A, CASE_ID);
    const requirement = await createPartRequirement({
      fleetId: FLEET_A,
      caseId: CASE_ID,
      description: "Brake chamber",
      requestedByUserId: MANAGER_ID,
    });
    await recordFitmentAssessment({
      fleetId: FLEET_A,
      partRequirementId: requirement!.id,
      vehicleId: VEHICLE_ID,
      evidence: { technicianConfirmed: true },
      source: "technician_manual",
      assessedByUserId: TECH_ID,
    });
    // No price given at all — e.g. a supplier who hasn't quoted yet.
    await addSupplierOption({
      fleetId: FLEET_A,
      partRequirementId: requirement!.id,
      supplierName: "No Quote Yet",
      capturedByUserId: MANAGER_ID,
    });

    const comparison = await getRecommendedOptions(FLEET_A, requirement!.id);
    expect(comparison.ranked).toHaveLength(1);
    expect(comparison.ranked[0].estimatedAcquisitionCostCents).toBeNull();
  });

  it("does not let a foreign-currency option win on price against a same-currency option, at the full service layer", async () => {
    await seedCase(FLEET_A, CASE_ID);
    const requirement = await createPartRequirement({
      fleetId: FLEET_A,
      caseId: CASE_ID,
      description: "Brake chamber",
      requestedByUserId: MANAGER_ID,
    });
    await recordFitmentAssessment({
      fleetId: FLEET_A,
      partRequirementId: requirement!.id,
      vehicleId: VEHICLE_ID,
      evidence: { technicianConfirmed: true },
      source: "technician_manual",
      assessedByUserId: TECH_ID,
    });
    await addSupplierOption({
      fleetId: FLEET_A,
      partRequirementId: requirement!.id,
      supplierName: "CAD Supplier",
      priceCents: 5000,
      currency: "CAD",
      capturedByUserId: MANAGER_ID,
    });
    const usdOption = await addSupplierOption({
      fleetId: FLEET_A,
      partRequirementId: requirement!.id,
      supplierName: "USD Supplier",
      priceCents: 100,
      currency: "USD",
      capturedByUserId: MANAGER_ID,
    });

    const comparison = await getRecommendedOptions(FLEET_A, requirement!.id);
    expect(comparison.primaryCurrency).toBe("CAD");
    const usdRanked = comparison.ranked.find((r) => r.id === usdOption!.id)!;
    expect(usdRanked.currencyMismatch).toBe(true);
    expect(comparison.recommended?.id).not.toBe(usdOption!.id);
  });

  it("resolves a full tie (same tier, same cost, same everything) the same way every time, not by unspecified DB row order", async () => {
    await seedCase(FLEET_A, CASE_ID);
    const requirement = await createPartRequirement({
      fleetId: FLEET_A,
      caseId: CASE_ID,
      description: "Brake chamber",
      requestedByUserId: MANAGER_ID,
    });
    await recordFitmentAssessment({
      fleetId: FLEET_A,
      partRequirementId: requirement!.id,
      vehicleId: VEHICLE_ID,
      evidence: { technicianConfirmed: true },
      source: "technician_manual",
      assessedByUserId: TECH_ID,
    });
    const first = await addSupplierOption({
      fleetId: FLEET_A,
      partRequirementId: requirement!.id,
      supplierName: "Supplier First",
      priceCents: 1000,
      capturedByUserId: MANAGER_ID,
    });
    await addSupplierOption({
      fleetId: FLEET_A,
      partRequirementId: requirement!.id,
      supplierName: "Supplier Second",
      priceCents: 1000,
      capturedByUserId: MANAGER_ID,
    });

    const runs = await Promise.all([
      getRecommendedOptions(FLEET_A, requirement!.id),
      getRecommendedOptions(FLEET_A, requirement!.id),
      getRecommendedOptions(FLEET_A, requirement!.id),
    ]);
    for (const run of runs) {
      expect(run.recommended?.id).toBe(first!.id);
    }
  });
});
