# Marketing analytics — architecture & reference

Privacy-conscious marketing analytics for the **public** TruckFixr website. It
measures whether public traffic generates qualified fleet meetings, without ever
touching authenticated application data.

> **Status:** the code is complete and safe to ship, but analytics is **not
> active** until the production GA4 / Clarity IDs and external accounts are
> configured. See [external-setup-checklist.md](./external-setup-checklist.md).
> Do not claim analytics is live until those steps are done and verified.

---

## What runs, where, and when

Analytics loads **only** when **all** of these hold (deny-by-default):

1. **Consent** — the visitor accepted analytics (and GPC is not forcing it off).
2. **Production** — a production build (`import.meta.env.PROD`) served from a
   production host (`truckfixr.com` / `www.truckfixr.com`). Local, preview, and
   staging never run analytics.
3. **Public route** — a public marketing page (see `client/src/lib/publicRoutes.ts`).
   The authenticated app, admin, auth, and onboarding are excluded.
4. **Not internal traffic** — the browser has not opted out (`?tfx_internal=1`).

In **non-production**, an optional debug mode (`VITE_ANALYTICS_DEBUG=true`) logs
sanitized event names + payloads to the console and **never** contacts GA4/Clarity.

If a provider ID is missing or malformed, that provider is disabled safely (a
dev-only console warning is emitted). The site, builds, and booking always keep
working — analytics never blocks anything.

## Architecture

```
Feature code (landing, /fleet-review, footer…)
        │  calls typed trackers only
        ▼
client/src/lib/analytics/marketing/index.ts   ← the ONLY entry point
        │
        ├── consent gate      (lib/consent/*)          consent + GPC
        ├── gate.ts           send | debug | drop       every guard, one decision
        ├── config.ts         env + prod/host detection
        ├── events.ts         event allowlist + param allowlist + PII scrub
        ├── page.ts           query/PII-free page_path + page_type
        ├── attribution.ts    first/recent-touch UTM (consent-gated, 90d)
        ├── internalOptOut.ts internal traffic exclusion
        ├── dedupe.ts         once-per-page / once-per-visit
        └── providers/        ga4.ts, clarity.ts (lazy, no-op without id)
```

Feature code **must not** call `gtag`, `clarity`, or `window.dataLayer`
directly — always call the module. Analytics failures are swallowed so they can
never interrupt navigation, CTA clicks, or booking.

This module is entirely separate from the authenticated **product** analytics in
`client/src/lib/analytics.ts`, which is untouched.

## Event schema

Stable `snake_case` names; only allowlisted, sanitized params are ever sent.

| Event                   | Fires when                                                             |
| ----------------------- | ---------------------------------------------------------------------- |
| `landing_page_view`     | A landing page (`/`, `/landing-v3`) is viewed                          |
| `public_page_view`      | Any public marketing page is viewed                                    |
| `pricing_or_pilot_view` | A pricing or booking page is viewed                                    |
| `section_view`          | A tracked landing section is ≥50% visible for ~1s (once per page view) |
| `evaluation_cta_click`  | A "Book Your Fleet Review" CTA is clicked                              |
| `qualified_visitor`     | Visit meets a qualified condition (see below), once per visit          |
| `calendly_opened`       | The Calendly embed mounts on `/fleet-review` (once per visit)          |
| `meeting_scheduled`     | Calendly confirms a booking (once per visit) — **primary conversion**  |
| `contact_click`         | A contact link (mailto/phone) is clicked                               |

`demo_video_play` is intentionally **not** implemented — the landing has no
`<video>`. Add it only when a real demo video ships.

**Allowed parameters (allowlist):** `page_path`, `page_type`, `cta_location`,
`cta_text`, `section_name`, `link_type`, `utm_source/medium/campaign/content`,
`first_touch_*`, `recent_touch_*`, `qualifier`, `engaged_seconds`.

**Never sent:** names, emails, phone numbers, company names, Calendly answers,
free-form text, vehicle/fault/repair data, auth/user IDs, exact addresses, full
URLs with query strings, or any other personal/sensitive data. Parameter
sanitization enforces the allowlist and drops any value that looks like an email
or phone number. `cta_text` is normalized to a length-limited snake_case token.

**Stable CTA locations:** `navigation`, `hero`, `mid_page`, `final_cta`,
`footer`, `sticky_mobile` (unknown → `other`).

**Stable section names:** `problem`, `workflow`, `validation`, `demo`,
`final_cta` (unknown → `other`). Section copy is never used as a value.

### Qualified visitor

A behavioural reporting label (not an identity claim). A consented, non-internal
visitor is "qualified" when they meet **at least one** of:

- **Engaged time** ≥ 30s of visible, active time on public pages, **or**
- **Multi-page** ≥ 2 distinct public pages viewed in the visit, **or**
- **CTA click** — clicked an evaluation CTA (high intent).

Fired **once per visit** (session-scoped dedupe). **Geography is deliberately not
evaluated in the browser** (client-side geo is unreliable); Canada/Ontario
emphasis is applied as a GA4/Looker reporting filter where geo is accurate.

## Campaign attribution

First-touch (immutable for 90 days) + most-recent-touch UTM capture. Persisted
in `localStorage` **only after consent**; before consent, UTMs are read
transiently for the current page and never stored. Strict allowlist
(`utm_source/medium/campaign/content`), lowercased + length-limited, 90-day
expiry. Never carries personal data. See [utm-conventions.md](./utm-conventions.md).

## Consent behaviour

- Banner offers **Accept / Reject** (equal prominence) + **Manage preferences**.
- Consent lasts **12 months**; a policy-version bump (`CONSENT_POLICY_VERSION`)
  re-prompts sooner when disclosures materially change.
- **GPC** auto-rejects and keeps analytics off while active. Legacy Do Not Track
  is **not** treated as GPC.
- A permanent **Cookie preferences** footer control lets visitors change or
  withdraw consent. Withdrawal clears first-party attribution + expires GA/Clarity
  cookies on this host (it cannot purge provider-side data).
- Ignoring the banner never blocks browsing or booking.

Full consent internals: `client/src/lib/consent/*`.

## Environment variables

Public (`VITE_`, safe to expose; set in Render frontend service):

| Var                           | Purpose                                                               |
| ----------------------------- | --------------------------------------------------------------------- |
| `VITE_GA4_MEASUREMENT_ID`     | GA4 Measurement ID (`G-XXXXXXXXXX`). Absent/malformed → GA4 disabled. |
| `VITE_CLARITY_PROJECT_ID`     | Microsoft Clarity project ID. Absent/malformed → Clarity disabled.    |
| `VITE_ANALYTICS_DEBUG`        | `true` → sanitized debug logging in non-production; never sends.      |
| `VITE_ANALYTICS_FORCE_ENABLE` | `true` → allow analytics outside production for local testing.        |

Never commit real IDs. Placeholders live in `.env.example`; production values go
in the Render dashboard only.

## Internal traffic exclusion

Reversible, identity-free, per-browser opt-out:

- **Enable:** visit any page with `?tfx_internal=1`
- **Disable:** visit any page with `?tfx_internal=0`

Stored as an opaque `localStorage` flag (`tfx_internal_optout`). Prevents GA4 +
Clarity init and all event sending on that browser. Use it **alongside** GA4's
server-side internal-traffic filter (configured in the GA4 dashboard — see the
external checklist). No personal/home IP is hard-coded in the repo.

## Debug mode

Set `VITE_ANALYTICS_DEBUG=true` in a non-production build. Events are logged as
`[marketing-analytics] <event> { …sanitized params }` and **never** sent to any
provider. Use it to confirm event names/params locally.

## Calendly tracking & limitations

- `/fleet-review` embeds Calendly in an `<iframe>` behind a qualification form.
- `calendly_opened` fires when the embed mounts (qualified visitor).
- `meeting_scheduled` fires on Calendly's `event_scheduled` `postMessage`
  (origin-checked; **no PII is read** from the payload), deduped once per visit.
- We do **not** count: merely viewing Calendly, closing it, or a CTA click
  without a completed booking.

**Limitations:** the booking signal depends on Calendly's browser `postMessage`,
which requires the visitor to complete scheduling in the embed on our page. If a
visitor completes booking in a different context (e.g. a follow-up email link),
that conversion is not captured client-side. A dedicated thank-you redirect route
would make this more robust but requires a Calendly account setting (documented
in the external checklist as optional). The booking form and Calendly config are
**not** modified by this work.

## Rollback

Analytics is inert until IDs are set, so the safest "off switch" is configuration:

1. **Fastest:** clear `VITE_GA4_MEASUREMENT_ID` and `VITE_CLARITY_PROJECT_ID` in
   the Render frontend service and redeploy. Both providers disable safely; the
   consent banner still works and the site is unaffected.
2. **Full revert:** revert the three marketing-analytics commits
   (consent → module → docs) or merge a revert PR. No schema/data migrations are
   involved.

The consent banner and privacy disclosures can remain even with providers off.

## Known limitations

- Client-side geo is not used for qualification (reporting-side only).
- Withdrawal clears first-party data under our control only; provider-side data
  already collected is not retroactively purged.
- `meeting_scheduled` relies on the Calendly embed postMessage (see above).
- Analytics is disabled entirely in previews/staging by design — verify events in
  GA4 DebugView/Realtime on production without polluting real data.
- **Code alone does not guarantee legal compliance.** Have counsel review the
  privacy disclosures and confirm consent/retention behaviour in production.
