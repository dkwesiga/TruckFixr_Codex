# Guest Workflow — Controlled Rollout Runbook

Covers the public `/try-one-case` funnel, restructured homepage, escalation/human
review, outcomes, and the CAD $99 pilot (Gates 1–4). Everything is **fail-closed**
and off by default.

## 1. Feature flags & environment

| Flag / var | Where | Default | Purpose |
|---|---|---|---|
| `ENABLE_GUEST_WORKFLOW` | server env | off | Gates all `guestCases.*` public procedures (fail-closed, returns not-found when off). |
| `VITE_ENABLE_TRY_ONE_CASE` | client build | off | Registers `/try-one-case` and `/pilot-apply` routes. |
| `VITE_ENABLE_HOMEPAGE_V2` | client build | off | Serves the restructured homepage at `/`; unset → current landing (instant rollback). |
| `GUEST_TOKEN_SECRET` | server env | falls back to `JWT_SECRET` | HMAC signing for scoped/expiring guest links. |
| `CASE_REVIEWER_EMAIL` | server env | sales inbox | Primary case reviewer for alerts. |
| `CASE_BACKUP_REVIEWER_EMAIL` | server env | — | Named qualified **310T** backup reviewer. |
| `RESEND_API_KEY` / `EMAIL_FROM` | server env | — | Reviewer alerts + guest follow-up emails (no-op if unset). |
| `STRIPE_PRICE_FLEET_PILOT_30_DAY` | server env | — | **Must be a one-time CAD $99 price** (see §6). |

> Client flags are **build-time** (Vite) — rebuild after changing. Server flags are
> runtime. There is no per-fleet `fleetFeatures` gate for guests (they have no fleet).

## 2. Migrations to apply (out-of-band, env-guarded)

Apply in filename order via `scripts/verify/apply-readiness-migrations.ts`
(`ALLOW_READINESS_MIGRATIONS=true`), **not** `drizzle-kit`:

- `0038_guest_case_workflow.sql` — guest case tables
- `0039_guest_case_outcomes.sql` — outcome columns + follow-ups table
- `0040_pilot_kickoff.sql` — pilot kickoff columns

All are idempotent (`CREATE TABLE / ADD COLUMN IF NOT EXISTS`).

## 3. Rollout sequence

1. **Internal testing** (staging): flags on in a non-prod env, seed scenarios
   (`pnpm seed:guest-demo`), run ≥10 realistic cases through the funnel + review + outcome.
2. **Invite-only**: keep `VITE_ENABLE_HOMEPAGE_V2` **off** at `/` (public still sees the
   current landing). Share the direct `/try-one-case` link with selected Mr Diesel +
   TruckFixr contacts (route enabled via `VITE_ENABLE_TRY_ONE_CASE`). Use **provisional**
   copy, clearly marked.
3. **Review**: usability, safety, SLA performance, outcomes, conversion. Correct friction.
4. **Warm traffic**: expand the invite list.
5. **Promote homepage**: set `VITE_ENABLE_HOMEPAGE_V2=true` and rebuild → `/` shows V2.
6. **Retain rollback** for 2–4 weeks; monitor. Then remove the fallback.

## 4. Rollback

- Homepage: unset `VITE_ENABLE_HOMEPAGE_V2` + rebuild → current landing returns.
- Funnel: unset `VITE_ENABLE_TRY_ONE_CASE` (routes 404) and `ENABLE_GUEST_WORKFLOW`
  (server returns not-found).
- Data: all migrations are additive — **no destructive rollback needed**. Guest tables
  simply stop receiving writes.

## 5. SEO continuity

- Root `/` URL preserved. Recommended title/description already applied.
- `client/public/sitemap.xml` includes `/try-one-case`.
- `robots.txt` allows crawling; canonical is currently static in `index.html`
  (per-route canonical/OG is a follow-up — `useSeoMeta` handles title/description only).
- FAQ structured data (FAQPage JSON-LD) renders on Homepage V2.
- Add a dedicated OG social-preview image (currently reuses the square logo).

## 6. Payment wiring (webhook is wired)

`STRIPE_PRICE_FLEET_PILOT_30_DAY` is confirmed a **one-time CAD $99** price. The
pilot payment is now automated end-to-end on the server:
- `createTruckFixrPilotCheckoutSession` stamps `metadata[pilot_application_id]` on the
  session (via `subscriptions.createPilotCheckoutSession({ pilotApplicationId })`).
- On `checkout.session.completed` with `billing_interval=pilot`, the webhook calls
  `markPilotPaid({ applicationId, paymentRef })`. Payment does **not** activate the pilot —
  activation still requires agreement + kickoff + vehicles.
- `markPilotPaid` is idempotent and authoritative (marks paid from `qualified` or
  `payment_pending`). The manual staff `pilotApplications.markPaid` remains as a fallback.

**Remaining client step:** the authenticated "accept & pay" screen (after sign-in from
`/pilot-apply`) must call `subscriptions.createPilotCheckoutSession({ pilotApplicationId })`
and redirect to the returned Stripe URL. No custom card entry — hosted Checkout only.

## 7. Legal & safety approval gate (MANDATORY before broad public rollout)

Broad public rollout must NOT proceed until all of the following are signed off.
Invite-only testing may proceed with clearly-marked provisional copy.

- [ ] **Commercial approval** — pricing, pilot terms, offer.
- [ ] **Qualified 310T technical & safety approval** — critical-trigger list, safety
      guidance copy, readiness/decision logic, prohibited claims (`SAFETY_DISCLAIMERS`,
      `docs/operations/case-review-sop.md`).
- [ ] **Ontario legal review** — privacy notice, consent separation, agreement copy
      (`shared/pilotAgreement.ts`, provisional), guest data retention/deletion, link
      expiry/revocation.
- [ ] Confirm no copy implies emergency dispatch, roadside assistance, continuous
      monitoring, roadworthiness certification, or guaranteed diagnosis/timing.
- [ ] Confirm reviewer coverage + backup 310T contact configured.

**Sign-off:** commercial ____ · 310T ____ · legal ____ · date ____
