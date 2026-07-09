# Incident Response Plan

| | |
|---|---|
| **Status** | DRAFT — pending ratification |
| **Owner** | TODO: Security Lead (Incident Commander) |
| **Version** | 0.1 |
| **Effective** | TODO |
| **Last reviewed** | 2026-06-29 |
| **Review cadence** | Annual; tabletop test annually |

## 1. Purpose

Define how TruckFixr detects, responds to, and learns from security and
availability incidents.

## 2. What is an incident

Any suspected or confirmed event that threatens the confidentiality, integrity, or
availability of customer/company data — e.g. unauthorized access, data exposure,
credential/secret leak, malware, extended outage, or a vendor breach affecting us.

## 3. Roles

- **Incident Commander (IC):** Security Lead — coordinates response and decisions.
- **Responders:** Engineering.
- **Communications:** IC (or delegate) handles customer/authority notifications.

## 4. Severity

| Sev | Examples | Target response |
|---|---|---|
| **SEV-1** | Confirmed customer-data exposure; full outage | Immediate, all-hands |
| **SEV-2** | Suspected exposure; partial outage; secret leak | Same business day |
| **SEV-3** | Minor/contained; no data impact | Next business day |

## 5. Process

1. **Detect & report** — anyone reports to the Security Lead (and via
   security@truckfixr.com). Sources include CI secret-scan alerts, observability
   events, uptime monitor, vendor notices, customer reports.
2. **Triage** — IC assigns severity and opens an incident record (date, timeline,
   actions).
3. **Contain** — e.g. revoke access, rotate secrets, disable a route, roll back a
   deploy.
4. **Eradicate & recover** — remove the cause; restore service (see
   [BC/DR](06-business-continuity-dr-policy.md) and the
   [Backups runbook](../backups-and-monitoring.md)).
5. **Notify** — if personal data is involved, assess breach-notification obligations
   under PIPEDA (notify the Privacy Commissioner and affected individuals where there
   is a real risk of significant harm) and notify affected customers per contract.
   **Planned/target:** document notification timelines with counsel.
6. **Post-incident review** — within 5 business days, write a brief blameless
   retro: what happened, impact, root cause, fixes, and prevention. File under
   `reports/`.

## 6. Contacts

- Internal: Security Lead — TODO.
- Key vendors' support/security contacts: see the
  [Vendor Inventory](../registers/vendor-subprocessor-inventory.md).

## 7. Testing

Run at least one tabletop exercise per year and record the outcome.
