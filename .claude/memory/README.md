# Memory vs. reports

**Reports** (`reports/*.md`) are time-bound observations: a daily/weekly code-review
snapshot, a point-in-time SOC 2 readiness assessment, a batch verification proof.
They record what was true when generated. Keep generating them the way they're
generated today (existing daily-code-review / weekly-self-improvement-review
cadence) — this harness does not replace that process, and a report is never itself
durable policy.

**Memory** (this directory) is durable, current engineering/domain knowledge that a
new Claude session should know without rediscovering it: schema conventions,
permission rules, tenant-boundary rules, naming conventions, repair-workflow
behavior, confirmed-outcome behavior, demo-seed assumptions, API patterns, testing
quirks, deployment pitfalls, recurring bugs, and lessons a code review actually
confirmed.

## Promotion rule

A candidate learning gets added to `engineering-memory.md` or `domain-memory.md`
only when it has evidence from one of:

- a bug that was discovered and fixed,
- a fresh-context reviewer finding (confirmed, not speculative),
- an architectural decision actually made,
- repeated implementation friction (the same mistake/question came up more than
  once),
- a production-safe convention confirmed by reading the code.

When a `reports/` entry surfaces something durable (e.g. a recurring bug pattern
across three daily reviews), promote the *lesson* into memory as one line — don't
copy the report itself, and don't treat the act of writing a report as promotion.

## What does NOT belong here

- Transient TODOs (those belong in `todo.md` or an issue tracker).
- Speculative assumptions ("we should probably...").
- Secrets, credentials, or connection strings.
- Customer-specific data or VIN-linked information.
- Copied report content or large code excerpts — link to the file/line instead.
- Anything Claude can trivially re-derive by reading the code (e.g. "the users table
  has an email column").

## Files

- `engineering-memory.md` — cross-cutting engineering conventions and pitfalls.
- `domain-memory.md` — TruckFixr fleet-maintenance domain conventions.
