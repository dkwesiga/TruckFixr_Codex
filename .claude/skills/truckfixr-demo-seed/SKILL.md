---
name: truckfixr-demo-seed
description: Use when creating, modifying, or troubleshooting demo-seed scripts (scripts/seed-*.ts) or anything that could touch demo fleet data, to keep demo data isolated from production and internally consistent.
---

# TruckFixr demo-seed safety

Authoritative reference: `DEMO_SEED_README.md`. This skill is the review checklist,
not a replacement for reading it.

## Before touching a seed script

- Confirm the script still requires `ALLOW_DEMO_SEED=true` and refuses production
  unless `ALLOW_DEMO_PRODUCTION_SEED=true` is explicitly set. Never remove or weaken
  this guard, even temporarily "to test something."
- Confirm the target-database guard pattern (`scripts/verify/db-target-guard.ts`) is
  reused rather than re-implemented — a second, slightly different safety check is
  a common source of a bypass bug.
- Demo emails must stay under `*@truckfixr-demo.example.com`; demo VINs must stay
  synthetic and clearly non-decodable. Never introduce a real VIN, email, or phone
  number into a seed for "realism."

## When changing demo data shape (adding a table/field the seed populates)

- Update the seed script to populate the new field for all three demo fleets
  (Maple Route Logistics, Peel Community Transport, NorthStone Construction) so
  demos stay representative.
- Update `pnpm validate:demo-seed` (`scripts/run-validate-demo-seed.mjs` and its
  checks) if the change affects counts, roles, or the separation invariants it
  currently asserts (3 companies, 1 owner/1 manager/2 drivers each, 12 users total,
  18 vehicles split 4/6/8, driver-vehicle assignment, cross-company isolation).
- Update `scripts/seed-demo-data-rollback.ts` so rollback still removes everything
  the seed now creates — an orphaned demo row left after rollback is a data-hygiene
  bug, not cosmetic.

## Verification

Run `pnpm validate:demo-seed` after any change to seed scripts or to a table the
seed populates. Treat a validator failure as a blocker for the change, not a
follow-up.

## Never

- Never seed demo data into a shared/staging database without confirming who else
  might be relying on its current state.
- Never make demo seeding a side effect of another command (e.g. running it
  automatically as part of `pnpm dev` or a migration).
