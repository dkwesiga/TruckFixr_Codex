# Storyboard — TruckFixr Coolant-Leak Product Demo (~3:05)

Format fields per scene: Duration · Purpose · Visuals · Voiceover · On-screen text · App screens ·
Capture requirement · Data · Open questions · Risk notes.

Total target 3:05 (inside the 2:45–3:20 window). Timings are targets; final trims in edit.

---

## Scene 1 — The real fleet problem — 0:00–0:20 (20s)
- **Purpose:** Set operational context; make the pain concrete.
- **Visuals:** Title card over subtle navy brand background; light "before" motif — icons/thumbnails of a phone call, a text, a paper inspection sheet, a photo buried in a chat thread; optional stock/AI b-roll of a box truck at a yard pre-trip.
- **Voiceover:** "Today, a coolant leak might be reported through a call, a text, a paper inspection, or a photo buried in a chat thread. Fleet teams aren't the problem — they work hard. The problem is that the information needed to make a maintenance decision ends up scattered."
- **On-screen text:** *A small issue becomes downtime when the decision is delayed.*
- **App screens:** none (title/b-roll).
- **Capture:** AI/stock visual (optional) + brand title card. No app recording.
- **Data:** none.
- **Open Q:** Use AI-generated truck b-roll or a clean brand title card only? (Q4)
- **Risk:** Keep b-roll generic; no real company/plate visible.

## Scene 2 — Introduce TruckFixr — 0:20–0:35 (15s)
- **Purpose:** Position the product in one line.
- **Visuals:** TruckFixr logo animates in; cut to landing page hero (`/`) or clean dashboard.
- **Voiceover:** "TruckFixr Fleet AI helps small and mid-sized fleets turn inspections, driver reports, symptoms, photos, fault codes, and repair history into faster maintenance decisions."
- **On-screen text:** *TruckFixr Fleet AI — AI maintenance intelligence for small and mid-sized fleets.*
- **App screens:** `/` LandingSaaS (or dashboard still).
- **Capture:** Screenshot of landing hero + logo asset; light zoom.
- **Data:** none / generic.
- **Risk:** Landing copy must match claims discipline; avoid any "predictive/automated" wording on screen.

## Scene 3 — Fleet dashboard overview — 0:35–0:55 (20s)
- **Purpose:** Show the manager command view.
- **Visuals:** Desktop `/manager`; fleet overview, vehicle status, open defects, inspection activity, maintenance/compliance indicators. Gentle pan; callout ring on the open-defects widget.
- **Voiceover:** "We start in the fleet dashboard. Here a manager can see vehicles, open issues, inspection activity, and maintenance priorities in one place — instead of chasing them across tools."
- **On-screen text:** *One place to see fleet maintenance priorities.*
- **App screens:** `/manager` (ManagerDashboard).
- **Capture:** Screen recording OR high-res screenshot of seeded ABC Logistics manager dashboard; Unit 204 visible with an open/pending state.
- **Data:** ABC Logistics fleet; Unit 204 present.
- **Open Q:** Does the manager dashboard show a compliance/inspection indicator per vehicle? confirm at capture.
- **Risk:** No real driver names/emails in fleet roster — seed data only.

## Scene 4 — Driver reports the coolant leak — 0:55–1:25 (30s)
- **Purpose:** Show the issue entering the system as structured data.
- **Visuals:** Mobile/PWA frame. Driver dashboard → select **Unit 204** → start daily inspection / report defect → choose coolant/engine/fluid-leak category → type note → attach photo (placeholder) → **Submit**. Cursor/tap highlights each step.
- **Voiceover:** "In this example, the driver notices a low-coolant warning during pre-trip and sees coolant near the reservoir. Instead of a loose text or a call that loses context, the driver submits it straight into TruckFixr — vehicle, symptom, note, and a photo, all captured together."
- **On-screen text:** *Driver report: low coolant warning + visible leak.*
- **App screens:** `/driver` → `/inspection` (DriverInspectionNSC) and/or `/diagnosis`.
- **Capture:** Mobile screen recording of the seeded flow; fall back to `demo-assets/mobile-03/04` + `video-generator .../mobile/04-issue-report`.
- **Data:** Unit 204; note = "Low coolant warning came on during pre-trip. Coolant visible near reservoir."; photo = placeholder labeled "coolant residue near reservoir cap/hose".
- **Open Q:** Exact category label in the inspection UI for a cooling-system defect (confirm at capture).
- **Risk:** Fictional driver only; photo must be a placeholder, not a real vehicle.

## Scene 5 — AI-assisted triage result — 1:25–1:55 (30s)
- **Purpose:** Show TruckFixr organizing the report and supporting the decision.
- **Visuals:** Show submit **once**; brief transition (do NOT linger on loading); land on completed **TADIS** result — risk level **High**, overheating-risk rationale, recommended next steps (inspect reservoir/cap/hoses/clamps, pressure-test). Callouts on risk badge + recommended steps.
- **Voiceover:** "TruckFixr organizes the report and runs AI-assisted triage. Here it's flagged high priority — a coolant leak can create overheating risk if the truck is dispatched without inspection — with suggested next steps: check the reservoir, cap, hoses and clamps, and pressure-test the cooling system."
- **On-screen text:** *AI-assisted triage: high priority — overheating risk.*
- **App screens:** `/diagnosis` result / `/defect/:id` TADIS section.
- **Capture:** Screenshot/recording of TADIS result on the coolant defect; fall back to `.../desktop/08-ai-diagnosis-result` + `mobile/06`.
- **Data:** Coolant defect on Unit 204; risk_level = high; recommended steps as above.
- **Open Q:** Will TADIS produce a coolant-specific rationale on seeded data, or do we stage a curated demo case? (Q2)
- **Risk:** Caption "AI-assisted" — never imply automatic repair/diagnosis. No fabricated confidence %.

## Scene 6 — Manager reviews issue context — 1:55–2:25 (30s)
- **Purpose:** Show the decision context — history + compliance in the same flow.
- **Visuals:** Desktop `/defect/:id` then `/truck/204`: vehicle history, recent PM (18 days ago), previous coolant reservoir replacement, daily inspection submitted, annual inspection due in 42 days. Callouts tie each fact to the decision.
- **Voiceover:** "Before deciding, the manager reviews the vehicle's history, recent maintenance, inspection status, and upcoming compliance. There was a coolant reservoir repair before, a PM eighteen days ago, and an annual inspection due in six weeks. The issue is no longer just a message — it's part of the vehicle record."
- **On-screen text:** *Inspection + history + compliance — in one record.*
- **App screens:** `/defect/:id` (DefectDetail), `/truck/:id` (TruckDetail).
- **Capture:** Screenshot/recording; fall back to `demo-assets/09-vehicle-profile`, `15-maintenance-history`, `16-compliance-tracking`.
- **Data:** Unit 204 history + compliance fields from the dataset plan.
- **Risk:** Compliance shown as part of THIS decision, not a separate module tour. No real inspection docs.

## Scene 7 — The maintenance decision — 2:25–2:45 (20s)
- **Purpose:** Show action taken before dispatch.
- **Visuals:** Manager updates defect status (hold / needs service / priority — real label at capture); assigns/acknowledges repair; **backup-unit note**. Emphasize "before dispatch."
- **Voiceover:** "With the report, triage, history, and inspection context together, the manager makes a faster call: hold the truck, schedule the repair, and assign a backup unit — before it's dispatched and before it becomes a roadside problem."
- **On-screen text:** *Decision: hold vehicle, schedule repair, assign backup unit.*
- **App screens:** `/defect/:id` action controls; `/manager`.
- **Capture:** Recording of the real status/assign action. Anything not a real action (scheduling, backup unit) is shown as a **note/decision**, not a completed feature.
- **Data:** Unit 204 defect → status hold/priority; note "Assign backup unit; schedule repair before dispatch."
- **Open Q:** Which of hold/schedule/backup-unit are real UI actions vs. notes? (Q3)
- **Risk:** Do not fake unbuilt capabilities as finished.

## Scene 8 — Partner pathway & product stage — 2:45–3:00 (15s)
- **Purpose:** Position for pilots and partnerships.
- **Visuals:** Short dashboard montage; simple integration-style cards (ELD / telematics / fault codes / repair partners) rendered as brand graphics (NOT claimed as live integrations).
- **Voiceover:** "TruckFixr is live today and available for pilot conversations with small and mid-sized fleets and partners. And it's built with a path to ELD, telematics, fault-code, and repair-partner integrations."
- **On-screen text:** *Built for fleets. Designed for partner workflows.*
- **App screens:** dashboard stills + brand card graphics.
- **Capture:** Reuse `.../desktop/10-cta-dashboard-clean`; build integration cards as graphics.
- **Risk:** Integration cards must read as "path to," not "integrated with." Approved future line only.

## Scene 9 — Call to action — 3:00–3:05+ (10s)
- **Purpose:** Close with a clear action.
- **Visuals:** TruckFixr logo, website, phone on a clean brand end card.
- **Voiceover:** "Explore a TruckFixr pilot or partnership."
- **On-screen text:** *Explore a TruckFixr pilot or partnership — truckfixr.com · 905-677-7663*
- **App screens:** none (end card).
- **Capture:** Brand end card graphic.
- **Risk:** Confirm phone/URL exactly: truckfixr.com · 905-677-7663.

---

### Runtime check
20+15+20+30+30+30+20+15+10 = **190s ≈ 3:10** — within 2:45–3:20. Trim Scenes 1/6 by ~5s each if
tightening toward 3:00.
