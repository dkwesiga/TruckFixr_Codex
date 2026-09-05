# AI / maintenance-safety rules

- TADIS (`server/services/aiTriage.ts`, `tadisCore`, `aiOrchestrator.ts`) is decision
  support. Its output (`most_likely_cause`, `severity`, `confidence_score`,
  `recommended_action`) must never be represented to a driver or fleet manager as a
  certified mechanical diagnosis. The existing disclaimer pattern
  (`SAFETY_DISCLAIMER` in `aiTriage.ts`) must ship with any new surface that shows
  model output.
- Model output is untrusted input. Parse/validate it (see
  `server/services/aiResponseParsing.ts`) before it drives a decision, a query, or a
  case-status transition. Never `eval`/interpolate raw model text into a query or
  shell command.
- Never silently lower an existing escalation/severity threshold
  (`mapTriageAction`, `isCriticalAction` in `shared/maintenance/caseWorkflow.ts`) —
  changing what counts as `pull_from_service` / `roadside_assistance` / `tow` is a
  safety-policy decision, not a routine code change. Document it as a finding and
  get explicit sign-off; don't implement it as a side effect of something else.
- Heightened-care conditions (treat false negatives as the dangerous failure mode):
  brakes, steering, tires, overheating, oil pressure, fire/electrical risk,
  driveline failure, emissions/derate conditions, and any other critical warning
  state already flagged `critical` in the data.
- When evidence is missing or conflicting, the system should prefer surfacing
  uncertainty (clarifying questions, `confidence_score`) over forcing a confident
  recommendation. Don't "fix" a low-confidence path by hardcoding a default answer.
- Use `.claude/skills/truckfixr-safety-gate/SKILL.md` for any change that touches
  triage/recommendation logic, case-status transitions, or severity mapping.
- A confirmed outcome must be verified before it feeds learning: don't remove or
  weaken the `RESOLVED_OUTCOME_STATES` check in
  `server/services/tadisLearningPromotion.ts` (`evaluateAndUpsertCandidate`) —
  it's the boundary that keeps a bare unverified `reported` outcome from being
  treated as training-quality evidence. See `.claude/skills/truckfixr-confirmed-outcome/SKILL.md`.
- Parts fitment (`shared/parts/fitmentEvidence.ts` → `assessFitment`) and option
  comparison (`shared/parts/recommendation.ts` → `compareOptions`) are
  deterministic by design — no AI call exists in either today, and none should
  be added without explicit sign-off. If AI assistance is added later (parsing
  technician notes or supplier quotes, normalizing descriptions, extracting an
  ETA, summarizing tradeoffs, suggesting clarifying questions), it may only
  ever supply *evidence* for `assessFitment`/`compareOptions` to evaluate — it
  must never: set a fitment state directly; invent a part number/cross-
  reference/supersession claim; fabricate a price, stock/availability claim,
  warranty term, ETA, or supplier identity; override deterministic fitment
  evidence; or autonomously approve a sourcing option (`partOptionApprovals` —
  approval is owner/manager-only by policy, never system-initiated). If AI
  extraction is introduced, preserve the chain **raw source → AI-extracted
  value → verified/non-verified status** — never treat an extraction as fact
  on its own, the same way a supplier's own claim
  (`partSupplierOptions.fitmentClaim`) is never treated as TruckFixr's fitment
  conclusion. See `.claude/skills/truckfixr-parts-acquisition/SKILL.md`.
