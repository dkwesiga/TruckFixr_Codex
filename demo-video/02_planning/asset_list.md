# Asset List

## Have (reuse first)
### Brand
- `client/public/truckfixr-logo.png`, `truckfixr-logo-square.png`
- Tokens: navy `#00263f`, dark `#0b3c5d`, red `#e32636`, sky `#7fa7cd` (from `client/src/index.css` / `video-generator/src/theme.ts`)
- PWA icons `client/public/pwa-icon-*.png`

### Screenshots — desktop (`demo-assets/` + `video-generator/assets/screenshots/desktop/`)
- Landing, login, signup, pricing
- Dashboard, fleet health, vehicle list, add vehicle, vehicle profile
- Daily inspection, defect flagged, AI diagnostic intake, **AI diagnosis result**
- Maintenance history, compliance tracking, settings/subscription
- Manager action / priority view, clean CTA dashboard

### Screenshots — mobile (`demo-assets/mobile-*` + `video-generator/.../mobile/`)
- Driver login/dashboard, assigned vehicle, daily inspection, **issue/defect report**, symptom entry, **AI triage result**, recommended next action

### Audio/video scaffolding
- `video-generator/assets/voiceover/` (30/60/90s explainer MP3s — explainer, not this demo)
- `video-generator/assets/music/background.mp3`
- Remotion pipeline: capture/audio/captions/render/compress/qa scripts

## Need to create/capture (after approval)
| Asset | Source | Notes |
|---|---|---|
| Coolant-specific mobile report frames (Unit 204) | recapture on seeded app | Scene 4 |
| TADIS **high — overheating** result on coolant defect | recapture / curated case | Scene 5; Q2 |
| Unit 204 vehicle record: prior coolant repair, PM 18d, annual due 42d | recapture on seeded app | Scene 6 |
| Manager decision (status hold/priority + note) | recapture on seeded app | Scene 7; Q3 |
| Placeholder "coolant residue" photo | generated/stock placeholder | Scene 4; not a real vehicle |
| Scene 1 "scattered info" motif (call/text/paper/photo) | graphics or AI/stock b-roll | Q4 |
| Integration cards (ELD/telematics/fault codes/repair) labeled "path to" | brand graphics | Scene 8 |
| Brand title card + end card | graphics | Scenes 2, 9 |
| Voiceover for THIS demo script | human or TTS | Q5; ~300 words |
| Music bed (subtle) | reuse `background.mp3` or license | keep low under VO |
| Captions SRT + VTT for this script | generate | `08_captions/` |
| Thumbnails 16:9 (+opt 9:16/1:1) | graphics over dashboard still | headline "Turn Fleet Issues Into Faster Maintenance Decisions" |

## Tooling to be used (documented per §16)
- **ffmpeg** (via `ffmpeg-static` already in `video-generator`) — trimming, compression, format conversion
- **Playwright** (already present) — screenshot/screen capture against local app
- **Remotion** (already present) — composition/render **OR** OpenMontage if provided (Q1)
- No new heavy dependencies without approval.

## Folder destinations
- Logo/brand → `01_inputs/logo`, `01_inputs/brand_assets`
- Provided screenshots → `01_inputs/screenshots_provided`
- New captures → `04_recordings/`, `05_screenshots/`
- AI/stock visuals → `06_ai_visuals_optional/`
- Narration/music → `07_openmontage/narration`, `/music`
- Captions → `08_captions/`
- Exports → `09_exports/`
- Thumbnails → `10_thumbnails/`
