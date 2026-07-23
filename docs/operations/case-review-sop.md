# Case Review SOP

Standard operating procedure for human review of TruckFixr cases (guest
`/try-one-case` submissions and fleet maintenance cases). This is provisional
operational copy and is subject to qualified 310T technical/safety and Ontario
legal review before broad public rollout.

## 1. Reviewer responsibilities

- Monitor the **Case review queue** (`/admin/case-review`, staff only).
- Work items worst-first: `critical_safety` and `urgent` priority before others.
- For each item: confirm the customer-facing readiness (Ready / Monitor /
  Service Soon / Stop) is safe and defensible given the evidence, correct it if
  not, and record required notes.
- Never weaken a critical (`Stop`) recommendation without a qualified assessment
  and a recorded override reason.

## 2. Review categories

| Category | Meaning |
|---|---|
| `critical_safety` | A safety trigger fired (brakes, steering, smoke/fire, etc.) or the vehicle was reported unsafe to move. Always eligible for review. |
| `technical_uncertainty` | Evidence is incomplete or a physical test is required. |
| `conflicting_information` | Reported symptoms/answers conflict. |
| `high_cost_risk` | Estimated cost exceeds the configured threshold (initially CAD $2,500). |
| `manual_reviewer_escalation` | A reviewer escalated the item. |

## 3. Routine review

1. **Claim** the item (sets `review_in_progress`, records reviewer + start time).
2. Read the concern, operating status, adaptive answers, and the automated
   assessment.
3. Confirm or adjust the readiness and operating action.
4. **Complete** with an outcome and required notes. The system records the
   completion time and whether the SLA was met.

## 4. Technician (310T) review

Escalate to the backup **qualified 310T technician** when the item is
`technical_uncertainty`, involves a safety system whose condition cannot be
judged from the report, or when a reviewer is not confident. Escalation raises
priority to `urgent`, records the reason, and alerts the backup reviewer.

## 5. Critical triggers

Brake performance, low air pressure, steering, red stop-engine, low oil
pressure, severe overheating, dangerous active leak, smoke, fire, wheel/tire
instability, wheel separation, severe derate in an unsafe location, immediate
danger to people, and collision-related mechanical risk. When triggered, the
system shows safety guidance to the submitter immediately (before any contact
capture), records the case, and queues it for review.

## 6. Service hours & SLA

- **Service hours:** Monday–Friday, 8:00 a.m.–6:00 p.m. Eastern Time.
- **Target:** critical cases submitted during service hours are targeted for
  review within **one business hour**. This is a target, not a guarantee, and is
  not 24/7 support.
- SLA due times are computed with timezone-aware business-hours math; cases
  submitted after hours start the clock at the next service-window open.
- The queue records: submitted, trigger detected, reviewer notified, review
  started, review completed, SLA due, SLA met/missed, reviewer, backup reviewer,
  escalation reason, outcome, and after-hours status.

## 7. After-hours handling

After-hours items are flagged `after hours`. Their SLA clock starts at the next
open. Critical safety guidance is still shown to the submitter immediately and
the case is preserved for the next business day's first review pass.

## 8. Reviewers (configurable)

- **Primary reviewer:** `CASE_REVIEWER_EMAIL` (falls back to the sales
  notification inbox).
- **Backup reviewer:** `CASE_BACKUP_REVIEWER_EMAIL` — intended for a **named
  qualified 310T technician**.

## 9. Required notes

Record: what evidence was reviewed, why the readiness/action was confirmed or
changed, and any escalation reason. Notes must be sufficient for another
reviewer to understand the decision.

## 10. Prohibited claims

Do not state or imply: a confirmed diagnosis, roadworthiness certification,
emergency dispatch, roadside assistance, continuous monitoring, or guaranteed
timing/outcomes. TruckFixr provides decision support only.

## 11. Missed-SLA review

Any item completed with `SLA missed` is reviewed weekly: identify the cause
(capacity, after-hours, routing) and adjust reviewer coverage or thresholds.

## 12. Weekly QA

Sample per the QA policy (all critical cases, missed SLA, readiness changed
after review, conflicting information, high-cost cases, outcomes that
contradicted the recommendation, repeat issues within 30 days, and 10% of
routine completed cases). Assess readiness correctness, safe guidance, question
usefulness, correct escalation, and whether a rule, prompt, threshold, or this
SOP needs updating.
