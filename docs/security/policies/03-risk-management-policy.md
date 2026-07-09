# Risk Management Policy

| | |
|---|---|
| **Status** | DRAFT — pending ratification |
| **Owner** | TODO: Security Lead |
| **Version** | 0.1 |
| **Effective** | TODO |
| **Last reviewed** | 2026-06-29 |
| **Review cadence** | Risk assessment at least annually; register reviewed weekly |

## 1. Purpose

Establish a lightweight, repeatable way to identify, rate, and treat security and
availability risks.

## 2. Process

1. **Identify** risks (from the weekly readiness review, incidents, vendor changes,
   architecture changes, and code review).
2. **Rate** each on **Likelihood × Impact** (Low / Medium / High).
3. **Treat**: mitigate, accept (with Security Lead sign-off and expiry), transfer
   (e.g. insurance/vendor), or avoid.
4. **Track** in the [Risk Register](../registers/risk-register.md) with an owner and
   target date.

## 3. Cadence

- The weekly SOC 2 readiness review (`reports/soc2-readiness-*.md`) is the primary
  risk-identification mechanism.
- A consolidated risk assessment is performed at least annually.

## 4. Risk acceptance

Accepting a risk requires the Security Lead's recorded approval, a rationale, and a
review/expiry date. Accepted risks are revisited at expiry.

## 5. Current top risks (snapshot — keep in the register)

- No automated test proves every customer-data query is fleet-scoped (app-layer
  isolation is the primary boundary). — *In progress.*
- API on a hosting tier without an SLA / documented backups verified by restore. —
  *In progress.*
- Small team → limited separation of duties; mitigated by CI gates and code review.
