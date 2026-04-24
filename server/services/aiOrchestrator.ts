import { randomUUID } from "node:crypto";
import { ENV } from "../_core/env";

export type AiProvider = "openai" | "anthropic" | "gemini" | "openrouter" | "groq";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4";
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type OrchestratorInput = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  maxTokens?: number;
  temperature?: number;
  responseFormat?: ResponseFormat;
  preferredProvider?: AiProvider;
  fallbackProviders?: AiProvider[];
  model?: string;
  timeoutMs?: number;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  orchestration?: {
    provider: AiProvider;
    model: string;
    latencyMs: number;
    estimatedCostUsd: number | null;
    attempts: Array<{
      provider: AiProvider;
      model: string;
      latencyMs: number;
      success: boolean;
      reason?: string;
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
      estimatedCostUsd?: number | null;
    }>;
  };
};

type ProviderAttempt = NonNullable<InvokeResult["orchestration"]>["attempts"][number];

type ProviderUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

type ProviderResponse = {
  result: InvokeResult;
  usage: ProviderUsage;
  provider: AiProvider;
  model: string;
};

type FetchLike = typeof fetch;

type ProviderConfig = {
  key: string;
  model: string;
  supportsImages: boolean;
  supportsTools: boolean;
  supportsJsonSchema: boolean;
};

type PriceCard = {
  inputPerMillion: number;
  outputPerMillion: number;
};

const DEFAULT_TIMEOUT_MS = 18_000;
const DEFAULT_MODELS: Record<AiProvider, string> = {
  openai: "gpt-4.1-mini",
  anthropic: "claude-sonnet-4-20250514",
  gemini: "gemini-2.5-flash",
  openrouter: "openrouter/free",
  groq: "qwen/qwen3-32b",
};

const DEFAULT_PRICE_CARDS: Record<AiProvider, PriceCard> = {
  openai: { inputPerMillion: 0.4, outputPerMillion: 1.6 },
  anthropic: { inputPerMillion: 3, outputPerMillion: 15 },
  gemini: { inputPerMillion: 0.3, outputPerMillion: 2.5 },
  openrouter: { inputPerMillion: 0, outputPerMillion: 0 },
  groq: { inputPerMillion: Number.NaN, outputPerMillion: Number.NaN },
};

const normalizeText = (value: string) => value.replace(/\s+/g, " ").trim();

const ensureArray = (value: MessageContent | MessageContent[]): MessageContent[] =>
  Array.isArray(value) ? value : [value];

const extractTextContent = (message: Message) =>
  ensureArray(message.content)
    .map((part) => {
      if (typeof part === "string") return part;
      if (part.type === "text") return part.text;
      if (part.type === "image_url") return `[image:${part.image_url.url}]`;
      if (part.type === "file_url") return `[file:${part.file_url.url}]`;
      return "";
    })
    .filter(Boolean)
    .join("\n");

const hasImageContent = (messages: Message[]) =>
  messages.some((message) =>
    ensureArray(message.content).some(
      (part) => typeof part !== "string" && part.type === "image_url"
    )
  );

const hasUnsupportedFiles = (messages: Message[]) =>
  messages.some((message) =>
    ensureArray(message.content).some(
      (part) => typeof part !== "string" && part.type === "file_url"
    )
  );

function resolveProviderConfig(provider: AiProvider): ProviderConfig {
  switch (provider) {
    case "openai":
      return {
        key: ENV.openAiApiKey,
        model: ENV.openAiModel || DEFAULT_MODELS.openai,
        supportsImages: true,
        supportsTools: true,
        supportsJsonSchema: true,
      };
    case "anthropic":
      return {
        key: ENV.anthropicApiKey,
        model: ENV.anthropicModel || DEFAULT_MODELS.anthropic,
        supportsImages: false,
        supportsTools: false,
        supportsJsonSchema: false,
      };
    case "gemini":
      return {
        key: ENV.geminiApiKey,
        model: ENV.geminiModel || DEFAULT_MODELS.gemini,
        supportsImages: false,
        supportsTools: false,
        supportsJsonSchema: false,
      };
    case "openrouter":
      return {
        key: ENV.openRouterApiKey,
        model: ENV.openRouterModel || DEFAULT_MODELS.openrouter,
        supportsImages: false,
        supportsTools: false,
        supportsJsonSchema: false,
      };
    case "groq":
      return {
        key: ENV.groqApiKey,
        model: ENV.groqModel || DEFAULT_MODELS.groq,
        supportsImages: false,
        supportsTools: false,
        supportsJsonSchema: false,
      };
  }
}

function getEnabledProviders() {
  return (["groq", "openrouter", "openai", "anthropic", "gemini"] as const).filter((provider) => {
    const config = resolveProviderConfig(provider);
    return Boolean(config.key);
  });
}

function getProviderOrder(input: OrchestratorInput) {
  const configuredProviders = getEnabledProviders();

  if (configuredProviders.length === 0) {
    throw new Error(
      "No AI providers are configured. Set GROQ_API_KEY, OPENROUTER_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY."
    );
  }

  const explicitlyRequested = [
    input.preferredProvider,
    ...(input.fallbackProviders ?? []),
  ].filter((value): value is AiProvider => Boolean(value));

  if (input.preferredProvider || input.fallbackProviders) {
    return explicitlyRequested.filter((provider, index) => explicitlyRequested.indexOf(provider) === index);
  }

  return configuredProviders;
}

function getPriceCard(provider: AiProvider) {
  const inputOverrideRaw =
    process.env[`AI_${provider.toUpperCase()}_INPUT_COST_PER_MILLION`];
  const outputOverrideRaw =
    process.env[`AI_${provider.toUpperCase()}_OUTPUT_COST_PER_MILLION`];
  const inputOverride =
    inputOverrideRaw && inputOverrideRaw.trim().length > 0
      ? Number(inputOverrideRaw)
      : Number.NaN;
  const outputOverride =
    outputOverrideRaw && outputOverrideRaw.trim().length > 0
      ? Number(outputOverrideRaw)
      : Number.NaN;

  return {
    inputPerMillion: Number.isFinite(inputOverride)
      ? inputOverride
      : DEFAULT_PRICE_CARDS[provider].inputPerMillion,
    outputPerMillion: Number.isFinite(outputOverride)
      ? outputOverride
      : DEFAULT_PRICE_CARDS[provider].outputPerMillion,
  };
}

function estimateCostUsd(provider: AiProvider, usage: ProviderUsage) {
  const priceCard = getPriceCard(provider);
  if (!Number.isFinite(priceCard.inputPerMillion) || !Number.isFinite(priceCard.outputPerMillion)) {
    return null;
  }

  const amount =
    (usage.promptTokens * priceCard.inputPerMillion +
      usage.completionTokens * priceCard.outputPerMillion) /
    1_000_000;

  return Number(amount.toFixed(6));
}

function normalizeToolChoice(
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | ToolChoiceExplicit | undefined {
  if (!toolChoice) return undefined;

  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }

  if (toolChoice === "required") {
    if (!tools?.length) {
      throw new Error("tool_choice 'required' was provided without any tools");
    }

    if (tools.length > 1) {
      throw new Error("tool_choice 'required' needs a single tool or an explicit tool name");
    }

    return {
      type: "function",
      function: {
        name: tools[0].function.name,
      },
    };
  }

  if ("name" in toolChoice) {
    return {
      type: "function",
      function: {
        name: toolChoice.name,
      },
    };
  }

  return toolChoice;
}

function buildOpenAiPayload(input: OrchestratorInput, model: string) {
  const payload: Record<string, unknown> = {
    model: input.model || model,
    messages: input.messages.map((message) => ({
      role: message.role,
      name: message.name,
      tool_call_id: message.tool_call_id,
      content: ensureArray(message.content).map((part) => {
        if (typeof part === "string") {
          return { type: "text", text: part };
        }
        return part;
      }),
    })),
  };

  if (input.maxTokens) {
    payload.max_tokens = input.maxTokens;
  }

  if (typeof input.temperature === "number") {
    payload.temperature = input.temperature;
  }

  if (input.tools?.length) {
    payload.tools = input.tools;
    const toolChoice = normalizeToolChoice(input.toolChoice, input.tools);
    if (toolChoice) {
      payload.tool_choice = toolChoice;
    }
  }

  if (input.responseFormat?.type === "json_object") {
    payload.response_format = { type: "json_object" };
  }

  if (input.responseFormat?.type === "json_schema") {
    payload.response_format = {
      type: "json_schema",
      json_schema: input.responseFormat.json_schema,
    };
  }

  return payload;
}

function buildAnthropicPayload(input: OrchestratorInput, model: string) {
  const systemMessages = input.messages
    .filter((message) => message.role === "system")
    .map((message) => extractTextContent(message))
    .filter(Boolean)
    .join("\n\n");

  const messages = input.messages
    .filter((message) => message.role !== "system" && message.role !== "tool" && message.role !== "function")
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: [
        {
          type: "text",
          text: extractTextContent(message),
        },
      ],
    }));

  return {
    model: input.model || model,
    max_tokens: input.maxTokens ?? 1024,
    ...(typeof input.temperature === "number" ? { temperature: input.temperature } : {}),
    ...(systemMessages ? { system: systemMessages } : {}),
    messages,
  };
}

function buildGeminiPayload(input: OrchestratorInput) {
  const systemInstruction = input.messages
    .filter((message) => message.role === "system")
    .map((message) => extractTextContent(message))
    .filter(Boolean)
    .join("\n\n");

  const contents = input.messages
    .filter((message) => message.role !== "system" && message.role !== "tool" && message.role !== "function")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [
        {
          text: extractTextContent(message),
        },
      ],
    }));

  return {
    ...(systemInstruction
      ? {
          systemInstruction: {
            parts: [{ text: systemInstruction }],
          },
        }
      : {}),
    contents,
    generationConfig: {
      ...(input.maxTokens ? { maxOutputTokens: input.maxTokens } : {}),
      ...(typeof input.temperature === "number" ? { temperature: input.temperature } : {}),
      ...(input.responseFormat?.type === "json_object" || input.responseFormat?.type === "json_schema"
        ? { responseMimeType: "application/json" }
        : {}),
    },
  };
}

async function parseJsonResponse(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Unable to parse AI response: ${text.slice(0, 240)}`);
  }
}

async function fetchWithTimeout(
  fetcher: FetchLike,
  url: string,
  init: RequestInit,
  timeoutMs: number
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetcher(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("AI request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function invokeOpenAi(
  input: OrchestratorInput,
  config: ProviderConfig,
  fetcher: FetchLike,
  timeoutMs: number
): Promise<ProviderResponse> {
  const response = await fetchWithTimeout(
    fetcher,
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.key}`,
      },
      body: JSON.stringify(buildOpenAiPayload(input, config.model)),
    },
    timeoutMs
  );

  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(
      `OpenAI request failed (${response.status} ${response.statusText}): ${payload?.error?.message ?? "unknown_error"}`
    );
  }

  const usage = {
    promptTokens: payload?.usage?.prompt_tokens ?? 0,
    completionTokens: payload?.usage?.completion_tokens ?? 0,
    totalTokens:
      payload?.usage?.total_tokens ??
      (payload?.usage?.prompt_tokens ?? 0) + (payload?.usage?.completion_tokens ?? 0),
  };

  return {
    provider: "openai",
    model: payload?.model ?? config.model,
    usage,
    result: {
      id: payload?.id ?? randomUUID(),
      created: payload?.created ?? Math.floor(Date.now() / 1000),
      model: payload?.model ?? config.model,
      choices: payload?.choices ?? [],
      usage: {
        prompt_tokens: usage.promptTokens,
        completion_tokens: usage.completionTokens,
        total_tokens: usage.totalTokens,
      },
    },
  };
}

async function invokeOpenRouter(
  input: OrchestratorInput,
  config: ProviderConfig,
  fetcher: FetchLike,
  timeoutMs: number
): Promise<ProviderResponse> {
  const response = await fetchWithTimeout(
    fetcher,
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.key}`,
        "X-Title": "TruckFixr",
      },
      body: JSON.stringify(buildOpenAiPayload(input, config.model)),
    },
    timeoutMs
  );

  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(
      `OpenRouter request failed (${response.status} ${response.statusText}): ${payload?.error?.message ?? "unknown_error"}`
    );
  }

  const usage = {
    promptTokens: payload?.usage?.prompt_tokens ?? 0,
    completionTokens: payload?.usage?.completion_tokens ?? 0,
    totalTokens:
      payload?.usage?.total_tokens ??
      (payload?.usage?.prompt_tokens ?? 0) + (payload?.usage?.completion_tokens ?? 0),
  };

  return {
    provider: "openrouter",
    model: payload?.model ?? config.model,
    usage,
    result: {
      id: payload?.id ?? randomUUID(),
      created: payload?.created ?? Math.floor(Date.now() / 1000),
      model: payload?.model ?? config.model,
      choices: payload?.choices ?? [],
      usage: {
        prompt_tokens: usage.promptTokens,
        completion_tokens: usage.completionTokens,
        total_tokens: usage.totalTokens,
      },
    },
  };
}

async function invokeGroq(
  input: OrchestratorInput,
  config: ProviderConfig,
  fetcher: FetchLike,
  timeoutMs: number
): Promise<ProviderResponse> {
  const response = await fetchWithTimeout(
    fetcher,
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.key}`,
      },
      body: JSON.stringify(buildOpenAiPayload(input, config.model)),
    },
    timeoutMs
  );

  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(
      `Groq request failed (${response.status} ${response.statusText}): ${payload?.error?.message ?? "unknown_error"}`
    );
  }

  const usage = {
    promptTokens: payload?.usage?.prompt_tokens ?? 0,
    completionTokens: payload?.usage?.completion_tokens ?? 0,
    totalTokens:
      payload?.usage?.total_tokens ??
      (payload?.usage?.prompt_tokens ?? 0) + (payload?.usage?.completion_tokens ?? 0),
  };

  return {
    provider: "groq",
    model: payload?.model ?? config.model,
    usage,
    result: {
      id: payload?.id ?? randomUUID(),
      created: payload?.created ?? Math.floor(Date.now() / 1000),
      model: payload?.model ?? config.model,
      choices: payload?.choices ?? [],
      usage: {
        prompt_tokens: usage.promptTokens,
        completion_tokens: usage.completionTokens,
        total_tokens: usage.totalTokens,
      },
    },
  };
}

async function invokeAnthropic(
  input: OrchestratorInput,
  config: ProviderConfig,
  fetcher: FetchLike,
  timeoutMs: number
): Promise<ProviderResponse> {
  const response = await fetchWithTimeout(
    fetcher,
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(buildAnthropicPayload(input, config.model)),
    },
    timeoutMs
  );

  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(
      `Anthropic request failed (${response.status} ${response.statusText}): ${payload?.error?.message ?? "unknown_error"}`
    );
  }

  const text = Array.isArray(payload?.content)
    ? payload.content
        .filter((part: { type?: string; text?: string }) => part?.type === "text" && part?.text)
        .map((part: { text: string }) => part.text)
        .join("\n")
    : "";

  const usage = {
    promptTokens: payload?.usage?.input_tokens ?? 0,
    completionTokens: payload?.usage?.output_tokens ?? 0,
    totalTokens: (payload?.usage?.input_tokens ?? 0) + (payload?.usage?.output_tokens ?? 0),
  };

  return {
    provider: "anthropic",
    model: payload?.model ?? config.model,
    usage,
    result: {
      id: payload?.id ?? randomUUID(),
      created: Math.floor(Date.now() / 1000),
      model: payload?.model ?? config.model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: text,
          },
          finish_reason: payload?.stop_reason ?? null,
        },
      ],
      usage: {
        prompt_tokens: usage.promptTokens,
        completion_tokens: usage.completionTokens,
        total_tokens: usage.totalTokens,
      },
    },
  };
}

async function invokeGemini(
  input: OrchestratorInput,
  config: ProviderConfig,
  fetcher: FetchLike,
  timeoutMs: number
): Promise<ProviderResponse> {
  const endpoint = new URL(
    `https://generativelanguage.googleapis.com/v1beta/models/${
      input.model || config.model
    }:generateContent`
  );
  endpoint.searchParams.set("key", config.key);

  const response = await fetchWithTimeout(
    fetcher,
    endpoint.toString(),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildGeminiPayload(input)),
    },
    timeoutMs
  );

  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(
      `Gemini request failed (${response.status} ${response.statusText}): ${
        payload?.error?.message ?? "unknown_error"
      }`
    );
  }

  const text = Array.isArray(payload?.candidates?.[0]?.content?.parts)
    ? payload.candidates[0].content.parts
        .map((part: { text?: string }) => part?.text ?? "")
        .filter(Boolean)
        .join("\n")
    : "";

  const usage = {
    promptTokens: payload?.usageMetadata?.promptTokenCount ?? 0,
    completionTokens: payload?.usageMetadata?.candidatesTokenCount ?? 0,
    totalTokens: payload?.usageMetadata?.totalTokenCount ?? 0,
  };

  return {
    provider: "gemini",
    model: payload?.modelVersion ?? config.model,
    usage,
    result: {
      id: payload?.responseId ?? randomUUID(),
      created: Math.floor(Date.now() / 1000),
      model: payload?.modelVersion ?? config.model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: text,
          },
          finish_reason: payload?.candidates?.[0]?.finishReason ?? null,
        },
      ],
      usage: {
        prompt_tokens: usage.promptTokens,
        completion_tokens: usage.completionTokens,
        total_tokens: usage.totalTokens,
      },
    },
  };
}

function validateProviderCompatibility(provider: AiProvider, input: OrchestratorInput) {
  const config = resolveProviderConfig(provider);

  if (!config.key) {
    return "provider_not_configured";
  }

  if (hasUnsupportedFiles(input.messages)) {
    return "file_inputs_not_supported";
  }

  if (hasImageContent(input.messages) && !config.supportsImages) {
    return "image_inputs_not_supported";
  }

  if (input.tools?.length && !config.supportsTools) {
    return "tool_calls_not_supported";
  }

  if (input.responseFormat?.type === "json_schema" && !config.supportsJsonSchema) {
    return "json_schema_not_supported";
  }

  return null;
}

function logAttempt(attempt: ProviderAttempt) {
  const summary = {
    provider: attempt.provider,
    model: attempt.model,
    latencyMs: attempt.latencyMs,
    success: attempt.success,
    promptTokens: attempt.promptTokens ?? 0,
    completionTokens: attempt.completionTokens ?? 0,
    totalTokens: attempt.totalTokens ?? 0,
    estimatedCostUsd: attempt.estimatedCostUsd ?? null,
    reason: attempt.reason,
  };

  console.info("[AI Orchestrator]", summary);
}

export async function invokeWithOrchestration(
  input: OrchestratorInput,
  options?: {
    fetcher?: FetchLike;
  }
): Promise<InvokeResult> {
  const providers = getProviderOrder(input);
  const attempts: ProviderAttempt[] = [];
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetcher = options?.fetcher ?? fetch;
  let lastError: Error | null = null;

  for (const provider of providers) {
    const incompatibility = validateProviderCompatibility(provider, input);
    const config = resolveProviderConfig(provider);
    const providerSpecificInput =
      input.model && input.preferredProvider && provider !== input.preferredProvider
        ? { ...input, model: undefined }
        : input;
    const model = providerSpecificInput.model || config.model;

    if (incompatibility) {
      const skippedAttempt: ProviderAttempt = {
        provider,
        model,
        latencyMs: 0,
        success: false,
        reason: incompatibility,
      };
      attempts.push(skippedAttempt);
      logAttempt(skippedAttempt);
      continue;
    }

    const startedAt = Date.now();

    try {
      const response =
        provider === "groq"
          ? await invokeGroq(providerSpecificInput, config, fetcher, timeoutMs)
          : provider === "openrouter"
          ? await invokeOpenRouter(providerSpecificInput, config, fetcher, timeoutMs)
          : provider === "openai"
          ? await invokeOpenAi(providerSpecificInput, config, fetcher, timeoutMs)
          : provider === "anthropic"
            ? await invokeAnthropic(providerSpecificInput, config, fetcher, timeoutMs)
            : await invokeGemini(providerSpecificInput, config, fetcher, timeoutMs);

      const latencyMs = Date.now() - startedAt;
      const estimatedCostUsd = estimateCostUsd(provider, response.usage);
      const successfulAttempt: ProviderAttempt = {
        provider,
        model: response.model,
        latencyMs,
        success: true,
        promptTokens: response.usage.promptTokens,
        completionTokens: response.usage.completionTokens,
        totalTokens: response.usage.totalTokens,
        estimatedCostUsd,
      };

      attempts.push(successfulAttempt);
      logAttempt(successfulAttempt);

      return {
        ...response.result,
        orchestration: {
          provider,
          model: response.model,
          latencyMs,
          estimatedCostUsd,
          attempts,
        },
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const failedAttempt: ProviderAttempt = {
        provider,
        model,
        latencyMs: Date.now() - startedAt,
        success: false,
        reason: normalizeText(lastError.message).slice(0, 240),
      };
      attempts.push(failedAttempt);
      logAttempt(failedAttempt);
    }
  }

  const fallbackSummary = attempts
    .map((attempt) => `${attempt.provider}:${attempt.reason ?? "failed"}`)
    .join(", ");

  throw new Error(
    `AI orchestration failed after ${attempts.length} attempt(s). ${fallbackSummary}${
      lastError ? ` Last error: ${lastError.message}` : ""
    }`
  );
}
