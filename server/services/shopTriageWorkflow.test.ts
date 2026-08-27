import { beforeEach, describe, expect, it } from "vitest";
import { ENV } from "../_core/env";
import {
  evidenceCompletenessCeiling,
  runShopTriageStep,
  SHOP_CONFIDENCE_THRESHOLD,
  type ShopEvidenceEntry,
} from "./shopTriageWorkflow";

function clearAllProviders() {
  ENV.openRouterApiKey = "";
  ENV.groqApiKey = "";
  ENV.openAiApiKey = "";
  ENV.anthropicApiKey = "";
  ENV.geminiApiKey = "";
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function chatCompletion(content: string) {
  return {
    id: "test",
    created: 0,
    model: "test-model",
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
  };
}

function aiTriagePayload(overrides: Record<string, unknown> = {}) {
  return {
    urgency: "attention",
    safetySummary: "No active hazard reported.",
    confidence: 40,
    likelyCauses: [{ cause: "Faulty sensor", rank: 1, rationale: "Matches reported symptom." }],
    nextDiagnosticStep: {
      type: "test",
      instruction: "Check the connector for corrosion.",
      reason: "Would confirm or rule out a wiring fault.",
    },
    evidenceSummary: "Customer reports intermittent warning light; no tests run yet.",
    remainingVerification: ["Retrieve stored fault codes"],
    diagnosticRationale: "Symptom pattern is consistent with a sensor or wiring fault.",
    ...overrides,
  };
}

const baseInput = {
  complaint: "Check engine light comes on intermittently, especially when cold.",
  vehicleLabel: "2019 Freightliner Cascadia",
  mileage: "412000",
  evidence: [] as ShopEvidenceEntry[],
};

beforeEach(() => {
  clearAllProviders();
});

describe("evidenceCompletenessCeiling", () => {
  it("caps confidence low for a bare complaint with no evidence", () => {
    expect(evidenceCompletenessCeiling({ hasFaultCodes: false, hasMileage: false, evidenceCount: 0 })).toBeLessThan(
      SHOP_CONFIDENCE_THRESHOLD
    );
  });

  it("raises the ceiling as fault codes, mileage, and evidence accumulate", () => {
    const bare = evidenceCompletenessCeiling({ hasFaultCodes: false, hasMileage: false, evidenceCount: 0 });
    const rich = evidenceCompletenessCeiling({ hasFaultCodes: true, hasMileage: true, evidenceCount: 3 });
    expect(rich).toBeGreaterThan(bare);
    expect(rich).toBeLessThanOrEqual(100);
  });
});

describe("runShopTriageStep", () => {
  it("returns an insufficient-evidence fallback (never throws) when no AI provider is configured", async () => {
    const result = await runShopTriageStep(baseInput);
    expect(result.confidenceStatus).toBe("insufficient");
    expect(result.confidence).toBe(0);
    expect(result.nextDiagnosticStep).toBeNull();
    expect(result.likelyCauses).toEqual([]);
  });

  it("reports 'progressing' below threshold with a next diagnostic step", async () => {
    ENV.openRouterApiKey = "test-key";
    const result = await runShopTriageStep(baseInput, {
      fetcher: async () => jsonResponse(chatCompletion(JSON.stringify(aiTriagePayload({ confidence: 40 })))),
    });
    expect(result.confidence).toBeLessThan(SHOP_CONFIDENCE_THRESHOLD);
    expect(result.confidenceStatus).toBe("progressing");
    expect(result.nextDiagnosticStep).not.toBeNull();
    expect(result.nextDiagnosticStep?.type).toBe("test");
  });

  it("clamps self-reported confidence to the evidence-completeness ceiling", async () => {
    ENV.openRouterApiKey = "test-key";
    // Bare complaint, no evidence: ceiling is well under 100. The model
    // claims 99 — must be clamped down, never trusted at face value.
    const result = await runShopTriageStep(
      { ...baseInput, mileage: null },
      { fetcher: async () => jsonResponse(chatCompletion(JSON.stringify(aiTriagePayload({ confidence: 99 })))) }
    );
    const ceiling = evidenceCompletenessCeiling({ hasFaultCodes: false, hasMileage: false, evidenceCount: 0 });
    expect(result.confidence).toBeLessThanOrEqual(ceiling);
    expect(result.confidence).toBeLessThan(99);
  });

  it("reaches target_reached and clears nextDiagnosticStep once confidence clears the threshold with enough evidence", async () => {
    ENV.openRouterApiKey = "test-key";
    const richEvidence: ShopEvidenceEntry[] = [
      { type: "test", instruction: "Check connector", response: "Corroded pin found", recordedAt: new Date().toISOString() },
      { type: "measurement", instruction: "Measure sensor voltage", response: "0.2V, out of spec", recordedAt: new Date().toISOString() },
      { type: "check", instruction: "Confirm warning light active", response: "Yes, active", recordedAt: new Date().toISOString() },
    ];
    const result = await runShopTriageStep(
      { ...baseInput, faultCodes: ["P0562"], evidence: richEvidence },
      {
        fetcher: async () =>
          jsonResponse(
            chatCompletion(
              JSON.stringify(
                aiTriagePayload({ confidence: 90, nextDiagnosticStep: null })
              )
            )
          ),
      }
    );
    expect(result.confidence).toBeGreaterThanOrEqual(SHOP_CONFIDENCE_THRESHOLD);
    expect(result.confidenceStatus).toBe("target_reached");
    expect(result.nextDiagnosticStep).toBeNull();
  });

  it("never presents likely causes as a confirmed diagnosis (prompt-level contract, schema shape)", async () => {
    ENV.openRouterApiKey = "test-key";
    const result = await runShopTriageStep(baseInput, {
      fetcher: async () => jsonResponse(chatCompletion(JSON.stringify(aiTriagePayload()))),
    });
    expect(result.likelyCauses.every((c) => typeof c.cause === "string" && typeof c.rationale === "string")).toBe(
      true
    );
    expect(result.diagnosticRationale).not.toMatch(/^replace /i);
  });

  it("falls back gracefully on invalid AI JSON", async () => {
    ENV.openRouterApiKey = "test-key";
    const result = await runShopTriageStep(baseInput, {
      fetcher: async () => jsonResponse(chatCompletion("not json")),
    });
    expect(result.confidenceStatus).toBe("insufficient");
    expect(result.confidence).toBe(0);
  });
});
