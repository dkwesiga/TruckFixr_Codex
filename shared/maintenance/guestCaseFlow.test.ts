import { describe, expect, it } from "vitest";

import {
  CONCERN_CATEGORIES,
  CRITICAL_TRIGGERS,
  MAX_ADAPTIVE_QUESTIONS,
  OPERATING_STATUSES,
  detectCriticalTrigger,
  isCriticalInput,
  nextAdaptiveQuestion,
  selectAdaptiveQuestions,
  type ConcernCategory,
  type GuestCaseInput,
  type OperatingStatus,
} from "./guestCaseFlow";

function input(overrides: Partial<GuestCaseInput> = {}): GuestCaseInput {
  return {
    concernText: "check engine light came on",
    operatingStatus: "operating_with_symptoms",
    concernCategory: "warning_light",
    ...overrides,
  };
}

describe("critical trigger detection", () => {
  it("fires for a representative keyword of every trigger", () => {
    for (const trigger of CRITICAL_TRIGGERS) {
      const kw = trigger.keywords[0];
      const result = detectCriticalTrigger(
        input({ concernText: `driver reports ${kw} while on the highway`, operatingStatus: "stopped" })
      );
      expect(result).not.toBeNull();
    }
  });

  it("treats unsafe_to_move as critical regardless of text", () => {
    expect(
      isCriticalInput(input({ concernText: "everything seems fine", operatingStatus: "unsafe_to_move" }))
    ).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isCriticalInput(input({ concernText: "There is SMOKE from the engine" }))).toBe(true);
  });

  it("returns null for a benign concern", () => {
    expect(
      detectCriticalTrigger(
        input({ concernText: "amber check-engine light, runs fine", operatingStatus: "operating_normally" })
      )
    ).toBeNull();
  });

  it("flags fire even embedded in a longer sentence", () => {
    const t = detectCriticalTrigger(input({ concernText: "I think the trailer brakes are on fire" }));
    expect(t?.code).toBe("fire");
  });

  it("does not false-trigger 'fire' on common non-fire automotive phrasing (word-boundary regression)", () => {
    expect(detectCriticalTrigger(input({ concernText: "truck won't start, cranks fine but never fires" }))).toBeNull();
    expect(detectCriticalTrigger(input({ concernText: "engine has a misfire on cylinder 3" }))).toBeNull();
    expect(detectCriticalTrigger(input({ concernText: "engine backfires under load" }))).toBeNull();
    expect(detectCriticalTrigger(input({ concernText: "fired up fine this morning, no issues" }))).toBeNull();
  });

  it("does not false-trigger 'wheel off' on 'wheel offset' (word-boundary regression)", () => {
    expect(detectCriticalTrigger(input({ concernText: "noticed a wheel offset issue after the alignment" }))).toBeNull();
  });

  it("still catches plural 'brakes' without a matching phrase (word-boundary regression)", () => {
    const t = detectCriticalTrigger(input({ concernText: "brakes feel weak this morning" }));
    expect(t?.code).toBe("brake_performance");
  });
});

describe("adaptive-question cap is enforced for every input path", () => {
  it("selectAdaptiveQuestions never returns more than the max", () => {
    for (const category of [...CONCERN_CATEGORIES, undefined] as Array<ConcernCategory | undefined>) {
      for (const status of OPERATING_STATUSES) {
        const qs = selectAdaptiveQuestions(input({ concernCategory: category, operatingStatus: status, concernText: "runs rough sometimes" }));
        expect(qs.length).toBeLessThanOrEqual(MAX_ADAPTIVE_QUESTIONS);
        // ids are unique
        expect(new Set(qs.map((q) => q.id)).size).toBe(qs.length);
      }
    }
  });

  it("critical inputs get zero questions (safety guidance instead)", () => {
    expect(selectAdaptiveQuestions(input({ concernText: "brakes failed", operatingStatus: "stopped" }))).toEqual([]);
    expect(nextAdaptiveQuestion(input({ concernText: "brakes failed" }), [])).toBeNull();
  });

  it("nextAdaptiveQuestion never exceeds the cap, walking the full flow", () => {
    for (const category of [...CONCERN_CATEGORIES, undefined] as Array<ConcernCategory | undefined>) {
      for (const status of OPERATING_STATUSES) {
        const i = input({ concernCategory: category, operatingStatus: status, concernText: "runs rough sometimes" });
        const answered: string[] = [];
        let asked = 0;
        // Attempt to ask up to MAX+2 times; the flow must stop at or before MAX.
        for (let attempt = 0; attempt < MAX_ADAPTIVE_QUESTIONS + 2; attempt++) {
          const q = nextAdaptiveQuestion(i, answered);
          if (!q) break;
          expect(answered).not.toContain(q.id); // never repeats
          answered.push(q.id);
          asked++;
        }
        expect(asked).toBeLessThanOrEqual(MAX_ADAPTIVE_QUESTIONS);
        // Once the cap is reached, further calls stay null.
        expect(nextAdaptiveQuestion(i, answered.concat(["x", "y", "z"]))).toBeNull();
      }
    }
  });

  it("every asked question can change at least one decision-relevant output", () => {
    const qs = selectAdaptiveQuestions(input({ concernCategory: "symptom", operatingStatus: "unknown", concernText: "vibration at speed" }));
    for (const q of qs) {
      expect(q.impacts.length).toBeGreaterThan(0);
    }
  });
});

describe("adaptive selection is tailored and deterministic", () => {
  it("asks the drivability question first when operating status is unknown", () => {
    const qs = selectAdaptiveQuestions(input({ operatingStatus: "unknown" }));
    expect(qs[0]?.id).toBe("operating_status_clarify");
  });

  it("asks a category-specific question", () => {
    const statuses: Array<[ConcernCategory, string]> = [
      ["warning_light", "warning_light_color"],
      ["fault_code", "fault_code_active"],
      ["symptom", "symptom_frequency"],
      ["defect", "defect_safety_system"],
      ["telematics_alert", "alert_severity"],
      ["maintenance_concern", "service_overdue"],
    ];
    for (const [category, expectedId] of statuses) {
      const qs = selectAdaptiveQuestions(input({ concernCategory: category, operatingStatus: "operating_with_symptoms", concernText: "issue reported" }));
      expect(qs.map((q) => q.id)).toContain(expectedId);
    }
  });

  it("is deterministic (same input => same questions)", () => {
    const i = input({ concernCategory: "symptom", operatingStatus: "unknown" });
    expect(selectAdaptiveQuestions(i)).toEqual(selectAdaptiveQuestions(i));
  });
});
