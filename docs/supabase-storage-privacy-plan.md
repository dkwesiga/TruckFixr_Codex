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

## Deferred Until Implementation Approval

- Supabase bucket creation.
- Storage policy SQL.
- Database schema changes for richer file metadata.
- Migration files.
- Edge Function or server upload-route changes.
- Production storage tests.
