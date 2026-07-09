# Click-by-Click Product Tour Checklist

Recorded against the **local/staging** app signed in as the seeded ABC Logistics **manager** (and a
seeded **driver** for Scene 4). Confirm exact labels/routes live at capture — placeholders noted.
No production data. Every step carries a privacy check and a claim-risk check.

Legend: Route may differ if labels change; verify against `client/src/App.tsx` routes.

---

### Scene 3 — Fleet dashboard overview
- **Screen:** Manager dashboard · **Route:** `/manager` · **Role:** Manager
- **Demo data:** ABC Logistics fleet (12 units); Unit 204 present with open/pending state
- **Action:** Load `/manager` → let fleet overview + open-defects widget render → slow pan
- **Expected:** Vehicle list, open defects, inspection activity, maintenance/compliance indicators visible; Unit 204 shows a pending/open flag
- **Narration point:** One place to see fleet maintenance priorities
- **Callout:** Ring open-defects widget + Unit 204 row
- **Privacy check:** Fleet roster shows only fictional seed names/emails
- **Claim check:** No "predictive"/"automated" wording on screen
- **Capture note:** 1080p screen recording; fallback `demo-assets/05-dashboard.png`, `06-fleet-health.png`

### Scene 4 — Driver reports coolant leak
- **Screen:** Mobile/PWA driver → daily inspection / defect report · **Route:** `/driver` → `/inspection` (and/or `/diagnosis`) · **Role:** Driver
- **Demo data:** Unit 204; driver = fictional (e.g. "Michael A.")
- **Action:** Open `/driver` → select **Unit 204** → start daily inspection / report defect → choose cooling/engine/fluid-leak category → enter note "Low coolant warning came on during pre-trip. Coolant visible near reservoir." → attach placeholder photo → **Submit**
- **Expected:** Defect submitted, shows as available for manager review
- **Narration point:** Driver reports in a structured workflow, not scattered messages
- **Callout:** Step chips 1–7; highlight Unit 204, note, photo, Submit
- **Privacy check:** Fictional driver + placeholder photo only; no real plate/VIN visible
- **Claim check:** Do not imply automatic repair diagnosis
- **Capture note:** Mobile viewport recording; fallback `demo-assets/mobile-03/04`, `video-generator/.../mobile/04-issue-report-screen.png`
- **Confirm live:** exact category label for a cooling-system defect

### Scene 5 — AI-assisted triage result
- **Screen:** TADIS diagnostic result · **Route:** `/diagnosis` result or `/defect/:id` (TADIS section) · **Role:** Driver→Manager
- **Demo data:** Coolant defect on Unit 204; risk_level = high; recommended steps
- **Action:** Show Submit once → transition (no lingering loader) → land on completed TADIS result → highlight risk badge + recommended next steps
- **Expected:** Result reads "high priority", overheating-risk rationale, next steps (reservoir, cap, hoses, clamps, pressure-test)
- **Narration point:** TruckFixr organizes the report and provides AI-assisted triage
- **Callout:** Ring risk badge **High**; ring recommended steps
- **Privacy check:** No real data in result
- **Claim check:** Caption "AI-assisted" only; no fabricated confidence %; never "diagnoses/decides"
- **Capture note:** fallback `video-generator/.../desktop/08-ai-diagnosis-result.png`, `mobile/06-ai-diagnosis-triage-result.png`
- **Confirm live:** whether TADIS yields coolant-specific rationale on seed data OR a curated demo case is needed (Q2)

### Scene 6 — Manager reviews issue context
- **Screen:** Defect detail + vehicle detail · **Route:** `/defect/:id` → `/truck/204` · **Role:** Manager
- **Demo data:** Unit 204 history: prior coolant reservoir replacement; PM 18 days ago; daily inspection submitted; annual inspection due in 42 days
- **Action:** Open the defect from dashboard → review TADIS + note → open Unit 204 vehicle record → scroll history / maintenance / compliance
- **Expected:** History, recent PM, prior coolant repair, inspection status, annual-inspection due date all visible in the vehicle record
- **Narration point:** Issue becomes part of the vehicle record; decision context in one place
- **Callout:** Chips "PM 18 days ago", "prior coolant repair", "annual due in 42 days"
- **Privacy check:** Seed history only; no real invoices/docs
- **Claim check:** Compliance shown inside this decision, not a separate module tour
- **Capture note:** fallback `demo-assets/09-vehicle-profile.png`, `15-maintenance-history.png`, `16-compliance-tracking.png`

### Scene 7 — Maintenance decision
- **Screen:** Defect actions · **Route:** `/defect/:id` (+ `/manager`) · **Role:** Manager
- **Demo data:** Unit 204 defect
- **Action:** Update status (hold / needs service / priority — real label at capture) → acknowledge/assign repair → add note "Assign backup unit; schedule repair before dispatch"
- **Expected:** Defect status updates; note recorded; vehicle flagged before dispatch
- **Narration point:** Faster decision with full context before dispatch
- **Callout:** Ring status control; chip "before dispatch"
- **Privacy check:** Seed data only
- **Claim check:** Show only real actions as done; scheduling/backup-unit as note if not a built action (Q3)
- **Capture note:** fallback `demo-assets/12-defect-flagged.png`, `video-generator/.../desktop/09-manager-action-priority-view.png`

### Scenes 2, 8, 9 — Non-workflow frames
- **Scene 2:** `/` landing hero screenshot + logo. Privacy: public page. Claim: on-screen copy must be claims-safe.
- **Scene 8:** dashboard stills + integration cards built as graphics labeled "path to". Claim: not live integrations.
- **Scene 9:** brand end card (logo, truckfixr.com, 905-677-7663). Verify contact details exactly.

---

## Pre-capture gate (do not record until all true)
- [ ] ABC Logistics demo company seeded on local/staging (Q2 approved)
- [ ] Unit 204 + coolant defect + history/compliance present
- [ ] Signed in as seeded manager and driver (no real accounts)
- [ ] All on-screen names/plates/VINs/emails confirmed fictional
- [ ] Real vs. note actions for Scene 7 confirmed (Q3)
- [ ] Browser zoom/clean profile; no extensions, bookmarks, or real tabs visible
