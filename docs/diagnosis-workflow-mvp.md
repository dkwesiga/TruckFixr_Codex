# TruckFixr MVP Diagnosis Workflow

## Problems Found In Current Code

- The current router builds a broad support package with prior diagnostics, defects, inspections, repairs, maintenance history, recent parts, compliance history, and similar cases before calling diagnosis.
- `tadisCore` contains rule-engine scoring, baseline ranking, recurring-failure calculations, LLM intake interpretation, LLM review, fallback shaping, queueing, labor guidance, and safety overrides in one large path.
- `diagnosticLlmReview` asks the model for internal support scores and labor-hour guidance, which is more complex than the MVP needs and increases prompt/response size.
- The UI presents TADIS as the primary diagnostic loop and displays labor estimates, which does not match the revised MVP contract.

## Revised MVP Direction

TruckFixr now follows this workflow:

- AI diagnoses.
- TADIS references.
- The diagnosis prompt receives only compact vehicle details, the user report, up to 3 maintenance summaries, the last daily inspection, compact clarification history, and approved fault-code reference matches.
- The AI handles classification, clarification, diagnostic reasoning, final recommendations, risk level, safe-to-drive decision, and driver/manager language.
- TADIS no longer overrules the AI diagnosis in the MVP path.

## Dynamic Diagnostic Session

The MVP diagnosis path is now a dynamic session, not a fixed two-call flow:

- Local preprocessing detects SPN/FMI, MID/PID/SID/FMI, OBD DTCs, derate/shutdown countdown, aftertreatment, ABS/brake/air, oil pressure, coolant/overheating, transmission, no-start, and electrical smoke/fire signals.
- Approved fault-code references are looked up before customer-facing diagnosis when fault-code patterns are detected.
- DeepSeek through OpenRouter is the low-cost default for classification and normal diagnosis.
- Stronger configured OpenRouter models are used when safety, complexity, missing approved references, low confidence, or plan/risk rules justify escalation.
- Clarification questions stay inside the same diagnostic case and do not count as separate customer-facing diagnosis usage.
- Completed final diagnostic cases count toward plan usage; every internal AI call is logged separately for cost and quality review.

## Reference Data Rules

- `faultCodeReferences`, `faultCodeReferenceSources`, and `faultCodeReferenceApprovals` are the prepared curated reference layer.
- New imported or placeholder records must start as `needs_review`.
- Only `approved` references are included in normal customer-facing diagnosis context.
- `needs_review` references are available only when internal reference viewing is explicitly allowed for owner/manager style review paths.

## Starter Seed And Review Flow

- Run `pnpm seed:fault-codes` with `DATABASE_URL` configured to load the starter high-value set for aftertreatment/emissions, brake/air pressure, oil pressure, coolant/overheating, and derate/shutdown cases.
- The seed inserts source rows into `faultCodeReferenceSources` and reference rows into `faultCodeReferences`.
- Seeded records are intentionally inserted as `needs_review`; the seed path does not auto-approve imported records.
- Sign in as an `owner` or `manager` and open `/admin/fault-codes`.
- Keep the queue filtered to `Needs review`, open each record, confirm the source link and summary, refine checks if needed, and use the Review Decision card to `Approve`, `Reject`, `Reopen`, or `Archive`.
- Every approval or status transition from the admin flow is written to `faultCodeReferenceApprovals`.
- Only records that have been explicitly approved from the review flow are eligible for normal customer-facing diagnosis context.

Current approved starter stance:

- The current approved starter set is intentionally heavy-duty-first for small Ontario/Canadian diesel fleets where J1939/SPN-FMI is the primary diagnostic surface.
- Approved starter references currently cover `SPN 4364 FMI 18`, `P2463`, `SPN 37 FMI 18`, `SPN 100 FMI 1`, `SPN 110 FMI 0`, and `SPN 5246 FMI 15/16/0`.
- `SPN 37 FMI 18` is approved conditionally for supported Eaton/Endurant-style air-managed transmission fleets and should not be treated as a universal brake/air reference.
- `P204F` and `P20EE` remain intentionally deferred in `needs_review` for broader fleet-fit review because they are more generic OBD-style aftertreatment/reductant records.
- If the supported fleet mix later expands beyond the current heavy-duty-first scope, revisit `P204F` and `P20EE` before broadening customer-facing reference coverage.

## Model Configuration

Required:

- `OPENROUTER_API_KEY`

Recommended canonical MVP model keys:

- `DEFAULT_CLASSIFICATION_MODEL`
- `DEFAULT_DIAGNOSIS_MODEL`
- `LOW_COST_CLARIFICATION_MODEL`
- `ADVANCED_DIAGNOSIS_MODEL`
- `SAFETY_CRITICAL_MODEL`
- `COMPLEX_FAULT_CODE_MODEL`
- `JSON_REPAIR_MODEL`
- `FALLBACK_MODEL_1`
- `FALLBACK_MODEL_2`
- `ADMIN_COMPARISON_MODEL`
- `DIAGNOSTIC_CONFIDENCE_THRESHOLD` defaults to `80`
- `DIAGNOSTIC_MAX_CLARIFICATIONS` defaults to `3`
- `DIAGNOSTIC_LLM_RETRY_COUNT` defaults to `2`
- `DIAGNOSTIC_INTAKE_MAX_TOKENS` defaults to `320`
- `DIAGNOSTIC_REVIEW_MAX_TOKENS` defaults to `380`
- `DIAGNOSIS_MAX_TOKENS` defaults to `900`

Canonical defaults used in local `.env.example`, runtime config, and `render.yaml`:

- `OPENROUTER_MODEL=deepseek/deepseek-v4-flash`
- `OPENROUTER_FALLBACK_MODEL=google/gemini-2.5-flash`
- `DEFAULT_CLASSIFICATION_MODEL=deepseek/deepseek-v4-flash`
- `DEFAULT_DIAGNOSIS_MODEL=deepseek/deepseek-v4-flash`
- `LOW_COST_CLARIFICATION_MODEL=deepseek/deepseek-v4-flash`
- `ADVANCED_DIAGNOSIS_MODEL=openai/gpt-4.1-mini`
- `SAFETY_CRITICAL_MODEL=openai/gpt-4.1-mini`
- `COMPLEX_FAULT_CODE_MODEL=google/gemini-2.5-flash`
- `JSON_REPAIR_MODEL=openai/gpt-4.1-mini`
- `FALLBACK_MODEL_1=google/gemini-2.5-flash`
- `FALLBACK_MODEL_2=openai/gpt-4.1-mini`

Provider-specific direct keys remain optional future escape hatches. Normal MVP routing should prefer OpenRouter BYOK where practical.

Legacy aliases still accepted at runtime for older deployments:

- `OPENROUTER_MODEL_PRIMARY`
- `SAFETY_CRITICAL_DIAGNOSIS_MODEL`
- `FALLBACK_DIAGNOSIS_MODEL_1`
- `FALLBACK_DIAGNOSIS_MODEL_2`

## Manual Test Cases

- Normal issue with code: select a vehicle, enter `Low power, check engine light`, and fault code `SPN 4364 FMI 18`. Expect normal routing to DeepSeek/OpenRouter and either a final diagnosis or one focused clarification if confidence is below 80.
- Safety-critical issue: enter `Brake pedal going soft`. Expect safety escalation and `stop_and_inspect` or `tow_or_repair_immediately`.
- Coolant and oil mixing: enter `Coolant mixed with oil, milky oil on dipstick`. Expect high/critical risk and no `safe_to_drive`.
- No history: use a vehicle with no maintenance or inspections. Diagnosis should still proceed.
- Low confidence: return or simulate AI confidence below 80. Expect one clarification question.
- Three clarifications: answer three questions, then rerun. Expect final diagnosis with uncertainty instead of a fourth question.
- Invalid AI JSON: simulate malformed model output. Expect one repair pass, then safe fallback if repair fails.
- No fault code: leave fault code blank. Diagnosis should proceed from symptoms.
- needs_review reference: insert a matching `faultCodeReferences` row with `reviewStatus='needs_review'`. Normal diagnosis should not include it as customer-facing context.
- OpenRouter fallback: make the primary OpenRouter model fail and verify a configured fallback model is attempted, fallback is logged, and raw provider errors are not shown.
