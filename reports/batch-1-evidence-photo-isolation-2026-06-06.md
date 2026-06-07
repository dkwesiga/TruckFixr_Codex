# Batch 1 — Evidence-Photo Tenant Isolation: Investigation & Decision Memo

Date: 2026-06-06
Status: Investigation complete (read-only). One founder decision required before code/infra changes.
Related: weekly review Rec 1; tasks TFX-CR-0031, TFX-CR-0035; `reports/security-legal-readiness-evidence.md` §2/§5/§7.

## What was verified (facts, not assumptions)

1. **Live storage backend is the Manus forge proxy, not Supabase Storage.**
   - `server/storage.ts` `storagePut` POSTs to `{FORGE_API_URL}/v1/storage/upload` and returns the proxy's `url`.
   - `server/routers/inspections.ts:1173` uploads evidence via `storagePut` and returns `{ key, url }`.

2. **Upload path is already well-hardened (app-layer).**
   - `verifyVehicleInspectionAccess({ fleetId, vehicleId, userId, userRole })` gates the upload, plus an inspection fleet+vehicle ownership recheck.
   - `server/services/evidencePhotos.ts`: MIME allow-list (`jpeg/png/webp`) + 5MB cap; company-scoped, UUID-randomized key `inspection-evidence/company-{fleetId}/inspections/{id}/vehicle-{id}/{kind}/{uuid}.{ext}`.

3. **Read path has NO storage-layer tenant enforcement.**
   - The client persists the returned `url` (not the key) into `photoUrls` (`client/src/pages/DriverInspectionNSC.tsx:506`).
   - `photoUrls` are rendered directly via `<img src>` across 7+ components (DriverDiagnosis, VerifiedInspection, DriverInspectionNSC, DriverDashboardSaaS, DefectDetail, DriverInspection, VehicleCaptureFlow).
   - No `storageGet`/signed-on-read is used on any read path. Read isolation therefore depends entirely on the (unverified) privacy of the forge URL.

4. **`manusTypes.ts` `expiresIn` is OAuth token exchange — NOT storage URL expiry.** There is no in-repo evidence that forge download URLs are signed or time-limited.

5. **Offline/failure path persists raw base64 data URLs** into DB rows (`DriverInspectionNSC.tsx` returns `dataUrl` on upload failure / when offline).

6. **The Supabase private-bucket + fleet-RLS migration is repo-only and unapplied** (`supabase/migrations/20260527113000_storage_privacy_policies.sql`); it is not the live backend.

## Risk summary

- Tenant isolation for customer evidence photos currently rests on app-layer checks at **upload** plus the **unverified privacy of forge URLs at read**. If forge URLs are durable and guessable/enumerable, a leaked or guessed URL bypasses fleet boundaries.
- Base64-in-DB is a data-minimization issue (PII blobs in rows, returned via API).

## Why no code/infra change was made yet

The robust fix is **decision-bound and/or environment-bound**, and both options are either irreversible or regression-prone — they should not be done blind:

- **Option A — Adopt applied Supabase private Storage (recommended target).** Cleanest tenant-isolation + SOC story. Requires: applying the existing migration to a verified staging Supabase project, switching `storagePut`/reads to Supabase client + signed URLs, persisting keys, migrating render sites, and a staging cross-fleet denial proof. Needs a staging target + the backend decision.
- **Option B — Keep forge proxy, prove URL privacy.** Requires confirming (with the forge vendor/API) that download URLs are non-enumerable and time-limited, then documenting the access model. If they are durable/public, add an authorized signed-on-read endpoint (persist keys, mint fresh URLs with a fleet check) — a ~Medium refactor across 7 render sites.

Either path also needs a decision on the base64-in-DB fallback (founder interim call: retain for pilot, document).

## Recommended decision

Target **Option A (Supabase private Storage)** as canonical, executed against a verified staging project so cross-fleet denial can be proven before real fleet use. Retain the base64 offline fallback for the current controlled pilot and replace with object references during the Option A migration.

## Acceptance criteria (unchanged from Rec 1)

- Documented canonical backend decision.
- If Supabase: applied to staging; Company B cannot read/list/signed-URL Company A objects.
- If forge: proven non-enumerable/expiring URLs + documented access model.
- Reads authorized (signed-on-read) rather than durable public URLs.
- Stop persisting raw base64 in DB (or document pilot-scoped retention).
- Cross-fleet denial proven in staging across upload/read/list/delete.

## What I need to proceed to code

1. Your pick: **Option A** (recommended) or **Option B**.
2. A verified **staging Supabase project** (Option A) or **forge URL behavior confirmation** (Option B).
Without these, further changes would be unprovable or risk regressions across the evidence read path.
