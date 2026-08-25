-- Close an RLS gap: several tables added since the last hardening sweep
-- (0041_post_0040_rls_hardening.sql) were created without RLS being enabled.
--
-- "cases" (0043_case_spine.sql), "technicianReviews" and
-- "technicianReviewReminders" (0044_technician_reviews.sql),
-- "verificationCodes" (0045_verification_codes.sql), "guestCaseEvidence"
-- (0046_guest_case_evidence.sql), and "partsRequests"/"partsOffers"
-- (0047_parts_concierge.sql) never had their own RLS-enabling migration and
-- were not covered by 0041's explicit table list (which predates them) or by
-- any later sweep. This left them publicly readable/writable via the
-- Supabase API, flagged by Supabase's "rls_disabled_in_public" check.
--
-- TruckFixr routes all application data access through the backend service
-- connection, so — consistent with every other table in this schema — the
-- fix is: enable RLS and grant full access to the service_role only.

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'cases',
    'technicianReviews',
    'technicianReviewReminders',
    'verificationCodes',
    'guestCaseEvidence',
    'partsRequests',
    'partsOffers'
  ] LOOP
    IF to_regclass(format('public."%s"', table_name)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public."%s" ENABLE ROW LEVEL SECURITY', table_name);
      IF to_regrole('service_role') IS NOT NULL THEN
        EXECUTE format('DROP POLICY IF EXISTS "%s_service_role_full_access" ON public."%s"', table_name, table_name);
        EXECUTE format(
          'CREATE POLICY "%s_service_role_full_access" ON public."%s" FOR ALL TO service_role USING (true) WITH CHECK (true)',
          table_name,
          table_name
        );
      END IF;
    END IF;
  END LOOP;
END $$;
