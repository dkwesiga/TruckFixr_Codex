# TruckFixr Mobile & Android Browser Verification Checklist

Mobile usability is launch-critical: drivers, owner-operators, and mechanics use
TruckFixr from phones in the field. This checklist operationalizes the weekly
mobile/Android verification pass.

> **Status of automated review (2026-06-15):** The items under "Code-level fixes
> applied" were verified by static/responsive code review and changed in this
> pass. The items under "Requires real-device testing" have **not** been tested
> on physical Android devices in this pass — no device/emulator evidence exists
> yet. Do not mark them passed until a human runs them on the listed browsers.

## Code-level fixes applied this pass

- [x] Re-enabled pinch-zoom (removed `maximum-scale=1` from the viewport meta) so
      field users can zoom into fault codes, photos, and small text (WCAG 1.4.4).
- [x] Added `viewport-fit=cover` so `env(safe-area-inset-*)` padding works on
      notched / gesture-bar Android and iOS devices.
- [x] `body` now uses `min-height: 100dvh` (with a `100vh` fallback) so the
      collapsing Android Chrome/Brave address bar does not leave content or CTAs
      hidden under browser chrome.

## Requires real-device testing (not yet performed)

Test matrix — run each flow on every column:

| # | Flow | Android Chrome | Android Brave | Android WebView/PWA | Mobile viewport (DevTools 360px) | Desktop Chrome/Edge |
|---|------|----------------|---------------|---------------------|----------------------------------|---------------------|
| 1 | Landing → Book a demo CTA | ☐ | ☐ | ☐ | ☐ | ☐ |
| 2 | Signup / login (`/signup`) | ☐ | ☐ | ☐ | ☐ | ☐ |
| 3 | Pricing → plan checkout CTA (`/pricing`) | ☐ | ☐ | ☐ | ☐ | ☐ |
| 4 | Driver diagnosis intake + clarifying question (`/diagnosis`) | ☐ | ☐ | ☐ | ☐ | ☐ |
| 5 | Diagnosis result screen | ☐ | ☐ | ☐ | ☐ | ☐ |
| 6 | Daily inspection capture (`/inspection`) | ☐ | ☐ | ☐ | ☐ | ☐ |
| 7 | Manager dashboard (`/manager`) | ☐ | ☐ | ☐ | ☐ | ☐ |
| 8 | Defect detail + resolve (`/defect/:id`) | ☐ | ☐ | ☐ | ☐ | ☐ |

### Pass criteria (every cell)

- [ ] No horizontal scrolling at 360px width.
- [ ] No primary CTA blocked, cut off, or hidden behind the address/gesture bar.
- [ ] Form inputs are not hidden by the on-screen keyboard; the field scrolls
      into view on focus and the submit button stays reachable.
- [ ] Dropdowns/`<select>` open and are operable (Android Chrome + Brave).
- [ ] Modals/drawers scroll fully on a short screen.
- [ ] Tables collapse or scroll without trapping action buttons.
- [ ] No layout-breaking JavaScript/console errors.
- [ ] Tap targets for primary actions are comfortably tappable (~44px).

### How to run the mobile-viewport column without hardware

1. `pnpm dev`, open the app in Chrome/Edge.
2. DevTools → device toolbar (Ctrl/Cmd+Shift+M) → "Responsive" at 360×800.
3. Walk each flow; watch the Console and the body for horizontal overflow
   (`document.documentElement.scrollWidth > window.innerWidth`).

### Known follow-ups (parking lot, not this pass)

- Unused page variants exist (`Landing.tsx`, `DriverInspection.tsx`,
  `DriverInspectionNSC.tsx`, `ManagerDashboardFixed.tsx`,
  `ManagerDashboardSaaS.tsx`, `DriverDashboard.tsx`); confirm-and-remove in a
  dedicated cleanup. They are not routed in `client/src/App.tsx`.
- Consider a small overflow guard in CI (Playwright at 360px asserting no
  horizontal scroll) to keep this from regressing.
