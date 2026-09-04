# Security rules

- Read `docs/security/tenant-isolation.md` before touching any query that returns
  customer data. The application layer is the tenant boundary; Postgres RLS is
  defense-in-depth only (the app DB role owns the tables and bypasses RLS).
- Never derive `fleetId`/`companyId` from client input for an authorization decision.
  Resolve it server-side from session context (`ctx.user`), the way
  `server/services/companyAccess.ts` / `maintenanceTenantScope.ts` do.
- Never bypass tenant scoping "just to debug" — no ad hoc `SELECT * FROM vehicles`
  without a fleet filter, even in a script, unless it's an explicitly staff-only /
  admin tool gated by `staffProcedure` and `isStaffAdminUser`.
- Secrets: never commit `.env`, API keys, or Supabase service-role keys. `.gitleaks.toml`
  runs in CI; don't add exceptions to it without a real reason.
- Never log VINs, customer emails/phone numbers, or full request bodies that might
  contain them, at a level that ships to persistent log storage.
- Treat AI/model output as untrusted input to downstream code, not as a trusted
  system value — validate/parse it (see `server/services/aiResponseParsing.ts`
  pattern) before using it to drive a decision or a query.
- Any new admin/staff-only route must use `staffProcedure`, not a hand-rolled role
  check — see `server/_core/trpc.ts` `isStaffAdminUser`.
- Fixing an authorization gap that follows an established pattern elsewhere in the
  codebase is low-risk and should be fixed directly. A new authorization *model* is
  not low-risk — document it as a finding instead.
