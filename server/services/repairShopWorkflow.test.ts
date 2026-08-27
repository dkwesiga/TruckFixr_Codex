import { beforeEach, describe, expect, it, vi } from "vitest";

// repairShopWorkflow.ts is a thin orchestration layer over existing services
// (maintenanceCases, maintenanceDecisions, outcomeVerification,
// shopTriageWorkflow) plus two direct DB writes (repairFollowUps insert,
// and the followUpDueAt/originalCaseId column updates). Mock at the module
// boundary rather than re-implementing a full drizzle mock, since what this
// file needs verified is the SEQUENCING and STATUS-GUARD logic it adds, not
// the already-tested internals of those services.

const { caseStore, decisionsMock, casesMock, outcomeMock, triageMock, dbMock } = vi.hoisted(() => {
  const caseStore: Record<number, any> = {
    1: { id: 1, fleetId: 1, vehicleId: "veh-1", status: "reported", reference: "MC-2026-000001", summary: "Loses power on hills", title: "Loses power", caseType: null },
  };

  const casesMock = {
    getCaseForFleet: vi.fn(async (_fleetId: number, caseId: number) => caseStore[caseId] ?? null),
    transitionCaseStatus: vi.fn(async ({ caseId, toStatus }: any) => {
      caseStore[caseId].status = toStatus;
      return { from: caseStore[caseId].status, to: toStatus };
    }),
    createManualCase: vi.fn(async (input: any) => {
      const id = Object.keys(caseStore).length + 1;
      const row = { id, fleetId: input.fleetId, vehicleId: input.vehicleId, status: "reported", reference: `MC-2026-00000${id}`, summary: input.summary, title: input.title, caseType: input.caseType ?? null };
      caseStore[id] = row;
      return row;
    }),
  };

  const decisionsMock = {
    addDecision: vi.fn(async (input: any) => ({ id: 1, ...input })),
    listDecisions: vi.fn(async () => [] as any[]),
  };

  const outcomeMock = {
    reportOutcome: vi.fn(async (input: any) => ({ id: 42, ...input })),
    verifyOutcome: vi.fn(async () => ({ ok: true, outcomeState: "verified" as const })),
  };

  const triageMock = {
    runShopTriageStep: vi.fn(async () => ({
      urgency: "attention" as const,
      safetySummary: "No active hazard.",
      confidence: 40,
      likelyCauses: [],
      nextDiagnosticStep: { type: "test" as const, instruction: "Check X", reason: "Would confirm Y" },
      evidenceSummary: "Thin evidence so far.",
      remainingVerification: [],
      diagnosticRationale: "Not enough evidence yet.",
      severity: "attention" as const,
      confidenceStatus: "progressing" as const,
    })),
  };

  const followUpRows: any[] = [];
  const dbMock = {
    getDb: vi.fn(async () => ({
      update: (_tbl: any) => ({
        set: (patch: any) => ({
          where: async () => {
            Object.assign(caseStore[1] ?? {}, patch);
            return undefined;
          },
        }),
      }),
      insert: (_tbl: any) => ({
        values: (vals: any) => ({
          returning: async () => {
            const row = { id: followUpRows.length + 1, ...vals };
            followUpRows.push(row);
            return [row];
          },
        }),
      }),
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([]),
            orderBy: () => Promise.resolve(followUpRows),
          }),
        }),
      }),
    })),
    followUpRows,
  };

  return { caseStore, decisionsMock, casesMock, outcomeMock, triageMock, dbMock };
});

vi.mock("./maintenanceCases", () => casesMock);
vi.mock("./maintenanceDecisions", () => decisionsMock);
vi.mock("./outcomeVerification", () => outcomeMock);
vi.mock("./shopTriageWorkflow", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./shopTriageWorkflow")>();
  return { ...actual, runShopTriageStep: triageMock.runShopTriageStep };
});
vi.mock("../db", () => ({ getDb: dbMock.getDb }));
vi.mock("./maintenanceActivityLog", () => ({ logMaintenanceActivity: async () => {} }));

import {
  advanceShopTriage,
  completeShopTriage,
  createReturnJob,
  recordShopFollowUp,
  recordShopRepairOutcome,
  startShopRepair,
} from "./repairShopWorkflow";

const FLEET = 1;

beforeEach(() => {
  caseStore[1].status = "reported";
  Object.keys(caseStore)
    .filter((k) => k !== "1")
    .forEach((k) => delete caseStore[Number(k)]);
  dbMock.followUpRows.length = 0;
  vi.clearAllMocks();
});

describe("advanceShopTriage", () => {
  it("moves a reported case into triaging on the first turn", async () => {
    caseStore[1].status = "reported";
    await advanceShopTriage({ fleetId: FLEET, caseId: 1, actorUserId: 9 });
    expect(caseStore[1].status).toBe("triaging");
    expect(decisionsMock.addDecision).toHaveBeenCalledTimes(1);
  });

  it("rejects advancing triage on a case that hasn't started or already moved on", async () => {
    caseStore[1].status = "in_repair";
    await expect(advanceShopTriage({ fleetId: FLEET, caseId: 1, actorUserId: 9 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("persists confidence, likely causes, and the next diagnostic step every turn", async () => {
    caseStore[1].status = "triaging";
    await advanceShopTriage({ fleetId: FLEET, caseId: 1, actorUserId: 9 });
    const call = decisionsMock.addDecision.mock.calls[0][0];
    expect(call.confidence).toBe(40);
    expect(call.confidenceStatus).toBe("progressing");
    expect(call.nextDiagnosticStep).toEqual({ type: "test", instruction: "Check X", reason: "Would confirm Y" });
  });

  it("saves the technician's answer to the prior step as this turn's evidence", async () => {
    caseStore[1].status = "triaging";
    decisionsMock.listDecisions.mockResolvedValueOnce([
      {
        id: 1,
        version: 1,
        createdAt: new Date(),
        nextDiagnosticStepJson: { type: "test", instruction: "Check the connector for corrosion.", reason: "x" },
        evidenceJson: null,
      },
    ]);
    await advanceShopTriage({ fleetId: FLEET, caseId: 1, actorUserId: 9, answerToPreviousStep: "Corrosion found on pin 3" });
    const call = decisionsMock.addDecision.mock.calls[0][0];
    expect(call.evidence).toEqual({
      type: "test",
      instruction: "Check the connector for corrosion.",
      response: "Corrosion found on pin 3",
    });
  });

  it("rejects an answer when there is no pending diagnostic step to answer", async () => {
    caseStore[1].status = "triaging";
    decisionsMock.listDecisions.mockResolvedValueOnce([
      { id: 1, version: 1, createdAt: new Date(), nextDiagnosticStepJson: null, evidenceJson: null },
    ]);
    await expect(
      advanceShopTriage({ fleetId: FLEET, caseId: 1, actorUserId: 9, answerToPreviousStep: "some answer" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("resumes a session by reconstructing the evidence trail from persisted decisions", async () => {
    caseStore[1].status = "triaging";
    decisionsMock.listDecisions.mockResolvedValueOnce([
      {
        id: 2,
        version: 2,
        createdAt: new Date(),
        nextDiagnosticStepJson: { type: "measurement", instruction: "Measure sensor voltage", reason: "x" },
        evidenceJson: { type: "test", instruction: "Check connector", response: "Corrosion found on pin 3" },
      },
      {
        id: 1,
        version: 1,
        createdAt: new Date(Date.now() - 1000),
        nextDiagnosticStepJson: { type: "test", instruction: "Check connector", reason: "x" },
        evidenceJson: null,
      },
    ]);
    await advanceShopTriage({ fleetId: FLEET, caseId: 1, actorUserId: 9 });
    expect(triageMock.runShopTriageStep).toHaveBeenCalledTimes(1);
    const triageArg = triageMock.runShopTriageStep.mock.calls[0][0];
    expect(triageArg.evidence).toEqual([
      { type: "test", instruction: "Check connector", response: "Corrosion found on pin 3", recordedAt: expect.any(String) },
    ]);
  });

  it("passes fault codes captured at intake through to the triage prompt", async () => {
    caseStore[1].status = "triaging";
    decisionsMock.listDecisions.mockResolvedValueOnce([
      {
        id: 1,
        version: 1,
        source: "manual",
        createdAt: new Date(),
        nextDiagnosticStepJson: null,
        evidenceJson: { faultCodes: ["P0562", "P0107"] },
      },
    ]);
    await advanceShopTriage({ fleetId: FLEET, caseId: 1, actorUserId: 9 });
    const triageArg = triageMock.runShopTriageStep.mock.calls[0][0];
    expect(triageArg.faultCodes).toEqual(["P0562", "P0107"]);
  });

  it("stops calling the AI once the diagnostic turn cap is reached", async () => {
    caseStore[1].status = "triaging";
    const manyAiTurns = Array.from({ length: 12 }, (_, i) => ({
      id: i + 1,
      version: i + 1,
      source: "ai",
      createdAt: new Date(),
      severity: "attention",
      confidence: 40,
      likelyCausesJson: [],
      immediateChecksJson: [],
      evidenceSummary: "thin",
      safetySummary: "none",
      nextDiagnosticStepJson: { type: "test", instruction: "x", reason: "y" },
      evidenceJson: null,
    }));
    decisionsMock.listDecisions.mockResolvedValueOnce(manyAiTurns);
    await advanceShopTriage({ fleetId: FLEET, caseId: 1, actorUserId: 9 });
    expect(triageMock.runShopTriageStep).not.toHaveBeenCalled();
    const call = decisionsMock.addDecision.mock.calls[0][0];
    expect(call.confidenceStatus).toBe("insufficient");
    expect(call.nextDiagnosticStep).toBeNull();
  });
});

describe("completeShopTriage", () => {
  it("only completes triage while in progress", async () => {
    caseStore[1].status = "reported";
    await expect(completeShopTriage({ fleetId: FLEET, caseId: 1, actorUserId: 9 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("transitions triaging -> decision_pending", async () => {
    caseStore[1].status = "triaging";
    await completeShopTriage({ fleetId: FLEET, caseId: 1, actorUserId: 9 });
    expect(caseStore[1].status).toBe("decision_pending");
  });
});

describe("startShopRepair", () => {
  it("starts repair from decision_pending", async () => {
    caseStore[1].status = "decision_pending";
    await startShopRepair({ fleetId: FLEET, caseId: 1, actorUserId: 9 });
    expect(caseStore[1].status).toBe("in_repair");
  });

  it("refuses to start repair straight from reported", async () => {
    caseStore[1].status = "reported";
    await expect(startShopRepair({ fleetId: FLEET, caseId: 1, actorUserId: 9 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});

describe("recordShopRepairOutcome", () => {
  const outcomeInput = {
    fleetId: FLEET,
    caseId: 1,
    actorUserId: 9,
    confirmedFault: "Corroded sensor connector",
    repairPerformed: "Replaced connector and pigtail",
    partsReplaced: ["connector pigtail"],
    verificationMethod: "electrical_verification" as const,
    shopConfidence: 92,
  };

  it("requires the required fields to move the case to awaiting_follow_up with a due date", async () => {
    caseStore[1].status = "in_repair";
    const result = await recordShopRepairOutcome(outcomeInput);
    expect(outcomeMock.reportOutcome).toHaveBeenCalledTimes(1);
    expect(outcomeMock.verifyOutcome).toHaveBeenCalledTimes(1);
    expect(caseStore[1].status).toBe("awaiting_follow_up");
    expect(result.followUpDueAt).toBeInstanceOf(Date);
    const daysOut = (result.followUpDueAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(daysOut).toBeGreaterThan(2.9);
    expect(daysOut).toBeLessThan(3.1);
  });

  it("rejects recording an outcome before repair has started", async () => {
    caseStore[1].status = "triaging";
    await expect(recordShopRepairOutcome(outcomeInput)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("recordShopFollowUp", () => {
  it("closes the case when the follow-up is resolved", async () => {
    caseStore[1].status = "awaiting_follow_up";
    const { followUp } = await recordShopFollowUp({ fleetId: FLEET, caseId: 1, actorUserId: 9, result: "resolved" });
    expect(followUp.result).toBe("resolved");
    expect(caseStore[1].status).toBe("closed");
  });

  it("sends the case back to in_repair when not fully resolved", async () => {
    caseStore[1].status = "awaiting_follow_up";
    await recordShopFollowUp({ fleetId: FLEET, caseId: 1, actorUserId: 9, result: "partially_resolved" });
    expect(caseStore[1].status).toBe("in_repair");
  });

  it("flags the case as a return_job when the problem returned", async () => {
    caseStore[1].status = "awaiting_follow_up";
    await recordShopFollowUp({ fleetId: FLEET, caseId: 1, actorUserId: 9, result: "returned" });
    expect(caseStore[1].status).toBe("return_job");
  });

  it("rejects recording a follow-up outside awaiting_follow_up", async () => {
    caseStore[1].status = "in_repair";
    await expect(
      recordShopFollowUp({ fleetId: FLEET, caseId: 1, actorUserId: 9, result: "resolved" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("createReturnJob", () => {
  it("creates a new case linked to the original without mutating the original's complaint", async () => {
    caseStore[1].status = "return_job";
    caseStore[1].summary = "Original complaint, verbatim";
    const before = { ...caseStore[1] };

    const { returnJobCase, originalCase } = await createReturnJob({
      fleetId: FLEET,
      originalCaseId: 1,
      actorUserId: 9,
      complaint: "Same power-loss symptom came back",
    });

    expect(returnJobCase.originalCaseId).toBe(1);
    expect(returnJobCase.id).not.toBe(1);
    expect(returnJobCase.summary).toBe("Same power-loss symptom came back");
    // Original case's own complaint/fields are untouched.
    expect(originalCase.summary).toBe(before.summary);
    expect(caseStore[1].summary).toBe("Original complaint, verbatim");
  });
});
