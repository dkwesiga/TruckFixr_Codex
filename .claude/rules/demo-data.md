# Demo-data rules

Authoritative source: `DEMO_SEED_README.md`. This file is a quick-reference; if it
ever disagrees with `DEMO_SEED_README.md` or the seed scripts, the seed scripts win.

- Demo seeding requires `ALLOW_DEMO_SEED=true`. It refuses to run against a database
  it believes is production unless `ALLOW_DEMO_PRODUCTION_SEED=true` is explicitly
  set — never add code that weakens or routes around that guard.
- Demo users are `*@truckfixr-demo.example.com` with shared password
  `DemoPass123!`. Demo VINs are synthetic and must never be treated as decodable
  real VINs, and real customer VINs/emails/phone numbers must never be used in a
  seed, fixture, or test.
- Three demo fleets exist (Maple Route Logistics, Peel Community Transport,
  NorthStone Construction) with fixed user/vehicle counts validated by
  `pnpm validate:demo-seed`. Don't add a fourth demo fleet or change these counts
  without updating that validator in the same change.
- `pnpm seed:demo:rollback` must remove only demo-domain fleets/users/records —
  never broaden its target query to something that could touch a real fleet.
- Never seed demo data into an environment as a side effect of debugging a bug
  report — reproduce with a scoped script or read-only query instead.
- A new seed script (`scripts/seed-*.ts`) should reuse the existing safety-check
  pattern (`ALLOW_DEMO_SEED`, environment/target guard) rather than inventing a new
  one — see `scripts/seed-demo-data.ts` and `scripts/verify/db-target-guard.ts`.
