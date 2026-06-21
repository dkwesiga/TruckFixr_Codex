-- Secondary indexes for the core, high-traffic tables.
--
-- The initial schema (0004_init.sql) created primary keys but no secondary
-- indexes, so the hottest dashboard / vehicle-detail / diagnostics queries
-- (filtered by fleet, vehicle, driver, status, and recency) do sequential
-- scans. These indexes target the foreign-key and filter columns those queries
-- actually use. Consistent with every other index in this repo, they are
-- defined in SQL (the Drizzle schema does not declare indexes).
--
-- Idempotent: re-running is a no-op. On a large production table, prefer
-- CREATE INDEX CONCURRENTLY (run outside a transaction) to avoid write locks.

-- defects: manager dashboard ("open defects for my fleet"), truck detail,
-- driver's own defects, and recency ordering.
CREATE INDEX IF NOT EXISTS "defects_fleet_status_idx" ON "defects" ("fleetId", "status");
CREATE INDEX IF NOT EXISTS "defects_vehicle_idx" ON "defects" ("vehicleId");
CREATE INDEX IF NOT EXISTS "defects_driver_idx" ON "defects" ("driverId");
CREATE INDEX IF NOT EXISTS "defects_created_at_idx" ON "defects" ("createdAt");

-- defectActions: loading the action history for a defect.
CREATE INDEX IF NOT EXISTS "defectActions_defect_idx" ON "defectActions" ("defectId");

-- vehicles: fleet roster and a driver's assigned vehicles.
CREATE INDEX IF NOT EXISTS "vehicles_fleet_idx" ON "vehicles" ("fleetId");
CREATE INDEX IF NOT EXISTS "vehicles_assigned_driver_idx" ON "vehicles" ("assignedDriverId");

-- inspections: fleet inspection feed, per-vehicle history, driver history.
CREATE INDEX IF NOT EXISTS "inspections_fleet_idx" ON "inspections" ("fleetId");
CREATE INDEX IF NOT EXISTS "inspections_vehicle_idx" ON "inspections" ("vehicleId");
CREATE INDEX IF NOT EXISTS "inspections_driver_idx" ON "inspections" ("driverId");

-- maintenanceLogs: per-vehicle maintenance history and fleet rollups.
CREATE INDEX IF NOT EXISTS "maintenanceLogs_vehicle_idx" ON "maintenanceLogs" ("vehicleId");
CREATE INDEX IF NOT EXISTS "maintenanceLogs_fleet_idx" ON "maintenanceLogs" ("fleetId");

-- repairOutcomes: TADIS outcome lookups by vehicle, defect, and fleet.
CREATE INDEX IF NOT EXISTS "repairOutcomes_vehicle_idx" ON "repairOutcomes" ("vehicleId");
CREATE INDEX IF NOT EXISTS "repairOutcomes_defect_idx" ON "repairOutcomes" ("defectId");
CREATE INDEX IF NOT EXISTS "repairOutcomes_fleet_idx" ON "repairOutcomes" ("fleetId");

-- tadisAlerts: alerts attached to a defect / fleet.
CREATE INDEX IF NOT EXISTS "tadisAlerts_defect_idx" ON "tadisAlerts" ("defectId");
CREATE INDEX IF NOT EXISTS "tadisAlerts_fleet_idx" ON "tadisAlerts" ("fleetId");

-- activityLogs: per-fleet audit feed, most-recent first.
CREATE INDEX IF NOT EXISTS "activityLogs_fleet_created_idx" ON "activityLogs" ("fleetId", "createdAt");

-- aiUsageLogs: cost/quality rollups by fleet and by user over time.
CREATE INDEX IF NOT EXISTS "aiUsageLogs_fleet_idx" ON "aiUsageLogs" ("fleetId");
CREATE INDEX IF NOT EXISTS "aiUsageLogs_user_created_idx" ON "aiUsageLogs" ("userId", "createdAt");

-- diagnosticReviewQueue: review workload by fleet, vehicle, and status.
CREATE INDEX IF NOT EXISTS "diagnosticReviewQueue_fleet_idx" ON "diagnosticReviewQueue" ("fleetId");
CREATE INDEX IF NOT EXISTS "diagnosticReviewQueue_vehicle_idx" ON "diagnosticReviewQueue" ("vehicleId");
CREATE INDEX IF NOT EXISTS "diagnosticReviewQueue_status_idx" ON "diagnosticReviewQueue" ("status");
