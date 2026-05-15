# TruckFixr Video Generator

This folder contains a self-contained marketing asset generator for TruckFixr Fleet AI explainer videos. It is intentionally isolated from the main TruckFixr application and is built to use existing app screenshots, optional voiceover, optional background music, and landing-page-ready exports.

## What This Generates

- `30s` teaser cut
- `60s` master landing-page explainer
- `90s` expanded explainer
- `16:9` landscape compositions at `1920x1080`
- `9:16` vertical compositions at `1080x1920`
- MP4 renders
- WebM conversions
- Poster thumbnails
- VTT and SRT captions
- Responsive landing-page embed snippet

Generated outputs are written inside `video-generator/output/`.

## Remotion Licensing Note

As of `2026-05-14`, Remotion’s official licensing pages indicate that commercial usage may require a paid company license depending on your usage and organization. Confirm the current terms before shipping or monetizing any video workflow built here.

Official sources:

- [Remotion licensing](https://www.remotion.dev/license)
- [Remotion pricing](https://www.remotion.dev/pricing)

This implementation does not block on licensing, but you should review the current terms before commercial deployment.

## Brand Inputs

The generator mirrors the current TruckFixr visual tokens found in [`client/src/index.css`](/C:/Users/dkwes/TruckFixr/Codex/client/src/index.css:53), especially:

- Primary navy: `#00263f`
- Dark surface/navy container: `#0b3c5d`
- Accent red: `#e32636`
- Supporting sky blue: `#7fa7cd`

Logo source files are copied from:

- [`client/public/truckfixr-logo.png`](/C:/Users/dkwes/TruckFixr/Codex/client/public/truckfixr-logo.png)
- [`client/public/truckfixr-logo-square.png`](/C:/Users/dkwes/TruckFixr/Codex/client/public/truckfixr-logo-square.png)

Local copies live in `assets/brand/`.

## Setup

1. Install dependencies from inside `video-generator/`.
2. Copy `.env.example` to `.env`.
3. Fill in:
   - `TRUCKFIXR_APP_URL`
   - `TRUCKFIXR_DEMO_EMAIL`
   - `TRUCKFIXR_DEMO_PASSWORD`
4. Start the TruckFixr app if you plan to refresh screenshots from a local instance.

Example:

```bash
cd video-generator
npm install
cp .env.example .env
```

## Commands

```bash
npm run capture:screenshots
npm run captions
npm run dev
npm run render:30
npm run render:60
npm run render:90
npm run render:all
npm run compress
npm run build:assets
npm run qa
```

## Screenshot Capture

The capture script uses Playwright with `TRUCKFIXR_APP_URL`, `TRUCKFIXR_DEMO_EMAIL`, and `TRUCKFIXR_DEMO_PASSWORD`.

Outputs:

- `assets/screenshots/desktop/`
- `assets/screenshots/mobile/`
- `output/reports/screenshot-capture-report.json`
- `output/reports/missing-screenshots.json`

If `TRUCKFIXR_APP_URL` is missing, the script stops with a setup error.
If a local URL is configured but the TruckFixr app is not running, the script tells you to start the app first.
If login fails, the script stops without printing credentials.

## Default Screenshot Inventory

This utility ships with safe fallback screenshots copied from the repo’s existing `demo-assets/` folder so the Remotion scenes have immediate inputs before live recapture.

### Desktop

- Login screen
- Main dashboard
- Fleet dashboard
- Vehicle list
- Vehicle profile
- Maintenance history
- Open issues / defects
- AI diagnosis result
- Manager action / priority fallback
- CTA background dashboard

### Mobile

- Driver dashboard
- Vehicle selection fallback
- Digital inspection
- Issue report
- Symptom entry
- AI diagnosis / triage result
- Recommended next action

## Known Capture Notes

- A distinct mobile `vehicle selection` screen is not confirmed from route inspection alone, so the shipped fallback uses an assigned-vehicle style screen until a live capture confirms a separate view.
- A distinct `manager action / priority view` route is not obvious from static route inspection. The live capture flow treats this as a dashboard section capture.
- A dedicated `clean CTA background` is currently a curated dashboard fallback.

After running `npm run capture:screenshots`, review `output/reports/missing-screenshots.json` for any real route or selector gaps.

## Audio

Optional voiceover files:

- `assets/voiceover/truckfixr-explainer-30.mp3`
- `assets/voiceover/truckfixr-explainer-60.mp3`
- `assets/voiceover/truckfixr-explainer-90.mp3`

Optional background music:

- `assets/music/background.mp3`

If voiceover or music is missing, the compositions still render. The render script automatically falls back to:

- `voiceover` profile when matching narration audio exists
- `autoplay` profile when only music exists
- `silent` profile when neither exists

## Rendering Notes

- The `60s` composition is the master timeline.
- `30s` is the condensed cut.
- `90s` adds more workflow detail.
- Landscape scenes emphasize dashboards and manager visibility.
- Vertical scenes emphasize driver reporting, inspections, and AI triage.

## Output Layout

- `output/renders/` raw MP4 renders from Remotion
- `output/web/` compressed MP4 and WebM files plus posters
- `output/captions/` VTT and SRT files
- `output/embed/truckfixr-video-embed.html` landing-page embed snippet
- `output/reports/` capture, render, and QA manifests

## Customization

- Update copy and timing in `src/script.ts`
- Adjust caption formatting in `src/captions.ts`
- Tune colors and typography in `src/theme.ts`
- Swap screenshots by replacing files in `assets/screenshots/`
- Add voiceover or music files to `assets/voiceover/` and `assets/music/`
- Edit export presets in `scripts/render-all.ts` and `scripts/compress-video.ts`
