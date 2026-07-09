# Asset Inventory

| | |
|---|---|
| **Status** | DRAFT — confirm each row |
| **Owner** | TODO: Security Lead |
| **Last reviewed** | 2026-06-29 |
| **Review cadence** | Annual + on change |

Systems, data stores, and accounts in scope. Endpoints/laptops are listed by count
to avoid storing personal device detail here.

## Production systems & data stores

| Asset | Type | Data class | Owner | Notes |
|---|---|---|---|---|
| TruckFixr frontend (Render static) | Service | Public/Internal | TODO | Stateless |
| `truckfixr-api` (Render web) | Service | Confidential (transient) | TODO | Stateless; free tier |
| Supabase Postgres | Data store | Confidential (PII) | TODO | Primary system of record |
| Supabase Storage | Data store | Confidential (PII) | TODO | Inspection/evidence photos |
| Stripe account | SaaS | Confidential | TODO | Billing source of truth |
| Email provider (Resend) | SaaS | Confidential | TODO | Transactional email |
| GitHub repo + Actions | SaaS | Internal | TODO | Source + CI |
| AI provider accounts | SaaS | Confidential (minimized) | TODO | Diagnosis workflow |
| Domain/DNS | Service | Internal | TODO | truckfixr.com |

## Privileged accounts (who holds admin)

Tracked in the [Access Review Log](access-review-log.md). MFA required where supported.

## Endpoints

| Type | Count | Controls |
|---|---|---|
| Staff work devices | TODO | Disk encryption, screen lock, supported OS (per Acceptable Use) |
