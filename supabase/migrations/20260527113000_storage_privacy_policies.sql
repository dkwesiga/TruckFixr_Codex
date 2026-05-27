-- Batch K/B: Supabase Storage privacy guardrails for TruckFixr evidence files.
--
-- This migration is repo-only until it is applied to a verified local/staging
-- Supabase target. It intentionally keeps all customer evidence buckets private
-- and scopes Storage object access through TruckFixr fleet membership helpers.
--
-- Note: the Supabase CLI was not available in this workspace when this file was
-- created, so the timestamped migration was authored manually for review.

CREATE OR REPLACE FUNCTION "truckfixr_storage_fleet_id"(object_name text)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public, storage
AS $$
  SELECT CASE
    WHEN object_name IS NULL THEN NULL
    WHEN (storage.foldername(object_name))[1] ~ '^company-[0-9]+$'
      THEN replace((storage.foldername(object_name))[1], 'company-', '')::integer
    ELSE NULL
  END
$$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'inspection-evidence',
    'inspection-evidence',
    false,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'diagnostic-evidence',
    'diagnostic-evidence',
    false,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'fleet-documents',
    'fleet-documents',
    false,
    10485760,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  )
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE INDEX IF NOT EXISTS "storage_objects_truckfixr_private_buckets_idx"
ON storage.objects (bucket_id, name)
WHERE bucket_id IN ('inspection-evidence', 'diagnostic-evidence', 'fleet-documents');

DROP POLICY IF EXISTS "truckfixr_private_evidence_select" ON storage.objects;
CREATE POLICY "truckfixr_private_evidence_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id IN ('inspection-evidence', 'diagnostic-evidence', 'fleet-documents')
    AND storage.allow_any_operation(ARRAY['object.list', 'storage.object.get_authenticated'])
    AND "truckfixr_storage_fleet_id"(name) IS NOT NULL
    AND "user_has_fleet_access"("truckfixr_storage_fleet_id"(name), "current_app_user_id"())
  );

DROP POLICY IF EXISTS "truckfixr_private_evidence_insert" ON storage.objects;
CREATE POLICY "truckfixr_private_evidence_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('inspection-evidence', 'diagnostic-evidence', 'fleet-documents')
    AND "truckfixr_storage_fleet_id"(name) IS NOT NULL
    AND "user_has_fleet_access"("truckfixr_storage_fleet_id"(name), "current_app_user_id"())
    AND (
      (
        bucket_id IN ('inspection-evidence', 'diagnostic-evidence')
        AND lower(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'webp')
      )
      OR (
        bucket_id = 'fleet-documents'
        AND lower(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'webp', 'pdf')
      )
    )
  );

DROP POLICY IF EXISTS "truckfixr_private_evidence_update_own_object" ON storage.objects;
CREATE POLICY "truckfixr_private_evidence_update_own_object" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id IN ('inspection-evidence', 'diagnostic-evidence', 'fleet-documents')
    AND owner_id = (select auth.uid()::text)
    AND "truckfixr_storage_fleet_id"(name) IS NOT NULL
    AND "user_has_fleet_access"("truckfixr_storage_fleet_id"(name), "current_app_user_id"())
  )
  WITH CHECK (
    bucket_id IN ('inspection-evidence', 'diagnostic-evidence', 'fleet-documents')
    AND "truckfixr_storage_fleet_id"(name) IS NOT NULL
    AND "user_has_fleet_access"("truckfixr_storage_fleet_id"(name), "current_app_user_id"())
  );

DROP POLICY IF EXISTS "truckfixr_private_evidence_delete_own_object" ON storage.objects;
CREATE POLICY "truckfixr_private_evidence_delete_own_object" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id IN ('inspection-evidence', 'diagnostic-evidence', 'fleet-documents')
    AND owner_id = (select auth.uid()::text)
    AND "truckfixr_storage_fleet_id"(name) IS NOT NULL
    AND "user_has_fleet_access"("truckfixr_storage_fleet_id"(name), "current_app_user_id"())
  );
