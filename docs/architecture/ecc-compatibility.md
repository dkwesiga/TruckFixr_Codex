# ECC compatibility notes

This harness deliberately adopts a small set of ECC-style patterns (fresh-context
review, rules/skills/memory separation, a lightweight promotion rule for durable
learnings) rather than installing ECC wholesale. This document records what was
considered and deferred, so a future pass can adopt more of it without a rewrite.

## Worth considering later

- **Continuous learning / auto-promotion of memory** — right now, promoting a
  learning into `.claude/memory/` is a manual judgment call against the rule in
  `.claude/memory/README.md`. A lightweight automated suggestion step (e.g. a
  reviewer agent proposes a memory-file diff when it finds a repeated pattern)
  would reduce the chance of the promotion rule being applied inconsistently.
- **Specialized subagents per review dimension** — today the fresh-context review
  workflow is one checklist run by one reviewer pass. Splitting security/tenancy,
  AI-safety, and database review into separate subagent passes (as ECC does) would
  parallelize review and let each agent go deeper, at the cost of more orchestration.
- **Dedicated security-tooling integration** (SAST/dependency-graph scanning beyond
  `pnpm audit` + gitleaks) — worth adding once the current non-blocking `pnpm audit`
  step is promoted to blocking and the advisory backlog is clean.
- **Database-review tooling** — an automated linter for the RLS/migration
  conventions in `.claude/rules/database.md` (e.g. flag a new fleet-scoped table
  missing an RLS migration) would catch what code review currently has to catch by
  eye.
- **E2E automation** — the critical-journey gaps in
  `docs/architecture/system-overview.md` are the concrete target; ECC's E2E
  patterns are a reasonable template once a journey is picked to cover first.
- **Research agents** for competitive/supplier research feeding the future parts-
  acquisition/Parts Intelligence Graph work (P2–P4).
- **Supply-chain-domain skills** — once parts acquisition moves past the concierge
  stage, a fitment/supplier-comparison skill set closer to ECC's domain-skill depth
  would fit naturally alongside `truckfixr-parts-fitment`.
- **Hooks** — pre-commit/pre-push hooks enforcing e.g. "no new `publicProcedure`
  touching a fleet table without an explicit allow-comment" could mechanize part of
  `.claude/rules/security.md` instead of relying on review.

## Intentionally deferred, and why

- **Wholesale ECC installation** — the task explicitly calls for augmentation, and
  this codebase already has substantial engineering discipline (SOC 2 policy pack,
  RLS verification, daily/weekly review reports) that a wholesale install would
  duplicate or conflict with rather than improve.
- **Dozens of skills/agents** — TruckFixr's actual review surface area (tenancy,
  AI safety, confirmed outcomes, demo data, database, release, parts fitment) is
  covered by 7 skills; more would fragment coverage without adding real value yet.
- **A new workflow/orchestration engine** — `.claude/workflows/*.md` are plain
  checklists a session or subagent follows; ECC's more elaborate orchestration isn't
  justified until this lightweight version proves insufficient.
- **Replacing existing CI/CD** — `.github/workflows/ci.yml` and `render.yaml` work
  and are documented; this pass only documents gaps (no lint step, non-blocking
  audit), it doesn't replace the pipeline.
- **New databases / microservices / event sourcing** — none of the domain
  complexity uncovered in this audit (case workflow, confirmed outcomes, parts
  concierge) requires them; introducing them now would be solving a scaling problem
  TruckFixr doesn't have yet (5 employees, 3 demo fleets, pre-P0 stabilization).

## First ECC component worth adopting next

Once this harness has been used for a few weeks of real changes: **splitting the
fresh-context review into parallel specialized passes** (tenancy/security,
AI-safety, database) is the highest-leverage next step — the checklist already
exists in `.claude/workflows/fresh-context-review.md` and the three skills it
delegates to already exist; the only missing piece is running them as separate
agents instead of one sequential pass, which reduces the chance a long review
misses something near the end of the checklist.
