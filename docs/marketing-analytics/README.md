# Marketing analytics — architecture & reference

Privacy-conscious, **cookieless, banner-free** marketing analytics for the
**public** TruckFixr website. It measures whether public traffic generates
qualified fleet meetings, without cookies, on-device tracking storage, session
recording, or a consent banner — and without ever touching authenticated
application data.

> **Status:** the code is complete and safe to ship, but analytics is **not
> active** until the production GA4 Measurement ID is configured. See
> [external-setup-checklist.md](./external-setup-checklist.md). Do not claim
> analytics is live until that's done and verified.

## Why there's no consent banner

A cookie-consent banner is legally driven by **storing or reading information on
the visitor's device** (cookies/local storage) and by **invasive tracking**
(e.g. session recording). This setup does neither:

- **No Microsoft Clarity / session recording** — removed entirely.
- **GA4 runs cookieless** — `analytics_storage` denied + `client_storage: 'none'`,
  so GA4 sets **no cookies** and stores **no identifier** on the device. It sends
  cookieless pings only; IP is anonymized; Google Signals + ad features off.
- **No on-device attribution storage** — UTMs are read in memory for the current
  page only, never persisted.

So there is nothing to "consent" to under cookie law. We still act
conservatively: a clear privacy-policy notice, a permanent footer opt-out, and we
automatically honour **GPC** and **Do Not Track**.

> This is a product/engineering decision, not legal advice. For a Canadian B2B
> audience this is a common, defensible setup, but **have counsel confirm** — code
> alone does not guarantee compliance.

## What runs, where, and when

GA4 loads **only** when **all** of these hold (deny-by-default):

1. **Production** — a production build (`import.meta.env.PROD`) on a production
   host (`truckfixr.com` / `www.truckfixr.com`). Local/preview/staging never run.
2. **Public route** — a public marketing page (`client/src/lib/publicRoutes.ts`).
   The authenticated app, admin, auth, and onboarding are excluded.
3. **Not internal traffic** — staff browser hasn't opted out (`?tfx_internal=1`).
4. **Not opted out** — the visitor hasn't used the footer "Do not track me".
5. **No GPC/DNT signal** — if either is present, analytics stays off.

In **non-production**, `VITE_ANALYTICS_DEBUG=true` logs sanitized events to the
console and **never** contacts GA4. A missing/malformed ID disables GA4 safely
(dev-only warning). The site, builds, and booking always keep working.

## Architecture

```
Feature code (landing, /fleet-review, footer…)
        │  calls typed trackers only
        ▼
client/src/lib/analytics/marketing/index.ts   ← the ONLY entry point
        │
        ├── gate.ts            send | debug | drop   every guard, one decision
        ├── config.ts          env + prod/host detection
        ├── events.ts          event allowlist + param allowlist + PII scrub
        ├── page.ts            query/PII-free page_path + page_type
        ├── campaign.ts        transient UTM read (no storage)
        ├── internalOptOut.ts  staff traffic exclusion (?tfx_internal=)
        ├── optOut.ts          visitor "Do not track me"
        ├── privacySignals.ts  GPC + DNT
        ├── dedupe.ts          once-per-page / once-per-visit
        └── providers/ga4.ts   cookieless GA4 (no-op without id)
```

Feature code **must not** call `gtag` or `window.dataLayer` directly — always the
module. Analytics failures are swallowed so they can never interrupt navigation,
CTA clicks, or booking. This module is entirely separate from the authenticated
**product** analytics in `client/src/lib/analytics.ts`, which is untouched.

## Event schema

Stable `snake_case` names; only allowlisted, sanitized params are ever sent.

| Event                   | Fires when                                                             |
| ----------------------- | ---------------------------------------------------------------------- |
| `landing_page_view`     | A landing page (`/`, `/landing-v3`) is viewed                          |
| `public_page_view`      | Any public marketing page is viewed                                    |
| `pricing_or_pilot_view` | A pricing or booking page is viewed                                    |
| `section_view`          | A tracked landing section is ≥50% visible for ~1s (once per page view) |
| `evaluation_cta_click`  | A "Book Your Fleet Review" CTA is clicked                              |
| `qualified_visitor`     | Visit meets a qualified condition (below), once per visit              |
| `calendly_opened`       | The Calendly embed mounts on `/fleet-review` (once per visit)          |
| `meeting_scheduled`     | Calendly confirms a booking (once per visit) — **primary conversion**  |
| `contact_click`         | A contact link (mailto/phone) is clicked                               |

`demo_video_play` is intentionally not implemented (no `<video>` on the landing).

**Allowed parameters:** `page_path`, `page_type`, `cta_location`, `cta_text`,
`section_name`, `link_type`, `utm_source/medium/campaign/content`, `qualifier`,
`engaged_seconds`.

**Never sent:** names, emails, phones, company names, Calendly answers, free-form
text, vehicle/fault/repair data, auth/user IDs, exact addresses, full URLs with
query strings, or any other personal/sensitive data. Sanitization enforces the
allowlist and drops any value that looks like an email or phone. `cta_text` is
normalized to a length-limited snake_case token.

**Stable CTA locations:** `navigation`, `hero`, `mid_page`, `final_cta`,
`footer`, `sticky_mobile` (unknown → `other`).
**Stable section names:** `problem`, `workflow`, `validation`, `demo`,
`final_cta` (unknown → `other`). Section copy is never used as a value.

### Qualified visitor

A behavioural reporting label (not identity). A non-internal, non-opted-out
visitor is "qualified" when they meet **at least one** of: engaged time ≥ 30s,
≥ 2 distinct public pages, or an evaluation CTA click. Fired **once per visit**.
Geography is **not** evaluated in the browser (unreliable); Canada/Ontario
emphasis is a GA4/Looker reporting filter.

## Campaign attribution

UTMs (`utm_source/medium/campaign/content`) are read from the current URL **in
memory** and attached to events — **never stored on the device**. Cross-session
first/recent-touch attribution is left to GA4's own server-side modelling. See
[utm-conventions.md](./utm-conventions.md).

## Visitor controls

- **Footer "Do not track me"** — permanent one-click opt-out (and opt back in),
  stored as a single opt-out flag (storing a _choice_ to opt out is permitted
  without consent). Toggling it stops/starts analytics immediately.
- **GPC / Do Not Track** — either signal auto-disables analytics.

## Environment variables

Public (`VITE_`, set in the Render frontend service):

| Var                           | Purpose                                                               |
| ----------------------------- | --------------------------------------------------------------------- |
| `VITE_GA4_MEASUREMENT_ID`     | GA4 Measurement ID (`G-XXXXXXXXXX`). Absent/malformed → GA4 disabled. |
| `VITE_ANALYTICS_DEBUG`        | `true` → sanitized debug logging in non-production; never sends.      |
| `VITE_ANALYTICS_FORCE_ENABLE` | `true` → allow analytics outside production for local testing.        |

These are **build-time** — after changing one in Render you must redeploy (clear
build cache). Never commit real IDs; `.env.example` holds placeholders only.

## Internal traffic exclusion

Reversible, identity-free, per-browser: `?tfx_internal=1` enables, `?tfx_internal=0`
disables (opaque `localStorage` flag `tfx_internal_optout`). Use **alongside**
GA4's server-side internal-traffic filter (see the checklist). No personal/home IP
is hard-coded in the repo.

## Debug mode

`VITE_ANALYTICS_DEBUG=true` in a non-production build logs
`[marketing-analytics] <event> { …sanitized params }` and **never** sends.

## Calendly tracking & limitations

`/fleet-review` embeds Calendly in an `<iframe>` behind a qualification form.
`calendly_opened` fires when the embed mounts; `meeting_scheduled` fires on
Calendly's `event_scheduled` `postMessage` (origin-checked; **no PII read**),
deduped once per visit. We don't count merely viewing/closing Calendly or a CTA
click without a completed booking.

**Limitation:** the booking signal needs the visitor to complete scheduling in the
embed on our page. A booking completed elsewhere (e.g. a follow-up email link) is
not captured client-side; a Calendly confirmation-redirect route would make this
more robust (optional — see checklist). The booking form/Calendly config are not
modified by this work.

## Rollback

Analytics is inert until the ID is set, so the safest off switch is config:

1. **Fastest:** clear `VITE_GA4_MEASUREMENT_ID` in the Render frontend service and
   redeploy (clear cache). GA4 disables safely; the site is unaffected.
2. **Full revert:** revert the marketing-analytics commits. No data migrations.

## Known limitations

- Cookieless GA4 has weaker cross-session/user attribution than cookie-based GA4
  (by design — that's the trade for no banner).
- Geo qualification is reporting-side only.
- `meeting_scheduled` relies on the Calendly embed postMessage (see above).
- Analytics is disabled entirely in previews/staging by design — verify in GA4
  DebugView/Realtime on production without polluting real data.
- **Code alone does not guarantee legal compliance** — have counsel review.
