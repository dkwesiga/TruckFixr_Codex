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
    ENV.groqApiKey = "groq-test-key";
    ENV.groqModel = "qwen/qwen3-32b";
    ENV.openRouterApiKey = "openrouter-test-key";
    ENV.openRouterModel = "openrouter/free";
    ENV.openAiApiKey = "openai-test-key";
    ENV.openAiModel = "gpt-4.1-mini";
    ENV.anthropicApiKey = "anthropic-test-key";
    ENV.anthropicModel = "claude-sonnet-4-20250514";
    ENV.geminiApiKey = "gemini-test-key";
    ENV.geminiModel = "gemini-2.5-flash";
  });

  it("supports OpenRouter as a preferred provider for free-model fallback", async () => {
    const result = await invokeWithOrchestration(
      {
        preferredProvider: "openrouter",
        messages: [{ role: "user", content: "Ask one precise clarifying question." }],
        responseFormat: { type: "json_object" },
        maxTokens: 120,
      },
      {
        fetcher: async (url) => {
          expect(String(url)).toContain("openrouter.ai/api/v1/chat/completions");

          return createJsonResponse({
            id: "openrouter-response",
            created: 123456,
            model: "openrouter/free",
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: '{"question":"Does the issue happen only under load?"}' },
                finish_reason: "stop",
              },
            ],
            usage: {
              prompt_tokens: 90,
              completion_tokens: 20,
              total_tokens: 110,
            },
          });
        },
      }
    );

    expect(result.choices[0]?.message.content).toBe(
      '{"question":"Does the issue happen only under load?"}'
    );
    expect(result.orchestration?.provider).toBe("openrouter");
    expect(result.orchestration?.estimatedCostUsd).toBe(0);
  });

  it("supports Groq as a preferred provider for TADIS question generation", async () => {
    const result = await invokeWithOrchestration(
      {
        preferredProvider: "groq",
        messages: [{ role: "user", content: "Ask one specific clarifying question." }],
        responseFormat: { type: "json_object" },
        maxTokens: 120,
      },
      {
        fetcher: async (url) => {
          expect(String(url)).toContain("api.groq.com/openai/v1/chat/completions");

          return createJsonResponse({
            id: "groq-response",
            created: 123456,
            model: "qwen/qwen3-32b",
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: '{"question":"Does the warning appear only while braking downhill?"}',
                },
                finish_reason: "stop",
              },
            ],
            usage: {
              prompt_tokens: 88,
              completion_tokens: 18,
              total_tokens: 106,
            },
          });
        },
      }
    );

    expect(result.choices[0]?.message.content).toBe(
      '{"question":"Does the warning appear only while braking downhill?"}'
    );
    expect(result.orchestration?.provider).toBe("groq");
    expect(result.orchestration?.estimatedCostUsd).toBeNull();
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

  it("honors an explicit empty fallback list and does not spill into other configured providers", async () => {
    let invocationCount = 0;

    await expect(
      invokeWithOrchestration(
        {
          preferredProvider: "openrouter",
          fallbackProviders: [],
          messages: [{ role: "user", content: "Return diagnostic JSON." }],
          responseFormat: { type: "json_object" },
          maxTokens: 120,
        },
        {
          fetcher: async (url) => {
            invocationCount += 1;
            expect(String(url)).toContain("openrouter.ai/api/v1/chat/completions");
            throw new Error("AI request timed out");
          },
        }
      )
    ).rejects.toThrow(/openrouter/i);

    expect(invocationCount).toBe(1);
  });

  it("uses provider-native fallback models when the preferred provider model should not carry across", async () => {
    let openRouterCalled = false;

    const result = await invokeWithOrchestration(
      {
        preferredProvider: "openrouter",
        fallbackProviders: ["gemini"],
        model: "openrouter/free",
        messages: [{ role: "user", content: "Return diagnostic JSON." }],
        responseFormat: { type: "json_object" },
        maxTokens: 120,
      },
      {
        fetcher: async (url) => {
          const urlString = String(url);

          if (urlString.includes("openrouter.ai")) {
            openRouterCalled = true;
            throw new Error("AI request timed out");
          }

          expect(openRouterCalled).toBe(true);
          expect(urlString).toContain("generativelanguage.googleapis.com");
          expect(urlString).toContain("models/gemini-2.5-flash:generateContent");
          expect(urlString).not.toContain("openrouter/free");

          return createJsonResponse({
            responseId: "gemini-fallback-response",
            modelVersion: "gemini-2.5-flash",
            candidates: [
              {
                content: {
                  parts: [{ text: "Provider-native fallback succeeded" }],
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

    expect(result.choices[0]?.message.content).toBe("Provider-native fallback succeeded");
    expect(result.orchestration?.provider).toBe("gemini");
  });
});
