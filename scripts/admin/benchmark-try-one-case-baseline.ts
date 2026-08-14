/**
 * One-time accuracy baseline for the guest "/try-one-case" AI layer
 * (server/services/guestCaseAi.ts), run against 12 representative golden
 * cases spanning benign/critical/ambiguous/insufficient-evidence scenarios.
 *
 * For each case this calls, at turn 0 (no prior answers — exactly what
 * `guestCases.start` does):
 *   - the deterministic engine (assessGuestCase) as a reference point,
 *   - generateGuestAssessment() (AI-assisted severity/action/confidence),
 *   - generateGuestNextQuestion() (the first clarifying question the flow
 *     would actually ask).
 *
 * Hits a real configured AI provider (OPENROUTER_API_KEY by default) —
 * this is a live-cost benchmark, not a CI test. No DB writes, no guest
 * case rows created.
 *
 * Usage:
 *   npx tsx scripts/admin/benchmark-try-one-case-baseline.ts
 */

import "dotenv/config";
import { generateGuestAssessment, generateGuestNextQuestion } from "../../server/services/guestCaseAi";
import { assessGuestCase } from "../../server/services/guestCaseAssessment";
import type { GuestCaseInput } from "../../shared/maintenance/guestCaseFlow";

type GoldenCase = {
  id: string;
  label: string;
  input: GuestCaseInput;
  expectCritical: boolean | "ambiguous";
  expectMinSeverity?: "stable" | "attention";
  note: string;
};

const CASES: GoldenCase[] = [
  {
    id: "C1_benign_light",
    label: "Amber light, runs fine",
    input: { concernText: "Amber check engine light on, truck runs and drives completely normally.", operatingStatus: "operating_normally", concernCategory: "warning_light" },
    expectCritical: false,
    note: "Sanity check: low-urgency case should not be over-classified.",
  },
  {
    id: "C2_no_start_immobile",
    label: "Won't start, sitting in the yard",
    input: { concernText: "Truck won't start, cranks fine but never fires. It's just sitting in the yard.", operatingStatus: "stopped", concernCategory: "symptom" },
    expectCritical: false,
    note: "Immobility-is-safe check — must not escalate just because the vehicle can't move.",
  },
  {
    id: "C3_no_crank_silent",
    label: "No crank, no click, no lights",
    input: { concernText: "Turn the key and absolutely nothing happens - no crank, no click, no lights.", operatingStatus: "stopped", concernCategory: "symptom" },
    expectCritical: false,
    note: "Electrical no-crank, immobile — should stay non-critical, attention/schedule_service.",
  },
  {
    id: "C4_intermittent_stall_driving",
    label: "Randomly stalls on the highway",
    input: { concernText: "Engine dies randomly a couple times a week while driving on the highway, then restarts on its own after a minute.", operatingStatus: "operating_with_symptoms", concernCategory: "symptom" },
    expectCritical: false,
    expectMinSeverity: "attention",
    note: "Consequence check — stalling in moving traffic is worse than immobility; severity must not be deflated to stable/continue_monitor.",
  },
  {
    id: "C5_derate_dpf",
    label: "DPF regen failing, derate warning",
    input: { concernText: "Dash shows a derate warning and reduced power icon, DPF regen has failed twice this week.", operatingStatus: "reduced_power_derate", concernCategory: "fault_code" },
    expectCritical: false,
    expectMinSeverity: "attention",
    note: "Should classify as needs-service soon, not a hard stop.",
  },
  {
    id: "C6_overheat_soft_language",
    label: "Temp gauge crept toward red, pulled over",
    input: { concernText: "Temperature gauge crept up toward the red zone on a long grade, I pulled over right away before it got there and shut it off.", operatingStatus: "stopped", concernCategory: "symptom" },
    expectCritical: "ambiguous",
    note: "Keyword-brittleness check — no literal 'overheat' trigger word. Does the AI still recognize near-overheat risk, or does severity get under-classified by relying on keywords alone?",
  },
  {
    id: "C7_fluid_under_truck",
    label: "Small puddle, unknown fluid, parked",
    input: { concernText: "Noticed a small puddle of fluid under the truck this morning, not sure what colour, vehicle hasn't been driven since.", operatingStatus: "stopped", concernCategory: "symptom" },
    expectCritical: false,
    note: "Insufficient-evidence case — first question should target fluid type/rate, not assume active/dangerous leak yet.",
  },
  {
    id: "C8_brake_soft_pedal",
    label: "Brake pedal felt soft",
    input: { concernText: "Brake pedal felt softer than usual this morning, still stopped fine, no warning lights.", operatingStatus: "operating_with_symptoms", concernCategory: "symptom" },
    expectCritical: true,
    note: "Must-rule-out safety system — deterministic keyword floor should catch 'brake' and escalate regardless of how mild the phrasing sounds.",
  },
  {
    id: "C9_clear_smoke",
    label: "White smoke from the hood",
    input: { concernText: "White smoke pouring from under the hood right now, pulled over.", operatingStatus: "stopped" },
    expectCritical: true,
    note: "Sanity check: obvious hazard must be critical.",
  },
  {
    id: "C10_vague_description",
    label: "Vague, no detail",
    input: { concernText: "Truck's acting weird lately.", operatingStatus: "operating_with_symptoms" },
    expectCritical: false,
    note: "Should NOT commit to a confident classification; expect low confidence and a genuinely discriminating first question, not a generic one.",
  },
  {
    id: "C11_recurring_post_repair",
    label: "Same fault code back after alternator replacement",
    input: { concernText: "Same electrical fault code came back a week after the shop replaced the alternator.", operatingStatus: "operating_normally", concernCategory: "fault_code", faultCodes: ["P0562"] },
    expectCritical: false,
    expectMinSeverity: "attention",
    note: "Recurring-after-repair context check — explanation should read as informed by that history, not treat it as a brand-new unrelated fault.",
  },
  {
    id: "C12_unsafe_to_move_flag",
    label: "Marked unsafe to move at roadside inspection",
    input: { concernText: "Fleet manager marked this unsafe to move after a roadside inspection failed it.", operatingStatus: "unsafe_to_move" },
    expectCritical: true,
    note: "operatingStatus alone must force critical, independent of concern text.",
  },
];

function fmtBool(actual: boolean, expected: boolean | "ambiguous"): string {
  if (expected === "ambiguous") return actual ? "CRITICAL (flagged ambiguous — review)" : "non-critical (flagged ambiguous — review)";
  const match = actual === expected;
  return `${actual ? "CRITICAL" : "non-critical"} ${match ? "✓" : `✗ expected ${expected ? "CRITICAL" : "non-critical"}`}`;
}

async function runCase(c: GoldenCase) {
  const ruleBased = assessGuestCase(c.input, {});
  const started = Date.now();
  const aiAssessment = await generateGuestAssessment({ input: c.input, answers: {} });
  const assessMs = Date.now() - started;

  const qStarted = Date.now();
  const question = await generateGuestNextQuestion({ input: c.input, answers: {}, confidence: aiAssessment.confidence ?? null });
  const questionMs = Date.now() - qStarted;

  console.log(`\n=== ${c.id} — ${c.label} ===`);
  console.log(`  input: "${c.input.concernText}" [${c.input.operatingStatus}${c.input.concernCategory ? `, ${c.input.concernCategory}` : ""}]`);
  console.log(`  note: ${c.note}`);
  console.log(`  rule-based:  ${fmtBool(ruleBased.criticalTriggered, c.expectCritical)} severity=${ruleBased.internalSeverity} action=${ruleBased.operatingAction}`);
  console.log(`  AI-assisted: ${fmtBool(aiAssessment.criticalTriggered, c.expectCritical)} severity=${aiAssessment.internalSeverity} action=${aiAssessment.operatingAction} confidence=${aiAssessment.confidence ?? "n/a"} (${assessMs}ms)`);
  if (c.expectMinSeverity === "attention" && aiAssessment.internalSeverity === "stable" && !aiAssessment.criticalTriggered) {
    console.log(`  ⚠ severity-deflation flag: expected at least "attention", AI said "stable"`);
  }
  if (aiAssessment.explanation) console.log(`  explanation: ${aiAssessment.explanation}`);
  if (question) {
    console.log(`  first question (${questionMs}ms): [${question.id}] ${question.prompt}`);
    console.log(`    options: ${question.options.map((o) => o.label).join(" | ")}`);
  } else {
    console.log(`  first question: (none — critical short-circuit)`);
  }

  return { id: c.id, ruleBased, aiAssessment, question, expectCritical: c.expectCritical };
}

async function main() {
  const hasProvider = Boolean(
    process.env.OPENROUTER_API_KEY || process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY
  );
  console.log("== try-one-case accuracy baseline ==");
  console.log(`  ${CASES.length} golden cases`);
  console.log(`  AI provider configured: ${hasProvider}`);
  if (!hasProvider) {
    console.log("  WARNING: no AI provider key set — every case will fall back to the deterministic engine, which defeats the purpose of this benchmark.");
  }

  const results = [];
  for (const c of CASES) {
    results.push(await runCase(c));
  }

  const criticalMismatches = results.filter((r) => r.expectCritical !== "ambiguous" && r.aiAssessment.criticalTriggered !== r.expectCritical);
  const ruleAiDivergence = results.filter((r) => r.ruleBased.criticalTriggered !== r.aiAssessment.criticalTriggered);

  console.log(`\n\n=== SUMMARY ===`);
  console.log(`  ${results.length} cases run`);
  console.log(`  critical-classification mismatches vs expectation: ${criticalMismatches.length} ${criticalMismatches.length ? `(${criticalMismatches.map((r) => r.id).join(", ")})` : ""}`);
  console.log(`  rule-based vs AI-assisted critical divergence: ${ruleAiDivergence.length} ${ruleAiDivergence.length ? `(${ruleAiDivergence.map((r) => r.id).join(", ")})` : ""}`);
  const confidences = results.map((r) => r.aiAssessment.confidence).filter((v): v is number => typeof v === "number");
  if (confidences.length) {
    const avg = confidences.reduce((a, b) => a + b, 0) / confidences.length;
    console.log(`  avg AI confidence (turn 0, no answers yet): ${avg.toFixed(1)} (n=${confidences.length})`);
  }
  console.log(`\n== baseline complete ==`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
