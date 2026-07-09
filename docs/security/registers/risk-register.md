# Risk Register

| | |
|---|---|
| **Status** | Living document |
| **Owner** | TODO: Security Lead |
| **Last reviewed** | 2026-06-29 |
| **Review cadence** | Weekly (readiness review); formal assessment annually |

Rate **Likelihood × Impact** (Low/Med/High). Treatment: Mitigate / Accept / Transfer
/ Avoid. See the [Risk Management Policy](../policies/03-risk-management-policy.md).

| ID | Risk | Likelihood | Impact | Treatment | Owner | Target date | Status |
|---|---|---|---|---|---|---|---|
| R-01 | A customer-data query missing its fleet filter leaks cross-tenant data (app-layer scoping is the primary boundary; RLS doesn't catch the app role) | Med | High | Mitigate — app-layer fleet-scoping + cross-fleet authz tests cover the access helpers, the `adminProcedure` queue, and the inspections/defects/fleet routers (`server/companyAccessFleetScope.test.ts`, `server/managerActionQueueAuthz.test.ts`, `server/routerFleetScope.test.ts`); extend to remaining fleet-scoped procedures as added | TODO | TODO | In progress |
| R-02 | API on no-SLA hosting tier; backups not yet verified by restore test | Med | High | Mitigate — capture backup config, run restore test, plan paid tier | TODO | TODO | Open |
| R-03 | No external uptime monitoring/alerting; observability buffer is non-durable | Med | Med | Mitigate — add uptime monitor + durable webhook sink | TODO | TODO | Open |
| R-04 | No published privacy policy / dead links (PII collected) | — | High | Mitigate — Privacy/Terms pages added; pending counsel ratification | TODO | TODO | In progress |
| R-05 | No CI gate before auto-deploy to prod | — | High | Mitigate — CI added (typecheck/test/secret scan) | TODO | TODO | In progress |
| R-06 | Public lead/auth endpoints lack rate limiting (abuse / PII flooding) | Med | Low–Med | Mitigated — per-IP fixed-window limits on lead intake, signup, login/signin, and password reset (`server/_core/rateLimit.ts`); move to shared store if API scales to multiple instances | TODO | TODO | Mitigated (single-instance) |
| R-07 | Small team → limited separation of duties | Med | Med | Mitigate — CI gates + code review; accept residual with sign-off | TODO | TODO | Open |
| R-08 | No automated dependency vulnerability alerting | Med | Med | In progress — Dependabot (`.github/dependabot.yml`) + non-blocking `pnpm audit` CI job added; promote audit to a required check once backlog is clean | TODO | TODO | In progress |
| R-09 | No version-controlled compliance docs / Comply drift risk | — | Med | Mitigate — policy pack added; bring any Comply docs into git | TODO | TODO | In progress |

Add new rows as risks are identified in the weekly review or incidents.
