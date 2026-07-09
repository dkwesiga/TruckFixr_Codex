# Assumptions

These are working assumptions made while planning. Each is safe to correct at approval time.

## Product / terminology
- A1. The app's AI engine is branded **TADIS**; "AI-assisted triage" in narration = TADIS
  diagnostic result + manager summary. Verified in `DefectDetail.tsx`, `DriverDiagnosis.tsx`.
- A2. Risk levels are `low / medium / high / critical`; compliance impact `none / warning /
  critical`. "High priority — overheating risk" maps to risk **high** (or **critical**). Verified.
- A3. Driver-side reporting is the **NSC/DVIR daily inspection** (`/inspection`) producing a
  **defect**, and/or the **TADIS diagnosis** flow (`/diagnosis`). "Issue" = defect in narration.
- A4. Coolant is **not** a hardcoded scenario; it's entered as free-text symptom/defect and
  diagnosed by TADIS. So the coolant story requires no new product capability — only seed data.

## Video tooling
- A5. **OpenMontage is not in this repo.** The existing `video-generator/` Remotion pipeline is the
  practical production tool. Folder `07_openmontage/` is kept per the requested structure but will
  hold whichever tool is approved (see Q1). No new heavy dependency will be added without approval.

## Demo data
- A6. The prompt's "ABC Logistics / Unit 204 / 2021 Freightliner M2 / driver Michael A." is treated
  as a **new isolated fictional demo company**, not one of the 3 existing seed companies, to keep
  the coolant hero story clean. All values remain fictional.
- A7. Demo seeding, if approved, runs only against a **local/staging** DB via `ALLOW_DEMO_SEED`,
  never production. Rollback via `pnpm seed:demo:rollback` scoped to demo domains.

## Scope / capability honesty
- A8. If "schedule repair" and "assign backup unit" are not real completed UI actions, they are
  shown as a **manager note / decision**, not a finished feature (pending Q3 confirmation).
- A9. Website (`truckfixr.com`) embed recommendation is analysis only; the live landing component is
  `LandingSaaS.tsx`. No website changes are made without approval.

## Process
- A10. Nothing is recorded, seeded, exported, or changed in app/website until the 11 planning docs
  are approved. This whole package is reversible (it only adds files under `demo-video/`).
