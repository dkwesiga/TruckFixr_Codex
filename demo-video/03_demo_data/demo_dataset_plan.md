# Demo Dataset Plan

Goal: one clean, fully fictional dataset that carries the coolant-leak story end to end, isolated
from production and from the 3 existing seed companies.

## Hero record (fictional — do not use real values)
```
Company:        ABC Logistics (fictional)
Fleet size:     12 vehicles
Vehicle:        Unit 204
Vehicle type:   2021 Freightliner M2 box truck
Pre-issue state: Scheduled for local delivery route
Driver:         Michael A. (fictional)

Defect:         Coolant leak / low-coolant warning
Driver note:    "Low coolant warning came on during pre-trip. Coolant visible near reservoir."
Photo:          PLACEHOLDER image labeled "coolant residue near reservoir cap/hose area"
Inspection:     Daily (NSC/DVIR) inspection submitted with defect noted
TADIS triage:   Risk level HIGH — overheating risk
Recommended:    Hold before dispatch; inspect reservoir, cap, hoses, clamps; pressure-test cooling system
Manager decision: Schedule repair before dispatch; assign backup unit
Compliance:     Daily inspection submitted; annual inspection due in 42 days
Maint. history: Coolant reservoir replaced previously; PM completed 18 days ago
```

## Field-name mapping to the real app (confirm at seed time)
| Dataset field | Likely app field / location |
|---|---|
| Unit 204 | vehicle `unitNumber` / label on `/truck/:id` |
| Defect + note | defect record from `/inspection` (NSC/DVIR) |
| TADIS triage | `risk_level` = `high`; `compliance_impact`; recommended-steps list on `/diagnosis` / `/defect/:id` |
| History / PM | maintenance history + PM record on `/truck/:id` |
| Annual due in 42 days | compliance/annual-inspection due date on `/truck/:id` |
| Status hold/priority | defect status control on `/defect/:id` |

## Safety rules (hard)
- All values fictional. **No** real VIN (use synthetic, non-decodable), plate, email, phone, invoice.
- Demo emails on a `*.example.com` domain, matching the existing seed convention.
- Seed only on **local or controlled staging**; production seeding stays blocked by default.
- Fully reversible via scoped rollback.

## Two possible sources for the coolant TADIS result (Q2 decision)
1. **Seed-driven** — seed the coolant defect and let TADIS produce the result live. Most authentic;
   depends on TADIS returning a coherent coolant/overheating result for the seeded input.
2. **Curated demo case** — `DriverDiagnosis.tsx` already references demo/sample cases; use/extend a
   curated coolant case so the on-screen result is deterministic for recording. Lower risk for a
   clean take. **Recommended fallback** if (1) is inconsistent.

Either way: no new product capability is invented — coolant is ordinary free-text symptom input the
engine already accepts.

## What must be approved before any seeding
- Create ABC Logistics demo company + Unit 204 + coolant defect + history/compliance on local/staging.
- Choice between seed-driven vs. curated TADIS result (Q2).
See `seed_data_proposal.md` for the exact, minimal, reversible steps (proposed, not executed).
