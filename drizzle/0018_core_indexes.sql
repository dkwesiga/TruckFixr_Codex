-- Secondary indexes for the core, high-traffic tables.
--
-- The initial schema created primary keys but no secondary indexes, so the
-- hottest dashboard / vehicle-detail / diagnostics queries (filtered by fleet,
-- vehicle, driver, status, and recency) do sequential scans. These indexes
-- target the foreign-key and filter columns those queries actually use.
-- Consistent with every other index in this repo, they are defined in SQL.
--
-- Resilient + idempotent: some tables are created lazily by the app, so each
-- index is guarded by a to_regclass() existence check and CREATE INDEX IF NOT
-- EXISTS. Re-running after more tables exist fills in the rest. On a large
-- production table, prefer CREATE INDEX CONCURRENTLY (outside a transaction).

DO $$
DECLARE
  spec record;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      -- defects: dashboard ("open defects for my fleet"), truck detail, driver
      -- view, recency ordering.
      ('defects',              'defects_fleet_status_idx',          '("fleetId", "status")'),
      ('defects',              'defects_vehicle_idx',               '("vehicleId")'),
      ('defects',              'defects_driver_idx',                '("driverId")'),
      ('defects',              'defects_created_at_idx',            '("createdAt")'),
      -- defectActions: action history for a defect.
      ('defectActions',        'defectActions_defect_idx',          '("defectId")'),
      -- vehicles: fleet roster and a driver's assigned vehicles.
      ('vehicles',             'vehicles_fleet_idx',                '("fleetId")'),
      ('vehicles',             'vehicles_assigned_driver_idx',      '("assignedDriverId")'),
      -- inspections: fleet feed, per-vehicle history, driver history.
      ('inspections',          'inspections_fleet_idx',             '("fleetId")'),
      ('inspections',          'inspections_vehicle_idx',           '("vehicleId")'),
      ('inspections',          'inspections_driver_idx',            '("driverId")'),
      -- maintenanceLogs: per-vehicle history and fleet rollups.
      ('maintenanceLogs',      'maintenanceLogs_vehicle_idx',       '("vehicleId")'),
      ('maintenanceLogs',      'maintenanceLogs_fleet_idx',         '("fleetId")'),
      -- repairOutcomes: TADIS outcome lookups.
      ('repairOutcomes',       'repairOutcomes_vehicle_idx',        '("vehicleId")'),
      ('repairOutcomes',       'repairOutcomes_defect_idx',         '("defectId")'),
      ('repairOutcomes',       'repairOutcomes_fleet_idx',          '("fleetId")'),
      -- tadisAlerts: alerts attached to a defect / fleet.
      ('tadisAlerts',          'tadisAlerts_defect_idx',            '("defectId")'),
      ('tadisAlerts',          'tadisAlerts_fleet_idx',             '("fleetId")'),
      -- activityLogs: per-fleet audit feed, most-recent first.
      ('activityLogs',         'activityLogs_fleet_created_idx',    '("fleetId", "createdAt")'),
      -- aiUsageLogs: cost/quality rollups by fleet and by user over time.
      ('aiUsageLogs',          'aiUsageLogs_fleet_idx',             '("fleetId")'),
      ('aiUsageLogs',          'aiUsageLogs_user_created_idx',      '("userId", "createdAt")'),
      -- diagnosticReviewQueue: review workload by fleet, vehicle, and status.
      ('diagnosticReviewQueue','diagnosticReviewQueue_fleet_idx',   '("fleetId")'),
      ('diagnosticReviewQueue','diagnosticReviewQueue_vehicle_idx', '("vehicleId")'),
      ('diagnosticReviewQueue','diagnosticReviewQueue_status_idx',  '("status")')
    ) AS t(tbl, idx, cols)
  LOOP
    IF to_regclass(format('public.%I', spec.tbl)) IS NOT NULL THEN
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON public.%I %s',
        spec.idx,
        spec.tbl,
        spec.cols
      );
    END IF;
  END LOOP;
END
$$;
