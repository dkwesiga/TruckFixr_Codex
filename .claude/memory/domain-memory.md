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
  `maintenanceCases`), no fleet-user endpoint. `partIntelligence.ts` (Parts
  Intelligence) is case-embedded and fleet-user-facing, linked directly to
  `maintenanceCases.id`. Neither does automated procurement — no ordering/
  supplier-contact/PO exists in either, through requirement → sourcing →
  comparison → human approval. Don't assume a fitment or supplier-selection
  field means "AI-confirmed" unless the code actually says so; the fitment
  and comparison engines (`shared/parts/fitmentEvidence.ts`,
  `recommendation.ts`) are fully deterministic, no AI call.
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
- `FORBIDDEN_MAINTENANCE_CAPABILITIES` (`shared/maintenance/permissions.ts`)
  already reserves `approve_estimate`-class financial/procurement decisions as
  owner/manager-only, never grantable to a technician via capability. Parts
  Intelligence's option-approval endpoints (`partOptionApprovals`) reuse this
  exact policy via `assertManagesFleet` rather than a new capability — treat
  any future "who can approve X financial/procurement decision" question as
  already answered by this precedent, not a fresh design choice.
- Parts Intelligence's `compareOptions` (`shared/parts/recommendation.ts`)
  hard-gates `not_confirmed`/`ambiguous` fitment, unavailable stock, and
  expired quotes OUT of the ranked/recommended list entirely (not just ranked
  last) — a hard-gated option is shown separately for investigation only.
  Currency mismatches are handled by treating a foreign-currency price as
  "cost unknown" for ranking purposes (reusing the existing missing-price
  tie-break), never by FX conversion.
- Parts Intelligence currently stops at human approval. Approval is not an
  order. Procurement execution (Phase 3: order placement, fulfillment
  tracking, receiving, installation linkage) is intentionally deferred until
  customer demand justifies building it — see "When to reopen Phase 3" in
  `docs/architecture/parts-acquisition.md`. Don't add any order/fulfillment
  state or table as a side effect of unrelated work.
