const test = require("node:test");
const assert = require("node:assert/strict");
const { initialDiagnosticsFlow, transitionDiagnosticsFlow } = require("./stateMachine.js");

test("requires vehicle before submitting issue", () => {
  assert.throws(
    () =>
      transitionDiagnosticsFlow(initialDiagnosticsFlow, {
        type: "SUBMIT_ISSUE",
        issue: { description: "Engine stalls on incline" },
      }),
    /Vehicle selection is required/,
  );
});

test("moves through diagnostics states", () => {
  const selected = transitionDiagnosticsFlow(initialDiagnosticsFlow, {
    type: "SELECT_VEHICLE",
    vehicle: { id: "veh-1", label: "2020 Freightliner Cascadia" },
  });
  const analyzing = transitionDiagnosticsFlow(selected, {
    type: "SUBMIT_ISSUE",
    issue: { description: "ABS warning lamp on", faultCodes: ["C0035"] },
  });
  const clarifying = transitionDiagnosticsFlow(analyzing, {
    type: "ANALYSIS_REQUIRES_CLARIFICATION",
    question: "Does the warning appear only under braking load?",
  });
  const processing = transitionDiagnosticsFlow(clarifying, {
    type: "SUBMIT_CLARIFICATION_ANSWER",
    answer: "Yes, mostly when loaded.",
  });
  const result = transitionDiagnosticsFlow(processing, {
    type: "ANALYSIS_COMPLETE",
    result: {
      mostLikelyIssue: "Right front wheel speed sensor intermittent.",
      confidence: 81,
      risk: "high",
      tests: ["Inspect wheel speed sensor harness", "Perform ABS live data comparison"],
      fix: "Repair harness and replace damaged wheel speed sensor.",
    },
  });

  assert.equal(analyzing.state, "analyzing");
  assert.equal(clarifying.state, "clarifying_question");
  assert.equal(processing.state, "processing_answer");
  assert.equal(result.state, "final_result");
});
