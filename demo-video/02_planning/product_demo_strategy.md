# TruckFixr Fleet AI — Product Demo Strategy

_Status: DRAFT for approval. Nothing recorded, exported, seeded, or changed in the app/website yet._

## 1. Objective
A ~3-minute (target 2:45–3:20) customer-facing product demo that shows TruckFixr moving a fleet
from a **driver-reported coolant leak → structured report → AI-assisted triage → manager review of
history + compliance → faster maintenance decision.**

It should feel like a guided sales demo for small/mid-sized fleets and partners — practical,
operational, benefit-led — not a generic software tour and not an investor pitch.

## 2. Single storyline (locked)
One defect only: **coolant leak / overheating risk.** A second scenario may only be *mentioned*
(e.g. a "future demo option" note), never staged as a second workflow.

Narrative beats:
1. Driver spots low-coolant warning + visible coolant during pre-trip.
2. Instead of a call/text/paper form/photo thread, it goes **into TruckFixr** as a structured report.
3. TruckFixr organizes it into a maintenance record.
4. **AI-assisted triage (TADIS)** flags urgency and suggests next steps.
5. Fleet manager reviews the issue alongside **vehicle history + compliance context**.
6. Decision made **before dispatch** — hold, schedule repair, assign backup unit.
7. Close: TruckFixr is **live and available for pilot / partner conversations**.

## 3. What the review of the actual app changed vs. the source prompt
Grounding the plan in the real codebase (not inventing capabilities):

| Source prompt assumption | Actual TruckFixr | Impact on demo |
|---|---|---|
| "OpenMontage" as the video workflow | **No OpenMontage present.** A mature **Remotion** pipeline exists at `video-generator/` (renders 30/60/90s cuts, captions, audio, WebM/MP4, embed snippet). | **OPEN QUESTION Q1** — recommend reusing the Remotion pipeline. See open_questions.md. |
| Company "ABC Logistics", "Unit 204", driver "Michael A." | Seed ships 3 Ontario demo companies (Maple Route / Peel / NorthStone) with a **DEF/aftertreatment** hero story, not coolant. | Need a clean isolated demo company for the coolant story. See demo_dataset_plan.md + Q2. |
| "AI triage" | Product name is **TADIS** AI diagnostics; risk levels are `low / medium / high / critical`, plus compliance impact `none / warning / critical` and likely-cause likelihoods. | Use real labels; "high priority — overheating risk" maps to risk level **high/critical**. |
| "Issue report" | App calls them **defects**; driver flow is the **NSC / DVIR daily inspection** (`/inspection`) → defect. | Use "defect" in click paths; "issue" is fine in narration. |
| Generic "compliance module" | Compliance lives on the **vehicle/truck detail** (`/truck/:id`) as annual/daily inspection + PM/maintenance history. | Show compliance *inside* the coolant decision, per prompt. Not a separate tour. |

## 4. Confirmed real screens/routes we can use
- `/` LandingSaaS (live landing page)
- `/manager` ManagerDashboard — fleet overview, open defects, priorities
- `/driver` DriverDashboardSaaS — driver home, assigned vehicles
- `/inspection` DriverInspectionNSC — daily inspection + defect reporting (mobile/PWA)
- `/diagnosis` DriverDiagnosis — TADIS AI diagnostic intake + result
- `/defect/:id` DefectDetail — defect + TADIS + manager actions
- `/truck/:id` TruckDetail — vehicle history, maintenance, compliance context

## 5. Existing asset inventory (reuse first, recapture only where needed)
- `demo-assets/` — 17 desktop + 6 mobile product screenshots (dashboard, fleet health, inspection, defect flagged, AI diagnostic intake/result, maintenance history, compliance).
- `video-generator/assets/screenshots/desktop` (10) + `/mobile` (7) — already curated for video, incl. `08-ai-diagnosis-result`, `09-manager-action-priority-view`.
- Brand: `client/public/truckfixr-logo.png`, `truckfixr-logo-square.png`; brand tokens navy `#00263f`, dark `#0b3c5d`, accent red `#e32636`, sky `#7fa7cd`.
- Voiceover/music scaffolding already in `video-generator/assets/`.

These are **explainer** assets (30/60/90s). The coolant-leak **product demo** needs a handful of
targeted recaptures against seeded coolant data — most other frames can be reused.

## 6. Versions to produce (after approval)
1. **Primary** — narrated, captions, 16:9, website/calls/partners. (master)
2. **Silent/captioned** — understandable without audio; LinkedIn/WhatsApp/mobile.
3. *Optional* **9:16 vertical** — larger captions, safe crop, possibly shorter cut.
4. *Optional* **1:1 square** — feed sharing.

## 7. Visual approach
Real screen recordings where the seeded coolant flow is clean; screenshots + zoom-ins + callouts
where needed for privacy, pacing, or polish. No faked capabilities. If scheduling / backup-unit
assignment isn't a real UI action, present it as a **note/decision**, not a completed feature (see
open_questions Q3).

## 8. Claims discipline (non-negotiable)
Use: helps / supports / AI-assisted / designed to / built with a path to / available for pilot
conversations. Never: guarantees downtime reduction, predicts failures, fully automates diagnosis,
replaces mechanics/managers, "integrates with all ELDs". "Built with a path to ELD, telematics,
fault-code, and repair partner integrations" is the approved future line.

## 9. Safety
No production data touched. Fictional demo company only, created via the existing gated seed
(`ALLOW_DEMO_SEED`) on a local/staging DB — proposed, not executed, pending approval. No real VINs,
plates, emails, phones, invoices.

## 10. Definition of done (pre-approval)
The 11 deliverables listed in the prompt §22 exist under `demo-video/`, this strategy is approved,
and open questions Q1–Q5 are answered. Then — and only then — recording/seeding/export begins.
