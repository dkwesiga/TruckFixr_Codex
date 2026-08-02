# External setup checklist (for Dickson)

These steps happen in third-party dashboards — they cannot be done in code. Until
they're complete and verified, analytics is **not** active. Platform UIs change,
so treat this as a guide and verify current options in each provider rather than
as permanent legal/product advice.

Legend: ☐ = to do. Values you obtain go in the **Render frontend service** env
vars (never commit them).

---

## 1. Google Analytics 4

- ☐ Create or confirm a GA4 **property** and a **Web data stream** for
  `truckfixr.com`.
- ☐ Add the production domain (`truckfixr.com`, and `www` if used).
- ☐ Copy the **Measurement ID** (`G-XXXXXXXXXX`) → set `VITE_GA4_MEASUREMENT_ID`.
- ☐ Mark **`meeting_scheduled`** as a **key event** (conversion). Optionally also
  `evaluation_cta_click` and `calendly_opened` as secondary key events.
- ☐ Register **custom dimensions** only if you want them in reports — event-scoped:
  `cta_location`, `cta_text`, `section_name`, `page_type`, `qualifier`,
  `first_touch_source`, `recent_touch_source`. (GA4 collects the params
  regardless; dimensions just expose them in the UI. Add only what you'll use.)
- ☐ **Configure internal traffic:** Admin → Data Streams → Configure tag settings
  → Define internal traffic. Add your office/home IP(s) as an `internal` rule,
  then Admin → Data Filters → activate the "Internal Traffic" filter. (This is in
  addition to the in-app `?tfx_internal=1` opt-out — do both.)
- ☐ Set **user-level data retention to 14 months** (Admin → Data Settings → Data
  Retention), subject to what's currently offered.
- ☐ Keep **Google Signals** and advertising features **disabled**.
- ☐ Do **not** enable User-ID or unnecessary advertising identifiers.
- ☐ Verify **country, region/province, and device-category** reporting appears.
- ☐ Test with **DebugView / Realtime** (use the debug build or GA4 DebugView) so
  you don't pollute production data while validating.

## 2. Google Search Console

- ☐ Verify **domain ownership** (DNS TXT record is the most robust method).
- ☐ Submit or confirm the **sitemap**.
- ☐ **Connect Search Console to GA4** (GA4 Admin → Product Links → Search Console).
- ☐ **Connect Search Console to Looker Studio** (separate connector — see below).
- ☐ Decide the **branded vs non-branded** rule: treat queries containing
  `truckfixr`, `truck fixr`, `truckfixer`, `truck fixer` (case-insensitive) as
  branded; everything else non-branded. Document the exact regex you use in Looker
  rather than hard-coding an exhaustive list.

## 3. Microsoft Clarity

- ☐ Create or confirm a Clarity **project**.
- ☐ Copy the **Project ID** → set `VITE_CLARITY_PROJECT_ID`.
- ☐ Restrict to the **production domain** in project settings.
- ☐ Verify **masking**: all **text and input** masking is ON by default. Do not
  unmask anything unless it is approved, static, public content.
- ☐ Confirm authenticated routes are excluded — the app never initializes Clarity
  on non-public routes, but sanity-check that no recordings show signed-in pages.
- ☐ Review current **retention** and available privacy controls.

## 4. Looker Studio

- ☐ Connect **GA4** and **Search Console** data sources.
- ☐ Build the weekly **scorecard + funnel** per
  [looker-weekly-report.md](./looker-weekly-report.md).
- ☐ Add **previous-week** and **trailing-4-week** comparisons.
- ☐ Add **source/medium, campaign, device, geography (Ontario emphasis), and
  new-vs-returning** breakdowns.
- ☐ Add **small-sample warnings** (min 30 visitors / 10 actions; label small
  samples "directional").
- ☐ **Schedule weekly delivery to Dickson only.**
- ☐ Use the latest complete **Monday–Sunday** period.
- ☐ Note any limitation from **connector freshness** or incompatible data sources
  (GA4 and Search Console connectors don't always join cleanly).

## 5. Calendly

- ☐ No booking-form or scheduling changes are required — the existing
  `calendly.com/dkwesga/25-min-meeting` embed already emits the `event_scheduled`
  browser event that drives `meeting_scheduled`.
- ☐ **Optional (more robust conversion):** configure a **confirmation redirect**
  to a dedicated TruckFixr thank-you route, or verify Calendly's browser-event
  integration is enabled for your plan. This is an improvement, not a requirement.
- ☐ Do **not** change booking-form questions, availability, event duration,
  scheduling rules, or notifications.

## 6. Privacy review

- ☐ Verify the **contact + business details** in the privacy policy are correct
  (currently `privacy@truckfixr.com`). Fill in any missing legal entity/address
  info — flagged for you, not invented.
- ☐ Have **counsel review** the analytics wording before you rely on it.
- ☐ Confirm **consent, retention, and withdrawal** behaviour in production
  (accept → events appear; reject/GPC → none; withdraw → stops).

---

Once §1 and §3 IDs are set in Render and a production deploy is out, verify in GA4
DebugView/Realtime that `public_page_view`, `evaluation_cta_click`,
`calendly_opened`, and `meeting_scheduled` arrive with no personal data in the
payloads. Only then is it accurate to say analytics is live.
