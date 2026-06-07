# TruckFixr Fleet AI — Security / SOC / Legal Readiness Evidence Tracker

Last updated: 2026-05-27

Purpose: Track **repo-backed** evidence for SOC-style controls, security readiness, privacy/legal readiness, and enterprise due-diligence readiness. This file does **not** assert compliance; it records what evidence exists and what is still missing.

Rules:
- Do not paste secrets, tokens, API keys, or customer data here.
- Prefer links/paths to repo artifacts (docs, policies, logs, scripts, tests) over prose.
- Treat every item as “readiness evidence”, not “certification”.

---

## 1) Identity & Access Management (IAM)

- Evidence: Not yet recorded.
- Gaps / Next proof needed:
  - Role model documented (owner/admin/manager/driver + staff/support).
  - Authentication/session policies documented (timeouts, refresh, revocation).
  - Admin/support access restrictions and auditability (read + write).

## 2) Tenant Isolation (Multi-Company Separation)

- Evidence (current state, 2026-06-06):
  - Application-layer fleet authorization is enforced on evidence upload: `server/routers/inspections.ts` `uploadEvidencePhoto` calls `verifyVehicleInspectionAccess({ fleetId, vehicleId, userId, userRole })` and re-checks that the linked inspection belongs to the same fleet+vehicle before storing.
  - Evidence object keys are company-scoped and randomized: `server/services/evidencePhotos.ts` `buildEvidencePhotoStorageKey` emits `inspection-evidence/company-{fleetId}/inspections/{inspectionId}/vehicle-{vehicleId}/{kind}/{uuid}.{ext}` and rejects non-positive `fleetId`.
  - Diagnostic similar-case retrieval is fleet-scoped at the query level: `server/routers/diagnostics.ts` reads `repairOutcomes`/`defects`/`activityLogs`/`aiQualityReviews` with `WHERE fleetId = input.fleetId`.
- Gaps / Next proof needed:
  - **Storage read-time isolation is NOT enforced at the storage layer.** The live backend is the Manus forge proxy (`server/storage.ts`); uploaded photos are persisted as the returned URL in `photoUrls` and fetched directly by the browser. There is no signed-on-read / per-request fleet check at read time, and no evidence the forge download URL is non-enumerable or time-limited. Isolation currently depends entirely on app-layer checks + the (unverified) privacy of forge URLs.
  - The Supabase private-bucket + fleet-RLS model in `supabase/migrations/20260527113000_storage_privacy_policies.sql` is **repo-only / not applied** and is not the live storage backend.
  - Staging/local behavior proof for cross-company denial (DB rows and storage objects) is still outstanding.
  - Decision required (founder): adopt applied Supabase private Storage as canonical evidence backend, OR retain forge proxy and prove URL non-enumerability/expiry. See `reports/batch-1-evidence-photo-isolation-2026-06-06.md`.

## 3) Audit Logging & Traceability

- Evidence: Not yet recorded.
- Gaps / Next proof needed:
  - What is logged (who/what/when/where), retention strategy, and access controls.
  - Support/admin recovery audit-read + audit-write staging proof.

## 4) Secure Development & Change Management

- Evidence: Not yet recorded.
- Gaps / Next proof needed:
  - Branch protection / review expectations (if any).
  - Verification command set (what must be green before deploy).
  - Release checklist (even for controlled pilots).

## 5) Data Protection (PII, secrets, encryption, retention)

- Evidence (current state, 2026-06-06):
  - Server-side evidence validation enforces an image MIME allow-list (`image/jpeg|png|webp`) and a 5MB size cap before storage: `server/services/evidencePhotos.ts` `parseEvidenceImageDataUrl`.
  - Secrets are read from env (`server/_core/env.ts`); storage proxy requires `BUILT_IN_FORGE_API_URL` / `BUILT_IN_FORGE_API_KEY`.
- Gaps / Next proof needed:
  - **Base64 data URLs are persisted in DB rows on the offline/upload-failure path** (`client/src/pages/DriverInspectionNSC.tsx` falls back to the raw data URL when offline or when upload fails). This embeds PII-bearing image blobs in `inspectionPhotos`/`defects.photoUrls` and returns them via API. Founder-approved interim decision: retain for the controlled pilot; replace with object references when the storage backend is finalized (Rec 1).
  - PII inventory (what the app stores) not yet documented.
  - Data retention plan (including inspection/defect photos and uploads) not yet documented.
  - Secret rotation expectations not yet documented.

## 6) Supabase / Database Controls

- Evidence: Not yet recorded.
- Gaps / Next proof needed:
  - Canonical schema/migrations source-of-truth decision (Drizzle vs Supabase).
  - Backup/restore/rollback plan for controlled pilots.

## 7) Storage Controls (Photos, Evidence, Fleet Documents)

- Evidence (current state, 2026-06-06):
  - Upload constraints enforced server-side: image MIME allow-list + 5MB cap (`server/services/evidencePhotos.ts`).
  - Company-scoped, UUID-randomized object paths (`buildEvidencePhotoStorageKey`).
  - Repo-only Supabase migration defining private buckets + fleet-scoped RLS exists for the future Supabase path (`supabase/migrations/20260527113000_storage_privacy_policies.sql`), with static policy-shape coverage in `server/storagePolicies.test.ts` and `pnpm run verify:storage-privacy`.
- Gaps / Next proof needed:
  - **Live backend (forge proxy) bucket privacy is unproven**; the repo Supabase policies are not applied and are not the live backend.
  - No signed-on-read / authorized read endpoint; persisted forge URLs are fetched directly.
  - Read/list/update/delete cross-fleet denial not proven in staging.
  - Orphaned-object cleanup behavior not defined.
  - See decision memo: `reports/batch-1-evidence-photo-isolation-2026-06-06.md`.

## 8) AI Safety, Liability, and Customer-Facing Disclaimers

- Evidence: Not yet recorded.
- Gaps / Next proof needed:
  - “Not a mechanic / not safety-certified” disclaimers where applicable.
  - Safety triage escalation (when to stop and recommend professional inspection).
  - AI vendor/LLM usage disclosure stance (pilot-appropriate wording).

## 9) Vendor / Third-Party Risk (Stripe, LLMs, hosting)

- Evidence: Not yet recorded.
- Gaps / Next proof needed:
  - Vendor inventory and what data is shared.
  - Webhook/event security expectations.

## 10) Incident Response / Support Operations

- Evidence: Not yet recorded.
- Gaps / Next proof needed:
  - Support runbook for common pilot issues.
  - Recovery controls: least privilege, audit logs, and bounded scope.

---

## 11) Open Evidence Requests (Fill In Over Time)

- Add links to: privacy policy, terms, AI disclaimer copy, data retention policy, support recovery runbook, backup/restore instructions, security logging notes, and any compliance-related docs that exist in-repo.
