---
name: truckfixr-safety-gate
description: Use before merging any change that touches maintenance triage, TADIS recommendations, case severity/status transitions, or escalation logic. Reviews whether the change could produce a dangerous false negative (an unsafe vehicle read as safe) or silently weaken an existing safety threshold.
---

# TruckFixr maintenance safety gate

Run this when a diff touches: `server/services/aiTriage.ts`, `tadisCore`,
`aiOrchestrator.ts`, `shared/maintenance/caseWorkflow.ts`, any case-status
transition, severity mapping, or escalation/notification logic
(`earlyWarning.ts`, `inAppAlerts`, `adminAlerts`).

## What to check

1. **Decision vocabulary unchanged or extended with evidence.** Actions:
   `continue_monitor`, `complete_trip_then_inspect`, `schedule_service`,
   `pull_from_service`, `roadside_assistance`, `tow`. Severities: `stable`,
   `attention`, `critical`. A new value or a remapped meaning is a safety-policy
   change — flag it, do not wave it through as a refactor.
2. **No threshold quietly loosens.** Compare confidence thresholds, severity→action
   mappings (`mapTriageAction`, `isCriticalAction`), and escalation conditions
   before/after. Any case where a previously `critical`/`pull_from_service`-eligible
   condition now maps to a less urgent action is a BLOCKER unless explicitly
   requested and justified by the user in this conversation.
3. **False negatives over false positives.** The dangerous failure mode is an unsafe
   vehicle read as safe/monitor-only. Evaluate the change against: brakes, steering,
   tires, overheating, oil pressure, fire/electrical risk, driveline failure,
   emissions/derate conditions. A change that makes any of these *less* likely to
   escalate needs explicit justification.
4. **Missing/conflicting evidence still escalates uncertainty, not confidence.** If
   evidence is incomplete (no fault code, no photo, low-confidence triage), the
   result should surface clarifying questions or a conservative default — not a
   forced confident recommendation.
5. **Escalation paths still reachable.** A human (manager) must still be able to
   override/escalate regardless of what the model says — verify no path removes or
   gates the manual override.
6. **Fallback behavior on AI failure is conservative.** If `analyzeDiagnosticWithAi`
   fails or times out, confirm the fallback doesn't default to "safe/monitor" —
   check what the existing fallback does before assuming the new code preserves it.
7. **Disclaimer/uncertainty language still ships.** Any new UI surface showing model
   output carries the existing safety-disclaimer pattern, not a stripped-down
   version implying certainty.

## Rules

- Never invent a regulatory requirement or a specific numeric threshold not already
  present in the code or asked for by the user.
- Never lower an existing safety threshold as a side effect of an unrelated change.
- If you find a threshold change that seems intentional but undocumented, treat it
  as a HIGH finding requiring explicit confirmation, not an assumption of correctness.
- Output findings using the BLOCKER/HIGH/MEDIUM/LOW/INFORMATIONAL scale from
  `.claude/workflows/fresh-context-review.md`.
