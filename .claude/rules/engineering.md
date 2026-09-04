# Engineering rules

- Inspect before editing: read the router → service → shared logic → schema chain for
  anything you touch. Field/status names must come from `drizzle/schema.ts` and
  `shared/maintenance/caseWorkflow.ts`, never guessed.
- Minimal diffs. No incidental refactors, renames, or abstractions riding along with a
  bug fix or feature. Three similar lines beat a premature helper.
- Business logic belongs in `shared/` (framework-free, unit-testable) or
  `server/services/*.ts`. Routers (`server/routers/*.ts`) stay thin: input validation
  (zod) + calling a service + shaping the response.
- Don't add error handling for cases that can't happen. Do validate at real
  boundaries: tRPC input schemas, webhook payloads (Stripe), external AI responses.
- New tRPC procedures default to `protectedProcedure`. Escalate to `adminProcedure`
  only for fleet owner/manager actions, `staffProcedure` only for genuine cross-fleet
  staff tooling. Never add a new `publicProcedure` that returns customer data.
- Every non-trivial service change ships with a co-located `*.test.ts` (see existing
  `*.test.ts` files next to `server/services/*.ts` for the pattern) — pure logic goes
  in `shared/` specifically so it can be tested without a database.
- Run `pnpm check` and `pnpm test` before considering a change done. See
  `.claude/workflows/release-gate.md` for the full pre-merge checklist.
