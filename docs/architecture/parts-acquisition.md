# Parts acquisition architecture

## Implemented now — Parts Intelligence Phase 1

TruckFixr has **two separate, non-overlapping parts flows**. Don't conflate them:

1. **Staff concierge intake** (`server/routers/partsRequests.ts` /
   `server/services/partsRequests.ts`, tables `partsRequests`/`partsOffers`) — a
   human-mediated flow: public self-serve intake, staff (`staffProcedure`) triage,
   customer/supplier links, transaction-status tracking. Links to the legacy
   `cases` table (`partsRequests.caseId → cases.id`), **not** to `maintenanceCases`.
   No fleet-user-facing endpoint exists for it. Unchanged by Phase 1.
2. **Case-embedded parts intelligence** (`server/routers/partIntelligence.ts`,
   tables `parts`/`partRequirements`/`partFitmentAssessments`/
   `partSupplierOptions`) — **new in Phase 1**, described below. Directly linked
   to `maintenanceCases.id`, fleet-user-facing (`protectedProcedure` + a new
   `manage_part_requirements` capability), tenant-scoped the same way the rest of
   the maintenance-case workflow is.

### Entities and relationships

```
maintenanceCases (existing)
  └─< partRequirements (fleetId direct; caseId -> maintenanceCases.id;
      optional repairCycleId -> repairCycles.id)
        ├─ partId -> parts.id (nullable: "unresolved" is a valid state)
        ├─< partFitmentAssessments (append-only; fleetId direct;
        │   partRequirementId -> partRequirements.id)
        └─< partSupplierOptions (fleetId direct;
            partRequirementId -> partRequirements.id)

parts (NOT fleet-scoped — shared catalog, like faultCodeReferences)
```

- **`parts`** — a shared, cross-fleet part-identity catalog (manufacturer, OEM
  number, manufacturer number, superseded number, cross-references, description,
  category). Not fleet-scoped: an OEM part number is a fact about the part, not
  about any one fleet's data, the same reasoning that keeps `faultCodeReferences`
  global. Never populated with an invented number — see "Part identification"
  below.
- **`partRequirements`** — one row per part a maintenance case needs. `fleetId` is
  a direct column (same convention as `maintenanceDecisions`/`repairCycles`/
  `repairOutcomes`), re-verified against the owning `maintenanceCases` row on
  every write. `partId` is nullable: a requirement can exist before its part is
  identified, and staying unresolved is a correct, non-error state.
- **`partFitmentAssessments`** — **append-only** (never updated in place, same
  pattern as `outcomeRevisions`/decision versioning): TruckFixr's own,
  evidence-based fitment determination for a requirement. Distinct from a
  supplier's own claim (below). The most recent row for a requirement is the
  current assessment; every prior one stays queryable.
- **`partSupplierOptions`** — a captured candidate sourcing option. `source` is
  `manual_entry` today (a human types in what a supplier quoted); the column
  exists so a future real supplier integration populates the *same* shape
  instead of a parallel one. `fitmentClaim` is the supplier's own, **unverified**
  text — never copied into or conflated with `partFitmentAssessments`.

### Tenant path (exact)

- `parts`: not customer data — no tenant path, same as `faultCodeReferences`.
- `partRequirements`/`partFitmentAssessments`/`partSupplierOptions`: direct
  `fleetId` column, resolved server-side two ways (never trusting a bare client
  `fleetId`):
  - **Direct fleet input**: `partIntelligence.create`/`listForCase` take a
    `caseId`; fleet is derived from the case (falls back to
    `resolveActiveFleetId` when the client also supplies an explicit `fleetId`,
    checked against real membership either way).
  - **Resource-derived fleet**: every endpoint keyed by `partRequirementId`
    alone (`get`, `transition`, `identify`, `recordFitmentAssessment`,
    `addSupplierOption`, the list/recommendation reads) resolves the
    requirement's *actual* owning fleet first (`getPartRequirementFleetId`,
    the same pattern as `getCaseFleetId`) and checks membership against that,
    never the caller's own "primary" fleet. `partRequirements.id` is a global
    `serial` primary key, so this is safe the same way it is for
    `maintenanceCases.id`.
- See `docs/architecture/tenant-isolation-test-coverage.md` and
  `server/routerFleetScope.test.ts` (`partIntelligence.*` block) for the
  regression tests proving this.
- RLS: `parts`/`partRequirements`/`partFitmentAssessments`/`partSupplierOptions`
  all get the standard post-0012 treatment — RLS enabled, `service_role`-only
  policy (`drizzle/0058_parts_intelligence_phase1.sql`) — the application layer
  is the real tenant boundary, same as everywhere else
  (`docs/security/tenant-isolation.md`).

### Part requirement workflow (`shared/parts/partRequirementWorkflow.ts`)

```
part_required → identifying → fitment_review → fitment_verified → sourcing → options_available
                                    ↕ fitment_ambiguous
```

Exception states: `fitment_ambiguous` (recoverable — more evidence can move it
forward), `part_not_found`, `cancelled` (both terminal). Deliberately stops at
`options_available` — no `ordered`/`in_transit`/`received`/`installed`/
`warranty_claim` states exist yet (Phase 2+, see below).

### Fitment evidence model (`shared/parts/fitmentEvidence.ts`)

Deterministic, no LLM call. States: `not_confirmed`, `ambiguous`, `likely`,
`confirmed` (functionally the CONFIRMED/LIKELY/AMBIGUOUS/NOT_CONFIRMED vocabulary
the product spec describes, in the codebase's existing lowercase-snake-case
style). The core invariant, enforced in code, not just documented:

- Only strong, specific evidence reaches `confirmed`: an exact current
  part-number match, a real OEM catalog match, an explicit manufacturer
  confirmation, or a technician's manual physical confirmation.
- A vehicle-configuration match *or* an aftermarket cross-reference match, alone,
  reaches at most `likely` — **never** `confirmed`. This is the concrete answer
  to "an aftermarket cross-reference alone must never become OEM-confirmed
  fitment" — see `shared/parts/fitmentEvidence.test.ts`.
- Any conflict (an explicit caller-reported conflict, or an internally-detected
  one — a known vehicle-configuration mismatch alongside a positive match) caps
  the result at `ambiguous`, regardless of how much other evidence looks
  positive. A strong signal never overrides a detected conflict.
- No evidence at all → `not_confirmed`. Absence of evidence is never a safe
  default.
- The result always carries `supportingEvidence`, `missingEvidence` (including
  caller-supplied `missingFields` like `["vin", "engineSerialNumber"]`), and
  `conflicts` — the structure a future UI/clarifying-question flow needs to ask
  the right next question (§12 of the product spec), without this phase
  building a conversational agent.

### Part identification (`server/services/partIdentification.ts`)

No AI call, no external supplier API. `identifyPartCandidate` normalizes
whatever identifier the caller supplied (`shared/parts/partNumberNormalization.ts`
— trim/uppercase/strip separators, so `"RE-12345"` and `"re12345"` match) and:

1. looks for an existing `parts` catalog row matching the normalized OEM/
   manufacturer number or one of its cross-references,
2. if none matches but the caller supplied a real number, records it as a
   **new** catalog entry using exactly what was given,
3. if no number was supplied at all (only a free-text description), returns
   `unresolved` — a description is not an identifier, and this phase never
   invents one to fill the gap.

### Recommendation (`shared/parts/recommendation.ts`, `getRecommendedOptions`)

Pure ranking, no optimization algorithm. Fitment tier is the **primary, hard**
sort key — price/ETA/warranty only break ties *within* the same tier, never
across tiers. A requirement with no fitment assessment yet is ranked at the
least-safe tier (`not_confirmed`), never assumed safe by default. See
`shared/parts/recommendation.test.ts` for the "cheaper option never outranks a
better-confirmed fit" proof.

### Confirmed-outcome integration

`partRequirements.caseId` and (optionally) `repairCycleId` are direct FKs, so a
part requirement is already reachable from the same case a confirmed outcome
belongs to. This phase does **not** add a `partRequirementId`/`partId` column to
`repairOutcomes`, and does **not** touch the existing free-text
`repairOutcomes.partsReplaced` field — that stays exactly as it is today, the
legacy/current representation. Progressively linking a confirmed outcome to the
structured part(s) actually installed is documented as future work below, not
implemented now (avoids a forced migration of historical free-text data).

## AI boundary (Phase 1)

No AI/LLM call exists anywhere in this phase's code — `identifyPartCandidate`
and `assessFitment` are both deterministic. This is a deliberate, conservative
choice for a first pass, not an oversight. When AI assistance is added later
(parsing unstructured technician notes, normalizing descriptions, suggesting
clarifying questions), it must follow `.claude/rules/ai-safety.md`'s parts
addition: AI may only ever supply *evidence* for `assessFitment` to evaluate —
never set a fitment state directly, never invent a part number/cross-reference/
supersession/supplier-availability claim, and never be the sole basis for
promoting `likely`/`ambiguous` to `confirmed`. The API layer already reflects
this: `recordFitmentAssessment`'s `source` enum accepts only
`deterministic_rule`/`technician_manual` today — `ai_assisted_extraction` is a
reserved future value, not yet exposed, so there is no way to call the mutation
and claim AI involvement before AI is actually wired in.

## Planned later — Phase 2 (not built in this task)

**Supplier sourcing + option comparison + human approval workflow.** Concretely:
a real supplier integration populating `partSupplierOptions` (`source` beyond
`manual_entry`); an approval step before any commitment; and the state machine
extension `options_available → awaiting_approval → ordered → in_transit →
received → installed`, plus exception states `backordered`/`wrong_part`/
`damaged`/`return_required`/`warranty_claim`. Reconcile new statuses against
`shared/parts/partRequirementWorkflow.ts`'s existing vocabulary rather than a
parallel enum. Also planned: linking an installed structured part back to its
`repairOutcomes` row (additive column, not a rewrite of `partsReplaced`).

## Future intelligence — Parts Intelligence Graph (not built)

A conceptual (not a literal graph-database) relationship for later cross-fleet
learning, once enough confirmed installs/outcomes exist:

```
VEHICLE → FAILURE → DIAGNOSIS → REQUIRED PART → PART IDENTITY → CROSS-REFERENCE
  → SUPPLIER OPTION → SELECTED PART → INSTALLED PART → CONFIRMED OUTCOME → REPEAT FAILURE
```

The existing relational schema (`parts` as the shared identity node,
`partRequirements`/`partFitmentAssessments`/`partSupplierOptions` as fleet-scoped
edges into it) is deliberately shaped so this relationship can be *queried*
later without new infrastructure — no graph database, no new technology
requirement. Supplier-comparison weighting beyond fitment-tier-then-cost
(supplier reliability, repeat-failure rate, part/brand reliability, downtime
exposure) is documented as a future extension in
`shared/parts/recommendation.ts`'s trailing comment, not implemented — downtime
economics specifically would reuse `shared/calculators/downtimeCost.ts` once
that wiring is a deliberate decision, not assumed here.

## What NOT to build yet

No autonomous ordering, no RFQ automation, no supplier email/chat, no PO
creation, no payment, no shipment tracking, no receiving, no returns, no
warranty claims. This phase stops at `options_available` /
`getRecommendedOptions` — a human decides what happens next.
