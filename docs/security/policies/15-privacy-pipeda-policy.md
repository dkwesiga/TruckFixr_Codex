# Privacy & PIPEDA Policy (Internal)

| | |
|---|---|
| **Status** | DRAFT — pending counsel review |
| **Owner** | TODO: Privacy Lead (may be Security Lead) |
| **Version** | 0.1 |
| **Effective** | TODO |
| **Last reviewed** | 2026-06-29 |
| **Review cadence** | Annual |

## 1. Purpose

Define how TruckFixr meets its privacy obligations under Canada's **PIPEDA** (and
applicable provincial law). This is the **internal** counterpart to the customer-facing
[Privacy Policy](../../../client/src/pages/Privacy.tsx).

## 2. PIPEDA principles → how we apply them

1. **Accountability** — the Privacy Lead owns privacy; vendors handling PII are under
   contract and tracked in the [Vendor Inventory](../registers/vendor-subprocessor-inventory.md).
2. **Identifying purposes** — purposes are stated in the customer Privacy Policy.
3. **Consent** — collected at sign-up and lead capture; consent can be withdrawn.
4. **Limiting collection** — collect only what the service needs (account, fleet,
   inspection, diagnostic, billing data).
5. **Limiting use, disclosure, retention** — use only for stated purposes; retain per
   the [Data Retention Policy](09-data-retention-disposal-policy.md); no sale of PII.
6. **Accuracy** — users/fleets can correct their data.
7. **Safeguards** — encryption in transit, RBAC, fleet isolation, log redaction
   (see [Data Classification](08-data-classification-policy.md) and
   [Cryptography](10-cryptography-policy.md)).
8. **Openness** — the Privacy Policy is published.
9. **Individual access** — individuals may request access to their data.
10. **Challenging compliance** — privacy@truckfixr.com receives concerns and requests.

## 3. Personal data we handle

Driver name/email/phone, VIN/plate, inspection photos and records, diagnostic inputs,
lead PII, and billing identifiers. See the Data Classification policy for handling.

## 4. Data subject / deletion requests

Handled per the [Data Retention & Disposal Policy](09-data-retention-disposal-policy.md).
Record each request and its resolution.

## 5. Breach handling

Privacy breaches follow the [Incident Response Plan](05-incident-response-plan.md),
including PIPEDA breach-notification assessment (notify the Office of the Privacy
Commissioner and affected individuals where there is a real risk of significant harm).
**Planned/target:** finalize notification timelines and templates with counsel.

## 6. Review

Reviewed annually and whenever data practices change. **Must be reviewed by legal
counsel before being treated as final.**
