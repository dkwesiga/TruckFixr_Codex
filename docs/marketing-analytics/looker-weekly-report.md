# Weekly reporting spec — Looker Studio

Build this in **Looker Studio** (connected to GA4 + Search Console). Do **not**
build a custom dashboard inside TruckFixr. Schedule it **weekly to Dickson only**.

**Reporting period:** the latest complete **Monday–Sunday** week. Compare against:

- the **previous complete week**, and
- the **trailing 4-week average**.

---

## Headline

> **How many qualified fleet meetings did the website generate this week, and
> from which sources?**

A single scorecard: `meeting_scheduled` count (this week) with WoW delta, plus a
small table of `meeting_scheduled` broken down by source/medium and campaign.

## Funnel

Counts and step conversion rates:

1. **Public-page visitors** — users with `public_page_view`
2. **Qualified visitors** — users with `qualified_visitor`
3. **Evaluation CTA clicks** — `evaluation_cta_click`
4. **Calendly openings** — `calendly_opened`
5. **Meetings scheduled** — `meeting_scheduled` (primary conversion)

Show each step's count, the step-to-step conversion %, and the overall
visitor→meeting rate. Include prior-week and 4-week-avg comparisons.

## Breakdowns

- Traffic **source / medium**
- **Campaign** (`utm_campaign`)
- Channel rollups: LinkedIn posts, LinkedIn DMs, email outreach, Google organic,
  events/accelerators, partner referrals, direct
- **Device** (desktop / mobile / tablet)
- **New vs returning**
- **Country / province** — emphasize **Ontario**
- **Landing page**
- **CTA location & wording** (`cta_location`, `cta_text`)
- **Key section views** (`section_view` by `section_name`)
- **Session source/medium** attribution (GA4's cookieless default-channel grouping)

## Search Console panel

- Organic **impressions, clicks, CTR, average position**
- **Top queries** and **top landing pages**
- **Branded vs non-branded** split. Branded = query matches (case-insensitive)
  `truckfixr|truck ?fix?e?r` — i.e. TruckFixr, TruckFixr Fleet AI, and reasonable
  spelling variants. Implement as a maintainable calculated field / regex filter,
  not a hard-coded exhaustive list.

## Change flags

Flag changes of **≥20%** only when volume is sufficient:

- **≥30 visitors** for visitor/rate analysis
- **≥10 relevant funnel actions** for action-rate analysis

Always show the **actual counts**. Clearly label small samples as
**"directional"**. Below threshold → don't raise a flag.

## Weekly action

One field: **"Recommended action for this week."** Use simple bottleneck logic to
suggest where to focus, but require manual review before acting:

- Low **visitors** → focus on traffic (SEO/LinkedIn/outreach).
- Healthy visitors, low **qualified %** → check landing relevance / audience fit.
- Qualified but low **CTA clicks** → CTA clarity/placement.
- CTA clicks but low **Calendly opens** → friction in the qualification form.
- Opens but low **meetings** → calendar availability / scheduling friction.

> The recommendation is a prompt, not a decision. Review GA4 before changing anything.

## Links (fill in)

- GA4 report: `<paste GA4 report URL>`
- Search Console performance: `<paste Search Console URL>`
- Looker Studio dashboard: `<paste Looker URL>`

## Connector caveats

GA4 and Search Console are separate connectors with different freshness (Search
Console data lags ~2–3 days) and cannot always be joined in one chart. Keep the
Search Console panel separate, and note any freshness limitation on the report.
