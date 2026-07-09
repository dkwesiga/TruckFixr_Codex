# System Description (SOC 2 Scope)

| | |
|---|---|
| **Status** | DRAFT — pending ratification |
| **Owner** | TODO: Security Lead |
| **Version** | 0.1 |
| **Last reviewed** | 2026-06-29 |

A plain description of the TruckFixr system for SOC 2 readiness. This defines the
**scope** the controls in the policy pack apply to.

## 1. Service

TruckFixr Fleet AI is a SaaS web/PWA application providing maintenance intelligence
and decision support for small and mid-sized commercial trucking fleets: driver
inspections (DVIR), defect tracking, AI-assisted diagnosis, early-warning flags,
compliance status, and reporting.

## 2. Trust services criteria in scope

Security, Availability, and Confidentiality. (Privacy is addressed operationally via
the PIPEDA policy but is not claimed as an audited TSC.)

## 3. Architecture

| Layer | Technology | Hosting |
|---|---|---|
| Frontend | Vite + React (PWA) | Render static site (`truckfixr.com`) |
| API | Node + Express + tRPC | Render web service (`truckfixr-api`) |
| Database | PostgreSQL (Drizzle ORM) | Supabase |
| Object storage | Inspection/evidence photos | Supabase Storage |
| Auth | Email/password + Supabase email auth + OAuth; JWT sessions | — |
| Billing | Stripe | Stripe |
| Email | Transactional/notification | Resend |
| AI diagnosis | LLM providers | OpenRouter / OpenAI / Anthropic / Google / Groq |
| Source & CI | Git + GitHub Actions | GitHub |

## 4. Data handled

Account/user data, fleet & vehicle data (incl. VIN/plate), inspection records and
photos, diagnostic inputs, lead PII, and billing identifiers. Classified in the
[Data Classification Policy](policies/08-data-classification-policy.md).

## 5. Key controls (summary)

- **Access:** server-side RBAC (`protectedProcedure`/`adminProcedure`/`staffProcedure`);
  password policy; least-privilege console access with MFA (target/enforced where
  supported).
- **Tenant isolation:** application-layer fleet scoping (primary) + Postgres RLS
  (defense-in-depth), verified by `scripts/verify/rls.ts`.
  See [Tenant Isolation](tenant-isolation.md).
- **Change management:** PR + CI (typecheck, tests, secret scan); migrations for
  schema; runtime schema repair disabled in production.
- **Confidentiality:** TLS in transit; platform encryption at rest; redacted logs.
- **Availability:** stateless app tiers; Supabase backups; `/healthz`.
  See [Backups & Monitoring](backups-and-monitoring.md). *(Known constraint: API on a
  no-SLA tier — see that runbook.)*
- **Monitoring:** redacted observability (`server/services/observability.ts`);
  uptime monitoring is a planned addition.

## 6. Boundaries / sub-service organizations

TruckFixr relies on the sub-processors listed in the
[Vendor / Sub-processor Inventory](registers/vendor-subprocessor-inventory.md). Their
own controls (carve-out) cover the infrastructure they operate.

## 7. Compliance status

SOC 2 readiness **in progress**; not certified. Tracked in `reports/soc2-readiness-*.md`.
