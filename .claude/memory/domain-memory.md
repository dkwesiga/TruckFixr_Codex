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
- Parts sourcing today is a human-mediated concierge flow (staff triage via
  `partsRequests.ts`), not automated procurement — don't assume a fitment or
  supplier-selection field means "AI-confirmed" unless the code actually says so.
- Demo fleets are 3 fixed companies (Maple Route Logistics = 4 vehicles, Peel
  Community Transport = 6, NorthStone Construction = 8; 18 total, 12 users) —
  changing these counts requires updating `validate:demo-seed` in the same change.
