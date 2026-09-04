# Parts acquisition architecture (future state)

## Current implementation (verified)

TruckFixr today has a **human-mediated parts concierge** flow, not automated
procurement:

- `server/routers/partsRequests.ts` / `server/services/partsRequests.ts`: public
  self-serve intake (`submitPublic`, rate-limited) creates a request in `draft`
  status; staff (`staffProcedure`) triage it, generate customer/supplier links
  (`generateCustomerLink`, `generateSupplierLink`), and track transaction status
  (`markPartsTransactionStatus`).
- A case can be the origin of a request (`route: "case_derived"`) or a request can
  start from a known part number directly.
- There is no fitment-validation, supplier-comparison, ordering, tracking, or
  installation-confirmation logic yet — those stages don't exist in code today.

## Future state machine (proposed — not implemented)

```
PART_REQUIRED
  → IDENTIFYING
  → FITMENT_VERIFIED
  → SOURCING
  → OPTIONS_FOUND
  → AWAITING_APPROVAL
  → ORDERED
  → IN_TRANSIT
  → RECEIVED
  → INSTALLED
  → OUTCOME_CONFIRMED
```

Exception states: `BACKORDERED`, `FITMENT_AMBIGUOUS`, `WRONG_PART`, `DAMAGED`,
`CANCELLED`, `RETURN_REQUIRED`, `WARRANTY_CLAIM`, `FITMENT_FAILED`.

This is a proposal, not a commitment to exact names — if implemented, reconcile
against whatever naming convention `shared/maintenance/caseWorkflow.ts` already
establishes for status enums (see `.claude/rules/database.md`) rather than
introducing a second style.

## Fitment principles (see also `.claude/skills/truckfixr-parts-fitment/SKILL.md`)

Never treat a search-result/catalog description as confirmed fitment. Validate
against whichever of VIN, year, make, model, engine, engine serial number,
transmission, axle, OEM part number, superseded part number, and manufacturer
cross-reference are actually available for the request. Conceptual fitment states:
`CONFIRMED`, `LIKELY`, `AMBIGUOUS`, `NOT_CONFIRMED`. Never represent an aftermarket
cross-reference as OEM-confirmed. Preserve uncertainty when data is missing rather
than defaulting to a guess.

## Decision logic principle (not a scoring formula — document only)

Optimize for **repair completion and vehicle availability**, not lowest purchase
price alone. A future supplier-comparison feature should be able to weigh: fitment
confidence, stock confidence, supplier reliability, ETA, freight, price, warranty,
returnability, supplier history, downtime exposure, repeat-failure history, and
brand reliability. Do not implement an arbitrary weighted-scoring formula unless an
existing product feature already requires one and the user has asked for it.

Long-term learning relationship (a future "Parts Intelligence Graph," not built
today):

```
VEHICLE → FAILURE → DIAGNOSIS → REQUIRED PART → PART NUMBER → ALTERNATIVES
  → SUPPLIER → COST → ETA → INSTALLED PART → CONFIRMED OUTCOME → REPEAT FAILURE
```

## What NOT to build yet

No autonomous ordering, no RFQ automation, no supplier API integration, no
scoring-formula implementation — all P2–P4 per the priority order in `CLAUDE.md`.
This document exists so a future implementation has a place to start from,
consistent with the existing concierge flow, rather than inventing a parallel
system.
