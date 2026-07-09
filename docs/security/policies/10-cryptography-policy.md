# Cryptography Policy

| | |
|---|---|
| **Status** | DRAFT — pending ratification |
| **Owner** | TODO: Engineering Lead |
| **Version** | 0.1 |
| **Effective** | TODO |
| **Last reviewed** | 2026-06-29 |
| **Review cadence** | Annual |

## 1. Purpose

Define how TruckFixr uses encryption to protect data.

## 2. In transit

- All traffic between browsers, the API, and providers uses **HTTPS/TLS**.
- Session cookies are `HttpOnly`, `Secure`, and `SameSite` appropriate to the
  deployment (see `server/_core/cookies.ts`).

## 3. At rest

- The Supabase Postgres database and Supabase Storage provide encryption at rest at
  the platform level (confirm and record provider details in the
  [Vendor Inventory](../registers/vendor-subprocessor-inventory.md)).

## 4. Secrets & keys

- Secrets are stored in Render environment variables (`sync: false`) and gitignored
  `.env`; never in source control. `JWT_SECRET` is platform-generated.
- Passwords are stored as hashes, never in plaintext.
- Key/secret rotation occurs on suspected exposure and on personnel departure.

## 5. Standards

- Use well-maintained, standard libraries (e.g. `jose` for JWTs, the platform's TLS).
  Do not implement custom cryptography.

## 6. Review

Reviewed annually and when providers or auth mechanisms change.
