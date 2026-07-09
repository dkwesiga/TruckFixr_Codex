# Data Retention & Disposal Policy

| | |
|---|---|
| **Status** | DRAFT — pending ratification |
| **Owner** | TODO: Security Lead |
| **Version** | 0.1 |
| **Effective** | TODO |
| **Last reviewed** | 2026-06-29 |
| **Review cadence** | Annual |

## 1. Purpose

Keep personal and customer data only as long as needed, then dispose of it safely
(supports Confidentiality and PIPEDA limiting-retention principle).

## 2. Retention schedule (confirm and finalize)

| Data | Retention target | Notes |
|---|---|---|
| Active customer account & fleet data | Life of the account | Deleted/anonymized on verified request or a defined period after closure |
| Inspection records & DVIRs | TODO — align with carrier legal/compliance needs | May have regulatory minimums; confirm |
| Inspection/evidence photos | TODO | Confidential; same basis as inspections |
| Diagnostic AI logs | TODO — operational minimum | Minimize; used for quality/cost monitoring |
| Lead submissions (PII) | TODO — e.g. 24 months then review | Marketing/sales contact data |
| Operational logs / observability | Short, bounded | In-memory ring buffer + bounded sinks; already redacted |
| Backups | Per backup retention | See [Backups runbook](../backups-and-monitoring.md) |

> `TODO` values must be set by the Security Lead (with counsel where regulatory
> minimums apply, e.g. inspection records). Do not delete data subject to a legal
> hold or regulatory retention requirement.

## 3. Deletion requests

Individuals may request deletion via privacy@truckfixr.com (see the customer
[Privacy Policy](../../../client/src/pages/Privacy.tsx)). Driver/member requests may
be coordinated with the fleet administrator who owns the account. Record each request
and its resolution.

## 4. Secure disposal

- Database/storage deletions follow the provider's deletion mechanisms; backups age
  out per retention.
- Decommissioned secrets are rotated/revoked, not merely deleted from one place.

## 5. Review

Revisit the schedule annually and whenever a new data type is introduced.
