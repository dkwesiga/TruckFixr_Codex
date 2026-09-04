---
name: truckfixr-parts-fitment
description: Use when working on parts identification, sourcing, or the parts-request/concierge flow (server/services/partsRequests.ts and related routers) to avoid representing an unverified part match as confirmed fitment.
---

# TruckFixr parts-fitment principles

TruckFixr's current parts flow is a **human-mediated concierge** model
(`server/routers/partsRequests.ts`, `server/services/partsRequests.ts`): a customer
or case submits a part need, staff (`staffProcedure`) triage it and generate
supplier/customer links; there is no automated fitment-matching or procurement yet.
See `docs/architecture/parts-acquisition.md` for the future-state architecture this
skill is designed to support.

## Rules

- Never treat a search-result or supplier-listing description as confirmed fitment.
  A part number appearing in a catalog search is, at best, `LIKELY` — not
  `CONFIRMED` — until validated against real vehicle data.
- When available, validate fitment against: VIN, year, make, model, engine, engine
  serial number, transmission, axle, OEM part number, superseded part number, and
  manufacturer cross-reference. Use whichever of these the current request actually
  has — don't fabricate ones it doesn't.
- Conceptual fitment states: `CONFIRMED`, `LIKELY`, `AMBIGUOUS`, `NOT_CONFIRMED`.
  If the code you're adding doesn't yet track a fitment-confidence field, don't
  silently assume `CONFIRMED` for a match — surface uncertainty in the response/UI
  copy at minimum, and flag the missing field as a gap in
  `docs/architecture/parts-acquisition.md`.
- Never represent an aftermarket cross-reference part as OEM-equivalent/OEM-
  confirmed. If the source data doesn't distinguish OEM from aftermarket, treat the
  match as unconfirmed rather than assuming OEM.
- When VIN, engine, or transmission data is unavailable for a request, preserve that
  uncertainty in the stored record and in what's shown to the customer/technician —
  don't fill in a guessed value to complete a form.
- Any new field or state added to the parts-request pipeline that could imply
  confirmed fitment (e.g. a boolean `fitmentConfirmed`) needs a clear source: who/what
  set it to true, and on what evidence.
