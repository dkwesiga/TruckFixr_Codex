---
name: truckfixr-parts-fitment
description: Use when working on parts identification, sourcing, or the parts-request/concierge flow (server/services/partsRequests.ts and related routers) to avoid representing an unverified part match as confirmed fitment.
---

# TruckFixr parts-fitment principles

TruckFixr has two parts flows — don't conflate them (see
`docs/architecture/parts-acquisition.md` for the full map):

1. The original **human-mediated concierge** model (`server/routers/partsRequests.ts`,
   `server/services/partsRequests.ts`, tables `partsRequests`/`partsOffers`): staff
   (`staffProcedure`) triage a request and generate supplier/customer links. Its
   `partsOffers.fitmentConfirmed`/`fitmentBasis` fields are the **supplier's own
   claim**, entered by staff on the supplier's behalf.
2. **Parts Intelligence Phase 1** (`server/routers/partIntelligence.ts`,
   `shared/parts/*.ts`, tables `parts`/`partRequirements`/
   `partFitmentAssessments`/`partSupplierOptions`) — case-embedded, fleet-user-
   facing, with a real deterministic fitment engine
   (`shared/parts/fitmentEvidence.ts` → `assessFitment`). This is where the rules
   below are actually enforced in code, not just documented.

## Rules

- Never treat a search-result or supplier-listing description as confirmed fitment.
  A part number appearing in a catalog search, or a supplier's own claim
  (`partsOffers.fitmentBasis` / `partSupplierOptions.fitmentClaim`), is at best
  `likely` — never `confirmed` — until `assessFitment` evaluates real evidence.
  These two things are structurally distinct fields in Phase 1: a supplier's claim
  is never copied into or conflated with a `partFitmentAssessments` row.
- `assessFitment`'s confirmed tier requires one of: an exact current part-number
  match, a real OEM catalog match, an explicit manufacturer confirmation, or a
  technician's manual physical confirmation. A vehicle-configuration match or an
  aftermarket cross-reference match, alone, caps at `likely` — enforced in code,
  not just convention; don't add a code path that lets either of those alone
  reach `confirmed`.
- Any conflict between evidence sources caps the result at `ambiguous`, even when
  another signal looks strong. Don't let a new "confidence boost" override a
  detected conflict.
- Fitment states in code: `not_confirmed`, `ambiguous`, `likely`, `confirmed`
  (`shared/parts/fitmentEvidence.ts` `FITMENT_STATES`) — the same concepts as
  `CONFIRMED`/`LIKELY`/`AMBIGUOUS`/`NOT_CONFIRMED`, in the codebase's lowercase
  style. Don't invent a parallel vocabulary.
- Never represent an aftermarket cross-reference part as OEM-equivalent/OEM-
  confirmed. If the source data doesn't distinguish OEM from aftermarket, treat the
  match as unconfirmed rather than assuming OEM.
- When VIN, engine, or transmission data is unavailable for a request, preserve
  that uncertainty (`missingEvidence`/`missingFields`) rather than filling in a
  guessed value to complete an assessment.
- `identifyPartCandidate` (`server/services/partIdentification.ts`) never invents
  a part number — no OEM number, cross-reference, or supersession may be created
  without the caller having supplied it. A request with no identifier stays
  `unresolved`. See the anti-hallucination tests in
  `server/services/partsIntelligence.e2e.test.ts`.
- AI must never set a fitment `state` directly — see `.claude/rules/ai-safety.md`.
