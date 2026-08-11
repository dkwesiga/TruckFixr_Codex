import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Behavioral tests for the partner knowledge-promotion router.
 *
 * The repo has no live-DB test harness, so these tests call the real tRPC
 * procedures through a scripted fake `db`: each awaited query chain pops the
 * next scripted result, and insert/update payloads are recorded for
 * assertions. This genuinely exercises the authz branches, the atomic-claim
 * CONFLICT path, and the source-row dedupe logic — everything except the SQL
 * itself, which is pinned by the guardrail tests at the bottom.
 */

const canManageVehicleAccess = vi.fn();
vi.mock("./services/vehicleAccess", () => ({
  canManageVehicleAccess: (...args: unknown[]) => canManageVehicleAccess(...args),
}));

type RecordedCall = {
  op: "select" | "insert" | "update";
  table?: unknown;
  values?: unknown;
  set?: unknown;
};

let script: unknown[] = [];
let calls: RecordedCall[] = [];

function scriptedDb() {
  let cursor = 0;
  const nextResult = () => {
    if (cursor >= script.length) {
      throw new Error(`db script exhausted after ${cursor} queries`);
    }
    return script[cursor++];
  };

  const builder = (call: RecordedCall) => {
    calls.push(call);
    const chain: Record<string, unknown> = {};
    const passthrough = ["from", "where", "limit", "orderBy", "returning", "onConflictDoNothing"];
    for (const method of passthrough) {
      chain[method] = () => chain;
    }
    chain.values = (arg: unknown) => {
      call.values = arg;
      return chain;
    };
    chain.set = (arg: unknown) => {
      call.set = arg;
      return chain;
    };
    // Awaiting the chain at any point resolves to the next scripted result.
    chain.then = (onFulfilled: (value: unknown) => unknown, onRejected: (reason: unknown) => unknown) =>
      Promise.resolve()
        .then(nextResult)
        .then(onFulfilled, onRejected);
    return chain;
  };

  const db = {
    select: () => builder({ op: "select" }),
    insert: (table: unknown) => builder({ op: "insert", table }),
    update: (table: unknown) => builder({ op: "update", table }),
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(db),
  };
  return db;
}

vi.mock("./db", () => ({
  getDb: async () => scriptedDb(),
}));

import { createCallerFactory } from "./_core/trpc";
import { partnerRouter } from "./routers/partner";
import {
  faultCodeReferences,
  faultCodeReferenceSources,
  repairOutcomes,
} from "../drizzle/schema";

const createCaller = createCallerFactory(partnerRouter);

function callerFor(user: { id: number; role: string }) {
  return createCaller({ req: {} as never, res: {} as never, user: user as never });
}

const partnerFleetRow = { id: 7, name: "Mr Diesel Inc", isPartner: true };
const promotableOutcome = {
  id: 100,
  fleetId: 7,
  vehicleId: "22",
  defectId: null,
  diagnosticCaseId: "case-abc-123",
  recordedByUserId: 42,
  confirmedFault: "SCR efficiency below threshold",
  repairPerformed: "Replaced DEF dosing valve",
  partsReplaced: ["DEF dosing valve"],
  aiDiagnosisCorrect: "yes",
  confirmationState: "mechanic_confirmed",
  source: "partner_shop",
  promotedReferenceId: null,
  promotedAt: null,
  promotedByUserId: null,
};

const referenceDraft = {
  codeSystem: "J1939",
  code: "SPN 4364 FMI 18",
  category: "aftertreatment",
  title: "SCR efficiency derate on DEF dosing failure",
  riskLevel: "high" as const,
  recommendedChecks: ["Inspect DEF dosing valve"],
};

const promoteInput = { fleetId: 7, outcomeId: 100, reference: referenceDraft };

beforeEach(() => {
  script = [];
  calls = [];
  canManageVehicleAccess.mockReset();
  canManageVehicleAccess.mockResolvedValue(true);
});

describe("partner router authz", () => {
  it("rejects promotion from a non-partner fleet", async () => {
    script = [[{ ...partnerFleetRow, isPartner: false }]];
    await expect(callerFor({ id: 42, role: "owner" }).promoteOutcomeToReference(promoteInput))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects a caller who does not manage the partner fleet", async () => {
    script = [[partnerFleetRow]];
    canManageVehicleAccess.mockResolvedValue(false);
    await expect(callerFor({ id: 42, role: "owner" }).promoteOutcomeToReference(promoteInput))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects an outcome that belongs to another fleet", async () => {
    script = [[partnerFleetRow], [{ ...promotableOutcome, fleetId: 9 }]];
    await expect(callerFor({ id: 42, role: "owner" }).promoteOutcomeToReference(promoteInput))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects a reference draft carrying PII before touching the knowledge base", async () => {
    script = [[partnerFleetRow], [promotableOutcome]];
    await expect(
      callerFor({ id: 42, role: "owner" }).promoteOutcomeToReference({
        ...promoteInput,
        reference: { ...referenceDraft, title: "Fix for VIN 1HGCM82633A004352" },
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    // Nothing was written: no insert or update was issued.
    expect(calls.filter((call) => call.op !== "select")).toHaveLength(0);
  });

  it("gates listPromotableOutcomes to partner fleets", async () => {
    script = [[{ ...partnerFleetRow, isPartner: false }]];
    await expect(callerFor({ id: 42, role: "owner" }).listPromotableOutcomes({ fleetId: 7 }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("partner router promotion", () => {
  it("promotes an outcome end-to-end and stamps provenance", async () => {
    script = [
      [partnerFleetRow], // requirePartnerFleet
      [promotableOutcome], // load outcome
      [{ id: 5 }], // ensurePartnerSourceId: existing source found
      [{ id: 100 }], // transaction: claim succeeds
      [{ id: 900 }], // insert reference
      [], // insert approval
      [], // stamp outcome
    ];

    const result = await callerFor({ id: 42, role: "owner" }).promoteOutcomeToReference(promoteInput);
    expect(result).toEqual({ success: true, referenceId: 900, reviewStatus: "needs_review" });

    const referenceInsert = calls.find(
      (call) => call.op === "insert" && call.table === faultCodeReferences
    );
    expect(referenceInsert?.values).toMatchObject({
      sourceId: 5,
      reviewStatus: "needs_review",
      normalizedCode: "SPN 4364 FMI 18",
      metadata: expect.objectContaining({ originRepairOutcomeId: 100, partnerFleetId: "7" }),
    });

    const stamp = calls.filter((call) => call.op === "update" && call.table === repairOutcomes).at(-1);
    expect(stamp?.set).toMatchObject({ promotedReferenceId: 900 });
  });

  it("returns CONFLICT and writes no reference when the claim is lost", async () => {
    script = [
      [partnerFleetRow],
      [promotableOutcome],
      [{ id: 5 }], // existing source
      [], // transaction: claim returns no rows — another request won
    ];

    await expect(callerFor({ id: 42, role: "owner" }).promoteOutcomeToReference(promoteInput))
      .rejects.toMatchObject({ code: "CONFLICT" });

    expect(calls.some((call) => call.op === "insert" && call.table === faultCodeReferences)).toBe(false);
  });

  it("reuses an existing partner source row instead of inserting a duplicate", async () => {
    script = [
      [partnerFleetRow],
      [promotableOutcome],
      [{ id: 5 }], // existing source found
      [{ id: 100 }],
      [{ id: 901 }],
      [],
      [],
    ];

    await callerFor({ id: 42, role: "owner" }).promoteOutcomeToReference(promoteInput);
    expect(
      calls.some((call) => call.op === "insert" && call.table === faultCodeReferenceSources)
    ).toBe(false);
  });

  it("recovers the winner's source row after losing the source-insert race", async () => {
    script = [
      [partnerFleetRow],
      [promotableOutcome],
      [], // no existing source
      [], // insert hits ON CONFLICT DO NOTHING — no row returned
      [{ id: 77 }], // re-select finds the winner's row
      [{ id: 100 }], // claim
      [{ id: 902 }], // insert reference
      [],
      [],
    ];

    const result = await callerFor({ id: 42, role: "owner" }).promoteOutcomeToReference(promoteInput);
    expect(result.referenceId).toBe(902);

    const referenceInsert = calls.find(
      (call) => call.op === "insert" && call.table === faultCodeReferences
    );
    expect(referenceInsert?.values).toMatchObject({ sourceId: 77 });
  });
});

describe("partner promotion SQL guardrails", () => {
  const routerSource = readFileSync(resolve(process.cwd(), "server/routers/partner.ts"), "utf8");
  const migration = readFileSync(
    resolve(process.cwd(), "drizzle/0033_partner_source_unique_guard.sql"),
    "utf8"
  );

  it("claims the outcome row with a promotedAt IS NULL condition inside the transaction", () => {
    expect(routerSource).toContain("db.transaction(");
    expect(routerSource).toContain("isNull(repairOutcomes.promotedAt)");
  });

  it("relies on the partial unique index for partner source dedupe", () => {
    expect(routerSource).toContain(".onConflictDoNothing()");
    expect(migration).toContain('"faultCodeReferenceSources_partner_fleet_unique"');
    expect(migration).toContain("WHERE \"sourceType\" = 'partner_shop'");
  });
});
