# TruckFixr Fleet AI — Engineering Context

This file is the persistent context for Claude Code sessions in this repo. Keep it short;
put detail in `docs/architecture/` and link to it instead of copying it here.

## Product

TruckFixr helps commercial fleets answer: **"What should we do with this vehicle now?"**
It turns driver-reported defects, DVIR findings, photos, fault codes, maintenance history,
and technician observations into a maintenance decision, while preserving safety,
uncertainty, and provenance, with human escalation always available.

Decision vocabulary actually used in code (`shared/maintenance/caseWorkflow.ts`):
`continue_monitor`, `complete_trip_then_inspect`, `schedule_service`,
`pull_from_service`, `roadside_assistance`, `tow`. Severities: `stable`, `attention`,
`critical`. Do not invent new decision/severity names — extend this vocabulary only with
evidence from the domain owner, and update the shared module, not ad hoc strings.

## Core domain model (as implemented, `drizzle/schema.ts`)

- **fleets** — the tenant. Every customer-data table is scoped by `fleetId`, either
  directly or via a join to a fleet-scoped parent — e.g. `partsRequests` has no
  `fleetId` column of its own and scopes only through its `caseId` →
  `maintenanceCases.fleetId`. Don't assume a raw `fleetId` column exists on every
  table without checking `drizzle/schema.ts`.
- **users** + **companyMemberships** — role is `owner` | `manager` | `driver` per fleet;
  `internalAdminRole` (`super_admin` | `admin` | `read_only_viewer`) marks TruckFixr staff,
  independent of fleet role.
- **vehicles**, **vehicleAssignments** — driver-to-vehicle access, sometimes temporary.
- **inspections**, **inspectionPhotos**, **inspectionFlags** — DVIR-style driver inspections.
- **defects**, **defectActions**, **tadisAlerts**, **aiTriageRecords** — the AI
  triage/early-warning layer (TADIS).
- **maintenanceCases** (statuses in `shared/maintenance/caseWorkflow.ts`) — the case
  spine: `reported → triaging → decision_pending → monitoring/scheduled →
  out_of_service/in_repair → awaiting_parts → ready_for_return → completed/closed`,
  plus repair-shop states `awaiting_follow_up`, `return_job`. `reopened`/`cancelled`
  exist off the happy path. Terminal: `closed`, `cancelled`, `return_job`.
- **repairOutcomes** — confirmed repair outcomes (see below).
- **partsRequests**/**partsOffers** — staff-only concierge parts sourcing, linked
  to the legacy `cases` table, not `maintenanceCases`. **partRequirements**/
  **parts**/**partFitmentAssessments**/**partSupplierOptions** — Parts
  Intelligence Phase 1, case-embedded and fleet-user-facing, with a
  deterministic (no-AI) fitment engine. These are two separate flows — see
  `docs/architecture/parts-acquisition.md`.
- **subscriptions**, **plans**, **planFeatures** — billing/entitlements (Stripe).

Do not rename or reinterpret these entities without checking `drizzle/schema.ts` first —
naming here must match the implementation, not aspirational docs.

## Architecture (verified)

- Frontend: React 19 + Vite, in `client/`.
- Backend: Node.js + Express + tRPC, in `server/` (`server/_core/index.ts` entrypoint,
  procedures in `server/routers/*.ts`, business logic in `server/services/*.ts`).
- Shared domain logic (framework-free, unit-testable): `shared/`.
- DB: Postgres via Drizzle ORM (`drizzle/schema.ts`, migrations in `drizzle/*.sql`).
  Auth/storage: Supabase. Payments: Stripe. Email: Resend.
- tRPC procedure tiers (`server/_core/trpc.ts`): `publicProcedure` (no auth) →
  `protectedProcedure` (any authenticated user) → `adminProcedure` (requires
  `ctx.user.role` is `owner`/`manager` — this check alone does **not** scope to a
  specific fleet) → `staffProcedure` (TruckFixr internal staff only,
  `isStaffAdminUser`, crosses fleet boundaries — used for admin/observability routes).
  **`adminProcedure`'s middleware checks role only.** Every resolver behind it must
  still explicitly resolve and verify the caller's fleet itself
  (`resolveActiveFleetId` / `assertManagesFleet` / `assertVehicleInFleet` in
  `server/services/maintenanceTenantScope.ts`, or the equivalent in
  `companyAccess.ts`) — do not assume the procedure tier alone enforces tenant
  scoping.
- Build/deploy: `render.yaml` (Render, `autoDeploy`). CI: `.github/workflows/ci.yml`
  (typecheck + tests + gitleaks secret scan + non-blocking `pnpm audit`), plus a
  separate `rls-isolation.yml` workflow.

## Critical invariants

1. **Tenant isolation is enforced at the application layer, not by Postgres RLS.**
   The app's DB role owns the tables and bypasses RLS. Every customer-data query MUST
   add an explicit `WHERE fleetId = ...` (or assignment/driver check) derived from
   server-side session context — never from client-supplied fleet/company IDs. RLS is
   defense-in-depth for the Supabase data-API path only. Full detail:
   `docs/security/tenant-isolation.md`. Verified by `pnpm verify:rls`.
2. **`staffProcedure` is the only sanctioned cross-fleet boundary.** Any new
   cross-fleet read/write must go through `isStaffAdminUser`, not a new ad hoc check.
3. **Never overwrite or destroy provenance**: original driver observation, original
   evidence, original AI assessment + confidence, fleet/manager decision, technician
   diagnosis, parts installed, repair performed, confirmed outcome. Corrections are
   additive (new row/status), never in-place mutation of history. See
   `docs/architecture/confirmed-outcomes.md`.
4. **AI output is a recommendation, not a diagnosis.** `aiTriageRecords` /
   `repairOutcomes.aiDiagnosisCorrect` track model confidence and correctness
   separately from human confirmation. Never surface model output to a driver/fleet
   as certain without the confirmed-outcome step. See `.claude/rules/ai-safety.md`.
5. **No silent schema mutation.** All schema changes go through Drizzle migrations in
   `drizzle/*.sql` + `drizzle.config.ts`, reviewed per
   `.claude/workflows/database-change.md`. Never hand-edit a database in place, never
   run `pnpm db:push` against a database you haven't identified as local/staging.
6. **No destructive production operations** (data deletion, `DROP`, force-push,
   `--no-verify`) without explicit user instruction in the moment.
7. **Demo data is isolated by construction, not just convention.** Demo seeds
   (`pnpm seed:demo`, etc.) require `ALLOW_DEMO_SEED=true` and refuse production
   unless `ALLOW_DEMO_PRODUCTION_SEED=true` is explicitly set; demo users/fleets use
   `@truckfixr-demo.example.com` and synthetic VINs. See `DEMO_SEED_README.md` and
   `.claude/rules/demo-data.md`. Never seed demo data as a side effect of debugging.
8. **Authentication requirements**: session-based auth via Supabase + a local
   email-auth fallback (`server/_core/emailAuthRoutes.ts`, `supabaseEmailAuth.ts`).
   `protectedProcedure` is required on anything touching a fleet's data; do not add a
   new `publicProcedure` that reads customer data.

## Development workflow

For any non-trivial change:

1. Inspect the relevant implementation (router → service → shared logic → schema) —
   don't guess field names or status vocabularies.
2. Understand the affected domain model (which table/tenant boundary/case status is
   involved).
3. State the implementation plan before editing.
4. Identify affected tests (`*.test.ts` next to the service you're touching, plus
   `scripts/verify/*`).
5. Add/update tests for the behavior you're changing.
6. Implement the minimal change — no incidental refactors.
7. Run `pnpm check` (typecheck), `pnpm test`, and `pnpm build` if the change touches
   build-affecting config.
8. Run a fresh-context review per `.claude/workflows/fresh-context-review.md` before
   calling the change done — treat your own implementation as unverified.
9. Fix BLOCKER/HIGH findings.
10. Re-verify (`pnpm check && pnpm test`).
11. Document any unresolved risk (in the PR description or a `reports/` note, not
    silently).
12. If the change revealed a durable convention, bug pattern, or decision, add one
    line to `.claude/memory/engineering-memory.md` or `domain-memory.md` (see that
    file's promotion rule — most learnings do not qualify).

## Safety (maintenance AI)

AI triage output (TADIS) is decision support, never a certified mechanical diagnosis.
Never represent it as certain. Heightened care applies to: brakes, steering, tires,
overheating, oil pressure, fire/electrical risk, driveline failure,
emissions/derate conditions, and other critical warning states — a change that could
make a dangerous condition look safer must default to the more conservative action
and never lower an existing escalation threshold silently. See
`.claude/rules/ai-safety.md` and `.claude/skills/truckfixr-safety-gate/SKILL.md`.

## Data

Preserve source evidence (photos, fault codes, driver text) and confirmed outcomes.
Corrections are additive. See `docs/architecture/confirmed-outcomes.md`.

## Security

Never bypass tenant scoping for convenience (e.g. "just query all fleets to debug").
Never log or seed real customer data, VINs, emails, or phone numbers.
See `.claude/rules/security.md`, `.claude/rules/tenancy.md`, `docs/security/`.

## Demo environment

See `DEMO_SEED_README.md` (authoritative) and `.claude/rules/demo-data.md`. Three
synthetic demo fleets, shared password `DemoPass123!`, all emails
`*@truckfixr-demo.example.com`. `pnpm validate:demo-seed` checks isolation invariants.

## Testing (actual commands — do not invent others)

- `pnpm check` — TypeScript typecheck, no emit.
- `pnpm test` — Vitest suite (`scripts/run-vitest.mjs`).
- `pnpm verify:rls` — live-DB cross-fleet RLS isolation proof.
- `pnpm verify:stripe` — Stripe webhook/billing smoke check.
- `pnpm verify:browser-smoke` / `verify:browser-routes` — route-level smoke checks.
- `pnpm validate:demo-seed` — demo-seed invariants.
- `pnpm build` — production build (client + server).

Full release checklist: `.claude/workflows/release-gate.md`.

## More detail

- `.claude/rules/` — short, actionable rules by area.
- `.claude/workflows/` — fresh-context review, database-change, release-gate.
- `.claude/skills/` — invocable TruckFixr domain skills.
- `.claude/memory/` — durable engineering/domain learnings (not TODOs, not reports).
- `docs/architecture/` — system overview, domain model, confirmed outcomes, parts
  acquisition (future), telematics (future).
- `docs/security/` — tenant isolation, policies, registers (SOC 2 readiness track).
- `reports/` — time-bound review snapshots; see `.claude/memory/README.md` for how
  these differ from durable memory.
