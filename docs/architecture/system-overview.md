# System overview

Concise architecture reference. See `CLAUDE.md` for the persistent-context summary
this expands on, and `docs/security/` for security-specific detail.

## Stack (verified from code)

- **Frontend**: React 19 + Vite (`client/`), Radix UI + Tailwind-adjacent component
  kit (`components.json`, `client/src/components/ui`), TanStack Query, tRPC client.
- **Backend**: Node.js + Express + tRPC (`server/_core/index.ts` entrypoint,
  `server/routers/*.ts` procedures, `server/services/*.ts` business logic).
- **Shared**: framework-free domain logic in `shared/` (case workflow, TADIS scoring,
  calculators) — unit-tested without a database.
- **Database**: Postgres via Drizzle ORM. Schema: `drizzle/schema.ts` (86 tables).
  Migrations: numbered SQL files in `drizzle/*.sql`, config in `drizzle.config.ts`.
- **Auth**: Supabase Auth + a local email-auth fallback
  (`server/_core/supabaseEmailAuth.ts`, `emailAuthRoutes.ts`, `localUsers.ts`).
- **Storage**: Supabase Storage (evidence/inspection photos) plus AWS S3 client
  present in dependencies for some asset flows.
- **Payments**: Stripe (`server/_core/stripeBillingRoutes.ts`, `billingRoutes.ts`).
- **Email**: Resend.
- **AI**: `server/services/aiOrchestrator.ts` fronts the configured LLM
  provider(s) (OpenRouter-backed per code comments; provider/model via env) for
  TADIS diagnostics; a separate vision path exists for VIN OCR
  (`vehicleLookupRoutes.ts`, `voiceTranscription.ts` also present for a voice input
  path).
- **Deploy**: Render (`render.yaml`, `autoDeploy` on `main`).
- **CI**: GitHub Actions (`.github/workflows/ci.yml` — typecheck/test/secret-scan/
  audit; `rls-isolation.yml` — separate RLS verification workflow).

## Request flow (typical case-lifecycle path)

Driver (client) → tRPC `inspections`/`defects` router (`protectedProcedure`) →
`inspectionWorkflow.ts` / `aiTriage.ts` service → TADIS via `aiOrchestrator.ts` →
`maintenanceCases.ts` service creates/updates a case → manager (client) reads via
`maintenanceCases` router (`adminProcedure`, fleet-scoped) → decision recorded via
`maintenanceDecisions.ts` → repair cycle via `repairCycles.ts` → confirmed outcome
via `confirmedOutcomes.ts` / `repairOutcomes` table.

## Tenancy and auth

See `docs/security/tenant-isolation.md` (authoritative) and `CLAUDE.md`. Summary:
fleet-scoped application-layer checks are primary; Postgres RLS is defense-in-depth
only, because the app's DB role bypasses it.

## Engineering workflow (as it exists today)

- Typecheck: `pnpm check`. Tests: `pnpm test` (Vitest). No separate lint script is
  configured in `package.json` today — `prettier --write .` exists for formatting
  but is not wired into CI as a check (a gap; see below).
- Code review has historically been captured as dated snapshot files in `reports/`
  (`daily-code-review-YYYY-MM-DD.md`) plus periodic `weekly-self-improvement-review-*`
  files — see `.claude/memory/README.md` for how this harness treats those going
  forward (kept as-is; durable lessons get promoted into `.claude/memory/`).
- Deployment checks: CI (typecheck, test, secret scan, non-blocking dependency
  audit) gates `main`; Render auto-deploys `main`. No documented manual promotion
  gate between CI-green and production beyond that.

## Known gaps (documented, not fixed in this pass)

- **No lint step in CI.** `prettier` exists but isn't enforced; there's no ESLint
  config found in the repo root. Recommend adding a lint script + CI step as future
  work rather than introducing one unreviewed in this pass.
- **No E2E test suite.** `verify:browser-smoke`/`verify:browser-routes` are
  route-level smoke checks (do the routes render/respond), not full user journeys.
  See "Critical journeys" below for what's missing.
- **`pnpm audit` is non-blocking** in CI (`continue-on-error: true`).

## Critical journeys — current coverage

| Journey | Coverage today |
|---|---|
| Driver reports issue → case created → triage → manager sees recommendation → action → repair → confirmed outcome | Covered piecemeal by service-level unit tests (`inspectionWorkflow.test.ts`, `aiTriage`/`aiOrchestrator.test.ts`, `maintenanceCases` service, `confirmedOutcomes.test.ts`); no single E2E test asserts the full chain end-to-end. |
| Safety escalation (critical issue escalates, unsafe vehicle not shown as safe) | Covered by unit-level severity/action mapping tests in `shared/maintenance/`; no integration/E2E test simulates a full critical-defect submission through to an escalation notification. |
| Tenant isolation (Fleet A cannot access Fleet B) | Covered by `scripts/verify/rls.ts` (live-DB, `authenticated`-role proof) for the RLS defense-in-depth layer; the *primary* application-layer boundary has no equivalent automated test suite today (this is the residual risk already flagged in `docs/security/tenant-isolation.md`). |
| Demo isolation (demo data cannot contaminate production) | Covered by `pnpm validate:demo-seed` plus the `ALLOW_DEMO_SEED`/`ALLOW_DEMO_PRODUCTION_SEED` env guards. No CI job runs this today (it needs a database) — a manual/staging-only check. |
| Parts lifecycle (requirement → fitment → supplier → approval → order → receipt → install → outcome) | Only the early stages exist (`partsRequests.ts` concierge intake/triage). No fitment-validation, ordering, or receipt tracking yet — see `docs/architecture/parts-acquisition.md`. |

Recommended priority for closing these (see `CLAUDE.md` / final report for the full
ranked list): an automated application-layer tenant-scoping test suite is the
highest-value gap, since it's the layer with no safety net today.
