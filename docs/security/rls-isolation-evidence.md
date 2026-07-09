# RLS / Tenant-Isolation Verification Cadence & Evidence

**Status:** Active · **Owner:** Engineering · **Last reviewed:** 2026-06-29

Defines how the cross-fleet isolation test is run, on what cadence, and where its
output is retained as SOC 2 evidence (Security / Confidentiality — logical access).

## What is tested

`scripts/verify/rls.ts` runs against a **live** Postgres database. Inside a single
rolled-back transaction it seeds two fleets (A and B) plus users, then, **acting as
the Supabase `authenticated` role with each user's JWT context**, asserts:

- a driver sees their own fleet's vehicle but **not** another fleet's vehicle;
- cross-fleet `activityLogs` inserts are denied; same-fleet inserts succeed;
- `subscriptions`, `earlyWarningFlags`, `inspectionReviewQueueItems`,
  `inspectionReviewActions`, `combinedInspectionSessions`, and `adminFleetNotes`
  rows stay fleet-scoped;
- `supportRecoveryActions` and `lead_submissions` are hidden from `authenticated`
  users and readable only by `service_role`;
- RLS is enabled on every post-0012 customer-data table.

The transaction is rolled back, so the test leaves no data behind.

> Note: this exercises the **defense-in-depth RLS layer**. The primary tenant boundary
> (application-layer fleet scoping) is described in `tenant-isolation.md` and is covered
> by a separate, still-pending application-layer test suite.

## How to run

```bash
# Requires DATABASE_URL pointing at a NON-production verification database.
# scripts/verify/db-target-guard.ts blocks disallowed targets.
pnpm verify:rls
```

The script prints a JSON result with `ok: true` and the list of checks.

## Cadence

| Trigger | Owner | Evidence |
|---|---|---|
| Every PR touching `drizzle/*`, `server/db.ts`, or any `*_select_policy` | Author | CI job output (see below) |
| Weekly, as part of the SOC 2 readiness review | Reviewer | Saved JSON in `reports/evidence/` |
| Whenever a new fleet-scoped table is added | Author | Extend `scripts/verify/rls.ts` first |

## Retaining evidence

Save the dated run output so the weekly review can point at real results:

```bash
mkdir -p reports/evidence
pnpm verify:rls | tee "reports/evidence/rls-isolation-$(date +%F).json"
```

## CI

`.github/workflows/rls-isolation.yml` runs this script on a weekly schedule and on
manual dispatch. It executes **only when** an `RLS_DATABASE_URL` repository secret is
configured (a disposable verification database), and uploads the JSON as a build
artifact. The main `ci.yml` workflow does **not** require a database, so it skips the
live RLS run and relies on the static policy test (`server/rlsPolicies.test.ts`).
