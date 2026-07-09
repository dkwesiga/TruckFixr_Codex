# Access Control Policy

| | |
|---|---|
| **Status** | DRAFT — pending ratification |
| **Owner** | TODO: Security Lead |
| **Version** | 0.1 |
| **Effective** | TODO |
| **Last reviewed** | 2026-06-29 |
| **Review cadence** | Annual; access reviews quarterly |

## 1. Purpose

Ensure only authorized people and services can access TruckFixr systems and
customer data, with the least privilege necessary.

## 2. Application access (customers)

- Authentication is via email/password (with Supabase email auth) and supported
  OAuth providers. Passwords must meet the policy enforced in
  `shared/passwordPolicy.ts`: minimum 8 characters with upper, lower, number, and
  special character; common and profile-derived passwords are rejected.
- Authorization is role-based and enforced server-side in `server/_core/trpc.ts`:
  - `protectedProcedure` — any authenticated user.
  - `adminProcedure` — customer fleet **owner/manager**, still fleet-scoped.
  - `staffProcedure` — TruckFixr **staff only** (`isStaffAdminUser`); all
    cross-fleet endpoints use this.
- Multi-tenant isolation is enforced primarily by application-layer fleet scoping,
  with Postgres RLS as defense-in-depth (see [Tenant Isolation](../tenant-isolation.md)).
- **Planned/target:** offer/require MFA for customer accounts.

## 3. Administrative / infrastructure access (staff)

- Production consoles — GitHub, Render, Supabase, Stripe, email provider, AI
  provider dashboards — are restricted to personnel who need them.
- **MFA is required** on every admin console that supports it.
- Access is provisioned by the Security Lead and removed promptly on role change
  or departure (see [Personnel Security](13-personnel-security-policy.md)).
- Shared logins are prohibited; use named accounts wherever the provider allows.

## 4. Secrets

- No secrets in source control. Production secrets live in Render environment
  variables (`sync: false`); `JWT_SECRET` is platform-generated. Local secrets live
  in gitignored `.env`. Secret scanning runs in CI (gitleaks).

## 5. Access reviews

- The Security Lead reviews who has access to each production console **quarterly**
  and on any departure, recording results in the
  [Access Review Log](../registers/access-review-log.md).

## 6. Deprovisioning

- On personnel departure or contract end, revoke all console access, rotate any
  shared/exposed secrets, and remove the named app account. Target: complete within
  one business day.
