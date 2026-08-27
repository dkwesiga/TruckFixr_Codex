import { beforeEach, describe, expect, it } from "vitest";
import { ENV } from "../_core/env";
import { extractJsonObject, invokeWithOrchestration } from "./aiOrchestrator";

function createJsonResponse(body: unknown, init?: { status?: number; statusText?: string }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    statusText: init?.statusText ?? "OK",
    headers: {
      "Content-Type": "application/json",
    },
  });
}

describe("extractJsonObject", () => {
  it("passes through a clean JSON object unchanged", () => {
    expect(extractJsonObject('{"a":1}')).toBe('{"a":1}');
  });

  it("extracts JSON wrapped in a ```json fence", () => {
    expect(extractJsonObject('Here you go:\n```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("extracts JSON wrapped in a bare ``` fence", () => {
    expect(extractJsonObject('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("extracts a JSON object embedded in surrounding prose with no fence", () => {
    expect(extractJsonObject('Sure, the answer is {"a":1} — let me know if you need more.')).toBe('{"a":1}');
  });
});

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

  it("sends reasoning:{enabled:false} to OpenRouter when disableReasoning is set (measured to roughly halve latency and stop reasoning tokens from eating the completion budget)", async () => {
    await invokeWithOrchestration(
      {
        preferredProvider: "openrouter",
        messages: [{ role: "user", content: "Classify this." }],
        responseFormat: { type: "json_object" },
        maxTokens: 120,
        disableReasoning: true,
      },
      {
        fetcher: async (_url, init) => {
          const body = JSON.parse(String(init?.body));
          expect(body.reasoning).toEqual({ enabled: false });
          return createJsonResponse({
            id: "openrouter-response",
            created: 123456,
            model: "openrouter/free",
            choices: [{ index: 0, message: { role: "assistant", content: "{}" }, finish_reason: "stop" }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          });
        },
      }
    );
  });

  it("omits the reasoning field for OpenRouter when disableReasoning is not set (default, unchanged behavior)", async () => {
    await invokeWithOrchestration(
      {
        preferredProvider: "openrouter",
        messages: [{ role: "user", content: "Classify this." }],
        responseFormat: { type: "json_object" },
        maxTokens: 120,
      },
      {
        fetcher: async (_url, init) => {
          const body = JSON.parse(String(init?.body));
          expect(body.reasoning).toBeUndefined();
          return createJsonResponse({
            id: "openrouter-response",
            created: 123456,
            model: "openrouter/free",
            choices: [{ index: 0, message: { role: "assistant", content: "{}" }, finish_reason: "stop" }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          });
        },
      }
    );
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

  describe("model-aware image capability (Groq VIN OCR)", () => {
    const imageMessages = [
      {
        role: "user" as const,
        content: [
          { type: "text" as const, text: "Extract the VIN." },
          { type: "image_url" as const, image_url: { url: "data:image/jpeg;base64,abc123" } },
        ],
      },
    ];

    it("sends image content to Groq's pinned vision model and reports it as the provider used", async () => {
      const result = await invokeWithOrchestration(
        {
          feature: "ocr_vin",
          preferredProvider: "groq",
          model: "qwen/qwen3.6-27b",
          fallbackProviders: ["openrouter", "openai"],
          messages: imageMessages,
          responseFormat: { type: "json_object" },
        },
        {
          fetcher: async (url, init) => {
            expect(String(url)).toContain("api.groq.com/openai/v1/chat/completions");
            const body = JSON.parse(String(init?.body));
            expect(body.model).toBe("qwen/qwen3.6-27b");
            const imagePart = body.messages[0].content.find((part: { type: string }) => part.type === "image_url");
            expect(imagePart.image_url.url).toBe("data:image/jpeg;base64,abc123");

            return createJsonResponse({
              id: "groq-vin-response",
              created: 123456,
              model: "qwen/qwen3.6-27b",
              choices: [
                {
                  index: 0,
                  message: { role: "assistant", content: '{"vinCandidate":"1M1AW07Y7FM010001","rawText":"1M1AW07Y7FM010001"}' },
                  finish_reason: "stop",
                },
              ],
              usage: { prompt_tokens: 300, completion_tokens: 20, total_tokens: 320 },
            });
          },
        }
      );

      expect(result.orchestration?.provider).toBe("groq");
      expect(result.orchestration?.attempts).toHaveLength(1);
      expect(result.orchestration?.attempts[0]?.success).toBe(true);
    });

    it("rejects Groq's default text-only model for image content and does not call it", async () => {
      let groqCalled = false;

      const result = await invokeWithOrchestration(
        {
          feature: "ocr_vin",
          preferredProvider: "groq",
          // No model override — falls back to ENV.groqModel ("qwen/qwen3-32b" in this suite's
          // beforeEach), a text-only model that must NOT be treated as image-capable.
          fallbackProviders: [],
          messages: imageMessages,
          responseFormat: { type: "json_object" },
        },
        {
          fetcher: async () => {
            groqCalled = true;
            throw new Error("should not be called for a text-only model with image content");
          },
        }
      );

      expect(groqCalled).toBe(false);
      expect(result.orchestration?.attempts).toEqual([
        expect.objectContaining({ provider: "groq", success: false, reason: "image_inputs_not_supported" }),
      ]);
    });

    it("treats a Groq rate limit (429) as a provider failure and falls through to the next eligible provider", async () => {
      const result = await invokeWithOrchestration(
        {
          feature: "ocr_vin",
          preferredProvider: "groq",
          model: "qwen/qwen3.6-27b",
          fallbackProviders: ["openrouter", "openai"],
          messages: imageMessages,
          responseFormat: { type: "json_object" },
        },
        {
          fetcher: async (url) => {
            if (String(url).includes("api.groq.com")) {
              return createJsonResponse({ error: { message: "Rate limit exceeded" } }, { status: 429, statusText: "Too Many Requests" });
            }
            // OpenRouter has no OPENROUTER_VISION_MODEL configured in this test, so it's
            // skipped structurally (image_inputs_not_supported) without a network call —
            // only OpenAI should actually be reached here.
            expect(String(url)).toContain("api.openai.com/v1/chat/completions");
            return createJsonResponse({
              id: "openai-vin-response",
              created: 123456,
              model: "gpt-4.1-mini",
              choices: [
                {
                  index: 0,
                  message: { role: "assistant", content: '{"vinCandidate":"1M1AW07Y7FM010001","rawText":"1M1AW07Y7FM010001"}' },
                  finish_reason: "stop",
                },
              ],
              usage: { prompt_tokens: 300, completion_tokens: 20, total_tokens: 320 },
            });
          },
        }
      );

      expect(result.orchestration?.provider).toBe("openai");
      const groqAttempt = result.orchestration?.attempts.find((a) => a.provider === "groq");
      expect(groqAttempt?.success).toBe(false);
      expect(groqAttempt?.reason).toContain("429");
      const openrouterAttempt = result.orchestration?.attempts.find((a) => a.provider === "openrouter");
      expect(openrouterAttempt).toEqual(expect.objectContaining({ success: false, reason: "image_inputs_not_supported" }));
    });

    it("skips Groq when GROQ_API_KEY is not configured and attempts the next eligible provider", async () => {
      ENV.groqApiKey = "";

      const result = await invokeWithOrchestration(
        {
          feature: "ocr_vin",
          preferredProvider: "groq",
          model: "qwen/qwen3.6-27b",
          fallbackProviders: ["openrouter", "openai"],
          messages: imageMessages,
          responseFormat: { type: "json_object" },
        },
        {
          fetcher: async (url) => {
            expect(String(url)).toContain("api.openai.com/v1/chat/completions");
            return createJsonResponse({
              id: "openai-vin-response",
              created: 123456,
              model: "gpt-4.1-mini",
              choices: [
                {
                  index: 0,
                  message: { role: "assistant", content: '{"vinCandidate":"1M1AW07Y7FM010001","rawText":"1M1AW07Y7FM010001"}' },
                  finish_reason: "stop",
                },
              ],
              usage: { prompt_tokens: 300, completion_tokens: 20, total_tokens: 320 },
            });
          },
        }
      );

      const groqAttempt = result.orchestration?.attempts.find((a) => a.provider === "groq");
      expect(groqAttempt).toEqual(expect.objectContaining({ success: false, reason: "provider_not_configured" }));
      expect(result.orchestration?.provider).toBe("openai");
    });

    it("returns OCR_PROVIDER_UNAVAILABLE-eligible synthetic fallback (zero successes) when every eligible provider fails", async () => {
      const result = await invokeWithOrchestration(
        {
          feature: "ocr_vin",
          preferredProvider: "groq",
          model: "qwen/qwen3.6-27b",
          fallbackProviders: ["openrouter", "openai"],
          messages: imageMessages,
          responseFormat: { type: "json_object" },
        },
        {
          fetcher: async (url) => {
            if (String(url).includes("api.groq.com")) {
              return createJsonResponse({ error: { message: "Rate limit exceeded" } }, { status: 429, statusText: "Too Many Requests" });
            }
            return createJsonResponse({ error: { message: "quota exceeded" } }, { status: 429, statusText: "Too Many Requests" });
          },
        }
      );

      expect(result.orchestration?.attempts.some((a) => a.success)).toBe(false);
      expect(JSON.parse(result.choices[0]?.message.content as string)).toEqual({
        status: "unavailable",
        feature: "ocr_vin",
        reason: "provider_unavailable",
      });
    });
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

    const result = await invokeWithOrchestration(
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
    );

    expect(invocationCount).toBe(1);
    expect(result.orchestration?.provider).toBe("openrouter");
    expect(result.orchestration?.attempts).toHaveLength(1);
    expect(result.choices[0]?.message.content).toContain("temporarily unavailable");
  });

  it("Test E: gives structured-extraction features (ocr_vin) an OCR-shaped fallback, not the diagnosis-flavored one", async () => {
    const result = await invokeWithOrchestration(
      {
        feature: "ocr_vin",
        preferredProvider: "openrouter",
        fallbackProviders: [],
        messages: [{ role: "user", content: "Extract the VIN." }],
        responseFormat: { type: "json_object" },
        maxTokens: 120,
      },
      {
        fetcher: async () => {
          throw new Error("AI request timed out");
        },
      }
    );

    const content = result.choices[0]?.message.content;
    expect(content).not.toContain("temporarily unavailable");
    expect(content).not.toContain("fault codes");
    expect(content).not.toContain("safety-critical");
    expect(JSON.parse(content as string)).toEqual({
      status: "unavailable",
      feature: "ocr_vin",
      reason: "provider_unavailable",
    });
  });

  it("leaves non-OCR features (e.g. diagnosis, unspecified feature) on the original safety-oriented fallback text", async () => {
    const result = await invokeWithOrchestration(
      {
        feature: "diagnosis_intake",
        preferredProvider: "openrouter",
        fallbackProviders: [],
        messages: [{ role: "user", content: "Summarize the diagnosis." }],
        responseFormat: { type: "json_object" },
        maxTokens: 120,
      },
      {
        fetcher: async () => {
          throw new Error("AI request timed out");
        },
      }
    );

    const content = result.choices[0]?.message.content;
    expect(content).toContain("temporarily unavailable");
    expect(content).toContain("safety-critical");
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
