import { beforeEach, describe, expect, it } from "vitest";
import { ENV } from "../_core/env";
import { invokeWithOrchestration } from "./aiOrchestrator";

function createJsonResponse(body: unknown, init?: { status?: number; statusText?: string }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    statusText: init?.statusText ?? "OK",
    headers: {
      "Content-Type": "application/json",
    },
  });
}

describe("aiOrchestrator", () => {
  beforeEach(() => {
    ENV.openAiApiKey = "openai-test-key";
    ENV.openAiModel = "gpt-4.1-mini";
    ENV.anthropicApiKey = "anthropic-test-key";
    ENV.anthropicModel = "claude-sonnet-4-20250514";
    ENV.geminiApiKey = "gemini-test-key";
    ENV.geminiModel = "gemini-2.5-flash";
  });

  it("routes to the preferred provider and tracks usage, latency, and cost", async () => {
    const result = await invokeWithOrchestration(
      {
        preferredProvider: "openai",
        messages: [{ role: "user", content: "Summarize this fault." }],
        maxTokens: 200,
      },
      {
        fetcher: async () =>
          createJsonResponse({
            id: "chatcmpl-test",
            created: 123456,
            model: "gpt-4.1-mini",
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: "Summary ready" },
                finish_reason: "stop",
              },
            ],
            usage: {
              prompt_tokens: 120,
              completion_tokens: 40,
              total_tokens: 160,
            },
          }),
      }
    );

    expect(result.choices[0]?.message.content).toBe("Summary ready");
    expect(result.orchestration?.provider).toBe("openai");
    expect(result.orchestration?.estimatedCostUsd).toBeGreaterThan(0);
    expect(result.orchestration?.attempts[0]).toMatchObject({
      provider: "openai",
      success: true,
      promptTokens: 120,
      completionTokens: 40,
      totalTokens: 160,
    });
  });

  it("falls back to the next provider after a timeout-style failure", async () => {
    let invocationCount = 0;

    const result = await invokeWithOrchestration(
      {
        preferredProvider: "openai",
        fallbackProviders: ["gemini"],
        messages: [{ role: "user", content: "Need a diagnosis summary." }],
      },
      {
        fetcher: async (url) => {
          invocationCount += 1;
          if (String(url).includes("openai.com")) {
            throw new Error("AI request timed out");
          }

          return createJsonResponse({
            responseId: "gemini-response",
            modelVersion: "gemini-2.5-flash",
            candidates: [
              {
                content: {
                  parts: [{ text: "Fallback provider response" }],
                },
                finishReason: "STOP",
              },
            ],
            usageMetadata: {
              promptTokenCount: 80,
              candidatesTokenCount: 30,
              totalTokenCount: 110,
            },
          });
        },
      }
    );

    expect(invocationCount).toBe(2);
    expect(result.choices[0]?.message.content).toBe("Fallback provider response");
    expect(result.orchestration?.provider).toBe("gemini");
    expect(result.orchestration?.attempts).toHaveLength(2);
    expect(result.orchestration?.attempts[0]).toMatchObject({
      provider: "openai",
      success: false,
    });
    expect(result.orchestration?.attempts[1]).toMatchObject({
      provider: "gemini",
      success: true,
    });
  });
});
