-- RLS Migration: Add Row-Level Security policies for multi-tenant isolation
-- Run this after running 0004_init.sql

-- Enable RLS on critical tables
ALTER TABLE "fleets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vehicles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inspections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "defects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "defectActions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "maintenanceLogs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tadisAlerts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "activityLogs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inspectionTemplates" ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotent reruns)
DROP POLICY IF EXISTS "users_select_policy" ON "users";
DROP POLICY IF EXISTS "fleets_select_policy" ON "fleets";
DROP POLICY IF EXISTS "vehicles_select_policy" ON "vehicles";
DROP POLICY IF EXISTS "inspections_select_policy" ON "inspections";
DROP POLICY IF EXISTS "defects_select_policy" ON "defects";
DROP POLICY IF EXISTS "defects_insert_policy" ON "defects";
DROP POLICY IF EXISTS "defectActions_select_policy" ON "defectActions";
DROP POLICY IF EXISTS "maintenanceLogs_select_policy" ON "maintenanceLogs";
DROP POLICY IF EXISTS "tadisAlerts_select_policy" ON "tadisAlerts";
DROP POLICY IF EXISTS "activityLogs_select_policy" ON "activityLogs";
DROP POLICY IF EXISTS "activityLogs_insert_policy" ON "activityLogs";
DROP POLICY IF EXISTS "inspectionTemplates_select_policy" ON "inspectionTemplates";
DROP POLICY IF EXISTS "inspectionTemplates_insert_policy" ON "inspectionTemplates";

-- Users: users can only see their own record (for auth)
CREATE POLICY "users_select_policy" ON "users"
  FOR SELECT USING ("id" = auth.uid()::integer);

-- Fleets: users can only see fleets they own OR fleets where they are a member
-- We'll use a function to check fleet membership
CREATE POLICY "fleets_select_policy" ON "fleets"
  FOR SELECT USING (
    "ownerId" = (
      SELECT id FROM "users" 
      WHERE "id" = auth.uid()::integer 
      AND ("role" = 'owner' OR "role" = 'manager')
      LIMIT 1
    )
    OR EXISTS (
      SELECT 1 FROM "users" u
      WHERE u."id" = auth.uid()::integer
      AND u."managerUserId" = "fleets"."ownerId"
    )
  );

-- Vehicles: users can only see vehicles in their fleets
CREATE POLICY "vehicles_select_policy" ON "vehicles"
  FOR SELECT USING (
    "fleetId" IN (
      SELECT f.id FROM "fleets" f
      WHERE f."ownerId" = (
        SELECT id FROM "users" 
        WHERE "id" = auth.uid()::integer 
        AND ("role" = 'owner' OR "role" = 'manager')
        LIMIT 1
      )
      OR EXISTS (
        SELECT 1 FROM "users" u
        WHERE u."id" = auth.uid()::integer
        AND u."managerUserId" = f."ownerId"
      )
    )
    -- Drivers can see their assigned vehicles
    OR "assignedDriverId" = auth.uid()::integer
  );

-- Inspections: users can only see inspections in their fleet
CREATE POLICY "inspections_select_policy" ON "inspections"
  FOR SELECT USING (
    "fleetId" IN (
      SELECT f.id FROM "fleets" f
      WHERE f."ownerId" = (
        SELECT id FROM "users" 
        WHERE "id" = auth.uid()::integer 
        AND ("role" = 'owner' OR "role" = 'manager')
        LIMIT 1
      )
      OR EXISTS (
        SELECT 1 FROM "users" u
        WHERE u."id" = auth.uid()::integer
        AND u."managerUserId" = f."ownerId"
      )
    )
    -- Drivers can see their own inspections
    OR "driverId" = auth.uid()::integer
  );

-- Defects: users can only see defects in their fleet
CREATE POLICY "defects_select_policy" ON "defects"
  FOR SELECT USING (
    "fleetId" IN (
      SELECT f.id FROM "fleets" f
      WHERE f."ownerId" = (
        SELECT id FROM "users" 
        WHERE "id" = auth.uid()::integer 
        AND ("role" = 'owner' OR "role" = 'manager')
        LIMIT 1
      )
      OR EXISTS (
        SELECT 1 FROM "users" u
        WHERE u."id" = auth.uid()::integer
        AND u."managerUserId" = f."ownerId"
      )
    )
    -- Drivers can see defects they created
    OR "driverId" = auth.uid()::integer
  );

-- Defects: managers/owners can insert
CREATE POLICY "defects_insert_policy" ON "defects"
  FOR INSERT WITH CHECK (
    "fleetId" IN (
      SELECT f.id FROM "fleets" f
      WHERE f."ownerId" = (
        SELECT id FROM "users" 
        WHERE "id" = auth.uid()::integer 
        AND ("role" = 'owner' OR "role" = 'manager')
        LIMIT 1
      )
      OR EXISTS (
        SELECT 1 FROM "users" u
        WHERE u."id" = auth.uid()::integer
        AND u."managerUserId" = f."ownerId"
      )
    )
  );

-- DefectActions: users can only see actions for defects in their fleet
CREATE POLICY "defectActions_select_policy" ON "defectActions"
  FOR SELECT USING (
    "defectId" IN (
      SELECT d.id FROM "defects" d
      WHERE d."fleetId" IN (
        SELECT f.id FROM "fleets" f
        WHERE f."ownerId" = (
          SELECT id FROM "users" 
          WHERE "id" = auth.uid()::integer 
          AND ("role" = 'owner' OR "role" = 'manager')
          LIMIT 1
        )
        OR EXISTS (
          SELECT 1 FROM "users" u
          WHERE u."id" = auth.uid()::integer
          AND u."managerUserId" = f."ownerId"
        )
      )
    )
  );

-- MaintenanceLogs: users can only see logs for their fleet's vehicles
CREATE POLICY "maintenanceLogs_select_policy" ON "maintenanceLogs"
  FOR SELECT USING (
    "fleetId" IN (
      SELECT f.id FROM "fleets" f
      WHERE f."ownerId" = (
        SELECT id FROM "users" 
        WHERE "id" = auth.uid()::integer 
        AND ("role" = 'owner' OR "role" = 'manager')
        LIMIT 1
      )
      OR EXISTS (
        SELECT 1 FROM "users" u
        WHERE u."id" = auth.uid()::integer
        AND u."managerUserId" = f."ownerId"
      )
    )
  );

-- TADIS alerts: users can only see alerts for their fleet's defects
CREATE POLICY "tadisAlerts_select_policy" ON "tadisAlerts"
  FOR SELECT USING (
    "fleetId" IN (
      SELECT f.id FROM "fleets" f
      WHERE f."ownerId" = (
        SELECT id FROM "users" 
        WHERE "id" = auth.uid()::integer 
        AND ("role" = 'owner' OR "role" = 'manager')
        LIMIT 1
      )
      OR EXISTS (
        SELECT 1 FROM "users" u
        WHERE u."id" = auth.uid()::integer
        AND u."managerUserId" = f."ownerId"
      )
    )
  );

-- ActivityLogs: users can only see logs for their fleet
CREATE POLICY "activityLogs_select_policy" ON "activityLogs"
  FOR SELECT USING (
    "fleetId" IN (
      SELECT f.id FROM "fleets" f
      WHERE f."ownerId" = (
        SELECT id FROM "users" 
        WHERE "id" = auth.uid()::integer 
        AND ("role" = 'owner' OR "role" = 'manager')
        LIMIT 1
      )
      OR EXISTS (
        SELECT 1 FROM "users" u
        WHERE u."id" = auth.uid()::integer
        AND u."managerUserId" = f."ownerId"
      )
    )
  );

-- ActivityLogs: authenticated users can insert (for logging)
CREATE POLICY "activityLogs_insert_policy" ON "activityLogs"
  FOR INSERT WITH CHECK (true);

-- InspectionTemplates: users can only see templates in their fleet
CREATE POLICY "inspectionTemplates_select_policy" ON "inspectionTemplates"
  FOR SELECT USING (
    "fleetId" IN (
      SELECT f.id FROM "fleets" f
      WHERE f."ownerId" = (
        SELECT id FROM "users" 
        WHERE "id" = auth.uid()::integer 
        AND ("role" = 'owner' OR "role" = 'manager')
        LIMIT 1
      )
      OR EXISTS (
        SELECT 1 FROM "users" u
        WHERE u."id" = auth.uid()::integer
        AND u."managerUserId" = f."ownerId"
      )
    )
  );

-- InspectionTemplates: managers/owners can insert
CREATE POLICY "inspectionTemplates_insert_policy" ON "inspectionTemplates"
  FOR INSERT WITH CHECK (
    "fleetId" IN (
      SELECT f.id FROM "fleets" f
      WHERE f."ownerId" = (
        SELECT id FROM "users" 
        WHERE "id" = auth.uid()::integer 
        AND ("role" = 'owner' OR "role" = 'manager')
        LIMIT 1
      )
      OR EXISTS (
        SELECT 1 FROM "users" u
        WHERE u."id" = auth.uid()::integer
        AND u."managerUserId" = f."ownerId"
      )
    )
  );

-- Create helper function to check if a user can access a fleet
CREATE OR REPLACE FUNCTION "user_has_fleet_access"(p_fleet_id integer, p_user_id integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM "fleets" f
    WHERE f.id = p_fleet_id
    AND (
      f."ownerId" = p_user_id
      OR EXISTS (
        SELECT 1 FROM "users" u
        WHERE u.id = p_user_id
        AND u."managerUserId" = f."ownerId"
      )
    )
  );
END;
$$;

-- Create helper function to get fleet IDs for a user
CREATE OR REPLACE FUNCTION "get_user_fleet_ids"(p_user_id integer)
RETURNS TABLE(fleet_id integer)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT f.id FROM "fleets" f
  WHERE f."ownerId" = p_user_id
     OR EXISTS (
       SELECT 1 FROM "users" u
       WHERE u.id = p_user_id
       AND u."managerUserId" = f."ownerId"
     );
END;
$$;