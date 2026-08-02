# External setup checklist (for Dickson)

These steps happen in third-party dashboards — they cannot be done in code. Until
they're complete and verified, analytics is **not** active. Platform UIs change,
so verify current options in each provider rather than treating this as permanent
legal/product advice.

This is the **cookieless, banner-free** setup: **no Microsoft Clarity**, and GA4
runs without cookies (the code handles that automatically — you don't configure
consent mode). Values you obtain go in the **Render frontend service** env vars
(never commit them). Legend: ☐ = to do.

---

## 1. Google Analytics 4

- ☐ Create or confirm a GA4 **property** and a **Web data stream** for
  `truckfixr.com`.
- ☐ Add the production domain (`truckfixr.com`, and `www` if used).
- ☐ Copy the **Measurement ID** (`G-XXXXXXXXXX`) → set `VITE_GA4_MEASUREMENT_ID`
  in the Render **TruckFixr-frontend** service, then redeploy (clear build cache).
- ☐ Mark **`meeting_scheduled`** as a **key event** (Admin → Key events → New key
  event → type the name). Optionally also `evaluation_cta_click` / `calendly_opened`.
- ☐ Register **custom dimensions** only for params you'll actually report on
  (event-scoped): `cta_location`, `cta_text`, `section_name`, `page_type`,
  `qualifier`, `utm_source`, `utm_campaign`.
- ☐ **Configure internal traffic:** Admin → Data Streams → Configure tag settings
  → Define internal traffic (add your IP as an `internal` rule), then Admin → Data
  Filters → activate the "Internal Traffic" filter. (In addition to the in-app
  `?tfx_internal=1` opt-out — do both.)
- ☐ Set **data retention to 14 months** (Admin → Data Settings → Data Retention).
- ☐ Keep **Google Signals** and advertising features **disabled**.
- ☐ Do **not** enable User-ID or advertising identifiers.
- ☐ Verify **country/province and device-category** reporting appears.
- ☐ Test with **DebugView / Realtime** so you don't pollute production data.

> **Note on cookieless mode:** the site tells GA4 to run without cookies and
> without storing a device identifier. You do **not** need to set up Google
> Consent Mode banners or a CMP. Some GA4 reports (e.g. precise new-vs-returning)
> are less exact as a result — that's the expected trade-off for no banner.

## 2. Google Search Console

- ☐ Verify **domain ownership** (DNS TXT record is most robust).
- ☐ Submit or confirm the **sitemap** (`sitemap.xml`).
- ☐ **Link Search Console to GA4** (GA4 Admin → Product links → Search Console).
- ☐ **Link Search Console to Looker Studio** (separate connector).
- ☐ Define **branded vs non-branded**: treat queries matching
  `truckfixr|truck ?fix?e?r` (case-insensitive) as branded. Implement as a
  maintainable regex/calculated field in Looker, not a hard-coded list.

## 3. Looker Studio

- ☐ Connect **GA4** and **Search Console** data sources.
- ☐ Build the weekly **scorecard + funnel** per
  [looker-weekly-report.md](./looker-weekly-report.md).
- ☐ Add **previous-week** and **trailing-4-week** comparisons.
- ☐ Add **source/medium, campaign, device, geography (Ontario emphasis),
  new-vs-returning** breakdowns.
- ☐ Add **small-sample warnings** (min 30 visitors / 10 actions; label small
  samples "directional").
- ☐ **Schedule weekly delivery to Dickson only**, latest complete **Monday–Sunday**.
- ☐ Note any **connector-freshness** limitation (Search Console lags ~2–3 days).

## 4. Calendly

- ☐ No booking-form or scheduling changes are required — the existing
  `calendly.com/dkwesga/25-min-meeting` embed already emits the `event_scheduled`
  browser event that drives `meeting_scheduled`.
- ☐ **Optional (more robust conversion):** configure a **confirmation redirect** to
  a dedicated TruckFixr thank-you route, or verify Calendly's browser-event
  integration for your plan. Improvement, not a requirement.
- ☐ Do **not** change booking-form questions, availability, duration, scheduling
  rules, or notifications.

## 5. Privacy review

- ☐ Verify the **contact + business details** in the privacy policy
  (`privacy@truckfixr.com`). Fill in any missing legal entity/address — flagged
  for you, not invented.
- ☐ Have **counsel review** the analytics wording and confirm the cookieless,
  banner-free approach is acceptable for your audience.
- ☐ Confirm in production: analytics is off for GPC/DNT and after the footer
  "Do not track me"; on otherwise; and never present on signed-in app pages.

---

Once the GA4 ID is set in Render and a production deploy is out, verify in GA4
DebugView/Realtime that `public_page_view`, `evaluation_cta_click`,
`calendly_opened`, and `meeting_scheduled` arrive with no personal data in the
payloads, and that **no analytics cookies** are set (DevTools → Application →
Cookies should show no `_ga*`). Only then is it accurate to say analytics is live.
