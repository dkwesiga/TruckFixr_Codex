# Try One Case — accuracy audit & baseline (2026-08-13)

Scope: guest `/try-one-case` flow only (`guestCaseAi.ts`, `guestCaseAssessment.ts`,
`guestCaseFlow.ts`, `guestCaseService.ts`, `TryOneCase.tsx`). Full system map
recorded in this session's transcript; not duplicated here.

## Changes shipped this pass

### 1. Fixed: critical-keyword false positives from substring matching (Category 1)
`shared/maintenance/guestCaseFlow.ts` `detectCriticalTrigger()` used
`text.includes(keyword)` — plain substring matching, not word-boundary. Verified
false positives via live benchmark and direct reproduction:

| Input | Before | After |
|---|---|---|
| "Truck won't start, cranks fine but never **fires**" | CRITICAL (`fire` ⊂ `fires`) | non-critical |
| "engine has a **misfire** on cylinder 3" | CRITICAL | non-critical |
| "engine **backfires** under load" | CRITICAL | non-critical |
| "noticed a **wheel offset** issue after alignment" | CRITICAL (`wheel off` ⊂ `wheel offset`) | non-critical |

This is a deterministic safety-floor bug, not a prompt/model issue — it overrides
the AI path entirely and would have false-escalated a very common phrasing
("never fires," "misfire") to the guest's most severe possible outcome
(pull-from-service / tow guidance), which is exactly the severity-inflation
failure mode task §26 warns about. Fixed with word-boundary regex matching;
added `brakes` as an explicit keyword to `brake_performance` to avoid a
regression (`brake` alone no longer matches plural `brakes` under word-boundary
matching). 3 new regression tests added to `guestCaseFlow.test.ts`; all 60
guest-case-related tests pass.

### 2. Prompt tuning: anti-anchoring / discriminating questions (Category 1)
`QUESTION_SYSTEM_PROMPT` in `guestCaseAi.ts` previously optimized only for
"would this change urgency." Added explicit instruction to prefer questions
that could *disconfirm* the current leading hypothesis (task §10-11) and to
restrict questions to driver-observable evidence, never technician-only
measurements. No test assertions depend on exact prompt text; full suite
still passes.

## Baseline: 12-case live benchmark (post-fix)

Script: `scripts/admin/benchmark-try-one-case-baseline.ts` (`npx tsx
scripts/admin/benchmark-try-one-case-baseline.ts`). Hits the real configured
OpenRouter key (`deepseek/deepseek-v4-flash`), turn 0 only (no prior answers —
matches what `guestCases.start` actually does). Not part of the CI suite
(live cost + latency); rerun manually when validating future prompt/logic
changes to this flow.

| Case | Expected critical? | Rule-based | AI-assisted | Confidence | Notes |
|---|---|---|---|---|---|
| C1 benign light | No | non-critical ✓ | non-critical ✓ | 90 | — |
| C2 no-start, immobile | No | non-critical ✓ | non-critical ✓ | 80 | fixed by the keyword-boundary patch above |
| C3 no-crank, silent | No | non-critical ✓ | non-critical ✓ | 80 | — |
| C4 intermittent stall on highway | No | non-critical ✓ | non-critical ✓ | n/a (AI call failed→fallback) | ⚠ fell back to rule-based "stable"; flagged below |
| C5 derate/DPF | No | non-critical ✓ | non-critical ✓ | 75 | — |
| C6 overheat, soft language | ambiguous | non-critical | non-critical | n/a (fallback) | correctly asked about coolant level next |
| C7 fluid under truck, unknown | No | non-critical ✓ | non-critical ✓ | 65 | asked for location first — good, didn't assume active leak |
| C8 soft brake pedal | Yes | CRITICAL ✓ | CRITICAL ✓ | — | keyword floor correctly escalates |
| C9 white smoke | Yes | CRITICAL ✓ | CRITICAL ✓ | — | sanity check |
| C10 vague ("acting weird") | No | non-critical ✓ | non-critical ✓ | 30 | correctly low-confidence, didn't overclaim |
| C11 recurring post-repair fault | No | non-critical ✓ | non-critical ✓ | 75 | explanation correctly referenced the prior repair |
| C12 `unsafe_to_move` flag | Yes | CRITICAL ✓ | CRITICAL ✓ | — | sanity check |

**Result: 12/12 critical-classification matches, 0 rule-based/AI divergence,
avg confidence 70.7 (n=7 cases where the AI call succeeded).**

### Open observations (not fixed this pass — flagged for follow-up)

- **AI call reliability in this environment**: 5 of 12 turn-0 calls to
  `deepseek/deepseek-v4-flash` via OpenRouter either timed out (12s) or
  otherwise fell back to the deterministic engine across two benchmark runs.
  Some of this may be sandbox-network latency rather than representative of
  production — flagging rather than concluding, sample too small either way.
  Worth checking real production `ai_call_fallback` rates before acting.
- **C4 (intermittent stall while driving) fell back to the deterministic
  engine on both runs**, which defaults to `stable/continue_monitor` — the
  most lenient possible reading, for a symptom that's arguably worse than
  immobility (stalling in moving traffic). This is the *preliminary* view
  shown before the follow-up question is answered, so it's provisional, not
  final — but it's still what's shown at that moment. Worth checking whether
  the deterministic engine's default-to-stable behavior for `symptom`-category
  free text is the right fallback when the AI is unavailable, since a
  degraded/fallback state should arguably be at least as cautious as the
  working state, not more lenient.
- **Confidence remains purely LLM self-reported** (not blended with
  structured evidence features per task §20). Still flagged as the top
  Category 2 candidate; not changed this pass — no benchmark evidence yet
  that a blended approach would improve on the above numbers, and this
  benchmark is really the enabling artifact for evaluating that change next.

## Sample-size caveat

12 synthetic golden cases, single run per case (barring the timeout-driven
rerun) — not statistically powered for confidence-interval claims. Good
enough to catch the keyword-matching bug and establish a repeatable baseline
artifact; not good enough to certify calibration. Recommend growing this set
from confirmed `guestCases` outcomes (via `guestCaseOutcomes`/follow-up
tables) once there's enough volume, per task §4's stated preference order.
