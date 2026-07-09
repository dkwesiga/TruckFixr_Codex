# Pre-Recording / Pre-Export Review Checklist

Do not record final takes or export until every box is checked or the open item is logged and
approved. Status: **BLOCKED pending approval + Q1–Q5.**

## Script & message
- [ ] Voiceover matches on-screen text and click paths
- [ ] Every claim uses approved language; no banned phrases (see claims list)
- [ ] "AI-assisted" used for triage everywhere; no "diagnoses/auto-fix"
- [ ] Runtime lands in 2:45–3:20 (current plan ≈ 3:10)

## Screens & app readiness
- [ ] All 7 routes render cleanly on local/staging (`/manager`, `/driver`, `/inspection`, `/diagnosis`, `/defect/:id`, `/truck/:id`, `/`)
- [ ] Coolant scenario visible end to end (report → TADIS high → history/compliance → decision)
- [ ] Scene 7 actions confirmed real vs. note (Q3)
- [ ] No broken spacing / overflow / empty states in captured frames
- [ ] No console error banners or dev overlays visible

## Demo data safety / privacy
- [ ] ABC Logistics + Unit 204 fully fictional
- [ ] No real VIN, plate, email, phone, invoice, or private note anywhere on screen
- [ ] Photo is a placeholder, not a real vehicle
- [ ] Browser profile clean: no real bookmarks/tabs/extensions/notifications
- [ ] Signed in as seeded accounts only

## Readability & accessibility
- [ ] UI text legible at target resolution; zoom-ins used where small
- [ ] Captions ≥ 32px @1080p, high contrast, not covering key UI or logo
- [ ] Transitions ≥ 0.4s; no rapid screen changes
- [ ] Silent version understandable without audio (step indicators present)

## Brand & CTA
- [ ] Logo correct and unobstructed
- [ ] Brand colors match tokens (navy `#00263f`, red `#e32636`)
- [ ] CTA exact: **truckfixr.com · 905-677-7663** (verified)

## Export requirements (post-approval)
- [ ] 16:9 1920×1080 master (narrated + captioned)
- [ ] Silent/captioned 16:9
- [ ] Optional 9:16 1080×1920 and 1:1 1080×1080
- [ ] Web-compressed MP4 + WebM + poster
- [ ] SRT + VTT caption files
- [ ] File sizes web-friendly (target master < ~50 MB compressed)

## Assets present
- [ ] Logo, brand tokens, screenshots/recordings, voiceover, music, integration-card graphics
- [ ] Any AI/stock b-roll cleared for use (Scene 1) — see Q4

## Open blockers (must be cleared)
- [ ] Q1 tooling (OpenMontage vs. Remotion)
- [ ] Q2 seed vs. curated TADIS coolant result
- [ ] Q3 Scene 7 real actions
- [ ] Q4 Scene 1 b-roll source
- [ ] Q5 voiceover source (human vs. TTS)
