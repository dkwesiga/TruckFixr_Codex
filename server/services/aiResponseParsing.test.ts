import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { extractJsonCandidate, parseAiJson } from "./aiResponseParsing";

const schema = z.object({
  confidence_score: z.number(),
  cause: z.string(),
});

describe("parseAiJson", () => {
  it("parses a clean JSON object", async () => {
    const result = await parseAiJson('{"confidence_score": 82, "cause": "worn brake pads"}', schema);
    expect(result).toEqual({ status: "ok", data: { confidence_score: 82, cause: "worn brake pads" } });
  });

  it("strips markdown code fences", async () => {
    const text = '```json\n{"confidence_score": 90, "cause": "loose belt"}\n```';
    const result = await parseAiJson(text, schema);
    expect(result.status).toBe("ok");
  });

  it("removes trailing commas", async () => {
    const text = '{"confidence_score": 70, "cause": "clogged filter",}';
    const result = await parseAiJson(text, schema);
    expect(result.status).toBe("ok");
  });

  it("extracts a balanced object out of surrounding prose without grabbing an unrelated later brace", async () => {
    const text = 'Here is my answer: {"confidence_score": 65, "cause": "sensor fault"} Let me know if you need {more} detail.';
    const result = await parseAiJson(text, schema);
    expect(result).toMatchObject({ status: "ok", data: { confidence_score: 65, cause: "sensor fault" } });
  });

  it("returns unparseable (not a wrong smaller object) when the response is truncated mid-object", async () => {
    // Simulates a token-budget cutoff: the object never closes, so naive
    // lastIndexOf("}") extraction would have latched onto some earlier,
    // unrelated closing brace and silently produced a bogus small object.
    const truncated = '{"confidence_score": 40, "cause": "partial engine {nested detail that never';
    const result = await parseAiJson(truncated, schema);
    expect(result.status).not.toBe("ok");
  });

  it("reports invalid_schema when JSON parses but doesn't match the schema", async () => {
    const result = await parseAiJson('{"confidence_score": "not a number"}', schema);
    expect(result.status).toBe("invalid_schema");
  });

  it("reports unparseable when nothing resembling JSON is present", async () => {
    const result = await parseAiJson("I cannot help with that.", schema);
    expect(result.status).toBe("unparseable");
  });

  it("leaves wrapper keys alone by default", async () => {
    const wrapped = '{"result": {"confidence_score": 55, "cause": "alternator"}}';
    const result = await parseAiJson(wrapped, schema);
    expect(result.status).not.toBe("ok");
  });

  it("unwraps nested wrapper keys when unwrapWrapperKeys is enabled", async () => {
    const wrapped = '{"result": {"confidence_score": 55, "cause": "alternator"}}';
    const result = await parseAiJson(wrapped, schema, { unwrapWrapperKeys: true });
    expect(result).toMatchObject({ status: "ok", data: { confidence_score: 55, cause: "alternator" } });
  });

  it("applies a caller-supplied coerce step before schema validation", async () => {
    const text = '{"confidenceScore": 60, "cause": "gasket leak"}';
    const result = await parseAiJson(text, schema, {
      coerce: (candidate) => {
        const record = candidate as Record<string, unknown>;
        return { confidence_score: record.confidenceScore, cause: record.cause };
      },
    });
    expect(result).toMatchObject({ status: "ok", data: { confidence_score: 60, cause: "gasket leak" } });
  });

  it("falls back to repairViaLlm when the first pass fails, and re-validates its output", async () => {
    const repairViaLlm = vi.fn().mockResolvedValue('{"confidence_score": 45, "cause": "repaired"}');
    const result = await parseAiJson("not json at all", schema, { repairViaLlm });
    expect(repairViaLlm).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ status: "ok", data: { confidence_score: 45, cause: "repaired" } });
  });

  it("returns the original failure if repairViaLlm itself throws", async () => {
    const repairViaLlm = vi.fn().mockRejectedValue(new Error("repair model unavailable"));
    const result = await parseAiJson("not json at all", schema, { repairViaLlm });
    expect(result.status).toBe("unparseable");
  });

  it("does not call repairViaLlm when the first pass already succeeds", async () => {
    const repairViaLlm = vi.fn();
    const result = await parseAiJson('{"confidence_score": 82, "cause": "worn brake pads"}', schema, {
      repairViaLlm,
    });
    expect(repairViaLlm).not.toHaveBeenCalled();
    expect(result.status).toBe("ok");
  });
});

describe("extractJsonCandidate", () => {
  it("returns an already-clean object unchanged", () => {
    expect(extractJsonCandidate('{"a":1}')).toBe('{"a":1}');
  });

  it("pulls JSON out of a code fence", () => {
    expect(extractJsonCandidate('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("pulls the first balanced object out of surrounding prose", () => {
    expect(extractJsonCandidate('sure, here: {"a":1} thanks')).toBe('{"a":1}');
  });
});
