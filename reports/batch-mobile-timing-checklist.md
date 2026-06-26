# Batch — Mobile / Android Timing + Responsive Proof (TFX-CR-0022, Rec #5)

Status: Pricing-table mobile fix landed in code. Real device timing pending your hardware.
Author: Codex · Date: 2026-06-14

This sandbox has no Android device or throttled browser, so route-level load
timings must be captured where a real device/browser is available. The code-side
responsive fix and a fresh production bundle snapshot are done; this checklist is
what to run on a phone.

---

## 0. What changed in code (Rec #5)

- **Pricing comparison table** (`client/src/pages/Pricing.tsx`): the 6-column
  comparison now scrolls horizontally inside its own container (with a pinned
  "Feature" column) on small screens, plus a "Swipe to compare plans →" hint
  shown only under `sm`. It no longer crushes columns or forces the whole page
  to scroll sideways on a 360–390px phone. The per-plan cards with prices + CTAs
  above the table remain the primary mobile path.

## 1. Fresh production bundle snapshot (2026-06-14)

Built locally via `pnpm run build:client` (exit 0). Largest JS assets:

| Asset | raw | gzip |
|---|---|---|
| vendor-shared | 381.15 kB | 125.65 kB |
| vendor-charts | 275.72 kB | 63.08 kB |
| vendor-data | 96.75 kB | 26.67 kB |
| vendor-radix | 86.83 kB | 26.28 kB |
| ManagerDashboard | 76.93 kB | 17.55 kB |
| vendor-motion | 74.38 kB | 23.85 kB |

`vendor-shared` (gzip ~126 kB) remains the biggest single lever on first paint.
Further splitting it is a separate optimization (see Parking Lot) — not done here
to avoid churn on a launch-critical bundle without device evidence that it helps.

## 2. Responsive checks (run at 360px and 390px widths)

Use Android Chrome + Android Brave (real device preferred; DevTools device mode
acceptable as a first pass). For each page: **no horizontal page scroll, no
cut-off text, tap targets ≥ ~44px, CTAs reachable, no layout-breaking console
errors.**

| # | Page | Focus |
|---|------|-------|
| 2.1 | Landing (`/`) | hero + credibility strip; confirm the prior Android Chrome overflow fix holds |
| 2.2 | Pricing (`/pricing`) | comparison table scrolls inside its card with pinned Feature column; price cards + CTAs reachable; no page-level horizontal scroll |
| 2.3 | Signup / login | inputs not hidden by the on-screen keyboard |
| 2.4 | Driver dashboard | cards/grids wrap; bottom CTAs not covered by sticky bars |
| 2.5 | Diagnostics (symptoms → clarifying → results) | textareas usable above keyboard; result cards readable |
| 2.6 | Inspection capture | photo capture + submit works on Android Chrome/Brave/WebView |

## 3. Route-level load timing (Android Chrome + Brave, "Fast 3G" or real cellular)

Capture for each route: TTFB, FCP, LCP, and time-to-interactive. The app also now
auto-reports loads over 6s via the client observability beacon
(`slow_page_load`), so check the staff `admin.observability` summary after a
throttled run.

| Route | FCP | LCP | TTI | Notes |
|---|---|---|---|---|
| initial shell `/` | | | | |
| `/login` | | | | |
| driver dashboard | | | | |
| manager dashboard | | | | |
| diagnosis start | | | | |

Pass = usable (interactive) within a few seconds on Fast-3G; no chunk-load errors
(chunk recovery should self-heal if one occurs).

## 4. Result log (paste evidence here)

```
Device(s) / browser(s):
2.1: 2.2: 2.3: 2.4: 2.5: 2.6:
Timings (FCP/LCP/TTI per route):
Console errors:
slow_page_load events observed:
```
