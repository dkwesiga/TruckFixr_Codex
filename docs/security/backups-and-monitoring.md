# Backups, Recovery & Monitoring Runbook

**Status:** Draft — values marked `TODO` must be captured from the live consoles.
**Owner:** Engineering · **Last reviewed:** 2026-06-29

Supports SOC 2 Availability (A1.2 backup/recovery, A1.3 recovery testing) and gives
the weekly readiness review concrete evidence to point at. This is intentionally
lean for an early-stage SaaS — capture the real settings, do not invent process.

## 1. Systems of record

| System | Provider | What it holds | Console |
|---|---|---|---|
| Primary database | Supabase (Postgres) | All fleet/customer data, users, inspections, leads | `TODO: project URL` |
| API service | Render (`truckfixr-api`, web, **free plan**) | Stateless API | Render dashboard |
| Frontend | Render (static) | No persistent data | Render dashboard |
| Object storage | Supabase Storage | Inspection/evidence photos | `TODO` |
| Billing | Stripe | Subscriptions (source of truth in Stripe) | Stripe dashboard |

The API and frontend are **stateless** — recovery means redeploy from `main`. All
durable state lives in Supabase (DB + Storage) and Stripe.

## 2. Backups

### Database (Supabase)
- Automated backups: `TODO: confirm cadence` (Supabase Free = daily, 7-day retention;
  Pro = point-in-time recovery). Capture the actual plan + retention.
- **RPO target:** `TODO` (≤ 24h on daily backups; ≤ 5 min if PITR is enabled).
- **RTO target:** `TODO` (document realistic restore time).
- Action items:
  - [ ] Record backup cadence + retention (screenshot for evidence).
  - [ ] If on Free tier, schedule a weekly `pg_dump` to off-platform storage, or upgrade
        to a plan with PITR before making any availability commitment to customers.

### Object storage (Supabase Storage)
- [ ] Confirm whether evidence photos are included in Supabase backups; if not,
      document a separate copy/lifecycle policy.

### Code & config
- Source of truth: this git repository (GitHub). Secrets are **not** in git — they live
  in Render env vars (`sync: false`) and `.env` (gitignored). Maintain an offline,
  access-controlled record of which secrets exist (names only) for recovery.

## 3. Recovery procedure (DB loss / corruption)

1. Identify the latest good backup / PITR timestamp in Supabase.
2. Restore to a new database (or in place per Supabase runbook).
3. Update `DATABASE_URL` in Render for `truckfixr-api` (and any verify scripts).
4. Confirm Drizzle migrations are applied (production runtime schema repair is OFF;
   apply migrations as a deliberate step — see `package.json` `db:push`).
5. Redeploy API + frontend from `main`.
6. Smoke test: `/healthz`, login, load a fleet dashboard, run `pnpm verify:rls`.

## 4. Recovery testing

- [ ] Perform one **restore test** to a scratch database and record the date, the
      backup timestamp used, and the measured RTO. Repeat at least `TODO: quarterly`.
- Store the result alongside this file as dated evidence.

## 5. Monitoring & alerting

- Health endpoint: `GET /healthz` (configured as Render `healthCheckPath`).
- Current alerting: **none beyond Render's built-in health checks.**
- Application observability: `server/services/observability.ts` keeps a redacted,
  in-memory ring buffer + counters, readable via a staff-only endpoint. This is **not**
  durable — it resets on restart and on free-plan spin-down.
- Action items (lean):
  - [ ] Add an external uptime monitor pinging `/healthz` with email/SMS alert
        (e.g. UptimeRobot / BetterStack free tier).
  - [ ] Set `OBSERVABILITY_WEBHOOK_URL` so critical events forward to a durable sink
        (the code already supports a best-effort webhook).
  - [ ] Decide a retention story for observability events if they become audit evidence.

## 6. Known availability constraints (state honestly)

- `truckfixr-api` is on Render's **free plan**: it spins down when idle (cold-start
  latency) and carries no SLA. Do not advertise uptime guarantees until this moves to
  a paid plan with monitoring.
