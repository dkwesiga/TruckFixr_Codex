# Repair Shop Partner Profile — MVP Spec

Status: Draft for review
Owner: Product
Branch: `claude/repair-shop-profile-mvp`

## 1. Summary

Introduce a **partner repair shop** persona (flagship example: **Mr Diesel Inc**) that can
capture a vehicle, raise an issue, run AI triage, and record the confirmed repair
outcome — **independent of any customer fleet** — in order to build TruckFixr's shared,
curated diagnostic knowledge base.

The MVP deliberately reuses existing machinery. A partner is modeled as a normal tenant
(`fleets` row) with a partner flag. Their triage runs through the existing diagnosis path
unchanged. The one genuinely new backend surface is a **bridge** that promotes a partner's
`repairOutcomes` row into a candidate `faultCodeReferences` record, which then flows through
the existing `/admin/fault-codes` review queue before it can reach any customer-facing
diagnosis.

Non-goal for this MVP: lead routing / marketplace, public attribution bylines, rewards or
bounties, and a polished walk-in vehicle capture UX. These are named in §8 as roadmap.

## 2. Background — what already exists

The learning loop this feature feeds is already built:

- **`repairOutcomes`** (`drizzle/schema.ts`) — captures `confirmedFault`, `repairPerformed`,
  `partsReplaced`, `aiDiagnosisCorrect`, `confirmationState`, `source`, `returnedToServiceAt`,
  `recordedByUserId`, scoped by `fleetId`.
- **`diagnostics.feedback`** procedure (`server/routers/diagnostics.ts`) — already defines a
  `mechanic_confirmed` confirmation state and persists normalized outcomes (today only for
  `owner`/`manager`).
- **Loop A — per-fleet confirmed outcomes** (`server/services/confirmedOutcomes.ts`) — ranks a
  fleet's own confirmed repairs by similarity and injects the top few into that fleet's next
  diagnosis prompt, with a defensive cross-fleet leak guard.
- **Loop B — curated fault-code references** (`faultCodeReferences`,
  `faultCodeReferenceSources`, `faultCodeReferenceApprovals`, reviewed at `/admin/fault-codes`)
  — the **global**, human-approved knowledge base that feeds every fleet's customer-facing
  diagnosis. Records start `needs_review`; only `approved` records reach diagnosis.

**Key architectural insight:** "build the knowledge base, independent of the fleet" is
**Loop B**. A partner is a new *source of candidate references* into a review queue that
already exists — not a hole in the tenant guard.

## 3. Goals & non-goals

### Goals
- A partner shop can run AI triage on vehicles they capture, independent of any customer fleet.
- A partner can promote a confirmed outcome into a candidate global reference.
- Partner-contributed candidates are **curator-gated** (`needs_review → approved`) before they
  reach any customer-facing diagnosis.
- Tenant isolation for existing customer fleets is unchanged (Loop A stays fleet-private).

### Non-goals (MVP)
- Lead routing / shop marketplace / fleet↔shop referral.
- Customer-facing "Validated by <shop>" attribution bylines.
- Rewards, bounties, or contribution leaderboards.
- Polished walk-in vehicle capture flow (start with partner pre-creating reference vehicles).
- Partner self-service signup (partners are provisioned by TruckFixr admin in the MVP).

## 4. Personas & the two knowledge loops

| | Loop A — per-fleet outcomes | Loop B — curated references |
| --- | --- | --- |
| Visibility | Private to one fleet | Global, all fleets |
| Trust gate | Auto-ranked by similarity | Human `needs_review → approved` |
| Fed by | Any fleet's owner/manager | **Partner shops (new)** + curated seeds |
| Table | `repairOutcomes` | `faultCodeReferences` |

A normal customer's outcomes stay in Loop A. **Only a partner's outcomes are eligible to be
promoted into Loop B**, and only via explicit action + admin approval.

## 5. Decisions (locked for MVP)

1. **Partner tenant, not global superuser.** Mr Diesel is a `fleets` row with `isPartner = true`.
   Their captured vehicles are their fleet's vehicles → the tenant guard stays intact and no
   nullable-fleet change is needed on `vehicles`.
2. **Explicit per-outcome promotion, not auto-queue.** Promotion is a deliberate action on a
   single outcome. Protects quality and PII; cost is one click.
3. **Curator-gated.** Promoted candidates land in `faultCodeReferences` as `needs_review` and
   flow through the existing `/admin/fault-codes` approval flow. No new gate is built.
4. **Partner triage metered under a partner plan** — free-to-partner but bounded so model cost
   stays predictable (reuse `fleets.aiSessionMonthlyLimit`).
5. **Attribution is internal provenance only in v1** (via `faultCodeReferenceSources`), not a
   customer-facing byline.

## 6. Data model deltas

Small and additive. No destructive migrations.

### 6.1 `fleets` — partner flag
```sql
ALTER TABLE "fleets" ADD COLUMN IF NOT EXISTS "isPartner" boolean NOT NULL DEFAULT false;
```
Drizzle (`drizzle/schema.ts`):
```ts
isPartner: boolean("isPartner").default(false).notNull(),
```
- Set `true` for Mr Diesel Inc only (admin-provisioned in MVP).
- Gates: eligibility to promote outcomes to Loop B, and partner plan metering.

### 6.2 `repairOutcomes` — promotion provenance (additive columns)
```sql
ALTER TABLE "repairOutcomes"
  ADD COLUMN IF NOT EXISTS "promotedReferenceId" integer,
  ADD COLUMN IF NOT EXISTS "promotedAt" timestamp,
  ADD COLUMN IF NOT EXISTS "promotedByUserId" integer;
```
- Existing `source` gets a new allowed value `"partner_shop"` for partner-captured outcomes.
- `confirmationState` reuses the existing `mechanic_confirmed` value.
- `promotedReferenceId` links the outcome to the `faultCodeReferences` candidate it seeded
  (enables retraction traceability — §7 risk).

### 6.3 `faultCodeReferences` — no schema change
Reuse as-is. A promoted candidate is inserted with:
- `reviewStatus = 'needs_review'`
- `sourceId` → a `faultCodeReferenceSources` row identifying the partner (see 6.4)
- `metadata` → `{ originRepairOutcomeId, partnerFleetId, promotedByUserId }`

### 6.4 `faultCodeReferenceSources` — partner as a source
No schema change. On first promotion (or once at provisioning) create a source row:
- `sourceType = 'partner_shop'`
- `title = 'Mr Diesel Inc'`
- `metadata = { partnerFleetId }`

## 7. Flows

### 7.1 Partner capture → triage → outcome
1. Partner (role `owner`/`manager` **within the partner tenant**) creates/selects a vehicle in
   their own fleet. MVP: pre-created reference vehicles; walk-in UX deferred.
2. Partner raises an issue and runs AI triage — existing diagnosis path, unchanged. Counts
   against the partner plan's `aiSessionMonthlyLimit`.
3. Partner records the outcome via the existing feedback/outcome path. Persisted as a
   `repairOutcomes` row with `source = 'partner_shop'`, `confirmationState = 'mechanic_confirmed'`.

At this point the outcome lives in the **partner's own Loop A** (private searchable history) —
useful to the shop, invisible to other tenants. Nothing is global yet.

### 7.2 Promote to knowledge base (the one new surface)
1. On a partner outcome, partner clicks **"Propose for knowledge base."**
2. UI collects the *generalizable* reference shape only — code system + code, category, title,
   summary, recommended checks, risk level — **explicitly separated from any customer/VIN data**
   (see §9 PII boundary).
3. Backend inserts a `faultCodeReferences` row (`needs_review`) + ensures a partner
   `faultCodeReferenceSources` row, and stamps `repairOutcomes.promotedReferenceId/promotedAt/
   promotedByUserId`.
4. Candidate appears in `/admin/fault-codes` "Needs review". A TruckFixr reviewer approves,
   rejects, reopens, or archives — writing to `faultCodeReferenceApprovals` as today.
5. Only after `approved` does the reference enter customer-facing diagnosis context (Loop B).

### 7.3 Authorization
- Only tenants with `isPartner = true` may call the promote mutation; enforce server-side.
- Promotion actor must be `owner`/`manager` **of the partner tenant**.
- Approval remains restricted to the existing admin/curator review path — partners cannot
  self-approve.

## 8. Roadmap (explicitly out of MVP)

- **Lead routing / marketplace** — the commercial north star. Fleet triage flags "needs a shop"
  → routed to a partner. Needs geography, fleet opt-in, liability model. Separate product.
- **Partner impact dashboard** — "your approved references were used in N diagnoses across M
  fleets; AI-correct rate X%." Reuses `adminMetrics`/analytics patterns. Strong Tier-1 incentive,
  fast follow.
- **Public opt-in attribution** — "Validated by <shop>" once the blame/liability posture is
  settled.
- **Walk-in vehicle capture UX** and **partner self-service onboarding**.

## 9. Risks & mitigations

- **PII bleed on captured/walk-in trucks (top risk).** A global reference must be generalizable
  (fault → cause → fix → parts), never "this VIN / this customer." Mitigation: the promote UI
  presents a distinct reference-shaped form (§7.2 step 2) that does not carry VIN/customer fields
  into `faultCodeReferences`; reviewers reject anything customer-specific at the gate.
- **One shop's practice becoming everyone's guidance.** Mitigation: the curator gate. Watch queue
  volume — an eager partner can swamp review; consider a per-period promotion cap if needed.
- **Retraction.** A later-discovered bad reference must be traceable to its origin.
  `repairOutcomes.promotedReferenceId` + reference `metadata.originRepairOutcomeId` give a
  two-way link; archiving the reference via the existing flow removes it from diagnosis context.
- **Model cost.** Partner triage is free-to-partner; bound it with `aiSessionMonthlyLimit` so cost
  stays predictable.
- **Incentive durability.** MVP leans on intrinsic tool value (free, genuinely useful triage +
  private searchable history). Recognition/impact and commercial leads are deferred but named so
  the partner sees the trajectory.

## 10. Test plan (extend existing suites)

- `server/services/confirmedOutcomes.test.ts` — a partner's outcomes do **not** leak into another
  fleet's Loop A context (cross-fleet guard still holds with partner source).
- `server/rlsPolicies.test.ts` — non-partner tenants cannot call promote; partners cannot
  self-approve references.
- New: promote bridge — a `partner_shop` outcome creates exactly one `needs_review`
  `faultCodeReferences` row with correct `sourceId`/`metadata` and stamps the outcome's
  `promotedReferenceId`; a non-partner outcome is rejected.
- New: an unapproved promoted candidate never appears in customer-facing diagnosis context; an
  approved one does.

## 11. Suggested build sequence

1. `isPartner` flag + partner plan metering; provision Mr Diesel Inc.
2. Allow partner-tenant `owner`/`manager` to capture vehicle, triage, and record
   `source = 'partner_shop'` outcomes (mostly reuse).
3. Promote bridge: mutation + `repairOutcomes` provenance columns + partner
   `faultCodeReferenceSources` row.
4. Minimal promote UI on a partner outcome (reference-shaped form with PII boundary).
5. Extend tests (§10). Verify approved-only candidates reach diagnosis.
6. (Fast follow, not MVP) partner impact dashboard.
