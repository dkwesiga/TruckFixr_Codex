# Domain memory (fleet-maintenance)

Durable, evidence-backed lessons only. See `README.md` in this directory for the
promotion rule before adding an entry.

- Decision vocabulary is fixed in code, not free text:
  actions = `continue_monitor | complete_trip_then_inspect | schedule_service |
  pull_from_service | roadside_assistance | tow`; severities = `stable | attention |
  critical`. (`shared/maintenance/caseWorkflow.ts`.)
- `isCriticalAction` treats `pull_from_service`, `roadside_assistance`, and `tow` as
  the critical set requiring the stricter approval path — any new action added to
  the vocabulary needs an explicit decision about whether it belongs in this set.
- Confirmed repair outcomes (`repairOutcomes` table, `confirmedOutcomes.ts`) already
  feed back into future diagnosis prompts for the *same fleet only* — the function
  re-checks `fleetId` defensively even though callers are expected to have already
  scoped it. Treat this defensive re-check as the pattern to copy in any new
  cross-cutting AI-context builder, not boilerplate to remove.
- TruckFixr has two separate parts flows — don't conflate them. `partsRequests.ts`
  is a staff-only concierge intake linked to the legacy `cases` table (not
  `maintenanceCases`), no fleet-user endpoint. `partIntelligence.ts` (Phase 1) is
  case-embedded and fleet-user-facing, linked directly to `maintenanceCases.id`.
  Neither does automated procurement — no ordering/supplier-contact exists in
  either. Don't assume a fitment or supplier-selection field means "AI-confirmed"
  unless the code actually says so; Phase 1's fitment engine
  (`shared/parts/fitmentEvidence.ts`) is fully deterministic, no AI call.
- A supplier's own fitment claim and TruckFixr's own fitment determination are
  different facts, kept in different fields on purpose:
  `partSupplierOptions.fitmentClaim` (raw, unverified supplier text) vs.
  `partFitmentAssessments.state` (evidence-based, deterministic). Never let one
  overwrite or get copied into the other.
- Demo fleets are 3 fixed companies (Maple Route Logistics = 4 vehicles, Peel
  Community Transport = 6, NorthStone Construction = 8; 18 total, 12 users) —
  changing these counts requires updating `validate:demo-seed` in the same change.
- A confirmed repair outcome's "was it actually fixed" question already has a
  dedicated field, not just free text: `repairOutcomes.outcomeState` (`unknown |
  reported | verified | confirmed | failed`, `shared/tadis/outcomeLifecycle.ts`).
  `failed` is reachable from any resolved state and is never deleted — it's kept
  as negative evidence. Don't invent a parallel "resolved" flag; use this field.
- Corrections to an already-verified/confirmed outcome or an existing maintenance
  decision are never in-place `UPDATE`s in this codebase: `addDecision` always
  inserts a new versioned row (`maintenanceDecisions.version`, prior rows marked
  `isCurrent: false`); `reviseVerifiedOutcome` inserts a new `repairOutcomes` row
  and marks the old one `supersededAt`/`supersededByOutcomeId`, logging the change
  in the append-only `outcomeRevisions` table. Expect this pattern (new row +
  supersession pointer, not overwrite) for any new correction path in this area.
- `server/services/maintenanceBoards.ts` → `getCaseTimeline` is the canonical
  provenance read model for one case (original report, AI triage, every decision
  version, repair cycles, outcome-lifecycle events) — prefer extending it over
  re-deriving the chain ad hoc when a new surface needs "explain this case."
