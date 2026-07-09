# Data Classification & Handling Policy

| | |
|---|---|
| **Status** | DRAFT — pending ratification |
| **Owner** | TODO: Security Lead |
| **Version** | 0.1 |
| **Effective** | TODO |
| **Last reviewed** | 2026-06-29 |
| **Review cadence** | Annual |

## 1. Purpose

Classify the data TruckFixr handles so it gets the right level of protection.

## 2. Classes

| Class | Examples | Handling |
|---|---|---|
| **Restricted** | Secrets/keys, `JWT_SECRET`, DB credentials, Stripe keys | Never in source/logs; in secret manager/env only; access strictly limited |
| **Confidential (PII / customer data)** | Driver name/email/phone, VIN, license plate, inspection photos, diagnostic inputs, lead PII, billing identifiers | Encrypted in transit; fleet-scoped access; redacted in logs; minimize copies |
| **Internal** | Source code, internal docs, metrics | Limited to personnel; GitHub access controls |
| **Public** | Marketing site, public resources, this published policy intent | No restriction |

## 3. Handling rules

- **Confidential/Restricted data must not** be copied to personal devices, personal
  cloud, ad-hoc spreadsheets, or pasted into unapproved third-party tools.
- Personal identifiers are **redacted in operational logs** automatically by
  `server/services/observability.ts` (emails, VINs, phones, JWTs, secret keys,
  inline image data).
- Customer data is **fleet-isolated** (see [Tenant Isolation](../tenant-isolation.md)).
- Inspection/evidence photos are treated as Confidential and stored in approved
  object storage only.

## 4. AI diagnosis data

Diagnostic inputs sent to AI providers are limited to what is needed to produce a
result. Do not include unnecessary personal identifiers in prompts. AI providers are
tracked as sub-processors.

## 5. Disposal

See [Data Retention & Disposal](09-data-retention-disposal-policy.md).
