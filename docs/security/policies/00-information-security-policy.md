# Information Security Policy (Master)

| | |
|---|---|
| **Status** | DRAFT — pending ratification |
| **Owner** | TODO: Security Lead (founder/CTO) |
| **Version** | 0.1 |
| **Effective** | TODO |
| **Last reviewed** | 2026-06-29 |
| **Review cadence** | Annual or on material change |

## 1. Purpose

This is the top-level policy governing how TruckFixr Fleet AI protects the
confidentiality, integrity, and availability of customer and company data. All
other policies in this pack support it.

## 2. Scope

Applies to all TruckFixr personnel (employees, founders, contractors) and to all
systems that store or process customer data: the TruckFixr web app/API, the
Supabase database and storage, Stripe billing, GitHub source control, Render
hosting, email delivery, and AI model providers used by the diagnosis workflow.
See the [System Description](../system-description.md) for the authoritative scope.

## 3. Principles

- **Least privilege** — access is granted only as needed for a role.
- **Defense in depth** — multiple independent controls (e.g. app-layer fleet
  scoping *and* database RLS).
- **Privacy by design** — personal identifiers are minimized and redacted in logs.
- **Secure by default** — secrets out of source control; production deploys gated
  by CI.
- **Honest claims** — we do not overstate our certification status.

## 4. Roles and responsibilities

- **Security Lead (Owner of this pack):** owns the security program, approves
  policies, runs the weekly readiness review, accepts risk.
- **Engineering:** implements and operates technical controls; follows the
  [Secure Development](12-secure-development-policy.md) and
  [Change Management](07-change-management-policy.md) policies.
- **All personnel:** follow the [Acceptable Use](02-acceptable-use-policy.md)
  policy and report suspected incidents.

## 5. Control areas (see linked policies)

Access control; acceptable use; risk management; vendor management; incident
response; business continuity & DR; change management; data classification;
data retention & disposal; cryptography; logging & monitoring; secure development;
personnel security; vulnerability management; privacy/PIPEDA.

## 6. Compliance posture

SOC 2 readiness is **in progress** (Security, Availability, Confidentiality).
TruckFixr is not certified. Progress is tracked in `reports/soc2-readiness-*.md`.

## 7. Enforcement

Violations may result in revoked access and, for personnel, disciplinary action.
Exceptions must be approved and recorded by the Security Lead with an expiry date.

## 8. Review

Reviewed at least annually and after any major incident, architecture change, or
new data type. Changes are tracked in git history.
