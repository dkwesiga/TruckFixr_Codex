# Logging & Monitoring Policy

| | |
|---|---|
| **Status** | DRAFT — pending ratification |
| **Owner** | TODO: Engineering Lead |
| **Version** | 0.1 |
| **Effective** | TODO |
| **Last reviewed** | 2026-06-29 |
| **Review cadence** | Annual |

## 1. Purpose

Ensure we can detect, investigate, and respond to security and availability events
(SOC 2 CC7) without leaking personal data.

## 2. What we log

- Application/API errors, AI provider failures, database/Supabase errors, Stripe
  webhook failures, slow routes, failed workflows, and forwarded browser runtime
  errors — via `server/services/observability.ts`.
- Hosting/platform logs from Render; database logs from Supabase.

## 3. Privacy in logs

- The observability layer **redacts** emails, VINs, phone numbers, JWTs, secret/API
  keys, bearer tokens, and inline base64 image data before anything is emitted.
- Recording an event never throws and never blocks the request path.

## 4. Access & retention

- Observability summaries are readable only via a **staff-only** endpoint.
- The in-app buffer is bounded (ring buffer + counters) and resets on restart.
- **Planned/target:** forward critical events to a durable sink via
  `OBSERVABILITY_WEBHOOK_URL` and define a retention period for security-relevant logs.

## 5. Monitoring & alerting

- Health endpoint `GET /healthz`.
- **Planned/target:** external uptime monitor on `/healthz` with alerting; route
  CI secret-scan and critical observability events to a person.

## 6. Review

Reviewed annually; alert thresholds tuned as traffic grows.
