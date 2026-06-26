# Supabase Storage Privacy Review and Policy Plan

This is a planning artifact for Batch K/B. It does not create buckets, change RLS, deploy Edge Functions, alter migrations, or modify production data.

## Current Evidence

- Inspection and defect photo flows currently collect `photoUrls` in `client/src/pages/DriverInspectionNSC.tsx` and `client/src/pages/VerifiedInspection.tsx`.
- Database metadata tables exist for inspection photos in `drizzle/schema.ts` and `drizzle/0007_verified_inspections.sql`.
- A generic storage proxy helper exists in `server/storage.ts`, but no repo-based Supabase Storage bucket configuration or storage policies were found during the 2026-05-27 review.

## Privacy Goal

Inspection photos, defect photos, diagnostic evidence, and fleet documents must be private by default and scoped by company/fleet. Drivers should only access files tied to assigned vehicles and allowed workflows. Managers/owners should only access files for their company. TruckFixr support access must be staff-only and auditable.

## Recommended Bucket Model

| Bucket | Public? | Purpose | Access Model |
|---|---|---|---|
| `inspection-evidence` | No | Daily inspection, defect, proof, and follow-up photos | Company-scoped paths and metadata |
| `diagnostic-evidence` | No | Diagnostic images/files if enabled later | Company + vehicle + diagnostic session scoped |
| `fleet-documents` | No | VIN photos, certificates, maintenance documents | Company-scoped manager/owner access |

Recommended object path convention:

```text
company-{fleetId}/vehicle-{vehicleId}/inspection-{inspectionId}/{uuid}.{ext}
company-{fleetId}/vehicle-{vehicleId}/diagnosis-{diagnosticCaseId}/{uuid}.{ext}
company-{fleetId}/documents/{uuid}.{ext}
```

## Required Metadata

Every uploaded file should have a database row linking it to the relevant owner records:

| Field | Required? | Reason |
|---|---|---|
| `fleetId` | Yes | Tenant isolation |
| `vehicleId` | Yes for vehicle evidence | Vehicle ownership and support recovery |
| `inspectionId` | Yes for inspection photos | Inspection history and compliance |
| `defectId` | Optional but recommended | Failed-item follow-up |
| `diagnosticCaseId` | Required for diagnostic files | TADIS history |
| `uploadedByUserId` | Yes | Auditability |
| `bucket` | Yes | Storage lookup |
| `objectPath` | Yes | Private retrieval |
| `mimeType` | Yes | Safety filtering |
| `sizeBytes` | Yes | Cost control and abuse prevention |
| `createdAt` / `deletedAt` | Yes | Cleanup and recovery |

## Policy Requirements

When implementation is approved, storage policies should enforce:

- `authenticated` users can read objects only when a matching metadata row belongs to a fleet they can access.
- Drivers can read/write only evidence linked to their assigned vehicle and active workflow.
- Owners/managers can read/write only company-scoped files.
- `service_role` can perform trusted backend maintenance and support operations.
- Public bucket access is disabled for customer, inspection, defect, diagnostic, and repair files.
- Signed URL generation happens only through trusted server routes that re-check user identity, role, fleet, and vehicle/workflow access.

## Upload Controls

Recommended MVP limits:

- Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`, and later `application/pdf` only for fleet documents.
- Max image size: 5 MB per file for driver mobile workflows.
- Max files per inspection item: 3 for pilot unless Dickson approves more.
- Strip or avoid storing unnecessary EXIF/location metadata unless it has a clear compliance purpose.
- Store thumbnail/compressed versions before broader rollout if mobile upload cost becomes material.

## Cleanup and Recovery

- Soft-delete metadata first; delete storage objects only after retention and support windows are satisfied.
- Add orphan detection: storage object without metadata, metadata without object, deleted inspection with live object, and cross-fleet path mismatch.
- Add support recovery actions for relinking or quarantining files, with audit rows in `supportRecoveryActions`.

## Verification Plan

Before enabling real fleet photo storage:

1. Create disposable local/staging users for Company A and Company B.
2. Upload an inspection photo as Company A driver assigned to Vehicle A.
3. Confirm Company A driver can read only their allowed file.
4. Confirm Company A manager/owner can read the file.
5. Confirm Company B users cannot read, list, or signed-url the file.
6. Confirm an unassigned Company A driver cannot access Vehicle A evidence.
7. Confirm file metadata links fleet, vehicle, inspection, user, bucket, object path, MIME type, and size.
8. Confirm deletion/deactivation does not orphan files silently.
9. Confirm logs do not print signed URLs, customer details, VINs, repair notes, or file contents.

## Repo-Level Implementation Proof

Batch K/B repo-level storage privacy proof was added on 2026-05-27 after approval.

- Added `supabase/migrations/20260527113000_storage_privacy_policies.sql` as a reviewable Supabase Storage policy migration. It was not applied to local, staging, or production Supabase by Codex.
- The migration keeps `inspection-evidence`, `diagnostic-evidence`, and `fleet-documents` private, scopes object paths by `company-{fleetId}`, applies MIME/size limits, and requires fleet access checks through app-user identity helpers.
- Added `server/storagePolicies.test.ts` to statically verify private buckets, tenant-aware storage paths, non-public policies, owner-restricted update/delete policy text, and operation-aware object access.
- Verification passed on 2026-05-27 with targeted storage/RLS/support tests and the full Vitest suite.
- Supabase CLI was not available in this environment, so the migration was manually authored and must be applied first to a disposable local or staging Supabase project before production use is considered.

## Remaining Before Real Fleet Photo Storage

- Apply the migration only to a verified local or staging Supabase project.
- Run Company A / Company B behavior tests for upload, read, list, signed URL, update, and delete denial.
- Connect app upload/download flows to private Supabase Storage and metadata rows if the product direction is to move beyond current URL/data-URL handling.
- Add orphan-file detection and retention cleanup after the private storage model is validated.

## Deferred Until Additional Approval

- Applying Supabase bucket creation or storage policy SQL to local, staging, or production.
- Database schema changes for richer file metadata.
- Edge Function or server upload-route changes.
- Production storage tests.
