ALTER TABLE "defects"
ADD COLUMN IF NOT EXISTS "clientDraftId" varchar(128);

CREATE UNIQUE INDEX IF NOT EXISTS "inspections_driver_session_vehicle_unique"
ON "inspections" ("fleetId", "driverId", "vehicleId", "inspectionSessionId")
WHERE "inspectionSessionId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "defects_client_draft_unique"
ON "defects" ("fleetId", "driverId", "vehicleId", "clientDraftId")
WHERE "clientDraftId" IS NOT NULL;
