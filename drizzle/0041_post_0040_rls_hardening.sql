-- Post-0040 RLS hardening gate.
-- Server-side TruckFixr procedures use the database service connection; direct
-- client access must remain unavailable unless an explicit policy is added.

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'guestCases',
    'guestCaseEvents',
    'guestCaseContacts',
    'freeCaseLedger',
    'caseSlaConfig',
    'caseReviewQueueItems',
    'analyticsEvents',
    'pilotApplications',
    'pilotSettings',
    'maintenanceCases',
    'maintenanceDecisions',
    'repairCycles',
    'repairDocuments',
    'repairAuthorizations',
    'partnerProfiles'
  ] LOOP
    IF to_regclass(format('public."%s"', table_name)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public."%s" ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('DROP POLICY IF EXISTS "%s_service_role_full_access" ON public."%s"', table_name, table_name);
      EXECUTE format(
        'CREATE POLICY "%s_service_role_full_access" ON public."%s" FOR ALL TO service_role USING (true) WITH CHECK (true)',
        table_name,
        table_name
      );
    END IF;
  END LOOP;
END $$;
