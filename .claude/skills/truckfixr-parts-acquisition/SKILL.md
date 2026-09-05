---
name: truckfixr-parts-acquisition
description: Use when working on the Parts Intelligence workflow — part requirements, sourcing, supplier options, comparison/recommendation, or human approval (server/routers/partIntelligence.ts, server/services/partRequirements.ts, partSupplierOptions.ts, partOptionApprovals.ts, shared/parts/*.ts) — to keep the requirement lifecycle, tenant scoping, and no-procurement boundary intact.
---

# TruckFixr parts-acquisition (Phase 1 + Phase 2)

Full architecture: `docs/architecture/parts-acquisition.md`. This skill is the
review checklist for the case-embedded parts-intelligence workflow specifically
(not the older `partsRequests` staff concierge flow — see
`.claude/skills/truckfixr-parts-fitment/SKILL.md` for how the two relate).

## Requirement lifecycle

`shared/parts/partRequirementWorkflow.ts`: `part_required → identifying →
fitment_review → fitment_verified → sourcing → options_available →
recommendation_ready → awaiting_approval → approved | declined`, with
`fitment_ambiguous` and `needs_more_information` as recoverable exceptions,
`part_not_found`/`cancelled`/`approved`/`declined` as terminal. Explicit
allow-list (`canTransitionPartRequirement`) — anything not listed is rejected.
**`approved` means "the fleet/shop selected this sourcing option," never "an
order was placed."** Do not add `order_request`/`ordered`/`in_transit`/
`received`/`installed`/`warranty_claim` states without the user explicitly
asking for Phase 3 — this workflow stops at `approved`/`declined` by design.

## Tenant scoping — reuse the existing patterns, no new style

- `partIntelligence.create`/`listForCase` (direct fleet input): fleet resolved
  from `caseId` via `getCaseFleetId` + `resolveActiveFleetId`.
- Every endpoint keyed by `partRequirementId` (`get`, `transition`,
  `identify`, fitment/option/approval endpoints): fleet resolved via
  `getPartRequirementFleetId`. `getSupplierOption` (keyed by an option id
  directly) resolves via `getSupplierOptionFleetId`. Same `getCaseFleetId`
  shape throughout — if you add a new endpoint keyed by an id, follow it,
  don't invent a new one.
- Two distinct authorization tiers, both owner/manager-implicit:
  - **Create/manage** (requirements, fitment assessments, supplier options):
    `manage_part_requirements` capability via `hasMaintenanceCapability` —
    grantable to a Service Advisor/Technician.
  - **Approve/decline/request-more-information**: owner/manager **only**, via
    `assertManagesFleet` — reuses the existing policy the capability system
    already enforces for `approve_estimate`
    (`FORBIDDEN_MAINTENANCE_CAPABILITIES`, never grantable to a technician).
    Do not add a grantable capability for approval actions; do not let a
    driver or a granted-but-non-owner/manager user approve.
- Add a cross-fleet regression test in `server/routerFleetScope.test.ts`
  (the `partIntelligence` blocks) for any new exposed procedure.

## No procurement — hard boundary

Nothing in this workflow may create a purchase order, contact a supplier, send
an RFQ, process payment, mark something ordered/received/installed, or place
an order. `approved` is a sourcing decision, not a transaction. If a task asks
for one of these, it is out of scope — check with the user before adding it.

## Sourcing abstraction

`shared/parts/optionSourcing.ts` — `PartOptionSource.sourcePartOptions()`
returns the same `NormalizedSupplierOption` shape `addSupplierOption`
persists. Only `manualEntrySource` (what the router uses) and
`mockPartOptionSource` (tests) exist — no live supplier API, no scraping, no
browser automation. Keep this independent of `recommendation.ts`: a future
real adapter must be swappable without touching fitment/comparison/approval
logic.

## Option comparison / recommendation

`shared/parts/recommendation.ts` → `compareOptions` (not `rankSupplierOptions`
— removed, no callers remain). Returns `{ primaryCurrency, ranked, hardGated,
recommended }`:

- **Hard gates** (excluded from `ranked`/`recommended`, shown separately for
  investigation): fitment `not_confirmed` or `ambiguous`, `availabilityState
  === "unavailable"`, an expired quote (`isOptionExpired`). Never let a new
  factor move a hard-gated option back into the normal ranked list without
  addressing the actual gate reason (new fitment evidence, updated
  availability, a fresh quote).
- **Soft ranking**, within the eligible set only: fitment tier is the
  **primary, hard** partition — price/ETA/warranty/condition only break ties
  *within* the same tier, never across it. A cheaper `likely` option must
  never outrank a `confirmed` one.
- **Currency**: no FX conversion exists or should be added without an
  explicit ask. A currency-mismatched option's price is never numerically
  compared against others (treated as "cost unknown," same as a missing
  price) — it still ranks by fitment tier/non-price factors, and
  `currencyMismatch: true` surfaces the mismatch rather than hiding it.
- A requirement with no fitment assessment yet defaults to `not_confirmed`,
  which is hard-gated — never assume safety by default when evidence is
  simply absent.

## Human approval

`server/services/partOptionApprovals.ts` — append-only, one row per decision.
`recommendedOptionId` must be computed **server-side, in the router**, from
the same `compareOptions`/`getRecommendedOptions` call the read endpoints use
— never accept it from client input (a client could otherwise assert a false
"this was the recommendation," corrupting the provenance record). Never let
an `approved` decision through without a `selectedOptionId`. Never overwrite
a past decision row — a new decision cycle (after `needs_more_information`)
is a new row.

## What NOT to do

- Don't wire an AI/LLM call into `identifyPartCandidate`, `assessFitment`, or
  `compareOptions` — see `.claude/rules/ai-safety.md` for the parts-specific
  boundary (no fabricated price/stock/warranty/ETA/supplier identity/part
  numbers, no autonomous approval).
- Don't add a supplier API integration, RFQ automation, or scraping — none is
  approved yet; extend `shared/parts/optionSourcing.ts` with a new
  `PartOptionSource` implementation only when the user explicitly asks.
- Don't create a normalized `suppliers`/vendor-management table or a
  synthetic supplier-reliability score — not justified until real historical
  performance data exists to populate one.
- Don't touch `repairOutcomes.partsReplaced` or force a migration of its
  existing free-text data to link it to `partRequirements`/`parts` — documented
  future work in `docs/architecture/parts-acquisition.md`, not a side effect
  of an unrelated change.
- Don't implement Phase 3 (order execution/tracking/receiving/installation
  linkage) — leave the extension points documented, don't build them.
