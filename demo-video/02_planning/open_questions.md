# Open Questions / Blockers

These block final recording/export. I'll ask them one at a time; recommended answers noted so you
can just confirm.

## Q1 — Video tooling: OpenMontage vs. existing Remotion pipeline **(blocker)**
The prompt names **OpenMontage** as the primary workflow, but there is **no OpenMontage in this
repo**. There *is* a mature **Remotion** pipeline at `video-generator/` that already renders
16:9 + 9:16, captions, audio, WebM/MP4, and an embed snippet.
- **Recommendation:** Reuse the Remotion pipeline (proven, isolated, zero new deps) and keep the
  `07_openmontage/` folder for narration/music/config. If you specifically require OpenMontage,
  tell me where it lives / how to install it.
- **Need:** confirm Remotion, OR provide OpenMontage access.

## Q2 — Coolant TADIS result: live seed vs. curated demo case **(blocker)**
Coolant is valid free-text symptom input, but I can't guarantee TADIS returns a clean
"high — overheating" result deterministically on seeded data without testing.
- **Recommendation:** Try seed-driven first; if inconsistent for a clean take, use a curated coolant
  demo case (the diagnosis page already supports demo cases). Either way, no invented capability.
- **Need:** approval to seed ABC Logistics on local/staging (Option A/B/C in seed_data_proposal.md),
  and OK to fall back to a curated case if needed.

## Q3 — Scene 7 actions: which are real UI actions? **(blocker for accuracy)**
Need to confirm which of **status change (hold/priority)**, **schedule repair**, **assign backup
unit** are real actions in `/defect/:id` vs. presented as a manager **note**.
- **Recommendation:** Show real actions live; render anything unbuilt as a note/decision (never as a
  finished feature). I'll verify at capture, but confirm if you already know.

## Q4 — Scene 1 opening visual **(minor)**
Brand title card + simple "scattered info" graphics only, or add AI-generated / stock truck b-roll?
- **Recommendation:** Brand graphics + optional light AI/stock b-roll, generic (no real vehicle/plate).

## Q5 — Voiceover source **(minor)**
Human voice talent or TTS for the narration?
- **Recommendation:** Draft with TTS for timing/approval; swap in human/pro voice for the final if
  desired. (`video-generator` can generate a local TTS scratch track.)

## Q6 — Environment for recording **(confirm)**
Confirm a **local or staging** instance is available with the seed applied, and that we must **not**
record against production. (Prod login also has a known cookie-domain caveat.)

## Q7 — Distribution intent **(later, non-blocking)**
Will this be posted to YouTube/LinkedIn/WhatsApp and embedded on truckfixr.com? Affects only the
final distribution copy + embed step, not recording.
