# Telematics ingestion architecture (future state)

## Current implementation (verified)

No telematics ingestion pipeline exists in the codebase today. The only related
references are cost-calculator logic (`shared/calculators/downtimeCost.ts`) and
guest-case-flow copy — neither ingests live device/vehicle sensor data. Fault codes
currently enter the system via manual/driver-reported paths and the
`faultCodeReferences` / `faultCodeReferenceSources` reference-data tables (a lookup
table for known codes, not a live device feed).

## Future architectural placeholder

When telematics ingestion is built, design around these concerns from day one
(these are the reasons ad hoc ingestion pipelines usually need a rewrite):

- **Source provenance** — every ingested event records which device/integration it
  came from, alongside the existing observation provenance model (see
  `docs/architecture/confirmed-outcomes.md`) — a telematics event is another kind of
  "observation," not a privileged one.
- **Timestamp handling** — device-reported timestamp vs. server-received timestamp
  must both be stored; don't collapse to a single `createdAt`.
- **Duplicate events** — devices/gateways commonly re-send; ingestion needs an
  idempotency key (device ID + event ID/sequence, or a content hash) before it can
  safely write, following the existing idempotency pattern already used for Stripe
  webhooks (`stripeWebhookEvents` table).
- **Delayed/out-of-order events** — a device can report hours late (connectivity
  gap); don't assume ingestion order matches occurrence order.
- **Source confidence** — not all signals are equally reliable; store enough to
  distinguish a hard fault code from a derived/inferred condition.
- **Tenant ownership / device-vehicle mapping** — a device maps to exactly one
  vehicle, which maps to exactly one fleet; get this mapping wrong and every
  downstream tenant-isolation guarantee in `docs/security/tenant-isolation.md`
  breaks for that data. This mapping itself must be fleet-scoped and auditable.
- **Normalization** — raw device payloads vs. a normalized internal event shape
  should be stored separately (raw for audit/debugging, normalized for the
  application) — don't normalize destructively in place.
- **Model-input traceability** — if a normalized telematics event ever feeds a TADIS
  prompt, it must be traceable back to the raw event the same way confirmed-outcome
  references trace back to `repairOutcomes` rows today.

## Explicitly out of scope for this pass

No integration code, no schema for telematics tables, and no vendor selection are
part of this harness pass — this document exists so the eventual implementation
starts from a considered design rather than an ad hoc one.
