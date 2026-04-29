-- Enable Row-Level Security on every existing public table.
--
-- TruckFixr routes all application data access through the backend, where
-- fleet/user/vehicle authorization is enforced before Drizzle queries run.
-- Supabase Auth remains in the auth schema. Public table access through anon or
-- authenticated Supabase API clients should be denied unless a table-specific
-- policy is added later.

DO $$
DECLARE
  table_record record;
BEGIN
  FOR table_record IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
      table_record.schema_name,
      table_record.table_name
    );

    IF to_regrole('service_role') IS NOT NULL THEN
      EXECUTE format(
        'DROP POLICY IF EXISTS %I ON %I.%I',
        'service_role_full_access',
        table_record.schema_name,
        table_record.table_name
      );

      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        'service_role_full_access',
        table_record.schema_name,
        table_record.table_name
      );
    END IF;
  END LOOP;
END $$;
