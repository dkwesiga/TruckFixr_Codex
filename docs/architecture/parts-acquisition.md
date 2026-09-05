# Parts acquisition architecture

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

## Deferred — Phase 3 (order execution + fulfillment tracking + receiving)

Not started. Extension points left clean: `approved` (Phase 2's terminal
"selected" state) → `order_request` → `ordered` → `in_transit` → `received` →
`installed` → linkage into `confirmed_outcome`. Also deferred: supplier
integrations beyond the sourcing abstraction, quote ingestion automation, RFQ
automation, inventory, returns, warranty claims. Reconcile any new statuses
against `shared/parts/partRequirementWorkflow.ts`'s existing vocabulary.

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
