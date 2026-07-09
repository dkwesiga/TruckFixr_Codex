# Website Embed Recommendation (analysis only — no website changes without approval)

Based on the live landing component `client/src/pages/LandingSaaS.tsx`. A full visual pass of
truckfixr.com can be done with the `/browse` skill on request; the component already tells us the
page structure.

## Headline finding
The landing page **already has a video placeholder section** — copy: *"Want a walkthrough now?
Request a pilot and we'll show you the full workflow on a real fleet"*, with a **Request Pilot** CTA
that tracks `cta_location: "video_placeholder"`. **This is the intended home for this demo video.**
No new section required — we fill an existing, purpose-built slot.

## Recommended placements (ranked)

### 1. Primary — replace the existing video placeholder (highest ROI, zero bloat)
- Swap the placeholder for the web-compressed MP4/WebM (with poster + captions).
- Keep the existing **Request Pilot** CTA directly beneath it — video → CTA is already wired for
  conversion tracking.
- Lazy-load with a poster image so it doesn't slow first paint (see performance notes).

### 2. Secondary — homepage hero (optional, only if it stays lightweight)
- A muted, poster-first, click-to-play thumbnail near the hero can lift engagement, but autoplaying
  video in the hero risks LCP/mobile performance. **Recommend poster + click-to-play only**, or skip
  in favor of placement #1.

### 3. Pilot CTA section (`#request-pilot`)
- A small "Watch the 3-min demo" thumbnail linking to the video modal/anchor reinforces the form.
- Low effort, reuses existing anchor.

### 4. Partner strip / "how it works"
- If a "how it works" section exists, the demo is a natural fit; otherwise the video placeholder slot
  already covers this intent. Don't add a new section just for this.

## Do NOT (without separate approval)
- Add heavy embeds (YouTube iframe on initial load), multiple copies of the video, or autoplay-with-
  sound anywhere.
- Introduce a new above-the-fold section that pushes the pilot CTA down.

## Performance / no-bloat guidance
- Self-host web-compressed MP4 + WebM from `09_exports/web_compressed/`; keep master < ~50 MB, web
  cut smaller.
- `preload="none"`, poster image, `playsinline`, captions track (VTT) for accessibility + silent
  autoplay-muted variant on mobile if desired.
- Defer/lazy-load; measure LCP before/after. Prefer self-host over third-party iframe for speed +
  privacy.

## Mobile usability
- Ensure captions are legible on small screens (use the silent/captioned cut's larger text).
- Poster + tap-to-play; no forced autoplay with sound.

## CTA alignment
- Every placement must keep **Request Pilot** immediately adjacent, preserving the existing
  `request_pilot_cta_clicked` tracking so we can measure demo→pilot conversion.

## Suggested next step (only if approved)
Wire the compressed video into the existing placeholder in `LandingSaaS.tsx`, poster-first, captions
on, CTA retained — a small, reversible change. Not done yet.
