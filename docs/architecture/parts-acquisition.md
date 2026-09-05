# Parts acquisition architecture

## Product boundary: Parts Intelligence is frozen at Phase 2 (human approval)

**As of the PR that closed out Phase 2, Parts Intelligence is intentionally
stopping at human approval — not because of a technical limitation, but as a
deliberate product decision.** The implemented, supported workflow is:

```
PART REQUIRED → IDENTIFICATION → FITMENT ASSESSMENT → SUPPLIER OPTIONS
  → RECOMMENDATION → HUMAN SELECTION / APPROVAL
```

**Approval does not mean an order has been placed.** TruckFixr currently helps
a fleet determine: what part is required; what candidate part identities
exist; whether fitment is sufficiently supported by evidence; what supplier
options are available; which option TruckFixr recommends; and which option
the human selected. The actual transaction — placing the order, paying,
tracking shipment, receiving the part, confirming installation — remains
outside TruckFixr in this product phase and happens through the fleet's/shop's
existing process, same as before Parts Intelligence existed.

This is a scope decision, not an implementation gap: see "Deferred — Phase 3"
and "What stopping at Phase 2 means" below for exactly what is and isn't
covered, and "When to reopen Phase 3" for how that decision gets revisited.
Do not build any part of Phase 3 as a side effect of unrelated work — see
`.claude/skills/truckfixr-parts-acquisition/SKILL.md`.

## Implemented now — Phase 1 (requirement + identity + fitment foundation) + Phase 2 (sourcing + comparison + approval)

TruckFixr has **two separate, non-overlapping parts flows**. Don't conflate them:

1. **Legacy concierge workflow** (`server/routers/partsRequests.ts` /
   `server/services/partsRequests.ts`, tables `partsRequests`/`partsOffers`) —
   staff-assisted sourcing tied to the legacy `cases` table
   (`partsRequests.caseId → cases.id`), **not** `maintenanceCases`. Public
   self-serve intake, staff (`staffProcedure`) triage, customer/supplier links,
   transaction-status tracking. No fleet-user-facing endpoint exists for it.
   Unchanged by Phase 1 or Phase 2 — kept operational, not migrated, not deleted,
   not made the core of the newer system merely because terminology overlaps.
   Future convergence (if any) is a separate, explicitly-evaluated decision.
2. **Parts Intelligence workflow** (`server/routers/partIntelligence.ts`, tables
   `parts`/`partRequirements`/`partFitmentAssessments`/`partSupplierOptions`/
   `partOptionApprovals`) — maintenance-case-native structured decision workflow,
   described in full below. Directly linked to `maintenanceCases.id`,
   fleet-user-facing (`protectedProcedure`), tenant-scoped the same way the rest
   of the maintenance-case workflow is.

### Entities and relationships

```
maintenanceCases (existing)
  └─< partRequirements (fleetId direct; caseId -> maintenanceCases.id;
      optional repairCycleId -> repairCycles.id)
        ├─ partId -> parts.id (nullable: "unresolved" is a valid state)
        ├─< partFitmentAssessments (append-only; fleetId direct)
        ├─< partSupplierOptions (fleetId direct)
        └─< partOptionApprovals (append-only; fleetId direct;
            recommendedOptionId / selectedOptionId -> partSupplierOptions.id)

parts (NOT fleet-scoped — shared catalog, like faultCodeReferences)
```

- **`parts`** — shared, cross-fleet part-identity catalog. Not fleet-scoped: an
  OEM part number is a fact about the part, not about any one fleet. Never
  populated with an invented number — see "Part identification" below.
- **`partRequirements`** — one row per part a maintenance case needs. `partId`
  nullable (unresolved is a valid state, not an error). Status vocabulary below.
- **`partFitmentAssessments`** — **append-only**: TruckFixr's own,
  evidence-based fitment determination. Distinct from a supplier's own claim.
  The most recent row is the current assessment; every prior one stays
  queryable.
- **`partSupplierOptions`** — a captured candidate sourcing option, extended in
  Phase 2 with condition, normalized availability, ETA type, core charge, and
  freshness fields (below). `source` is `manual_entry` today; the column exists
  so a future real supplier integration populates the *same* shape, not a
  parallel one. `fitmentClaim` is the supplier's own, **unverified** text.
- **`partOptionApprovals`** (Phase 2, new) — **append-only** human-approval
  decisions. `recommendedOptionId` is a snapshot of what TruckFixr was
  recommending at decision time (computed server-side, never client-supplied —
  see "Human approval" below); `selectedOptionId` is the human's actual choice.
  Neither ever overwrites the other, and a later re-ranking never rewrites a
  past decision's snapshot.

### Tenant path (exact)

- `parts`: not customer data — no tenant path, same as `faultCodeReferences`.
- Every other table: direct `fleetId` column, resolved server-side two ways
  (never trusting a bare client `fleetId`):
  - **Direct fleet input**: `partIntelligence.create`/`listForCase` take a
    `caseId`; fleet is derived from the case (`getCaseFleetId`).
  - **Resource-derived fleet**: every endpoint keyed by `partRequirementId`
    (`get`, `transition`, `identify`, fitment/option/approval endpoints)
    resolves the requirement's *actual* owning fleet first
    (`getPartRequirementFleetId`); `getSupplierOption` (keyed by an option id
    directly) resolves via `getSupplierOptionFleetId`. Same pattern as
    `getCaseFleetId` throughout — no third authorization style. All relevant
    primary keys are global `serial` sequences, so this is safe.
- See `docs/architecture/tenant-isolation-test-coverage.md` and
  `server/routerFleetScope.test.ts` (`partIntelligence.*` blocks) for the
  regression tests proving this, including the Phase 2 approval endpoints.
- RLS: all five tables get the standard post-0012 treatment — RLS enabled,
  `service_role`-only policy (`drizzle/0058_parts_intelligence_phase1.sql`,
  `0059_parts_intelligence_phase2.sql`) — the application layer is the real
  tenant boundary (`docs/security/tenant-isolation.md`).

### Part requirement workflow (`shared/parts/partRequirementWorkflow.ts`)

```
part_required → identifying → fitment_review → fitment_verified → sourcing
  → options_available → recommendation_ready → awaiting_approval
  → approved | declined
                              ↕ fitment_ambiguous            ↕ needs_more_information
```

Exception/recoverable states: `fitment_ambiguous`, `needs_more_information`
(both recoverable — more evidence/options can move the requirement forward
again); `part_not_found`, `cancelled`, `approved`, `declined` (terminal).
**`approved` means "the fleet/shop selected this sourcing option" — it does
NOT mean an order was transmitted, a supplier accepted it, payment occurred, or
inventory was reserved.** No `ordered`/`in_transit`/`received`/`installed`/
`warranty_claim` states exist yet — that's Phase 3 (order execution), out of
scope here.

### Fitment evidence model (`shared/parts/fitmentEvidence.ts`) — unchanged from Phase 1

States: `not_confirmed`, `ambiguous`, `likely`, `confirmed`, deterministic, no
LLM call. Only exact-part-number/OEM-catalog/manufacturer/technician-confirmed
evidence reaches `confirmed`; a vehicle-configuration or cross-reference match
alone caps at `likely`; any conflict caps at `ambiguous`. See
`shared/parts/fitmentEvidence.test.ts`.

### Part identification (`server/services/partIdentification.ts`) — unchanged from Phase 1

No AI call, no external supplier API. Never fabricates a number; a
description-only request stays `unresolved`.

### Sourcing abstraction (`shared/parts/optionSourcing.ts`) — new in Phase 2

`PartOptionSource.sourcePartOptions(context)` returns
`NormalizedSupplierOption[]` — the same shape `addSupplierOption` persists, so
a future real adapter is a drop-in replacement, never a parallel write path.
Implemented sources today: `manualEntrySource` (what the router actually uses
— a human enters what a supplier told them) and `mockPartOptionSource` (tests
only). **No live source exists** — no supplier API, no scraping, no browser
automation. Deliberately independent of `shared/parts/recommendation.ts`: a
future adapter is replaceable without touching fitment, comparison, or
approval logic. See `shared/parts/optionSourcing.test.ts`.

### Option normalization — extended `partSupplierOptions` fields (Phase 2)

Beyond Phase 1's price/currency/freight/stockStatus/eta/warranty/returnable/
fitmentClaim, Phase 2 adds:

| Concern | Field(s) | Notes |
|---|---|---|
| Minimum supplier identity | `supplierContact`, `supplierLocation`, `externalSupplierId` | Kept as columns, not a new `suppliers` table — nothing yet requires deduplicating a supplier across options or scoring reliability (see below); revisit if that changes. |
| Condition | `conditionType`: `oem_new\|aftermarket_new\|remanufactured\|rebuilt\|used\|unknown` | Distinct risk profiles — never used to auto-prefer a cheaper condition over a better-confirmed fit. |
| Availability | `availabilityState` (normalized: `in_stock\|limited_stock\|orderable\|backordered\|unavailable\|unknown`) alongside existing `stockStatus` (supplier's raw words, kept verbatim) | A normalized reading, not a guarantee. |
| ETA | `etaType` (`pickup_today\|same_day_delivery\|estimated_date\|lead_time_days\|unknown`), `etaLeadTimeDays`, existing `etaAt` for a concrete date | A vague claim is never silently converted into a precise date. |
| Total cost | `coreChargeCents` (added to Phase 1's `priceCents`/`freightCents`) | See "Total acquisition cost" below. |
| Freshness | `quoteExpiresAt`, `lastVerifiedAt` | See below — no arbitrary invented expiration window; only used when the supplier/capturer actually provided one. |

Missing fields stay explicitly missing (`null`) — nothing is defaulted to imply
verified information.

### Option comparison + recommendation (`shared/parts/recommendation.ts`, `compareOptions`)

Replaces Phase 1's `rankSupplierOptions` (removed — no remaining callers).
Returns `{ primaryCurrency, ranked, hardGated, recommended }`:

- **Hard eligibility gates** (never a normal recommendation, shown separately
  for investigation only): fitment `not_confirmed` or `ambiguous` (this
  codebase's "ambiguous" already *is* "conflicting evidence" — both hard-gate
  reasons the product spec names), `availabilityState === "unavailable"`, an
  expired quote (`isOptionExpired`, checked against `quoteExpiresAt`).
- **Soft ranking**, within the eligible set only: fitment tier first (hard
  partition: `confirmed` < `likely`, never crossed by price), then
  `estimatedAcquisitionCostCents` (`priceCents + freightCents +
  coreChargeCents` — named to avoid implying a true landed cost; no tax model
  exists, so none is invented), then ETA quality, then warranty/returnability.
- **Currency safety**: no FX conversion. The "primary currency" is the most
  common currency among eligible options; anything in a different currency is
  never numerically cost-compared (treated as "cost unknown" for ranking,
  exactly like a missing price) but still ranks normally by fitment tier and
  non-price factors, and is flagged `currencyMismatch: true` in the output.
- **Explainability**: every ranked option carries a `rationale: string[]`
  built only from fields actually present (fitment tier, cost when comparable,
  availability, condition, warranty/returnability) — never an invented
  narrative ("saves 2 days") unless the underlying data supports that specific
  comparison.
- A requirement with no fitment assessment yet defaults to `not_confirmed`,
  which is hard-gated — absence of evidence is never a safe default and never
  silently becomes "the recommendation."

See `shared/parts/recommendation.test.ts` (hard gates, ranking, currency) and
`server/services/partsIntelligence.e2e.test.ts` (end-to-end through real
service calls, including money/currency at the service layer).

### Human approval (`server/services/partOptionApprovals.ts`, Phase 2, new)

`recordApprovalDecision` inserts one **append-only** `partOptionApprovals` row
per decision (`approved`/`declined`/`needs_more_information`) — never updates a
prior one. `recommendedOptionId` is computed **server-side by the router**
(via the same `compareOptions`/`getRecommendedOptions` the read endpoints use)
at the moment of decision, never accepted from client input — a client
asserting "this was the recommendation" would corrupt the exact provenance
record this exists to protect. `selectedOptionId` is the human's actual
choice, which may differ from the recommendation; both are preserved,
distinct columns, and neither overwrites the other — the relationship the
future outcome-learning system needs (did following vs. overriding the
recommendation correlate with a better confirmed outcome?) is intact by
construction, though the learning logic itself is not built.

Gating: approving/declining/requesting-more-information is **owner/manager
only** (`assertManagesFleet`), reusing the *existing* policy the capability
system already enforces for `approve_estimate`
(`FORBIDDEN_MAINTENANCE_CAPABILITIES` in `shared/maintenance/permissions.ts` —
that capability can never be granted to a technician). No new grantable
capability was introduced for this — approving a sourcing option is the same
category of financial/procurement-adjacent decision. Creating/comparing
options remains gated by the existing `manage_part_requirements` capability
(grantable to a Service Advisor/Technician).

`approveOption` requires a `selectedOptionId` (an approval with nothing
selected is rejected). `declineOptions`/`requestMoreInformation` select
nothing. `needs_more_information` is recoverable — the requirement can return
to `fitment_review`/`sourcing` and go through another comparison/approval
cycle, and the full history of prior decisions remains queryable
(`listApprovalHistory`).

### Confirmed-outcome integration — unchanged from Phase 1

Still does **not** add a `partRequirementId`/`partId` column to
`repairOutcomes`, and does **not** touch `repairOutcomes.partsReplaced`. An
approved option (`partOptionApprovals.selectedOptionId`) is one hop from a
`repairOutcomes` row via `partRequirements.caseId`/`repairCycleId`, but linking
"the part actually installed" to a confirmed outcome is Phase 3 work (order
execution → installation), not built here.

## AI boundary

No AI/LLM call exists anywhere in this codebase's parts logic today —
`identifyPartCandidate`, `assessFitment`, and `compareOptions` are all
deterministic. When AI assistance is added later (parsing supplier quotes,
normalizing descriptions, extracting ETA, summarizing tradeoffs, generating
clarifying questions), per `.claude/rules/ai-safety.md`:

- AI may only ever supply *evidence* for `assessFitment` to evaluate — never
  set a fitment state directly.
- AI must never fabricate price, stock, warranty, ETA, supplier identity, or
  part numbers, and must never override deterministic fitment evidence.
- AI must never autonomously approve an option or place an order.
- If AI extraction is introduced, preserve the chain **raw source → AI
  extracted value → verified/non-verified status** — extraction is never
  treated as fact on its own.

The API layer already reflects this today: `recordFitmentAssessment`'s
`source` enum accepts only `deterministic_rule`/`technician_manual` —
`ai_assisted_extraction` is a reserved future value, not yet exposed.

## Deferred: Parts Intelligence Phase 3 — **NOT IMPLEMENTED**

Nothing below this line exists in code today. This section describes a
*potential* future workflow, not a build in progress — no partial states, no
speculative columns, no half-wired router endpoints exist for any of it, and
none should be added until the trigger conditions below are met and a human
explicitly asks for this phase.

Potential future workflow (conceptual only):

```
APPROVED_OPTION → ORDER_REQUEST → ORDERED → IN_TRANSIT → RECEIVED → INSTALLED
  → CONFIRMED_OUTCOME
```

Also out of scope until Phase 3 is opened: supplier integrations beyond the
sourcing abstraction, quote ingestion automation, RFQ automation, inventory,
returns, warranty claims, payment. Reconcile any new statuses against
`shared/parts/partRequirementWorkflow.ts`'s existing vocabulary when/if this
work starts.

### What stopping at Phase 2 means TruckFixr does not currently capture

Because the workflow stops at `approved`/`declined`, TruckFixr does not
record:

- actual purchase-order transmission to a supplier,
- supplier acknowledgement of an order,
- the actual date an order was placed,
- actual fulfillment/shipment status,
- actual delivery date,
- received quantity,
- damaged- or wrong-part receipt,
- installed-part confirmation linked directly back to the selected supplier
  option,
- quoted-vs-actual supplier performance (ETA accuracy, fill rate, etc.),
- any automatic linkage from an approved option to a confirmed repair outcome.

**None of these gaps prevent Parts Intelligence from doing its actual job.**
The product's value in this phase is decision support — helping a human reach
a good, evidence-based, well-compared sourcing decision quickly — not
transaction execution. A fleet can still place the order, track it, and
receive the part through whatever process it already uses; Parts Intelligence
simply doesn't (yet) observe or record that part of the process.

### When to reopen Phase 3

Phase 3 is **demand-triggered, not calendar-triggered** — it should not be
built merely because the architecture supports it or because a roadmap slot
opens up. Reopen it when real usage shows evidence such as:

- pilot fleets repeatedly ask TruckFixr to place or manage parts orders,
- fleet users approve supplier options but then struggle with the manual
  hand-off to actually ordering,
- approved-option volume becomes high enough that order tracking is
  operationally significant on its own,
- fleets explicitly request receiving or shipment visibility,
- supplier-performance data becomes necessary to keep recommendation quality
  improving (i.e., Phase 2's recommendations are limited by not knowing which
  suppliers actually deliver as quoted),
- commercial customers indicate procurement execution materially affects
  willingness to pay.

Until one of these shows up in real usage, the near-term priority stays
pilot/customer usage, sales conversion, confirmed-outcome growth, and product
gaps surfaced by actual fleets using Phase 1/2 — not building Phase 3 ahead of
demonstrated need.

### Why Phase 3 can be added later without redesigning Phase 1/2

The current data model already supports the relationship a future Phase 3
needs, without any destructive schema change:
`partOptionApprovals.selectedOptionId` already points at the exact
`partSupplierOptions` row a human chose, and `partRequirements.caseId`
already links that decision back to a `maintenanceCases` row (and, via
`repairCycleId`, to a repair cycle). A future `ORDER_REQUEST`/`ORDERED`/etc.
table (or new terminal states) would attach *additively* to
`partOptionApprovals`/`partRequirements` by id — nothing about the existing
append-only approval history, the requirement lifecycle, or the fitment/
recommendation engines would need to change shape to support it. This
document does not add any new table or column now in anticipation of that —
only the existing relationship is noted here.

## Future — supplier reliability + outcome learning + Parts Intelligence Graph

**Supplier reliability**: no synthetic score exists or should be created.
`partSupplierOptions`'s per-column supplier identity (not a normalized
`suppliers` table — see above) is deliberately light because there is no
historical performance data yet to justify more. Once confirmed
installs/outcomes accumulate, future evidence could support: quoted-vs-actual
ETA, wrong-part rate, cancellation rate, return rate, warranty-claim rate,
repeat-purchase success — never populate a placeholder score in the meantime.

**Outcome learning**: `partOptionApprovals` already preserves
recommended-vs-selected distinctly (see above) specifically so a future system
can correlate "did the fleet follow or override the recommendation" against
the eventual confirmed outcome. The learning algorithm itself is not built.

**Parts Intelligence Graph** (conceptual, not a literal graph database):

```
VEHICLE → FAILURE → DIAGNOSIS → REQUIRED PART → PART IDENTITY → CROSS-REFERENCE
  → SUPPLIER OPTION → SELECTED PART → INSTALLED PART → CONFIRMED OUTCOME → REPEAT FAILURE
```

The relational schema (`parts` as the shared identity node,
`partRequirements`/`partFitmentAssessments`/`partSupplierOptions`/
`partOptionApprovals` as fleet-scoped edges into it) is shaped so this
relationship can be *queried* later without new infrastructure. Downtime
exposure / urgency / vehicle utilization / replacement-vehicle availability
are documented extension points in `shared/parts/recommendation.ts`'s trailing
comment — would reuse `shared/calculators/downtimeCost.ts` once wiring that in
is a deliberate decision, not assumed here.

## What NOT to build yet

No autonomous ordering, no RFQ automation, no supplier email/chat/scraping/
browser automation, no PO creation, no payment, no shipment tracking, no
receiving, no returns, no warranty claims, no synthetic supplier-reliability
scores, no FX conversion. This phase stops at `approved` — a human decided,
nothing was transmitted anywhere.
