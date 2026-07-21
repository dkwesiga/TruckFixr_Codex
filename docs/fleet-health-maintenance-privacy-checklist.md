# Fleet Health & Maintenance — Privacy Checklist

Working checklist for the pilot. **Legal conclusions are marked `[LEGAL REVIEW]`
and are NOT settled here.** This document does not claim formal compliance
(e.g., SOC 2, PIPEDA) — see `docs/security/` and the SOC 2 readiness reports for
the program-level position.

## Data collected

- Vehicle operational events (odometer, engine hours, DTC codes, inspection
  defects, free text) — `vehicleEvents`.
- Vehicle attention scores + snapshots — operational priority, derived.
- Preventive-maintenance schedules/completions.
- Maintenance cases, append-only decisions, repair cycles, downtime.
- Repair documents (estimates/work orders/invoices) — files + manually entered
  financial fields.
- Pilot settings, external-AI consent records, activity logs.
- User identifiers already held by the app (ids, roles); no new PII categories.

## Purpose

Operational maintenance decision support for enrolled pilot fleets only. Not used
for diagnosis, cross-fleet intelligence, model training, or advertising.

## Storage & regions

- **Database region:** inherited from the existing Postgres deployment.
  `[LEGAL REVIEW]` — confirm the provider region before any residency claim.
- **Application region:** existing Render deployment (see `render.yaml`).
- **Document storage:** existing private storage proxy (`server/storage.ts`,
  `BUILT_IN_FORGE_API_*`). Server-generated keys; signed URLs; never logged.
  `[LEGAL REVIEW]` — confirm the storage provider region.
- **AI region:** the diagnosis AI orchestrator may route to providers outside
  Canada. Automated document AI is **not enabled** (extraction blocked), so no
  document content is sent to any external AI today.

Use graded disclosures, never an unqualified "Canada-only": "Stored and processed
in Canada" / "Stored in Canada; AI processing may occur outside Canada" /
"Processing region not guaranteed" — pick per the confirmed facts above.

## Providers & training

- External AI (diagnosis) providers per existing configuration. `[LEGAL REVIEW]`
  — confirm each provider's training/retention terms before enabling external
  document processing.
- No provider was added for this feature.

## Retention

- Raw event payloads minimized and excluded from list queries.
- Raw document text retention minimized; structured normalized fields kept for
  comparison.
- No automatic deletion in this release; deletion metadata columns exist for a
  future controlled deletion flow. `[LEGAL REVIEW]` — define retention periods.

## Access & tenant isolation

- Every record carries `fleetId`; fleet resolved server-side; cross-fleet access
  and cross-fleet duplicate disclosure are prevented.
- Financial totals/variance/limits/approvals restricted to owners/managers even
  for maintenance-permitted users.
- Internal roles separate from fleet roles; `read_only_viewer` cannot mutate.

## Logging

Activity logs reuse `activityLogs` and **never** record cookies, JWTs, session
tokens, credentials, provider secrets, full CSV contents, signed URLs, private
storage keys, password-reset data, or unbounded raw payloads (enforced by a
redaction guard in `maintenanceActivityLog.ts`).

## Consent & withdrawal

- External-AI consent defaults `none`; owners grant/withdraw; internal admins
  record documented consent with evidence (never impersonating the fleet).
- Withdrawal/expiry stops future external processing; preserves prior results,
  uploads, manual entry, and deterministic comparison.

## Manual fallback & correction

- Full manual document workflow + deterministic comparison operate without any
  external AI. Corrections are append-only for audit.

## Anonymization & cross-border

- Golden diagnostic fixtures are anonymized.
- `[LEGAL REVIEW]` — cross-border processing implications of the diagnosis AI
  providers, and any DPA requirements for pilot fleets.

## Incidents & legal gaps

- Follow the existing security incident process (`SECURITY.md`, `docs/security/`).
- `[LEGAL REVIEW]` open items: database/storage/AI regions; provider
  training/retention; retention periods; cross-border/DPA; any residency claims
  in customer-facing copy.
