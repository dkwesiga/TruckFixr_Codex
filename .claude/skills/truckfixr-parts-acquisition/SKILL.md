---
name: truckfixr-parts-acquisition
description: Use when working on the Parts Intelligence Phase 1 workflow — part requirements, supplier options, or recommendation ranking (server/routers/partIntelligence.ts, server/services/partRequirements.ts, partSupplierOptions.ts, shared/parts/*.ts) — to keep the requirement lifecycle, tenant scoping, and no-procurement boundary intact.
---

# TruckFixr parts-acquisition (Phase 1)

Full architecture: `docs/architecture/parts-acquisition.md`. This skill is the
review checklist for the case-embedded parts-intelligence workflow specifically
(not the older `partsRequests` staff concierge flow — see
`.claude/skills/truckfixr-parts-fitment/SKILL.md` for how the two relate).

## Requirement lifecycle

`shared/parts/partRequirementWorkflow.ts`: `part_required → identifying →
fitment_review → fitment_verified → sourcing → options_available`, with
`fitment_ambiguous` (recoverable), `part_not_found`, `cancelled` as exceptions.
This is an explicit allow-list (`canTransitionPartRequirement`) — anything not
listed is rejected. **Do not add `ordered`/`in_transit`/`received`/`installed`/
`warranty_claim` states without the user explicitly asking for Phase 2** — this
phase stops at `options_available` by design (no procurement).

## Tenant scoping — reuse the existing two patterns, no third style

- `partIntelligence.create`/`listForCase` (direct fleet input): fleet resolved
  from `caseId` via `getCaseFleetId` + `resolveActiveFleetId`, same as
  `maintenanceCases.list`.
- Every endpoint keyed by `partRequirementId` alone (`get`, `transition`,
  `identify`, `recordFitmentAssessment`, `addSupplierOption`, and the read/
  recommendation endpoints): fleet resolved from the requirement's *owning*
  fleet via `getPartRequirementFleetId` + `resolveActiveFleetId` — never from a
  bare client-supplied `fleetId`. This mirrors `maintenanceCases.get`'s
  `getCaseFleetId` pattern exactly; if you add a new endpoint keyed by an id,
  follow the same shape, don't invent a new one.
- Manage-tier mutations additionally require the `manage_part_requirements`
  maintenance capability (`shared/maintenance/permissions.ts`) via
  `hasMaintenanceCapability` — owners/managers hold it implicitly; a granted
  service-advisor/technician needs the explicit grant.
- Add a cross-fleet regression test in `server/routerFleetScope.test.ts`
  (the `partIntelligence` block) for any new exposed procedure, following the
  existing tests there.

## No procurement — hard boundary

Nothing in this workflow may create a purchase order, contact a supplier, send
an RFQ, process payment, or mark something ordered/received/installed. If a
task asks for one of these, it is out of Phase 1's scope — check with the user
before adding it rather than assuming it's a natural extension.

## Recommendation ranking

`shared/parts/recommendation.ts` → `rankSupplierOptions`: fitment tier is the
**primary, hard** sort key; price/ETA/warranty only break ties within the same
tier. Never let a cost-based change in ranking logic cross a fitment-tier
boundary (a cheaper `likely` option must never outrank a `confirmed` one). A
requirement with no fitment assessment yet ranks at `not_confirmed` — never
assume safety by default when evidence is simply absent.

## What NOT to do

- Don't wire an AI/LLM call into `identifyPartCandidate` or `assessFitment` — see
  `.claude/rules/ai-safety.md` for the parts-specific boundary.
- Don't add a supplier API integration, RFQ automation, or scraping — none is
  approved yet.
- Don't touch `repairOutcomes.partsReplaced` or force a migration of its
  existing free-text data to link it to `partRequirements`/`parts` — that's
  documented future work in `docs/architecture/parts-acquisition.md`, not a
  side effect of an unrelated change.
