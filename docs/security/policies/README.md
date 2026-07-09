# TruckFixr Security & Compliance Policy Pack

**Status: DRAFT.** These are lean, early-stage policies grounded in TruckFixr's
actual stack and controls. They are intentionally short and free of enterprise
boilerplate. Each must be **reviewed and ratified** (owner sign-off + effective
date) before it is treated as an in-force control, and several reference controls
marked **Planned/target** that are not yet implemented.

> TruckFixr is **not** SOC 2 compliant, SOC 2 certified, ISO 27001 certified, or
> HIPAA compliant. SOC 2 readiness is in progress, aligning with the **Security,
> Availability, and Confidentiality** trust services criteria.
>
> If StrongDM Comply (or similar) is used, it is a **documentation accelerator
> only — it does not prove TruckFixr is SOC 2 compliant or certified.**

## How to use this pack

1. Assign each policy an **Owner** (replace `TODO`).
2. Fill effective dates and any `TODO`/`Planned` items, or move them to the
   `reports/soc2-readiness-*.md` backlog.
3. Ratify (owner sign-off). Re-review at the cadence stated in each document, or
   on material change.

## Contents

| # | Policy | Primary SOC 2 criteria |
|---|--------|------------------------|
| 00 | [Information Security Policy](00-information-security-policy.md) (master) | CC1–CC9 |
| 01 | [Access Control Policy](01-access-control-policy.md) | CC6 |
| 02 | [Acceptable Use Policy](02-acceptable-use-policy.md) | CC1, CC6 |
| 03 | [Risk Management Policy](03-risk-management-policy.md) | CC3, CC4 |
| 04 | [Vendor & Third-Party Management Policy](04-vendor-management-policy.md) | CC9 |
| 05 | [Incident Response Plan](05-incident-response-plan.md) | CC7 |
| 06 | [Business Continuity & Disaster Recovery Policy](06-business-continuity-dr-policy.md) | A1 |
| 07 | [Change Management Policy](07-change-management-policy.md) | CC8 |
| 08 | [Data Classification & Handling Policy](08-data-classification-policy.md) | C1, CC6 |
| 09 | [Data Retention & Disposal Policy](09-data-retention-disposal-policy.md) | C1, P |
| 10 | [Cryptography Policy](10-cryptography-policy.md) | CC6 |
| 11 | [Logging & Monitoring Policy](11-logging-monitoring-policy.md) | CC7 |
| 12 | [Secure Development Policy (SDLC)](12-secure-development-policy.md) | CC8 |
| 13 | [Personnel Security Policy](13-personnel-security-policy.md) | CC1 |
| 14 | [Vulnerability Management Policy](14-vulnerability-management-policy.md) | CC7 |
| 15 | [Privacy & PIPEDA Policy (internal)](15-privacy-pipeda-policy.md) | P |

## Related operational documents

- [System Description](../system-description.md) — SOC 2 scope and architecture
- [Tenant Isolation Control Statement](../tenant-isolation.md)
- [Backups & Monitoring Runbook](../backups-and-monitoring.md)
- [RLS Isolation Evidence Cadence](../rls-isolation-evidence.md)

## Registers (evidence)

- [Vendor / Sub-processor Inventory](../registers/vendor-subprocessor-inventory.md)
- [Risk Register](../registers/risk-register.md)
- [Asset Inventory](../registers/asset-inventory.md)
- [Access Review Log](../registers/access-review-log.md)
