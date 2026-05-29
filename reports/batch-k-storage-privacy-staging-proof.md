# Batch K: Storage Privacy + Photo Access Proof (Staging/Local Only)

Goal: Collect end-to-end evidence that inspection/defect/proof photos are private, fleet-scoped, and non-leaking across fleets/users.

This batch is **staging/local only**. Do not apply storage migrations or run write-enabled verification scripts against unclassified or production databases.

## Preconditions

- You have an explicitly classified target: `TFX_DATABASE_TARGET=staging` (or local), and it is **not** production.
- Supabase Storage migration is reviewed and ready to apply to staging/local only:
  - `supabase/migrations/20260527113000_storage_privacy_policies.sql`
- You can run spawn-capable browser verification for direct-route checks.

## Evidence To Collect

### 1) Repo-level policy intent (static)

- Confirm `server/storagePolicies.test.ts` passes (static policy assertions).
- Confirm object path convention is fleet-scoped:
  - `inspection-evidence/company-<fleetId>/...`

### 2) Apply migration (staging/local only)

- Apply `supabase/migrations/20260527113000_storage_privacy_policies.sql` to staging/local.
- Confirm buckets exist and are private:
  - `inspection-evidence`, `diagnostic-evidence`, `fleet-documents`

### 3) Upload + read proof (two fleets)

Setup in staging:
- Fleet A and Fleet B exist.
- Two users exist: A-user (member of Fleet A), B-user (member of Fleet B).

Evidence:
1) As A-user, upload an inspection photo + a proof photo for a Fleet A vehicle.
2) Confirm A-user can view the photo URLs in the UI (driver + manager).
3) As B-user, attempt to view/list the same photo(s):
   - Expected: **denied** / not visible.
4) Repeat with reversed roles (B uploads; A cannot read).

### 4) Deletion / replacement ownership constraint

- As A-user (the uploader), replace/delete the object:
  - Expected: allowed.
- As another user in Fleet A who did **not** upload the object:
  - Expected: denied for delete/update.

## Notes

- The server now supports uploading evidence photos via `inspections.uploadEvidencePhoto` (tRPC), which stores the photo in storage and returns a URL; offline flows may still temporarily carry data-URLs until a queued-upload path is proven.

