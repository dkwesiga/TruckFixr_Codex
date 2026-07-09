# TruckFixr Security & Compliance Documentation

**Status: DRAFT.** TruckFixr is an early-stage SaaS. **SOC 2 readiness is in
progress** (Security, Availability, Confidentiality). TruckFixr is **not** SOC 2
compliant, SOC 2 certified, ISO 27001 certified, or HIPAA compliant.

> If StrongDM Comply (or similar) is used, it is a **documentation accelerator only —
> it does not prove TruckFixr is SOC 2 compliant or certified.**

## Map

- **[System Description](system-description.md)** — what's in scope (architecture, data,
  controls summary).
- **[Policy pack](policies/README.md)** — 16 lean policies + an index.
- **Operational control docs**
  - [Tenant Isolation Control Statement](tenant-isolation.md)
  - [Backups & Monitoring Runbook](backups-and-monitoring.md)
  - [RLS Isolation Evidence Cadence](rls-isolation-evidence.md)
  - [Deployment Safety & CI/CD Controls](deployment-safety.md)
- **Registers (evidence)**
  - [Vendor / Sub-processor Inventory](registers/vendor-subprocessor-inventory.md)
  - [Risk Register](registers/risk-register.md)
  - [Asset Inventory](registers/asset-inventory.md)
  - [Access Review Log](registers/access-review-log.md)
- **Reviews** — `reports/soc2-readiness-*.md` (weekly).
- **Vulnerability reporting** — see [`/SECURITY.md`](../../SECURITY.md).

## Before treating any of this as "in force"

1. Assign an **Owner** to each document (replace `TODO`).
2. Fill the `TODO`/`Planned` items or move them to the readiness backlog.
3. **Ratify** (owner sign-off + effective date).
4. Have the privacy documents reviewed by **legal counsel**.
5. Re-review at each document's stated cadence.
