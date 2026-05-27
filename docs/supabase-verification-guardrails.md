# Supabase Verification Guardrails

TruckFixr daily reviews may inspect repository files and run safe verification. Any verification script that writes test rows, even inside a transaction that rolls back, must classify the database target before connecting.

## Target Classification

Set `TFX_DATABASE_TARGET` when using any remote database:

| Value | Meaning | Default write-verification behavior |
|---|---|---|
| `local` | Local disposable database | Allowed |
| `staging` | Staging/test Supabase project | Blocked unless `ALLOW_STAGING_DB_VERIFY_WRITES=true` |
| `production` | Production Supabase project | Blocked unless Dickson approves a named verification and `ALLOW_PRODUCTION_DB_VERIFY_WRITES=true` |

If `TFX_DATABASE_TARGET` is not set, localhost-style hosts are treated as local. Other remote hosts are treated as `unknown_remote` and blocked for write-capable verification.

## Guarded Scripts

- `pnpm verify:rls` writes temporary users, fleets, vehicles, subscriptions, activity logs, and support recovery audit rows inside a rollback transaction.
- `pnpm exec tsx scripts/verify/stripe.ts` writes temporary billing fixtures and cleans them up.
- `scripts/verify/apply-readiness-migrations.ts` applies schema changes and also requires `ALLOW_READINESS_MIGRATIONS=true`.

## Daily Review Rule

Daily review should not run write-capable verification against production by default. Production Supabase checks should be read-only unless Dickson approves a named Batch K verification or fix.
