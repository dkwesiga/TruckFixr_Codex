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
- **AI**: `server/services/aiOrchestrator.ts` is a genuinely multi-provider
  orchestrator (`AiProvider = "openai" | "anthropic" | "gemini" | "openrouter" |
  "groq"`), selected and modeled via env (`PRIMARY_AI_PROVIDER` defaults to
  `openrouter`, `FALLBACK_AI_PROVIDER` supported) — do not describe this as
  "OpenRouter-backed" as though OpenRouter were the only or hardcoded provider.
  Used for TADIS diagnostics; a separate vision path exists for VIN OCR
  (`vehicleLookupRoutes.ts`, with a model-aware image-capability check per
  provider), and `voiceTranscription.ts` for a voice-input path.
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
| Tenant isolation (Fleet A cannot access Fleet B) | **Correction (this doc previously understated this):** `scripts/verify/rls.ts` covers the live-DB RLS defense-in-depth layer, but the *primary* application-layer boundary already has real, non-trivial coverage too — `server/companyAccessFleetScope.test.ts` (unit tests on `canManageCompanyOperations`: cross-tenant denial, owner fallback, inactive membership, driver denial), `server/routerFleetScope.test.ts` (tRPC-caller-level cross-fleet tests for `inspections.getRecentByFleet`, `defects.listByFleet`, `fleet.getById`), `server/managerActionQueueAuthz.test.ts` (`diagnostics.getManagerActionQueue`), and `server/services/confirmedOutcomes.test.ts` / `server/diagnosticFeedbackPersistence.test.ts` (cross-fleet leakage guard in the confirmed-outcome builder). See `docs/architecture/tenant-isolation-test-coverage.md` for the full resource-by-resource map and the identified gap (the `maintenanceCases` router's case-derived-fleet path had no router-level cross-tenant test until this pass added one). |
| Demo isolation (demo data cannot contaminate production) | Covered by `pnpm validate:demo-seed` plus the `ALLOW_DEMO_SEED`/`ALLOW_DEMO_PRODUCTION_SEED` env guards. No CI job runs this today (it needs a database) — a manual/staging-only check. |
| Parts lifecycle (requirement → identification → fitment → supplier option → recommendation → approval → order → receipt → install → outcome) | **Requirement through recommendation now exists** (Parts Intelligence Phase 1: `partIntelligence.ts` router, `parts`/`partRequirements`/`partFitmentAssessments`/`partSupplierOptions` tables, deterministic fitment engine, tenant-scoped, tested — `server/services/partsIntelligence.e2e.test.ts`). Approval/order/receipt/install remain unbuilt by design (Phase 2+) — see `docs/architecture/parts-acquisition.md`. The older `partsRequests.ts` staff concierge flow is separate and unchanged. |

Recommended priority for closing these (see `CLAUDE.md` / final report for the full
ranked list): the application-layer tenant boundary already has a real safety net
(see above) — the remaining work is extending its per-resource coverage (see
`docs/architecture/tenant-isolation-test-coverage.md`) and adding at least one
E2E-level proof of the same boundary, not building a suite from nothing.
