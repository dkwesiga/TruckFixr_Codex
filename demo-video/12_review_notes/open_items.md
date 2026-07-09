# Open Items

Tracks work not yet done. Blockers detailed in `02_planning/open_questions.md`.

## Decisions locked (2026-07-04)
- [x] Q1 — Tool = **OpenMontage** — RESOLVED. Repo provided: https://github.com/calesthio/OpenMontage. Cloned to `C:/Users/dkwes/OpenMontage` (isolated, outside TruckFixr repo). Python venv install in progress; Node deps + `.env` already present; ffmpeg/node/python OK; `make` absent on Windows (using manual install path). Pipeline to use: **`screen-demo`** (production). OpenMontage uses Remotion internally, so earlier Remotion analysis still applies.
- [x] Q2 — **Approved**: seed ABC Logistics / Unit 204 on local/staging; try live TADIS, curated coolant case as fallback.
- [x] Q3 — **Approved**: show real Scene 7 actions; unbuilt ones as manager notes.

## Blockers still open
- [ ] Q1a — Provide OpenMontage source, OR confirm Remotion fallback, before any render.
- [ ] Q6 — **HALT/SAFETY:** the only configured `DATABASE_URL` in `.env` points to a **remote Supabase pooler** (`aws-0-us-west-2.pooler.supabase.com`), no demo-seed flags set. This looks like production/shared, NOT local/staging. **Seed will NOT run against this.** Need a genuine local/staging `DATABASE_URL` (or explicit confirmation the target is an isolated demo DB) before seeding. Meanwhile, Option C (screenshots + curated case, zero DB writes) can proceed if you'd rather not stand up a local DB.

## Minor / non-blocking
- [ ] Q4 — Scene 1 b-roll source (brand graphics vs. AI/stock)
- [ ] Q5 — Voiceover source (human vs. TTS)
- [ ] Q7 — Distribution intent (YouTube/LinkedIn/WhatsApp + embed) for final copy step

## After approval (prompt §23)
- [ ] Seed demo data (approved option)
- [ ] Capture/recapture coolant frames (Scenes 4–7)
- [ ] Record narration + build compositions
- [ ] Render 16:9 master + silent/captioned (+ optional 9:16, 1:1)
- [ ] SRT/VTT captions, web-compressed cuts, poster, thumbnail
- [ ] Distribution copy (YouTube/LinkedIn/WhatsApp) + live demo script
