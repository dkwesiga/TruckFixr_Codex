# Business Continuity & Disaster Recovery Policy

| | |
|---|---|
| **Status** | DRAFT — pending ratification |
| **Owner** | TODO: Security Lead |
| **Version** | 0.1 |
| **Effective** | TODO |
| **Last reviewed** | 2026-06-29 |
| **Review cadence** | Annual; restore test at least annually |

## 1. Purpose

Ensure TruckFixr can recover service and data after a disruption.

## 2. Architecture resilience

- The API and frontend are **stateless** — recovery is a redeploy from `main`.
- All durable state is in **Supabase** (Postgres + Storage) and **Stripe** (billing
  source of truth).

## 3. Objectives (confirm and record actuals)

- **RPO (max data loss):** TODO — target ≤ 24h on daily backups, ≤ 5 min with PITR.
- **RTO (max downtime):** TODO — document a realistic target.

## 4. Backups & recovery

Operational detail lives in the [Backups & Monitoring Runbook](../backups-and-monitoring.md),
which covers backup cadence/retention, the step-by-step recovery procedure, and the
restore-test requirement. Key obligations:

- Database backups must be enabled and their cadence/retention recorded.
- At least one **restore test** to a scratch database is performed and dated annually.
- Object storage (inspection photos) backup coverage must be confirmed.

## 5. Continuity for the team

- Source of truth (code, policies) is in GitHub; access is not dependent on any one
  person's device.
- A current record of which provider accounts and secrets exist (names only) is kept
  so a second authorized person can recover access.

## 6. Known constraint

The API currently runs on a hosting tier without an SLA. Do not commit to uptime
guarantees until this is upgraded and monitored.
