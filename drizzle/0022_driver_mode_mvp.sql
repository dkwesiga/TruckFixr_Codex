ALTER TABLE "fleets"
ADD COLUMN IF NOT EXISTS "driverModeEnabled" boolean NOT NULL DEFAULT false;

UPDATE "fleets"
SET "driverModeEnabled" = true
WHERE "accountType" = 'demo'
   OR "isDemoAccount" = true
   OR "salesStatus" = 'demo'
   OR lower(coalesce("companyEmail", '')) LIKE '%@truckfixr-demo.example.com';
