-- Fix schema drift: Update all vehicleId columns from integer to varchar(64) to support UUIDs

-- Helper function to safely migrate a column
do $$
declare
    tbl text;
    col text;
    is_not_null boolean;
begin
    -- List of tables with their vehicleId column constraints
    for tbl, col, is_not_null in 
        values 
            ('defects', 'vehicleId', true),
            ('inspections', 'vehicleId', true),
            ('inspectionChecklistResponses', 'vehicleId', true),
            ('inspectionPhotos', 'vehicleId', true),
            ('randomProofRequests', 'vehicleId', true),
            ('inspectionFlags', 'vehicleId', true),
            ('aiTriageRecords', 'vehicleId', true),
            ('repairOutcomes', 'vehicleId', true),
            ('inAppAlerts', 'vehicleId', false),
            ('maintenanceLogs', 'vehicleId', true),
            ('vehicleAccessRequests', 'vehicleId', false),
            ('aiUsageLogs', 'vehicleId', false)
    loop
        -- Drop dependent indexes if they exist
        execute format('DROP INDEX IF EXISTS "%s_vehicle_idx"', tbl);
        execute format('DROP INDEX IF EXISTS "%s_vehicleId_idx"', tbl);
        
        -- Add new varchar column
        execute format('ALTER TABLE "%s" ADD COLUMN IF NOT EXISTS "vehicleId_new" varchar(64)', tbl);
        
        -- Copy data from old column to new
        execute format('UPDATE "%s" SET "vehicleId_new" = "vehicleId"::varchar(64) WHERE "vehicleId" IS NOT NULL', tbl);
        
        -- Drop old column
        execute format('ALTER TABLE "%s" DROP COLUMN IF EXISTS "vehicleId"', tbl);
        
        -- Rename new column
        execute format('ALTER TABLE "%s" RENAME COLUMN "vehicleId_new" TO "vehicleId"', tbl);
        
        -- Set NOT NULL constraint if required
        if is_not_null then
            execute format('ALTER TABLE "%s" ALTER COLUMN "vehicleId" SET NOT NULL', tbl);
        end if;
        
        -- Recreate index
        execute format('CREATE INDEX IF NOT EXISTS "%s_vehicleId_idx" ON "%s" ("vehicleId")', tbl, tbl);
        
        raise notice 'Migrated table %', tbl;
    end loop;
end $$;
