# On-Screen Text & Callout Plan

Two layers:
- **Caption band** — narration captions (drive the silent version). Bottom third, high-contrast.
- **Callouts** — labels/arrows/zoom rings on specific UI elements.

## Global style
- Font: brand sans (match app). Caption size ≥ 32px @1080p (≥ 5% of frame height); vertical ≥ 44px.
- Colors: white text on navy `#00263f` @ 85% band, or navy text on white. Accent red `#e32636` for
  emphasis chips only. Contrast ≥ 4.5:1.
- Never cover the TruckFixr logo or the key UI element being explained. Callouts sit in margins.
- Hold each caption ≥ 2.5s; transitions ≥ 0.4s. No more than ~8 words per caption line.

## Per-scene text

| Scene | Caption band (on-screen) | Callouts / zoom targets |
|---|---|---|
| 1 | **A small issue becomes downtime when the decision is delayed.** | Faded icons: call · text · paper form · chat photo |
| 2 | **TruckFixr Fleet AI** — AI maintenance intelligence for small & mid-sized fleets | Logo lockup; underline tagline |
| 3 | **One place to see fleet maintenance priorities** | Ring: open-defects widget; ring: Unit 204 row |
| 4 | **Driver report: low coolant warning + visible leak** | Steps 1–7 chips; highlight Unit 204, note field, photo attach, Submit |
| 5 | **AI-assisted triage: high priority — overheating risk** | Ring: risk badge **High**; ring: recommended next steps list |
| 6 | **Inspection + history + compliance — in one record** | Chips: "PM 18 days ago", "prior coolant repair", "annual due in 42 days" |
| 7 | **Decision: hold vehicle · schedule repair · assign backup unit** | Ring: status control; note chip "before dispatch" |
| 8 | **Built for fleets. Designed for partner workflows.** | Cards: ELD · telematics · fault codes · repair partners (labeled "path to") |
| 9 | **Explore a TruckFixr pilot or partnership** — truckfixr.com · 905-677-7663 | Logo; URL + phone |

## Rules that protect claims discipline
- Scene 5 chip says **"AI-assisted triage"** verbatim — never "AI diagnosis" or "auto-fix".
- Scene 8 integration cards must carry a small **"path to"** qualifier so they never read as live
  integrations.
- Scene 7: if scheduling/backup-unit is not a real action, its chip reads "recommended" / "note",
  matching what's actually on screen (see open_questions Q3).

## Silent-version specific
- Add a persistent tiny brand bug (logo) top-left except Scene 2 & 9 (full logo moments).
- Scenes 4–7 get a small step indicator ("Step 2 of 5: Report → Triage → Review → Decide") so the
  workflow reads without audio.
- Add an intro caption card at 0:00 for silent viewers: *"How a coolant leak becomes a faster
  maintenance decision."*
