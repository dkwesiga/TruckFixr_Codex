import { z } from "zod";

// Promoted from diagnosticLlmReview.ts's per-schema parse* helpers, which each
// built this same candidate-extraction/repair pipeline independently. This is
// the shared seam: turn possibly-broken LLM text into a validated object.
// Naive brace-matching (lastIndexOf("}")) silently grabs the wrong substring
// when the model's response is truncated mid-object; extractBalancedJsonObjects
// only ever completes an object once depth returns to zero, so a truncated
// response correctly yields no candidate instead of a wrong, smaller one.

export type AiJsonParseResult<T> =
  | { status: "ok"; data: T }
  | { status: "invalid_schema"; issues: z.ZodIssue[] }
  | { status: "unparseable"; raw: string };

export type ParseAiJsonOptions = {
  /**
   * Recursively unwraps nested wrapper keys (result/response/output/data/...)
   * before schema validation. Off by default so existing callers (guestCaseAi,
   * historicalCaseImport) keep their current behavior on migration; tadisCore's
   * diagnosticLlmReview.ts opts in since it already relied on this.
   */
  unwrapWrapperKeys?: boolean;
  /** Pre-schema shape coercion, since each caller's expected shape differs. */
  coerce?: (candidate: unknown) => unknown;
  /**
   * Optional second-pass repair: sends the raw text to a model that converts
   * it into valid JSON, then re-runs the same extraction/validation over the
   * result. Not built in — some callers shouldn't pay for a second round-trip.
   */
  repairViaLlm?: (raw: string) => Promise<string>;
};

function normalizeJsonLikeText(value: string) {
  return value
    .replace(/^﻿/, "")
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .trim();
}

function stripMarkdownCodeFences(value: string) {
  return value.replace(/```(?:json)?\s*([\s\S]*?)```/gi, "$1").trim();
}

function removeTrailingCommas(value: string) {
  return value.replace(/,\s*([}\]])/g, "$1");
}

function extractJsonCodeBlocks(value: string) {
  return Array.from(value.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi))
    .map((match) => match[1]?.trim() ?? "")
    .filter(Boolean);
}

function dedupeStrings(values: string[]) {
  return values.filter((value, index) => value && values.indexOf(value) === index);
}

function extractBalancedJsonObjects(text: string) {
  const objects: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (isEscaped) {
      isEscaped = false;
      continue;
    }

    if (char === "\\") {
      isEscaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        objects.push(text.slice(start, index + 1));
        start = -1;
      }
    }
  }

  return objects;
}

function unwrapParsedPayload(payload: unknown, depth = 0): unknown[] {
  if (depth > 3 || payload == null) {
    return [];
  }

  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (!trimmed) {
      return [];
    }

    try {
      return [payload, ...unwrapParsedPayload(JSON.parse(trimmed), depth + 1)];
    } catch {
      return [payload];
    }
  }

  if (Array.isArray(payload)) {
    return [payload, ...payload.flatMap((item) => unwrapParsedPayload(item, depth + 1))];
  }

  if (typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const nestedKeys = [
      "result",
      "response",
      "output",
      "data",
      "json",
      "diagnosis",
      "analysis",
      "diagnostic_review",
      "diagnosticReview",
      "diagnostic_result",
      "diagnosticResult",
      "final_result",
      "finalResult",
      "tadis_result",
      "tadisResult",
      "review",
    ];
    return [
      payload,
      ...nestedKeys.flatMap((key) => unwrapParsedPayload(record[key], depth + 1)),
    ];
  }

  return [payload];
}

function candidateStrings(rawText: string): string[] {
  const normalized = normalizeJsonLikeText(rawText);
  const stripped = stripMarkdownCodeFences(normalized);
  return dedupeStrings([
    normalized,
    stripped,
    ...extractJsonCodeBlocks(normalized),
    ...extractBalancedJsonObjects(stripped),
    ...extractBalancedJsonObjects(normalized),
  ]);
}

/**
 * Best-guess JSON-object substring extraction with no schema validation.
 * Preserves the extractJsonObject(text): string call shape used by
 * aiOrchestrator.ts's existing callers, but sources it from the more robust
 * (string-aware, depth-balanced) extraction instead of naive brace-matching.
 */
export function extractJsonCandidate(text: string): string {
  const normalized = normalizeJsonLikeText(text);
  if (normalized.startsWith("{") && normalized.endsWith("}")) {
    return normalized;
  }

  const fenced = extractJsonCodeBlocks(normalized)[0];
  if (fenced) {
    return fenced;
  }

  const stripped = stripMarkdownCodeFences(normalized);
  const balanced = extractBalancedJsonObjects(stripped)[0] ?? extractBalancedJsonObjects(normalized)[0];
  if (balanced) {
    return balanced;
  }

  return normalized;
}

function tryParse<T>(rawText: string, schema: z.ZodType<T>, options: ParseAiJsonOptions): AiJsonParseResult<T> {
  const candidates = candidateStrings(rawText);
  let lastIssues: z.ZodIssue[] | null = null;

  for (const candidate of candidates) {
    const parseAttempts = dedupeStrings([candidate, removeTrailingCommas(candidate)]);

    for (const attempt of parseAttempts) {
      let root: unknown;
      try {
        root = JSON.parse(attempt);
      } catch {
        continue;
      }

      const payloadCandidates = options.unwrapWrapperKeys ? unwrapParsedPayload(root) : [root];

      for (const payload of payloadCandidates) {
        const coerced = options.coerce ? options.coerce(payload) : payload;
        const result = schema.safeParse(coerced);
        if (result.success) {
          return { status: "ok", data: result.data };
        }
        lastIssues = result.error.issues;
      }
    }
  }

  if (lastIssues) {
    return { status: "invalid_schema", issues: lastIssues };
  }

  return { status: "unparseable", raw: rawText };
}

export async function parseAiJson<T>(
  rawText: string,
  schema: z.ZodType<T>,
  options: ParseAiJsonOptions = {}
): Promise<AiJsonParseResult<T>> {
  const attempt = tryParse(rawText, schema, options);
  if (attempt.status === "ok" || !options.repairViaLlm) {
    return attempt;
  }

  try {
    const repairedText = await options.repairViaLlm(rawText);
    return tryParse(repairedText, schema, options);
  } catch {
    return attempt;
  }
}
