# Seed Data Proposal (PROPOSED — not executed; needs approval)

The repo already has a gated, reversible demo-seed system (`DEMO_SEED_README.md`):
`pnpm seed:demo` / `pnpm seed:demo:rollback` / `pnpm validate:demo-seed`, guarded by
`ALLOW_DEMO_SEED=true` and blocked from production by default. We build on that rather than writing
ad-hoc DB scripts.

## Recommended approach (safest first)
Add **one isolated fictional company (ABC Logistics)** with the single coolant hero record, without
disturbing the existing 3 seed companies.

### Option A — Extend the existing demo seed (recommended)
- Add ABC Logistics as an additional demo company block in the seed source, reusing its safety
  guards, `*.example.com` emails, synthetic VINs, and rollback targeting.
- Pros: reuses proven safety rails, one-command rollback, validation coverage.
- Cons: touches the seed source file (dev-only, non-production) — needs approval as a code change.

### Option B — Local-only supplemental seed script
- A separate `demo-video`-scoped script that inserts ABC Logistics only on local/staging.
- Pros: zero change to the shared seed.
- Cons: new script to maintain; must replicate the same guards.

### Option C — No DB writes; screenshots + curated demo case only
- Use existing `demo-assets/` + `video-generator/` screenshots, plus a curated coolant TADIS demo
  case, and add callouts to convey Unit 204 / ABC Logistics.
- Pros: touches no database at all — lowest risk, fastest.
- Cons: less "live" feel; some frames are stills.

**Recommendation:** Option A for a live-feeling demo; fall back to Option C if we must avoid any DB
change for now. Decide via Q2.

## Guardrails applied to whichever option is approved
- `ALLOW_DEMO_SEED=true`, target = local/staging `DATABASE_URL` only. Never production.
- All identifiers fictional; synthetic non-decodable VIN; `*.example.com` emails; no real phone/plate/invoice.
- Rollback: `pnpm seed:demo:rollback` (or the supplemental script's rollback) scoped to demo domains.
- Post-seed: `pnpm validate:demo-seed` (or a manual check) before recording.

## Explicitly NOT part of this proposal
- No production data changes, auth/billing/permission changes, migrations, or core logic changes.
- No new product capability. Coolant is ordinary symptom input the app already accepts.

## Approval needed to proceed
1. Which option (A / B / C)?
2. Seed-driven vs. curated TADIS coolant result (Q2)?
3. Target environment confirmed local/staging?
