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

## Update 2026-08-17: confidence-calibration fix (Category 2)

Addressed the "confidence remains purely LLM self-reported" gap flagged above,
using this benchmark as the validation artifact per task §41's requirement
that medium-risk changes need benchmark evidence before shipping.

**Change**: added `evidenceCompletenessCeiling()` in `guestCaseAi.ts` — a pure
function that computes a confidence *ceiling* (never a floor) from structured
signals already available on the case: base 60, +15 if `concernCategory` is
set, +10 if `operatingStatus` isn't `"unknown"`, +10 if fault codes were
given, +5/+15 for 1/2+ answered adaptive questions. The model's self-reported
`confidence` is clamped to `min(reported, ceiling)` before it's used for
anything — the early-stop decision, the `confidenceLow` escalation flag, or
storage. This directly operationalizes task §20 ("confidence should be
constrained by structured evidence features... the LLM may contribute
judgment but should not invent confidence independently") without touching
the question-flow control logic itself (the existing `CONFIDENCE_THRESHOLD`/
`CONFIDENCE_QUESTION_CAP` gating is unchanged) — a thin, unstructured
one-liner can no longer be reported as 90%+ confident regardless of what the
model claims, while a well-specified case (category + known status + fault
codes) can still be confidently assessed on turn 1, since the ceiling scales
with actual evidence rather than imposing a fixed "must ask N questions"
rule. 5 new tests added (3 for the pure ceiling function, 2 integration tests
proving the clamp does/doesn't fire); all 32 `guestCaseAi.test.ts` tests pass.

**Benchmark re-run (post-fix, same 12 cases)**: 12/12 critical-classification
matches maintained, 0 rule-based/AI divergence maintained, avg confidence
65.8 (n=6 successful calls this run — visibly pulled down from the prior
run's 70.7, consistent with the clamp engaging on at least one case: C2's
raw self-reported confidence was clamped down to exactly its 85 ceiling).
No case's severity/action classification changed as a result of this
change — confirms the clamp is acting on the reported number, not silently
altering the underlying decision logic, matching the intended low blast
radius.

Not addressed this pass (still open, see above): AI-call reliability in this
environment, and the deterministic-fallback default-to-stable behavior for
ambiguous `symptom`-category free text (C4/C11 still fell back to the rule
engine and showed the same "stable" severity-deflation flag both runs).

## Update 2026-08-17 (2): AI-call reliability root cause found and fixed

Investigated the "AI call reliability in this environment" open item from the
first update. Root cause found via `scripts/admin/probe-diagnosis-ai-health.ts`
plus direct live requests against OpenRouter: **`deepseek/deepseek-v4-flash`
(the default OpenRouter model) is a reasoning-token model, and the
orchestrator never told OpenRouter to skip reasoning.** Reproduced directly
against the real `ASSESSMENT_SYSTEM_PROMPT`:

| | reasoning enabled (prior default) | `reasoning: {enabled: false}` |
|---|---|---|
| Latency (C4 prompt, live) | 8178ms | 4844ms |
| `reasoning_tokens` used | 278 / 400 completion-token budget (70%) | 0 |

Reasoning was eating up to 70% of the completion-token budget on a task that
only needs a few hundred tokens of structured JSON out, and roughly doubling
latency against the 12s `AI_TIMEOUT_MS` — a direct mechanism for both the
timeouts and the truncated/unparseable-JSON fallbacks seen in the first
benchmark run (this is likely why C4/C5/C11 fell back inconsistently across
runs: reasoning-token consumption is non-deterministic per OpenRouter's
upstream routing).

**Fix**: added an OpenRouter-only `disableReasoning` option to
`aiOrchestrator.ts`'s `OrchestratorInput` (`invokeOpenRouter` sends
`reasoning: {enabled: false}` when set; every other provider is unaffected —
scoped deliberately, not a global orchestrator default, since only this
flow's prompts were benchmarked). Wired into both `guestCaseAi.ts` calls
(`guest_case_next_question`, `guest_case_assessment`). 2 new tests in
`aiOrchestrator.test.ts` assert the field is/isn't sent depending on the
flag; 39/39 tests pass across both files, typecheck clean.

**Benchmark re-run (post-fix, same 12 cases)**:

- **AI-call fallback rate: 6/12 → 1/12** (C4 remains the sole outlier —
  same case that fell back on every run so far; worth a closer look
  separately, may be a different failure mode).
- **Latency roughly halved across the board** (e.g. C1: 2.5s vs. the 3.5-10s
  range seen previously; C7: 1.8s vs. up to 16s).
- **C11 (recurring post-repair fault) — one of the two cases flagged for
  severity-deflation in the first update — now succeeds and correctly
  reports `attention/schedule_service`** instead of falling back to the
  deterministic engine's lenient `stable` default. This is a direct, measured
  fix for one of the two open severity-deflation concerns, not just a
  latency win.
- 0/12 critical-classification mismatches and 0 rule-based/AI divergence
  held throughout — no accuracy regression from the change itself.
- Avg confidence 71.3 (n=8 successful calls, up from n=6 in the prior run,
  reflecting more calls actually succeeding rather than falling back).

**Still open**: C4 (intermittent stall while driving) has now fallen back on
every run regardless of the reasoning fix — worth investigating as its own,
narrower issue rather than assuming it will resolve itself. Also unresolved:
whether the deterministic engine's `stable` default for `symptom`-category
free text is the right fallback severity when the AI *does* fail (still
relevant for C4 and for production's inevitable occasional fallback, even at
a much lower rate now).

## Update 2026-08-17 (3): C4's specific fallback root-caused and partly fixed

Called `generateGuestAssessment()` directly against C4's real input 5 times
in a row (turn 0, no answers) to see the actual failure reasons rather than
just success/fail counts. Found two distinct, unrelated causes — neither is
the reasoning/timeout issue fixed above:

1. **By-design safety floor, working correctly**: 1/5 runs had the AI
   classify the case as `critical` on turn 0 with zero clarifying answers —
   `generateGuestAssessment` correctly defers a first-turn critical verdict
   to the rule-based result (`guest_case_ai_critical_deferred`), exactly as
   designed. Not a bug. But the rule-based fallback it defers to classifies
   this input as `stable` — the most lenient possible reading, for a case
   the AI itself flagged as potentially critical. Flagged, not fixed (see
   below).
2. **Real bug, fixed**: 1/5 runs failed schema validation —
   `"explanation": too_big, maximum 400 characters`. The model's explanation
   ran a few characters past the 400-char cap, and the *entire* otherwise-
   valid classification (severity, action, confidence) was discarded because
   of it, falling all the way back to the rule engine's `stable` default.
   Fixed by truncating the explanation to 400 chars before schema validation
   instead of rejecting the whole response — 1 new regression test in
   `guestCaseAi.test.ts` (29/29 pass).

**Re-verified with the fix in place**, this time simulating one answered
clarifying question (past the turn-0 safety floor): 5 of 6 runs succeeded
and consistently classified the case as **`critical`/`pull_from_service`,
confidence 85-90** — not merely `attention` as this benchmark's own C4
expectation assumed. On reflection that's a defensible, arguably more
correct call: stalling on a highway is a real collision risk, not just a
"needs service soon" symptom. The one remaining fallback in that re-run was
the turn-0-only safety floor from cause 1 above, working as intended.

**Net effect**: what looked like unexplained "AI reliability" flakiness for
this one case was actually two identifiable, mostly-fixed causes, not
irreducible noise. Still open: whether the rule-based engine's `stable`
default is the right severity to show for `symptom`-category free text
during the (now much rarer, but still real) window where a first-turn
critical AI verdict is correctly deferred — that's a change to shared
severity-classification logic affecting more than just this case, so it
needs its own benchmark pass across a broader case set before touching it,
not a one-off fix scoped to C4.

## Sample-size caveat

12 synthetic golden cases, single run per case (barring the timeout-driven
rerun) — not statistically powered for confidence-interval claims. Good
enough to catch the keyword-matching bug and establish a repeatable baseline
artifact; not good enough to certify calibration. Recommend growing this set
from confirmed `guestCases` outcomes (via `guestCaseOutcomes`/follow-up
tables) once there's enough volume, per task §4's stated preference order.
